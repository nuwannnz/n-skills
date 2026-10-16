import { app, setApp, type Wizard } from '../../app/store';
import { api } from '../../lib/api';
import { send } from '../chat/actions';
import { makeProject, show } from '../projects/actions';
import { chatWith } from '../workspace/navigation';

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

/** A ticket key from the project name: initials of several words, or the first letters of one. */
export const suggestKey = (name: string) => {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const k = (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? '').slice(0, 3)).toUpperCase().replace(/^[0-9]+/, '').slice(0, 5);
  return k.length >= 2 ? k : (k + 'XX').slice(0, 2);
};
export const keyOk = (key: string) => /^[A-Z][A-Z0-9]{1,9}$/.test(key);

const fresh = (): Wizard => ({ stage: 1, folder: null, info: null, name: '', key: '', keyTouched: false, git: true, running: false, steps: {}, error: null, root: null, brief: '' });
export const editWizard = (fn: (w: Wizard) => void) => setApp(s => { if (s.wizard) fn(s.wizard); });

export function openWizard() {
  setApp(s => { s.active = null; s.wizard = fresh(); });
}

/** Leaves the flow, opening the new project (on the guide, or in the chat with the kickoff started). */
export function closeWizard(open: boolean, kick?: { skill: string; text: string }) {
  const root = app().wizard?.root ?? null;
  setApp(s => { s.wizard = null; });
  if (!root) return show(null);
  show(root, open && kick ? 'chat' : 'guide');
  if (open && kick) { chatWith(kick.skill, kick.text); send(root); }
}

export async function pickFolder() {
  const r = await api.pickFolder();
  if (r.cancelled) return;
  editWizard(w => {
    Object.assign(w, { folder: r.folder, info: r, error: null, steps: {}, git: !r.isRepo });
    if (!w.name) w.name = titleCase(r.name);
    if (!w.keyTouched) w.key = suggestKey(w.name);
  });
}

export async function createProject() {
  const w = app().wizard;
  if (!w?.folder) return;
  editWizard(x => { Object.assign(x, { running: true, error: null, steps: {} }); });
  const r = await api.createProject({ folder: w.folder, name: w.name.trim(), key: w.key, git: w.git });
  if (r.error || !r.project) return editWizard(x => { x.running = false; x.error = r.error ?? 'Setting up the project failed.'; });
  makeProject(r.project);
  editWizard(x => { x.running = false; x.root = r.project!.root; x.stage = 2; });
}
