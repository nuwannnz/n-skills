// The chat with the agent: messages from Claude Code turned into the thread, approval
// and question cards, and sending, stopping and reopening chats.
import type { Draft } from 'immer';
import { app, editProject, getProject, newChat, setApp, type AppState, type ChatState, type Live, type Pending, type ThreadItem } from '../../app/store';
import { api } from '../../lib/api';
import { ago, elapsed } from '../../lib/format';
import type { AskRequest, ChatSummary } from '../../lib/types';
import { loadDocs, refreshAll } from '../projects/actions';
import { setView } from '../workspace/navigation';

export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit'];
type NewItem = ThreadItem extends infer T ? (T extends ThreadItem ? Omit<T, 'id'> : never) : never;

let nextId = 1;
const push = (c: Draft<ChatState>, item: NewItem) => { const id = nextId++; c.items.push({ ...item, id } as ThreadItem); return id; };

export const relPath = (root: string, f: unknown) => (String(f ?? '').startsWith(root + '/') ? String(f).slice(root.length + 1) : String(f ?? ''));

/** What a tool call is doing, in words: [label, detail]. */
export function stepLabel(root: string, name: string, input: any = {}): [string, string] {
  const f = input.file_path ? relPath(root, input.file_path) : '';
  switch (name) {
    case 'Read': return ['Reading', f];
    case 'Edit': case 'MultiEdit': return ['Editing', f];
    case 'Write': return ['Writing', f];
    case 'Glob': case 'Grep': return ['Searching the project', ''];
    case 'Bash': return /\bscrumo\s+validate\b/.test(input.command ?? '') ? ['Running checks', ''] : [input.description || 'Running a command', ''];
    case 'Skill': return ['Loading the skill', input.skill ?? ''];
    case 'TodoWrite': return ['Planning the work', ''];
    case 'AskUserQuestion': return ['Preparing questions', ''];
    case 'WebFetch': case 'WebSearch': return ['Looking something up', ''];
    case 'Task': case 'Agent': return ['Working on a sub-task', ''];
    default: return [`Using ${name}`, ''];
  }
}

/** Sets what the agent is doing now. Only while a turn runs, and never while replaying an earlier chat. */
function setLive(c: Draft<ChatState>, state: Live['state'], label = '', detail = '') {
  if (c.replaying || !c.busy) return;
  const l = c.live;
  if (!l || l.state !== state || l.label !== label || l.detail !== detail) c.live = { state, label, detail, since: Date.now() };
}

function setBusy(c: Draft<ChatState>, busy: boolean) {
  c.busy = busy;
  if (!busy) c.live = null;
}

/** Closes a turn: the live line becomes a short record of how it ended. */
function endTurn(c: Draft<ChatState>, outcome: 'done' | 'stopped' | 'failed', why = '') {
  for (const id of c.streams) { const it = c.items.find(i => i.id === id); if (it?.kind === 'text') it.streaming = false; }
  c.streams = [];
  const took = elapsed(Date.now() - (c.turnStart ?? Date.now()));
  setBusy(c, false);
  if (c.replaying) return;
  const files = c.turnFiles.length;
  if (outcome === 'done') push(c, { kind: 'turn-end', ok: true, text: `Done in ${took}`, files, retry: false });
  else push(c, { kind: 'turn-end', ok: false, text: `Stopped after ${took}`, ...(outcome === 'failed' ? { why } : {}), files: 0, retry: !!c.lastSent });
  c.flash = { kind: outcome === 'done' ? 'done' : 'stopped', until: Date.now() + 5000 };
}

