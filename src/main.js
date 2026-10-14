import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatSession, claudeVersion, engineEnv, findClaude, loginShellPath } from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
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

function openProject(p) {
  root = resolve(p);
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

  const start = process.env.SCRUMO_PROJECT ?? join(here, '../.demo/pawplan');
  if (isProject(start)) openProject(start);

  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    title: 'scrumo',
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

app.on('window-all-closed', () => {
  session?.close();
  watcher?.close();
  app.quit();
});
