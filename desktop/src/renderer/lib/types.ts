// Shapes of what the main process sends the renderer (see src/main.js and src/git.js).

export type ProjectInfo = {
  root: string;
  name: string;
  key: string;
  skills: string[];
  hasCli: boolean;
  git: GitState | null;
};

export type DocFile = { path: string; text: string };
export type Doc = DocFile & { meta: Record<string, string>; body: string };

export type ChangedFile = { path: string; code: string; kind: string };
export type PrStatus = 'review' | 'approved' | 'changes' | 'merged' | 'closed' | 'draft';
export type Pr = {
  number: number; title: string; url: string; branch: string; base: string; updatedAt: string; mergedAt: string | null;
  status: PrStatus; conflicts: boolean; checks: 'passing' | 'failing' | 'pending' | null;
};
export type GitState = {
  repo: boolean; error?: string; branch: string; upstream: string | null; ahead: number; behind: number; behindBase: number;
  defaultBranch: string; onDefault: boolean; remote: string | null; files: ChangedFile[];
  notes?: string[]; syncError?: string | null; prs?: Pr[] | null; prError?: string | null; syncedAt?: number | null;
};
export type Identity = { name: string; email: string; source: string; gh: { login: string; name: string; email: string } | null };
export type FileLog = { name: string; email: string; at: number; hash: string; subject: string } | null;

export type Sprint = {
  number: number; status: 'planned' | 'active' | 'closed'; goal: string; start: string; end: string;
  points: number; donePoints: number;
  pace?: { expectedPct: number; verdict: string } | null;
  days?: { left: number; total: number } | null;
};
export type Status = {
  sprints?: Sprint[];
  attention?: string[];
  epicProgress?: { id: string; stories: number; doneStories: number; points: number; donePoints: number }[];
  documents?: Record<string, string>;
  epics?: Record<string, number>;
  stories?: Record<string, number>;
  velocity?: { average: number; history: number[] };
};
export type Finding = { code: string; severity: string; message: string; file: string; line?: number };
export type Validation = { ok: boolean; files: number; findings: Finding[] };
export type Member = { id: string; name: string; emails: string[]; roles: string[]; points: number | null };
export type Team = { team: Member[]; capacity: number };

export type ScrumoResult = { code: number; stdout: string; stderr: string; json: any };
export type Model = { value: string; name: string; description?: string; resolved?: string };
/** How much the agent may do without asking (see decide() in src/engine.js). */
export type Permissions = 'ask' | 'edits' | 'auto';
export type Update = { version: string; canInstall: boolean };
export type Usage = {
  days: Record<string, Record<string, { turns: number; models?: Record<string, Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'cost', number>>> }>>;
  limits?: Record<string, { utilization?: number | null; resetsAt?: number; status?: string; at?: number }>;
  models?: Model[];
  model?: string;
};
export type Context = { totalTokens: number; maxTokens: number; percentage: number; model?: string };
export type ChatSummary = { id: string; title: string; at: number };
export type Engine = { claudePath: string | null; version: string | null };
export type Init = {
  projects: ProjectInfo[]; open: string | null; engine: Engine; theme?: string; updates?: boolean;
  model?: string; models?: Model[] | null; version?: string; update?: Update | null; permissions?: Permissions;
};
export type Question = { header?: string; question: string; multiSelect?: boolean; options?: { label: string; description?: string; preview?: string }[] };
export type AskRequest = { id: number; root: string; toolName: string; input: any };
export type PickedFolder = { cancelled?: true; folder: string; name: string; isProject: boolean; isRepo: boolean; hasFiles: boolean };
export type SaveResult = { error?: string; needsIdentity?: boolean; prUrl?: string; updated?: boolean; note?: string; compareUrl?: string };