/* ---------- streamed text arrives in small pieces; they are applied once per frame ---------- */
const buffers = new Map<number, { root: string; text: string }>();
let frame = 0;
function applyBuffers(s: Draft<AppState>, root?: string) {
  for (const [id, b] of buffers) {
    if (root && b.root !== root) continue;
    const item = s.projects[b.root]?.chat.items.find(i => i.id === id);
    if (item?.kind === 'text') item.text += b.text;
    buffers.delete(id);
  }
}
function buffer(root: string, id: number, text: string) {
  const b = buffers.get(id);
  if (b) b.text += text; else buffers.set(id, { root, text });
  frame ||= requestAnimationFrame(() => { frame = 0; setApp(s => applyBuffers(s)); });
}

/* ---------- messages from Claude Code ---------- */
export function onMessage({ root, msg }: { root: string; msg: any }) {
  const before = getProject(root);
  if (!before) return;
  let after: 'edited' | 'result' | null = null;
  if (msg.type === 'stream_event' && !msg.parent_tool_use_id && msg.event?.type === 'content_block_delta') {
    const id = before.chat.streams.at(-1);
    if (id && msg.event.delta?.type === 'text_delta') buffer(root, id, msg.event.delta.text);
    return;
  }
  setApp(s => {
    const p = s.projects[root]!;
    const c = p.chat;
    if (msg.type === 'stream_event') {
      const ev = msg.event;
      if (msg.parent_tool_use_id || !ev) return;
      if (ev.type === 'message_start') setLive(c, 'thinking');
      else if (ev.type === 'content_block_start') {
        const b = ev.content_block ?? {};
        if (b.type === 'text') { c.streams.push(push(c, { kind: 'text', text: '', streaming: true })); setLive(c, 'writing'); }
        else if (b.type === 'tool_use') setLive(c, 'step', ...stepLabel(root, b.name));
        else setLive(c, 'thinking');
      }
    } else if (msg.type === 'assistant') {
      applyBuffers(s, root);
      for (const b of msg.message.content) {
        if (b.type === 'text' && b.text.trim()) {
          const id = c.streams.shift();
          const it = id ? c.items.find(i => i.id === id) : null;
          if (it?.kind === 'text') { it.text = b.text; it.streaming = false; }
          else push(c, { kind: 'text', text: b.text, streaming: false });
        }
        if (b.type === 'tool_use') {
          const rel = EDIT_TOOLS.includes(b.name) ? relPath(root, b.input.file_path) : null;
          c.tools[b.id] = { name: b.name, input: b.input, existed: rel ? p.docs.some(d => d.path === rel) : true };
          if (!c.pending.length) setLive(c, 'step', ...stepLabel(root, b.name, b.input));
        }
      }
      for (const id of c.streams.splice(0)) { // streams the message didn't fill
        const i = c.items.findIndex(x => x.id === id);
        const it = c.items[i];
        if (it?.kind !== 'text') continue;
        if (!it.text.trim()) c.items.splice(i, 1); else it.streaming = false;
      }
    } else if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
      for (const b of msg.message.content) {
        if (b.type !== 'tool_result') continue;
        const t = c.tools[b.tool_use_id];
        if (!t) continue;
        if (!c.pending.length) setLive(c, 'thinking');
        if (!b.is_error && EDIT_TOOLS.includes(t.name)) {
          const f = relPath(root, t.input.file_path);
          if (!c.turnFiles.includes(f)) c.turnFiles.push(f);
          p.selected = f;
          if (c.files[f] !== 'created') c.files[f] = t.name === 'Write' && !t.existed ? 'created' : 'updated';
          if (!c.replaying) after = 'edited';
        }
      }
    } else if (msg.type === 'result') {
      const why = ({ error_max_turns: 'the agent reached its step limit', error_during_execution: 'something went wrong while it was working' } as Record<string, string>)[msg.subtype] ?? String(msg.subtype ?? '');
      endTurn(c, c.stopping ? 'stopped' : msg.subtype === 'success' ? 'done' : 'failed', why);
      after = 'result';
    } else if (msg.type === 'app_error') {
      endTurn(c, 'failed', msg.message);
    }
  });
  if (after === 'edited') { loadDocs(root); api.git.status(root); }
  if (after === 'result') refreshAll(root);
}

