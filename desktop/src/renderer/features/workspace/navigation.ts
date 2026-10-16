// Moving around inside the open project: views, the full document, the side drawer, and handing text to the chat.
import { app, editProject, setApp, type View } from '../../app/store';
import { isEpic, isStory } from '../../lib/data';
import { refreshUsage } from '../usage/actions';

const active = () => app().active;

export function setView(view: View, { peek = null }: { peek?: string | null } = {}) {
  const root = active();
  if (!root) return;
  editProject(root, p => {
    p.view = view;
    p.peek = peek;
    p.peekTrail = [];
    if (view === 'chat') p.composer.focusTick++;
  });
  if (view === 'usage') refreshUsage();
}

/** Stories and epics open in the drawer unless `full`; everything else opens full window. */
export function openDoc(path: string, { full = false } = {}) {
  if (!full && (isStory(path) || isEpic(path))) return peek(path);
  openFull(path);
}

export function openFull(path: string) {
  const root = active();
  if (!root) return;
  editProject(root, p => {
    if (p.view !== 'doc') p.backTo = { view: p.view, peek: p.peek };
    p.selected = path;
  });
  setView('doc');
}

/** Back from a full document to the view it was opened from. */
export function goBack() {
  const root = active();
  const to = root ? app().projects[root]?.backTo : null;
  if (!root || !to) return;
  editProject(root, p => { p.backTo = null; });
  setView(to.view, { peek: to.peek });
}

/** Shows a story or epic in the drawer. `push` keeps the current one so Back returns to it. */
export function peek(path: string, { push = false } = {}) {
  const root = active();
  if (!root) return;
  editProject(root, p => {
    if (push && p.peek) p.peekTrail.push(p.peek); else p.peekTrail = [];
    p.peek = path;
  });
}

export const peekBack = () => { const root = active(); if (root) editProject(root, p => { p.peek = p.peekTrail.pop() ?? null; }); };
export const closePeek = () => { const root = active(); if (root) editProject(root, p => { p.peek = null; p.peekTrail = []; }); };
/** Hides or shows the project sidebar; the choice is remembered on this computer. */
export function toggleNav() {
  setApp(s => { s.navHidden = !s.navHidden; });
  try { localStorage.setItem('navHidden', app().navHidden ? '1' : '0'); } catch { /* storage may be unavailable */ }
}
export const toggleSplit = () => { const root = active(); if (root) editProject(root, p => { p.split = !p.split; }); };

/** Opens the chat with a skill picked and the start of a message typed, ready to finish. */
export function chatWith(skill: string, text: string) {
  const root = active();
  if (!root) return;
  setView('chat');
  editProject(root, p => {
    if (p.info.skills.includes(skill)) p.composer.skill = skill;
    p.composer.draft = text;
    p.composer.focusTick++;
  });
}
