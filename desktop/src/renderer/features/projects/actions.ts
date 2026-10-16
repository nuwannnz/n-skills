// Opening, loading and refreshing projects: documents, scrumo checks, team, git identity.
import { app, editProject, getProject, newProject, setApp, type View } from '../../app/store';
import { api } from '../../lib/api';
import { parseDoc } from '../../lib/markdown';
import type { ProjectInfo } from '../../lib/types';
import { toast } from '../../ui';
import { guideDone } from '../guide/steps';
import { setView } from '../workspace/navigation';

export async function loadDocs(root: string) {
  const docs = await api.docs(root);
  editProject(root, p => { p.docs = docs.map(d => ({ ...d, ...parseDoc(d.text) })); });
}

export async function reloadTeam(root: string) {
  const t = await api.scrumo(root, ['team', 'list', '--json']);
  editProject(root, p => { p.team = t.json; });
}

export async function refreshChecks(root: string) {
  if (!getProject(root)?.info.hasCli) return;
  const [v, s, t] = await Promise.all([api.scrumo(root, ['validate', '--json']), api.scrumo(root, ['status', '--json']), api.scrumo(root, ['team', 'list', '--json'])]);
  editProject(root, p => {
    p.validation = v.json;
    p.status = s.json;
    p.team = t.json;
    if (p.autoView) { // a new project opens on its guide until the workflow is done
      p.autoView = false;
      if (p.view === 'sprint' && !guideDone(p)) p.view = 'guide';
    }
  });
}

export async function loadIdentity(root: string) {
  const who = await api.git.identity(root);
  editProject(root, p => { p.identity = who; });
}

/** Everything that may have changed after the agent or a scrumo command touched the project. */
export function refreshAll(root: string) {
  loadDocs(root);
  refreshChecks(root);
  api.git.status(root);
}

/** Runs a scrumo command for a project and reports how it went. */
export async function run(root: string, args: string[], { quiet = false } = {}) {
  const r = await api.scrumo(root, args);
  if (r.code !== 0) {
    toast((r.stderr || r.stdout || 'The scrumo command failed.').trim().split('\n').slice(0, 3).join(' '), 'err');
    return { ok: false, r };
  }
  if (!quiet) toast((r.stdout || 'Done.').trim().split('\n')[0]!);
  await Promise.all([loadDocs(root), refreshChecks(root)]);
  api.git.status(root);
  return { ok: true, r };
}

export function makeProject(info: ProjectInfo) {
  if (getProject(info.root)) return;
  setApp(s => { s.projects[info.root] = newProject(info); });
  loadDocs(info.root);
  refreshChecks(info.root);
  api.git.sync(info.root);
  loadIdentity(info.root);
}

/** Shows a project (or the home screen, for null), optionally on a given view. */
export function show(root: string | null, view?: View) {
  setApp(s => { s.active = root; s.wizard = null; s.paletteOpen = false; });
  if (root === null) return;
  setView(view ?? getProject(root)!.view);
  api.git.sync(root);
}

export async function addProject() {
  const r = await api.addProject();
  if (r.error) return toast(r.error, 'err');
  if (!r.project) return;
  makeProject(r.project);
  show(r.project.root, 'sprint');
}

export async function openExistingFolder(folder: string) {
  const r = await api.addProject(folder);
  if (r.project) { makeProject(r.project); show(r.project.root, 'sprint'); }
}

export async function removeProject(root: string) {
  const p = getProject(root);
  if (!p || !confirm(`Remove ${p.info.name} from the list? Its files stay where they are.`)) return;
  await api.removeProject(root);
  setApp(s => { delete s.projects[root]; if (s.active === root) s.active = null; });
}

export function syncNow(root: string) {
  editProject(root, p => { p.syncing = true; });
  api.git.sync(root);
}

export const projectName = (root: string) => app().projects[root]?.info.name ?? root.split('/').pop() ?? root;
