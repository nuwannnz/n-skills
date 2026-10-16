// Connects the main process to the store: the app's starting state, then every event it sends.
import { api } from '../lib/api';
import { toast } from '../ui';
import { onAsk, onAskCancel, onMessage, stop } from '../features/chat/actions';
import { makeProject, refreshAll, show } from '../features/projects/actions';
import { refreshUsage } from '../features/usage/actions';
import { editWizard } from '../features/wizard/actions';
import { closePeek } from '../features/workspace/navigation';
import { app, editProject, getProject, setApp } from './store';

function listen() {
  api.on('chat:message', onMessage);
  api.on('chat:ask', onAsk);
  api.on('chat:ask-cancel', onAskCancel);
  api.on('create:progress', ({ id, state, msg }) => editWizard(w => { w.steps[id] = { state, msg }; }));
  api.on('usage:update', ({ root, total }) => { editProject(root, p => { p.chat.lastUsage = { total }; }); refreshUsage(); });
  api.on('usage:context', ({ root, ...c }) => editProject(root, p => { p.chat.context = c; }));
  api.on('usage:limits', () => refreshUsage());
  api.on('models:list', list => setApp(s => { s.models = list; }));
  api.on('docs:changed', root => { if (getProject(root)) refreshAll(root); });
  api.on('project:added', info => { makeProject(info); show(info.root); });
  api.on('project:focus', root => { if (getProject(root)) show(root, 'changes'); });
  api.on('update:available', u => { if (app().updatesOn) setApp(s => { s.update = u; }); });
  api.on('app:focus', () => { const root = app().active; if (root) api.git.sync(root); });
  api.on('git:state', ({ root, git }) => {
    const before = getProject(root)?.git?.notes ?? [];
    (git.notes ?? []).filter(n => !before.includes(n)).forEach(n => toast(n));
    editProject(root, p => { p.git = git; p.syncing = false; });
  });
}

/** Esc closes the drawer, or stops the agent while you watch it; ⌘K (Ctrl+K) opens the finder. Popovers take Esc first. */
function keys() {
  document.addEventListener('keydown', e => {
    const s = app();
    const p = getProject(s.active);
    if (e.key === 'Escape' && p && !s.paletteOpen) {
      if (p.peek && p.view !== 'doc') closePeek();
      else if (p.chat.busy && p.view === 'chat') stop(p.info.root);
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && s.active) { e.preventDefault(); setApp(x => { x.paletteOpen = true; }); }
  });
}

export async function start() {
  listen();
  keys();
  const init = await api.init();
  setApp(s => {
    s.engine = init.engine;
    s.theme = init.theme ?? 'system';
    s.modelPref = init.model ?? '';
    s.models = init.models ?? null;
    s.updatesOn = init.updates !== false;
    s.appVersion = init.version ?? '';
    s.update = init.update ?? null;
    s.ready = true;
  });
  init.projects.forEach(makeProject);
  const open = init.open && getProject(init.open) ? init.open : null;
  show(open, open ? 'sprint' : undefined);
}