/* ---------- cards waiting for the person ---------- */
/** An approval blocks the agent, so it brings the chat forward. */
function beforeAsk(root: string) {
  editProject(root, p => setLive(p.chat, 'needs'));
  const p = getProject(root)!;
  if (app().active === root && p.view !== 'chat' && !p.split) setView('chat');
}
/** After the person deals with a card: the agent carries on. */
function afterAsk(c: Draft<ChatState>, next: [string, string] | null) {
  if (c.busy && !c.pending.length) { if (next) setLive(c, 'step', ...next); else setLive(c, 'thinking'); }
}
const removePending = (c: Draft<ChatState>, id: number) => { c.pending = c.pending.filter(x => x.id !== id); };

/** A step that needs the person's OK (an edit under docs/ or a command), or the agent's questions. */
export function onAsk(req: AskRequest) {
  const p = getProject(req.root);
  if (!p) return;
  const { id, root, toolName, input } = req;
  if (toolName === 'AskUserQuestion') {
    const questions = (input.questions ?? []).slice(0, 4);
    editProject(root, x => { x.chat.pending.push({ id, kind: 'question', questions, at: 0, picked: questions.map(() => []), other: questions.map(() => '') }); });
    return beforeAsk(root);
  }
  const file = input.file_path ? relPath(root, input.file_path) : '';
  if (EDIT_TOOLS.includes(toolName) && file.startsWith('docs/') && p.chat.autoDocs) {
    api.answer({ id, allow: true });
    editProject(root, x => setLive(x.chat, 'step', ...stepLabel(root, toolName, input)));
    return;
  }
  editProject(root, x => {
    x.chat.pending.push({ id, kind: 'approval', toolName, input, file, exists: x.docs.some(d => d.path === file) });
    if (file && toolName !== 'Bash') x.selected = file;
  });
  beforeAsk(root);
}

export async function answerApproval(root: string, card: Extract<Pending, { kind: 'approval' }>, allow: boolean, autoDocs: boolean) {
  const { id, toolName, input, file } = card;
  const verb = `You ${allow ? 'allowed' : 'denied'}`;
  editProject(root, p => {
    const c = p.chat;
    if (allow && autoDocs) c.autoDocs = true;
    removePending(c, id);
    if (EDIT_TOOLS.includes(toolName)) push(c, { kind: 'decided', ok: allow, text: `${verb} the edit to `, mono: file });
    else if (toolName === 'Bash') push(c, { kind: 'decided', ok: allow, text: `${verb} `, mono: String(input.command ?? '').slice(0, 80) });
    else push(c, { kind: 'decided', ok: allow, text: `${verb} ${toolName}` });
    afterAsk(c, allow ? stepLabel(root, toolName, input) : null);
  });
  await api.answer({ id, allow });
}

/** Keeps a question card's progress, so it survives switching projects. */
export const editQuestion = (root: string, id: number, fn: (q: Draft<Extract<Pending, { kind: 'question' }>>) => void) =>
  editProject(root, p => { const q = p.chat.pending.find(x => x.id === id); if (q?.kind === 'question') fn(q); });

/** Sends the answers back as { question: answer }; skipping every question declines the request. */
export async function answerQuestions(root: string, card: Extract<Pending, { kind: 'question' }>) {
  const { id, questions } = card;
  const answered = (i: number) => card.picked[i]!.length > 0 || card.other[i]!.trim() !== '';
  const any = questions.some((_, i) => answered(i));
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => {
    const parts = [...card.picked[i]!].sort((a, b) => a - b).map(o => q.options![o]!.label);
    if (card.other[i]!.trim()) parts.push(card.other[i]!.trim());
    answers[q.question] = parts.join(', ') || 'No answer. Keep this as an open question.';
  });
  editProject(root, p => {
    removePending(p.chat, id);
    if (any) push(p.chat, { kind: 'decided', ok: true, text: 'You answered', answers: questions.filter((_, i) => answered(i)).map(q => ({ label: q.header || q.question, answer: answers[q.question]! })) });
    else push(p.chat, { kind: 'decided', ok: false, text: `You skipped the agent's question${questions.length > 1 ? 's' : ''}` });
    afterAsk(p.chat, null);
  });
  await api.answer(any ? { id, allow: true, answers } : { id, allow: false, message: 'The person chose not to answer. Continue with your best judgement and say what you assumed.' });
}

