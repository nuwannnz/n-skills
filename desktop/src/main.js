import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatSession, claudeVersion, engineEnv, findClaude, loginShellPath } from './engine.js';
import { APP_ID, APP_NAME, electronBinary, installLauncher, isGlobalInstall, launcherExists, launcherPath, pkgDir } from './launcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const icon = join(here, '../build/icon.png');

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) app.exit(0); // the running instance gets 'second-instance'
let win = null;
let root = null;
let watcher = null;
let session = null;
let autoApproveDocEdits = false;
const pending = new Map();
let nextAsk = 0;
const engine = { path: '', claudePath: null, version: null, env: {} };

const send = (channel, data) => win?.webContents.send(channel, data);
const isProject = p => p && existsSync(join(p, 'scrumo.yaml'));

function projectInfo() {
  if (!root) return null;
  const yaml = readFileSync(join(root, 'scrumo.yaml'), 'utf8');
  const name = yaml.match(/^\s+name:\s*(.+)$/m)?.[1]?.trim() ?? basename(root);
  const key = yaml.match(/^\s+key:\s*(\S+)/m)?.[1] ?? '';
  const skills = existsSync(join(root, '.claude/skills')) ? readdirSync(join(root, '.claude/skills')).filter(s => !s.startsWith('.')) : [];
  return { root, name, key, skills, hasCli: existsSync(join(root, 'node_modules/.bin/scrumo')) };
}

/** A project folder named on the command line (scrumo-desktop <folder>, or a second launch). */
const projectArg = argv => argv.slice(1).map(a => resolve(a)).reverse().find(a => a !== pkgDir && isProject(a)) ?? null;

const recentsFile = () => join(app.getPath('userData'), 'recent-projects.json');
function recentProjects() {
  try { return JSON.parse(readFileSync(recentsFile(), 'utf8')).filter(isProject); } catch { return []; }
}
function rememberProject(p) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(recentsFile(), JSON.stringify([p, ...recentProjects().filter(r => r !== p)].slice(0, 10), null, 2));
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

function openProject(p) {
  root = resolve(p);
  rememberProject(root);
  session?.close();
  session = null;
  watcher?.close();
  let timer;
  watcher = watch(join(root, 'docs'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => send('docs:changed'), 250);
  });
  return projectInfo();
}

function listDocs() {
  const out = [];
  const walk = d => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.md')) out.push({ path: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  walk(join(root, 'docs'));
  return out;
}

function scrumo(args) {
  return new Promise(res => execFile(join(root, 'node_modules/.bin/scrumo'), args,
    { cwd: root, env: { ...process.env, PATH: engine.path }, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr, json });
    }));
}

function askPerson(request, signal) {
  return new Promise(res => {
    const id = ++nextAsk;
    pending.set(id, res);
    send('chat:ask', { id, ...request });
    signal?.addEventListener('abort', () => {
      if (!pending.delete(id)) return;
      res({ allow: false });
      send('chat:ask-cancel', id);
    });
  });
}

function ensureSession() {
  if (session) return session;
  if (!engine.claudePath) throw new Error('Claude Code is not installed. Install it and sign in, then restart the app.');
  session = new ChatSession({
    root,
    claudePath: engine.claudePath,
    env: engine.env,
    autoApproveDocEdits,
    askPerson,
    onMessage: msg => send('chat:message', msg),
  }).start();
  return session;
}

ipcMain.handle('app:init', () => ({
  project: projectInfo(),
  engine: { claudePath: engine.claudePath, version: engine.version },
}));
ipcMain.handle('project:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open a scrumo project', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { cancelled: true };
  if (!isProject(r.filePaths[0])) return { error: 'That folder has no scrumo.yaml. Pick the root of a scrumo project.' };
  return { project: openProject(r.filePaths[0]) };
});
ipcMain.handle('project:docs', () => (root ? listDocs() : []));
ipcMain.handle('scrumo', (_e, args) => scrumo(args));
ipcMain.handle('chat:send', (_e, text) => {
  try { ensureSession().send(text); return { ok: true }; } catch (err) { return { error: err.message }; }
});
ipcMain.handle('chat:interrupt', () => session?.interrupt());
ipcMain.handle('chat:reset', () => { session?.close(); session = null; });
ipcMain.handle('chat:answer', (_e, { id, allow, message }) => {
  const res = pending.get(id);
  if (res) { pending.delete(id); res({ allow, message }); }
});
ipcMain.handle('settings:auto-edits', (_e, value) => {
  autoApproveDocEdits = !!value;
  if (session) session.autoApproveDocEdits = autoApproveDocEdits;
});

app.whenReady().then(() => {
  engine.path = loginShellPath();
  engine.claudePath = findClaude(engine.path);
  engine.env = engineEnv(engine.path);
  engine.version = engine.claudePath ? claudeVersion(engine.claudePath, engine.env) : null;

  const start = projectArg(process.argv) ?? process.env.SCRUMO_PROJECT ?? recentProjects()[0] ?? join(here, '../.demo/pawplan');
  if (isProject(start)) openProject(start);

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
    backgroundColor: '#f2f5f5',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(join(here, 'renderer/index.html'));

  // Dev aids. SCRUMO_CLIENT_SNAPSHOT=out.png saves a screenshot after load and logs renderer
  // console output. Adding SCRUMO_CLIENT_DEMO_PROMPT sends that prompt, clicks Allow on every
  // approval, and takes the screenshot when the turn finishes instead.
  const snapshot = process.env.SCRUMO_CLIENT_SNAPSHOT;
  const demoPrompt = process.env.SCRUMO_CLIENT_DEMO_PROMPT;
  if (snapshot) {
    const js = code => win.webContents.executeJavaScript(code);
    const shoot = async () => {
      writeFileSync(snapshot, (await win.webContents.capturePage()).toPNG());
      console.log(`snapshot saved: ${snapshot}`);
    };
    win.webContents.on('console-message', e => console.log(`[renderer] ${e.message}`));
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (!demoPrompt) return shoot();
      await js(`document.querySelector('#prompt').value = ${JSON.stringify(demoPrompt)}; document.querySelector('#sendBtn').click();`);
      const timer = setInterval(async () => {
        const done = await js(`document.querySelectorAll('[data-allow]').forEach(b => b.click()); !!document.querySelector('.result, .info.err')`);
        if (done) { clearInterval(timer); setTimeout(shoot, 1500); }
      }, 1000);
    }, Number(process.env.SCRUMO_CLIENT_SNAPSHOT_DELAY ?? 3000)));
  }
});

// A second launch (the launcher again, or `scrumo-desktop <folder>`) focuses this window and opens its project.
app.on('second-instance', (_e, argv) => {
  const p = projectArg(argv);
  if (p && p !== root) send('project:switched', openProject(p));
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  session?.close();
  watcher?.close();
  app.quit();
});
