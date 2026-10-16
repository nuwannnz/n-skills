// Where the person writes to the agent: which skill runs, the message, the model, and how full the conversation is.
import { useEffect, useRef } from 'react';
import { editProject, useApp, useComposer, type ChatState, type ProjectView } from '../../app/store';
import { prettyModel } from '../../lib/format';
import { skillGroups } from '../../lib/skills';
import type { Context, Model } from '../../lib/types';
import { Button, Grow, Icon, toast } from '../../ui';
import { PermissionSelect } from '../settings/PermissionSelect';
import { setModel } from '../usage/actions';
import { send, stop } from './actions';

export function Composer({ p, chat, hidden }: { p: ProjectView; chat: ChatState; hidden: boolean }) {
  const root = p.info.root;
  const composer = useComposer();
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { // put the cursor at the end when something asks for it (chatWith, switching to the chat)
    const el = ta.current;
    if (!el || !composer?.focusTick) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [composer?.focusTick]);
  if (!composer) return null;
  const set = (k: 'draft' | 'skill', v: string) => editProject(root, x => { x.composer[k] = v; });
  return (
    <div className="composer-wrap" hidden={hidden}>
      <div className="composer">
        <label className="skillpill" title="Pick which agent skill runs your message"><span className="slash">/</span>
          <select id="skill" aria-label="Skill" value={composer.skill} onChange={e => set('skill', e.target.value)}>
            <option value="">No skill: just ask</option>
            {skillGroups(p.info.skills).map(g => (
              <optgroup key={g.role} label={g.role}>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <textarea id="prompt" ref={ta} rows={2} value={composer.draft} onChange={e => set('draft', e.target.value)}
          placeholder="Describe what you need. For example: the clinic decided late cancellations cost a €15 fee, which unblocks PAW-9."
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(root); } }} />
        <div className="composer-bar">
          <ModelPicker />
          <label className="modelpick" title="How much the agent may do without asking. Applies to every project, from its next step."><span className="muted small">Permissions</span><PermissionSelect id="permPick" /></label>
          <ContextRing context={chat.context} />
          <span className="muted small" id="chatState">{chat.busy ? 'Esc to stop' : ''}</span>
          <Grow />
          {chat.busy
            ? <Button variant="stop" id="stopBtn" title="Stop the agent (Esc)" onClick={() => stop(root)}><Icon name="stop" size={12} />Stop</Button>
            : <Button variant="primary" id="sendBtn" onClick={() => send(root)}>Send</Button>}
        </div>
      </div>
    </div>
  );
}

// Until Claude Code has said which models it offers (the app asks at start and keeps the answer).
const FALLBACK_MODELS: Model[] = [{ value: 'opus', name: 'Opus' }, { value: 'sonnet', name: 'Sonnet' }, { value: 'haiku', name: 'Haiku' }];

export const modelLabel = (pref: string, models: Model[] | null) => (pref ? (models?.find(m => m.value === pref)?.name ?? prettyModel(pref)) : '');

/** Which Claude model answers. Takes effect on the next message. */
function ModelPicker() {
  const pref = useApp(s => s.modelPref);
  const models = useApp(s => s.models);
  const def = models?.find(m => m.value === 'default');
  const defName = def ? (def.resolved ? prettyModel(def.resolved) : def.description?.split(' · ')[0]) : '';
  const list: Model[] = [
    { value: '', name: defName ? `Default · ${defName}` : 'Default', description: def?.description ?? 'What Claude Code uses unless told otherwise' },
    ...(models ?? FALLBACK_MODELS).filter(m => m.value && m.value !== 'default'),
  ];
  if (pref && !list.some(m => m.value === pref)) list.push({ value: pref, name: prettyModel(pref), description: '' });
  return (
    <label className="modelpick" title="Which Claude model answers. Takes effect on your next message."><span className="muted small">Model</span>
      <select id="modelPick" aria-label="Model" value={pref} onChange={async e => {
        const v = e.target.value;
        await setModel(v);
        toast(`Next message uses ${v ? modelLabel(v, models) : 'the default model'}.`);
      }}>
        {list.map(m => <option key={m.value} value={m.value} title={m.description ?? ''}>{m.name}</option>)}
      </select>
    </label>
  );
}

/** A small ring showing how full the conversation is. */
function ContextRing({ context: c }: { context: Context | null }) {
  const pct = c ? Math.max(0, Math.min(100, c.percentage)) : 0;
  const R = 8, C = 2 * Math.PI * R;
  const color = pct >= 85 ? 'var(--err)' : pct >= 65 ? 'var(--warn)' : 'var(--accent)';
  const title = c ? `Context: ${Math.round(pct)}% full (${c.totalTokens.toLocaleString()} of ${c.maxTokens.toLocaleString()} tokens)` : 'Context: starts empty. It fills as the conversation grows.';
  return (
    <span className="ctxring" id="ctxRing" title={title} aria-label={title}>
      <svg width="22" height="22" viewBox="0 0 22 22" role="img" aria-hidden="true">
        <circle cx="11" cy="11" r={R} fill="none" stroke="var(--line-strong)" strokeWidth="3" />
        <circle cx="11" cy="11" r={R} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 11 11)" />
      </svg>
    </span>
  );
}
