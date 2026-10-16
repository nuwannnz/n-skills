import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, Notification, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatSession, chatMessages, claudeVersion, engineEnv, findClaude, loginShellPath, recentChats } from './engine.js';
import * as git from './git.js';
import { APP_ID, APP_NAME, electronBinary, installLauncher, isGlobalInstall, launcherExists, launcherPath, pkgDir } from './launcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const icon = join(here, '../build/icon.png');
const renderer = join(here, '../dist/renderer/index.html');

app.setName(APP_NAME);
if (process.env.SCRUMO_USER_DATA) app.setPath('userData', process.env.SCRUMO_USER_DATA); // a separate profile for development, so it can run beside the installed app
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) app.exit(0); // the running instance gets 'second-instance'
let win = null;
let autoApproveDocEdits = false;
const pending = new Map();
let nextAsk = 0;
const engine = { path: '', claudePath: null, version: null, env: {} };

/** Every project the person has opened, in the order they keep them. State per project lives here. */
const projects = new Map();

const send = (channel, data) => win?.webContents.send(channel, data);
const isProject = p => p && existsSync(join(p, 'scrumo.yaml'));
const get = root => projects.get(root) ?? null;

function projectInfo(root) {
  const yaml = readFileSync(join(root, 'scrumo.yaml'), 'utf8');
  const name = yaml.match(/^\s+name:\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') ?? basename(root);
  const key = yaml.match(/^\s+key:\s*(\S+)/m)?.[1] ?? '';
  const skills = existsSync(join(root, '.claude/skills')) ? readdirSync(join(root, '.claude/skills')).filter(s => !s.startsWith('.')) : [];
  return { root, name, key, skills, hasCli: existsSync(join(root, 'node_modules/.bin/scrumo')), git: get(root)?.git ?? null };
}

/** A project folder named on the command line (scrumo-desktop <folder>, or a second launch). */
const projectArg = argv => argv.slice(1).map(a => resolve(a)).reverse().find(a => a !== pkgDir && isProject(a)) ?? null;

/* ---------- remembered projects ---------- */
const registryFile = () => join(app.getPath('userData'), 'projects.json');
function loadRegistry() {
  const read = f => { try { return JSON.parse(readFileSync(join(app.getPath('userData'), f), 'utf8')); } catch { return null; } };
  const roots = read('projects.json')?.projects ?? read('recent-projects.json') ?? [];
  return roots.filter(r => typeof r === 'string' && isProject(r));
}
function saveRegistry() {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(registryFile(), JSON.stringify({ projects: [...projects.keys()] }, null, 2));
  } catch { /* not worth failing over */ }
}

/** Puts the launcher back if a global install lost it (for example npm ran with --ignore-scripts). */
function ensureLauncher() {
  if (!isGlobalInstall() || process.env.SCRUMO_DESKTOP_NO_LAUNCHER) return;
  try {
    if (!launcherExists()) installLauncher();
    if (process.platform === 'win32') {
      shell.writeShortcutLink(launcherPath(), 'update', { target: electronBinary(), args: `"${pkgDir}"`, appUserModelId: APP_ID, icon: join(here, '../build/icon.ico'), iconIndex: 0 });
    }
  } catch (err) {
    console.warn(`Could not add the app launcher: ${err.message}`);
  }
}

function addProject(p) {
  const root = resolve(p);
  if (!projects.has(root)) {
    const entry = { root, session: null, watcher: null, git: null, lock: Promise.resolve(), prState: new Map() };
    let timer;
    try {
      entry.watcher = watch(join(root, 'docs'), { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => send('docs:changed', root), 250);
      });
    } catch { /* no docs/ folder yet */ }
    projects.set(root, entry);
    saveRegistry();
    refreshGit(root, { fetch: true });
  }
  return projectInfo(root);
}

function removeProject(root) {
  const p = get(root);
  if (!p) return;
  p.session?.close();
  p.watcher?.close();
  projects.delete(root);
  saveRegistry();
}

function listDocs(root) {
  const out = [];
  const walk = d => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.md')) out.push({ path: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  if (existsSync(join(root, 'docs'))) walk(join(root, 'docs'));
  return out;
}