export function onAskCancel(id: number) {
  setApp(s => {
    for (const p of Object.values(s.projects)) {
      if (!p.chat.pending.some(x => x.id === id)) continue;
      removePending(p.chat, id);
      push(p.chat, { kind: 'decided', ok: false, text: 'The agent withdrew this request' });
      afterAsk(p.chat, null);
    }
  });
}

/* ---------- sending ---------- */
export function send(root: string) {
  const p = getProject(root);
  const text = p?.composer.draft.trim();
  if (!p || !text || p.chat.busy) return;
  editProject(root, x => { x.composer.draft = ''; });
  ask(root, p.composer.skill, text);
}

export async function ask(root: string, skill: string, text: string) {
  editProject(root, p => {
    const c = p.chat;
    if (!c.title) c.title = text.slice(0, 70);
    push(c, { kind: 'user', text, ...(skill ? { command: skill } : {}) });
    Object.assign(c, { lastSent: { skill, text }, turnStart: Date.now(), turnFiles: [], stopping: false, flash: null, streams: [] });
    setBusy(c, true);
    setLive(c, 'starting');
  });
  const r = await api.send(root, skill ? `/${skill} ${text}` : text);
  if (r?.error) editProject(root, p => endTurn(p.chat, 'failed', r.error));
}

export function retry(root: string) {
  const c = getProject(root)?.chat;
  if (c?.lastSent && !c.busy) ask(root, c.lastSent.skill, c.lastSent.text);
}

export function stop(root: string) {
  if (!getProject(root)?.chat.busy) return;
  editProject(root, p => { p.chat.stopping = true; });
  api.interrupt(root);
}

export async function startNewChat(root: string) {
  await api.reset(root);
  editProject(root, p => { p.chat = newChat(); });
}

/* ---------- earlier chats ---------- */
/** Plays an earlier chat's messages into the thread, without touching the project. */
function replay(root: string, m: any) {
  if (m.type === 'assistant') return onMessage({ root, msg: m });
  if (m.type !== 'user') return;
  const content = m.message?.content;
  const parts = typeof content === 'string' ? [{ type: 'text', text: content }] : (content ?? []);
  for (const b of parts) {
    if (b.type === 'tool_result') onMessage({ root, msg: { type: 'user', message: { content: [b] } } });
    else if (b.type === 'text' && b.text.trim() && !/^<(system-reminder|local-command)/.test(b.text.trim())) {
      const cmd = b.text.match(/<command-name>\/?([^<]+)<\/command-name>/);
      const args = b.text.match(/<command-args>([\s\S]*?)<\/command-args>/);
      const text = cmd ? (args?.[1] ?? '').trim() : b.text.trim();
      if (text || cmd) editProject(root, p => { push(p.chat, { kind: 'user', text, ...(cmd ? { command: cmd[1]! } : {}) }); });
    }
  }
}

export async function openHistory(root: string, chat: ChatSummary) {
  const msgs = await api.openChat(root, chat.id);
  editProject(root, p => { p.chat = { ...newChat(), replaying: true }; });
  for (const m of msgs) replay(root, m);
  editProject(root, p => {
    p.chat.replaying = false;
    p.chat.title = chat.title;
    setBusy(p.chat, false);
    push(p.chat, { kind: 'info', text: `Earlier chat · ${ago(chat.at)}. Your next message continues it.` });
  });
}
