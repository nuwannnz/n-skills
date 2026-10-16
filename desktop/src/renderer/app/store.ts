// The one store for the window. Each open project keeps its own entry, so switching
// projects loses nothing (a chat keeps running while you look at another project).
// Features change it through their own actions; components read it with the hooks below.
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import type { Draft } from 'immer';
import type {
  Context, Doc, Engine, FileLog, GitState, Identity, Model, Permissions, PickedFolder, ProjectInfo, Question, Status, Team, Update, Usage, Validation,
} from '../lib/types';

export type View = 'usage' | 'guide' | 'chat' | 'changes' | 'sprint' | 'planning' | 'backlog' | 'board' | 'epics' | 'docs' | 'doc' | 'checks' | 'team';

export type Filters = { q: string; epics: string[]; statuses: string[]; assignees: string[]; hideDone: boolean };
export type PlanDraft = { number: number; goal: string; start: string; end: string; capacity: number | null; picked: string[] };
export type MemberDraft = { name: string; email: string; roles: string[]; points: string };

/** One entry in the chat thread, above the live status line. */
export type ThreadItem =
  | { id: number; kind: 'user'; text: string; command?: string }
  | { id: number; kind: 'text'; text: string; streaming: boolean }
  | { id: number; kind: 'info'; text: string }
  | { id: number; kind: 'decided'; ok: boolean; text: string; mono?: string; answers?: { label: string; answer: string }[] }
  | { id: number; kind: 'turn-end'; ok: boolean; text: string; why?: string; files: number; retry: boolean };

/** A card waiting for the person, below the live status line. */
export type Pending =
  | { id: number; kind: 'approval'; toolName: string; input: any; file: string; exists: boolean }
  | { id: number; kind: 'question'; questions: Question[]; at: number; picked: number[][]; other: string[] };

export type Live = { state: 'starting' | 'thinking' | 'writing' | 'step' | 'needs'; label: string; detail: string; since: number };

export type ChatState = {
  items: ThreadItem[];
  pending: Pending[];
  live: Live | null;
  busy: boolean;
  stopping: boolean;
  replaying: boolean;
  turnStart: number | null;
  turnFiles: string[];
  lastSent: { skill: string; text: string } | null;
  flash: { kind: 'done' | 'stopped'; until: number } | null;
  title: string;
  files: Record<string, 'created' | 'updated'>;
  context: Context | null;
  lastUsage: { total: number } | null;
  tools: Record<string, { name: string; input: any; existed: boolean }>;
  streams: number[]; // ids of the text items still streaming, oldest first
};

export type ProjectState = {
  info: ProjectInfo;
  docs: Doc[];
  status: Status | null;
  validation: Validation | null;
  team: Team | null;
  git: GitState | null;
  identity: Identity | null;
  syncing: boolean;
  view: View;
  autoView: boolean;
  split: boolean;
  selected: string;
  peek: string | null;
  peekTrail: string[];
  backTo: { view: View; peek: string | null } | null;
  sprintShown: number | null;
  filters: Filters;
  collapsed: (string | number)[] | null;
  docQuery: string;
  plan: PlanDraft | null;
  newMember: MemberDraft;
  saveTitle: string;
  fileLogs: Record<string, FileLog>;
  composer: Composer;
  chat: ChatState;
};

/** What is typed in the chat box. Kept apart so typing doesn't redraw the views. */
export type Composer = { draft: string; skill: string; focusTick: number }; // focusTick is bumped to put the cursor in the box

export type WizardStep = { state: string; msg: string };
export type Wizard = {
  stage: 1 | 2 | 3; folder: string | null; info: PickedFolder | null; name: string; key: string; keyTouched: boolean; git: boolean;
  running: boolean; steps: Record<string, WizardStep>; error: string | null; root: string | null; brief: string;
};

export type AppState = {
  ready: boolean;
  active: string | null; // root of the open project, or null for the home screen
  projects: Record<string, ProjectState>;
  engine: Engine;
  permissions: Permissions; // one setting for every project, saved by the main process
  theme: string;
  updatesOn: boolean;
  appVersion: string;
  update: Update | null;
  wizard: Wizard | null;
  usage: Usage | null;
  usagePeriod: string;
  modelPref: string;
  models: Model[] | null;
  paletteOpen: boolean;
  navHidden: boolean; // the project sidebar, hidden with ⌘\ and remembered on this computer
};

export const useApp = create<AppState>()(immer(() => ({
  ready: false, active: null, projects: {}, engine: { claudePath: null, version: null }, permissions: 'ask', theme: 'system', updatesOn: true,
  appVersion: '', update: null, wizard: null, usage: null, usagePeriod: 'week', modelPref: '', models: null, paletteOpen: false,
  navHidden: (() => { try { return localStorage.getItem('navHidden') === '1'; } catch { return false; } })(),
})));

export const app = () => useApp.getState();
export const setApp = (fn: (s: Draft<AppState>) => void) => useApp.setState(fn);
export const getProject = (root: string | null) => (root ? useApp.getState().projects[root] ?? null : null);
/** Changes one project's entry, if it is still open. */
export const editProject = (root: string, fn: (p: Draft<ProjectState>) => void) => useApp.setState(s => { const p = s.projects[root]; if (p) fn(p); });

export const filterDefaults = (): Filters => ({ q: '', epics: [], statuses: [], assignees: [], hideDone: true });
export const newChat = (): ChatState => ({
  items: [], pending: [], live: null, busy: false, stopping: false, replaying: false, turnStart: null, turnFiles: [], lastSent: null, flash: null,
  title: '', files: {}, context: null, lastUsage: null, tools: {}, streams: [],
});
export const newProject = (info: ProjectInfo): ProjectState => ({
  info, docs: [], status: null, validation: null, team: null, git: info.git, identity: null, syncing: false,
  view: info.hasCli ? 'sprint' : 'chat', autoView: info.hasCli, split: false, selected: 'docs/prd.md', peek: null, peekTrail: [], backTo: null,
  sprintShown: null, filters: filterDefaults(), collapsed: null, docQuery: '', plan: null, newMember: { name: '', email: '', roles: ['dev'], points: '' },
  saveTitle: '', fileLogs: {}, composer: { draft: '', skill: '', focusTick: 0 }, chat: newChat(),
});

export type ProjectView = Omit<ProjectState, 'chat' | 'composer'>;
const withoutChat = (p: ProjectState): ProjectView => { const { chat: _chat, composer: _composer, ...rest } = p; return rest; };

/** The open project without its chat, so views don't redraw while the agent streams or you type. */
export const useProject = (): ProjectView | null => useProjectByRoot(useApp(s => s.active));
export function useProjectByRoot(root: string | null): ProjectView | null {
  const p = useApp(useShallow(s => { const x = root ? s.projects[root] : undefined; return x ? withoutChat(x) : NONE; }));
  return 'info' in p ? p : null;
}
const NONE = {} as ProjectView;

/** The open project's chat. */
export const useChat = (): ChatState | null => useApp(s => (s.active ? s.projects[s.active]?.chat ?? null : null));
export const useComposer = (): Composer | null => useApp(s => (s.active ? s.projects[s.active]?.composer ?? null : null));
export const useActiveRoot = () => useApp(s => s.active);