function scrumo(root, args) {
  return new Promise(res => execFile(join(root, 'node_modules/.bin/scrumo'), args,
    { cwd: root, env: { ...process.env, PATH: engine.path }, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr, json });
    }));
}

function askPerson(root, request, signal) {
  return new Promise(res => {
    const id = ++nextAsk;
    pending.set(id, res);
    send('chat:ask', { id, root, ...request });
    signal?.addEventListener('abort', () => {
      if (!pending.delete(id)) return;
      res({ allow: false });
      send('chat:ask-cancel', id);
    });
  });
}

function ensureSession(root) {
  const p = get(root);
  if (!p) throw new Error('That project is not open.');
  if (p.session) return p.session;
  if (!engine.claudePath) throw new Error('Claude Code is not installed. Install it and sign in, then restart the app.');
  p.session = new ChatSession({
    root,
    claudePath: engine.claudePath,
    env: engine.env,
    autoApproveDocEdits,
    model: readSettings().model || undefined,
    resume: p.resume,
    askPerson: (request, signal) => askPerson(root, request, signal),
    onMessage: msg => { handleUsage(root, msg); send('chat:message', { root, msg }); },
  }).start();
  p.cum = {}; // running totals this session has reported, so only the difference is added to the ledger
  return p.session;
}

/* ---------- git and pull requests ---------- */
const PR_NOTICE = {
  approved: 'was approved',
  changes: 'has requested changes',
  merged: 'was merged',
  closed: 'was closed without merging',
};

/** Runs git work for one project one at a time, so a poll never overlaps a save. */
function exclusive(p, fn) {
  const run = p.lock.then(fn, fn);
  p.lock = run.catch(() => {});
  return run;
}

/** Reads (and with `fetch`, updates) the repo and its pull requests, then tells the window. */
function refreshGit(root, { fetch = false } = {}) {
  const p = get(root);
  if (!p) return Promise.resolve(null);
  return exclusive(p, async () => {
    const before = await git.status(root);
    let notes = p.git?.notes ?? [];
    let syncError = null;
    let prs = p.git?.prs ?? null;
    let prError = p.git?.prError ?? null;
    if (before.repo && before.remote && fetch) {
      if (await git.hasGh()) {
        const r = await git.listPrs(root);
        if (r.prs) { prs = r.prs; prError = null; } else prError = r.error;
      } else prError = 'Install the GitHub CLI (gh) to follow pull requests.';
      const open = new Set((prs ?? []).filter(x => !['merged', 'closed'].includes(x.status)).map(x => x.branch));
      const merged = (prs ?? []).find(x => x.status === 'merged' && x.branch === before.branch && !open.has(x.branch));
      const s = await git.sync(root, { mergedBranch: merged?.branch });
      if (s.error) syncError = s.error;
      notes = s.notes ?? [];
      notifyPrChanges(p, root, prs);
    }
    const status = await git.status(root);
    p.git = { ...status, notes, syncError, prs, prError, syncedAt: fetch ? Date.now() : p.git?.syncedAt ?? null };
    send('git:state', { root, git: p.git });
    return p.git;
  });
}

function notifyPrChanges(p, root, prs) {
  if (!prs) return;
  for (const pr of prs) {
    const prev = p.prState.get(pr.number);
    p.prState.set(pr.number, pr.status);
    if (prev && prev !== pr.status && PR_NOTICE[pr.status] && Notification.isSupported()) {
      const n = new Notification({ title: `${basename(root)}: pull request ${PR_NOTICE[pr.status]}`, body: `#${pr.number} ${pr.title}` });
      n.on('click', () => { win?.show(); send('project:focus', root); });
      n.show();
    }
  }
}

function pollGit() {
  for (const root of projects.keys()) refreshGit(root, { fetch: true });
}

/* ---------- new project: folder, git, scrumo CLI, scrumo init ---------- */
const sh = (cmd, args, cwd, timeout = 120000) => new Promise(res => execFile(cmd, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PATH: engine.path, GIT_TERMINAL_PROMPT: '0' } },
  (err, stdout, stderr) => res({ ok: !err, out: String(stdout).trim(), err: String(stderr || err?.message || '').trim() })));
