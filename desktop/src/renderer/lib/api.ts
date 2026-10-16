// The bridge the preload script (src/preload.cjs) puts on window.api, typed.
import type {
  AskRequest, ChatSummary, Context, DocFile, FileLog, GitState, Identity, Init, Model, Permissions, PickedFolder, ProjectInfo, SaveResult, ScrumoResult, Update, Usage,
} from './types';

type Events = {
  'chat:message': { root: string; msg: any };
  'chat:ask': AskRequest;
  'chat:ask-cancel': number;
  'docs:changed': string;
  'project:added': ProjectInfo;
  'project:focus': string;
  'git:state': { root: string; git: GitState };
  'app:focus': void;
  'update:available': Update;
  'create:progress': { id: string; state: string; msg: string };
  'usage:update': { root: string; total: number };
  'usage:context': { root: string } & Context;
  'usage:limits': unknown;
  'models:list': Model[];
};

export type Api = {
  init(): Promise<Init>;
  addProject(folder?: string): Promise<{ project?: ProjectInfo; error?: string; cancelled?: true }>;
  pickFolder(): Promise<PickedFolder>;
  createProject(o: { folder: string; name: string; key: string; git: boolean }): Promise<{ project?: ProjectInfo; error?: string }>;
  removeProject(root: string): Promise<void>;
  docs(root: string): Promise<DocFile[]>;
  scrumo(root: string, args: string[]): Promise<ScrumoResult>;
  send(root: string, text: string): Promise<{ error?: string } | undefined>;
  interrupt(root: string): Promise<void>;
  reset(root: string): Promise<void>;
  chats(root: string): Promise<ChatSummary[]>;
  openChat(root: string, id: string): Promise<any[]>;
  answer(a: { id: number; allow: boolean; message?: string; answers?: Record<string, string> }): Promise<void>;
  setTheme(theme: string): Promise<void>;
  usage(): Promise<Usage>;
  setModel(model: string): Promise<void>;
  setUpdates(on: boolean): Promise<void>;
  installUpdate(): Promise<{ error?: string }>;
  restart(): Promise<void>;
  setPermissions(mode: Permissions): Promise<void>;
  git: {
    sync(root: string): Promise<GitState>;
    status(root: string): Promise<GitState>;
    identity(root: string): Promise<Identity>;
    setIdentity(root: string, who: { name: string; email: string }): Promise<{ ok?: true; error?: string }>;
    diff(root: string, file: string): Promise<{ text: string }>;
    fileLog(root: string, file: string): Promise<FileLog>;
    save(root: string, o: { title?: string; body?: string }): Promise<SaveResult>;
  };
  openUrl(url: string): Promise<void>;
  on<K extends keyof Events>(channel: K, fn: (data: Events[K]) => void): void;
};

declare global { interface Window { api: Api } }

export const api = window.api;