const tail = s => s.split('\n').filter(Boolean).slice(-3).join(' ');
const CLI_SPEC = process.env.SCRUMO_CLI ?? 'scrumo'; // the npm package, or a path to a checkout while developing

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose or create the project folder', properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Use this folder' });
  if (r.canceled || !r.filePaths[0]) return { cancelled: true };
  const folder = r.filePaths[0];
  return {
    folder, name: basename(folder), isProject: isProject(folder), isRepo: existsSync(join(folder, '.git')),
    hasFiles: readdirSync(folder).some(n => !n.startsWith('.')),
  };
});

ipcMain.handle('project:create', async (_e, { folder, name, key, git: doGit }) => {
  if (!folder || !existsSync(folder)) return { error: 'That folder doesn\'t exist.' };
  if (isProject(folder)) return { error: 'That folder is already a scrumo project.' };
  name = String(name ?? '').trim();
  if (!name) return { error: 'Give the project a name.' };
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key ?? '')) return { error: 'The ticket key is 2 to 10 capital letters or digits, starting with a letter.' };
  const progress = (id, state, msg = '') => send('create:progress', { id, state, msg });
  const step = async (id, fn) => { progress(id, 'run'); const r = await fn(); if (r?.skip) progress(id, 'skip'); else if (r.ok) progress(id, 'done'); else { progress(id, 'err', tail(r.err)); return false; } return true; };

  if (doGit && !existsSync(join(folder, '.git'))) { if (!await step('git', () => sh('git', ['init', '-q'], folder))) return { error: 'Couldn\'t set up git. Is it installed?' }; } else progress('git', 'skip');
  if (!await step('package', async () => (existsSync(join(folder, 'package.json')) ? { skip: true } : sh('npm', ['init', '-y', '--silent'], folder)))) return { error: 'npm isn\'t available. Install Node.js and try again.' };
  const ignore = join(folder, '.gitignore');
  try { const cur = existsSync(ignore) ? readFileSync(ignore, 'utf8') : ''; if (!/^node_modules\/?$/m.test(cur)) writeFileSync(ignore, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}node_modules/\n`); } catch { /* not fatal */ }
  if (!await step('cli', () => sh('npm', ['install', '--save-dev', '--silent', CLI_SPEC], folder, 300000))) return { error: 'Couldn\'t install the scrumo CLI. Check your network and that npm can reach the registry.' };
  const cli = join(folder, 'node_modules/.bin/scrumo');
  if (!await step('init', () => sh(cli, ['init', '--key', key, '--name', name, '--agents', 'claude'], folder))) return { error: 'scrumo init failed.' };
  await step('me', async () => { const r = await sh(cli, ['team', 'add', '--me'], folder); return r.ok ? r : { skip: true }; });
  if (doGit) await step('commit', async () => { await sh('git', ['add', '-A'], folder); const r = await sh('git', ['commit', '-q', '-m', 'Set up scrumo'], folder); return r.ok ? r : { skip: true }; });
  else progress('commit', 'skip');
  return { project: addProject(folder) };
});

/* ---------- models and usage ---------- */
const ledgerFile = () => join(app.getPath('userData'), 'usage.json');
let ledger = null;
const loadLedger = () => (ledger ??= (() => { try { return JSON.parse(readFileSync(ledgerFile(), 'utf8')); } catch { return { days: {}, limits: {} }; } })());
let ledgerTimer;
const saveLedger = () => { clearTimeout(ledgerTimer); ledgerTimer = setTimeout(() => { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(ledgerFile(), JSON.stringify(ledger)); } catch { /* not worth failing over */ } }, 800); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
let modelsCache = null;

/** Records what a finished turn used (the difference since the last result), plan limits, and the context fill. */
async function handleUsage(root, msg) {
  const p = get(root);
  const l = loadLedger();
  if (msg.type === 'system' && msg.subtype === 'init' && !modelsCache && p?.session) {
    p.session.models().then(list => { if (list?.length) { modelsCache = list.map(m => ({ value: m.value, name: m.displayName, description: m.description })); send('models:list', modelsCache); } });
  } else if (msg.type === 'rate_limit_event' && msg.rate_limit_info) {
    const i = msg.rate_limit_info;
    const windows = Object.entries(i.unifiedWindows ?? {}); // the 5-hour and weekly windows arrive together
    if (windows.length) for (const [k, w] of windows) l.limits[k] = { status: k === i.rateLimitType ? i.status : 'allowed', utilization: w.utilization, resetsAt: w.resetsAt, at: Date.now() };
    else l.limits[i.rateLimitType ?? 'other'] = { ...i, at: Date.now() };
    saveLedger();
    send('usage:limits', l.limits);
  } else if (msg.type === 'result' && p) {
    const day = ((l.days[today()] ??= {})[root] ??= { turns: 0, models: {} });
    day.turns += 1;
    for (const [model, u] of Object.entries(msg.modelUsage ?? {})) {
      const prev = p.cum?.[model] ?? ZERO;
      const cur = { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0, cacheRead: u.cacheReadInputTokens ?? 0, cacheWrite: u.cacheCreationInputTokens ?? 0, cost: u.costUSD ?? 0 };
      const m = (day.models[model] ??= { ...ZERO });
      for (const k of Object.keys(ZERO)) m[k] += Math.max(0, cur[k] - prev[k]);
      (p.cum ??= {})[model] = cur;
    }
    saveLedger();
    send('usage:update', { root, total: msg.total_cost_usd ?? 0, modelUsage: msg.modelUsage ?? {} });
    const c = await p.session?.context();
    if (c) send('usage:context', { root, totalTokens: c.totalTokens, maxTokens: c.maxTokens, percentage: c.percentage, model: c.model });
  }
}

/* ---------- appearance: follow the system, or force light or dark ---------- */
const settingsFile = () => join(app.getPath('userData'), 'settings.json');
function readSettings() { try { return JSON.parse(readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function applyTheme(theme) { nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system'; }

/* ---------- updates: ask the npm registry whether a newer version is published ---------- */
const current = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const UPDATE_URL = process.env.SCRUMO_UPDATE_URL ?? 'https://registry.npmjs.org/scrumo-desktop/latest';
let update = null;
const newer = (a, b) => { // is semver a newer than b (numeric parts only)?
  const x = String(a).split('-')[0].split('.').map(Number), y = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function checkForUpdate() {
  if (readSettings().updates === false) return;
  try {
    const res = await fetch(UPDATE_URL, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (!res.ok) return; // not published yet, or offline: stay quiet
    const { version } = await res.json();
    if (version && newer(version, current) && version !== update?.version) {
      update = { version, current, canInstall: isGlobalInstall() };
      send('update:available', update);
    }
  } catch { /* offline: try again later */ }
}

/* ---------- IPC ---------- */
ipcMain.handle('app:init', () => ({
  projects: [...projects.keys()].map(projectInfo),
  open: launchProject,
  engine: { claudePath: engine.claudePath, version: engine.version },
  theme: readSettings().theme ?? 'system',
  updates: readSettings().updates !== false,
  model: readSettings().model ?? '',
  models: modelsCache,
  version: current,
  update,
}));
ipcMain.handle('project:add', async (_e, folder) => {
  let picked = typeof folder === 'string' ? folder : null; // a folder already chosen, for example in the new-project flow
  if (!picked) {
    const r = await dialog.showOpenDialog(win, { title: 'Open a scrumo project', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    picked = r.filePaths[0];
  }
  if (!isProject(picked)) return { error: 'That folder has no scrumo.yaml. Pick the root of a scrumo project.' };
  return { project: addProject(picked) };
});
ipcMain.handle('project:remove', (_e, root) => removeProject(root));
ipcMain.handle('project:docs', (_e, root) => (get(root) ? listDocs(root) : []));
ipcMain.handle('scrumo', (_e, root, args) => (get(root) ? scrumo(root, args) : { code: 1, stdout: '', stderr: 'Project not open', json: null }));
ipcMain.handle('chat:send', (_e, root, text) => {
  try { ensureSession(root).send(text); return { ok: true }; } catch (err) { return { error: err.message }; }
});
ipcMain.handle('chat:interrupt', (_e, root) => get(root)?.session?.interrupt());
ipcMain.handle('chat:reset', (_e, root) => { const p = get(root); p?.session?.close(); if (p) { p.session = null; p.resume = null; } });
ipcMain.handle('chats:list', (_e, root) => (get(root) ? recentChats(root) : []));
ipcMain.handle('chats:open', async (_e, root, id) => { // shows an earlier chat; the next message continues it
  const p = get(root);
  if (!p) return [];
  p.session?.close();
  p.session = null;
  p.resume = id;
  return chatMessages(root, id);
});
ipcMain.handle('chat:answer', (_e, { id, allow, message, answers, annotations }) => {
  const res = pending.get(id);
  if (res) { pending.delete(id); res({ allow, message, answers, annotations }); }
});
ipcMain.handle('settings:auto-edits', (_e, value) => {
  autoApproveDocEdits = !!value;
  for (const p of projects.values()) if (p.session) p.session.autoApproveDocEdits = autoApproveDocEdits;
});

ipcMain.handle('git:sync', (_e, root) => refreshGit(root, { fetch: true }));
ipcMain.handle('git:status', (_e, root) => refreshGit(root));
ipcMain.handle('git:identity', (_e, root) => (get(root) ? git.identity(root) : null));
ipcMain.handle('git:set-identity', async (_e, root, who) => {
  if (!get(root)) return { error: 'Project not open' };
  return git.setIdentity(root, who);
});
ipcMain.handle('git:diff', (_e, root, file) => (get(root) ? git.diff(root, String(file)) : { text: '' }));
ipcMain.handle('git:file-log', (_e, root, file) => (get(root) ? git.fileLog(root, String(file)) : null));
ipcMain.handle('git:save', async (_e, root, { title, body }) => {
  const p = get(root);
  if (!p) return { error: 'Project not open' };
  const prs = p.git?.prs ?? [];
  const result = await exclusive(p, () => git.save(root, {
    title, body,
    openPrBranches: prs.filter(x => !['merged', 'closed'].includes(x.status)).map(x => x.branch),
    mergedBranches: prs.filter(x => x.status === 'merged').map(x => x.branch),
  }));
  await refreshGit(root, { fetch: !!result.ok });
  return result;
});
ipcMain.handle('usage:get', () => { const l = loadLedger(); const keep = Object.keys(l.days).sort().slice(-120); return { days: Object.fromEntries(keep.map(d => [d, l.days[d]])), limits: l.limits, models: modelsCache, model: readSettings().model ?? '' }; });
ipcMain.handle('model:set', async (_e, model) => {
  try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), model: model || '' }, null, 2)); } catch { /* not worth failing over */ }
  for (const p of projects.values()) await p.session?.setModel(model || undefined);
});
ipcMain.handle('settings:theme', (_e, theme) => {
  applyTheme(theme);
  try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), theme }, null, 2)); } catch { /* not worth failing over */ }
});
ipcMain.handle('settings:updates', (_e, on) => {
  try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), updates: !!on }, null, 2)); } catch { /* not worth failing over */ }
  if (on) checkForUpdate(); else update = null;
});
ipcMain.handle('update:install', () => new Promise(res => {
  if (!isGlobalInstall()) return res({ error: 'This copy wasn\'t installed with npm install -g, so it can\'t update itself.' });
  execFile('npm', ['install', '-g', 'scrumo-desktop@latest'], { env: { ...process.env, PATH: engine.path }, timeout: 300000, maxBuffer: 8 * 1024 * 1024 },
    (err, _out, stderr) => res(err ? { error: String(stderr || err.message).trim().split('\n').slice(-3).join(' ') } : { ok: true }));
}));
ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('open-url', (_e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });

let launchProject = null; // a project named on the command line: the window opens straight into it

app.whenReady().then(() => {
  engine.path = loginShellPath();
  engine.claudePath = findClaude(engine.path);
  engine.env = engineEnv(engine.path);
  engine.version = engine.claudePath ? claudeVersion(engine.claudePath, engine.env) : null;

  git.setPath(engine.path);
  applyTheme(process.env.SCRUMO_CLIENT_THEME ?? readSettings().theme);

  for (const r of loadRegistry()) addProject(r);
  const arg = projectArg(process.argv) ?? (isProject(process.env.SCRUMO_PROJECT) ? resolve(process.env.SCRUMO_PROJECT) : null);
  if (arg) { addProject(arg); launchProject = arg; }
  const demo = join(here, '../.demo/pawplan');
  if (!projects.size && isProject(demo)) addProject(demo);
  setInterval(pollGit, 60_000);
  setTimeout(checkForUpdate, 4000);
  setInterval(checkForUpdate, 6 * 3600_000);

  if (process.platform === 'darwin' && !process.execPath.includes(`/${APP_NAME}.app/`)) app.dock?.setIcon(nativeImage.createFromPath(icon));
  ensureLauncher();

  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    title: APP_NAME,
    icon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // The renderer is built by Vite into dist/renderer; `npm run dev` serves it with hot reload instead.
  const devUrl = process.env.SCRUMO_RENDERER_URL;
  if (devUrl) win.loadURL(devUrl);
  else if (existsSync(renderer)) win.loadFile(renderer);
  else dialog.showErrorBox(APP_NAME, `The app's window isn't built yet. Run "npm run build -w desktop" and start it again.`);
  win.on('focus', () => send('app:focus'));

  // Dev aids. SCRUMO_CLIENT_SNAPSHOT=out.png saves a screenshot after load and logs renderer
  // console output. Adding SCRUMO_CLIENT_DEMO_PROMPT sends that prompt, clicks Allow on every
  // approval, and takes the screenshot when the turn finishes instead.
  const snapshot = process.env.SCRUMO_CLIENT_SNAPSHOT;
  if (snapshot && !launchProject && process.env.SCRUMO_CLIENT_VIEW !== 'home') launchProject = [...projects.keys()][0] ?? null;
  const demoPrompt = process.env.SCRUMO_CLIENT_DEMO_PROMPT;
  if (snapshot) {
    const js = code => win.webContents.executeJavaScript(code);
    const shoot = async () => {
      writeFileSync(snapshot, (await win.webContents.capturePage()).toPNG());
      console.log(`snapshot saved: ${snapshot}`);
    };
    win.webContents.on('console-message', e => console.log(`[renderer] ${e.message}`));
    if (process.env.SCRUMO_CLIENT_DEMO_ASK) { // shows a sample multiple-choice question from the agent
      win.webContents.once('did-finish-load', () => setTimeout(() => send('chat:ask', { id: 9001, root: [...projects.keys()][0], toolName: 'AskUserQuestion', input: { questions: [
        { header: 'Approach', question: 'How should late cancellations be handled in the PRD?', multiSelect: false, options: [{ label: 'Flat fee', description: 'A fixed EUR 15 charge inside 24 hours' }, { label: 'Percentage', description: 'A share of the booking price' }, { label: 'No fee', description: 'Only warn the owner' }] },
        { header: 'Channels', question: 'Where should owners be told?', multiSelect: true, options: [{ label: 'Email', description: 'At booking and in the reminder' }, { label: 'On screen', description: 'In the cancel dialog' }] }] } }), 3500));
    }
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.SCRUMO_CLIENT_EVAL) { await js(process.env.SCRUMO_CLIENT_EVAL); await new Promise(r => setTimeout(r, 1500)); }
      if (!demoPrompt) return shoot();
      await js(`document.querySelector('#prompt').value = ${JSON.stringify(demoPrompt)}; document.querySelector('#sendBtn').click();`);
      const timer = setInterval(async () => {
        const done = await js(`document.querySelectorAll('[data-allow]').forEach(b => b.click()); !!document.querySelector('.turn-end')`);
        if (done) { clearInterval(timer); setTimeout(shoot, 1500); }
      }, 1000);
    }, Number(process.env.SCRUMO_CLIENT_SNAPSHOT_DELAY ?? 3000)));
  }
});

// A second launch (the launcher again, or `scrumo-desktop <folder>`) focuses this window and opens its project.
app.on('second-instance', (_e, argv) => {
  const p = projectArg(argv);
  if (p) send('project:added', addProject(p));
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  for (const p of projects.values()) { p.session?.close(); p.watcher?.close(); }
  app.quit();
});
