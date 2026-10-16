// The chat pane: its bar, the thread, the composer, and the files this chat changed.
import { useState } from 'react';
import { useApp, useChat, type ChatState, type ProjectView } from '../../app/store';
import { api } from '../../lib/api';
import { ago, elapsed } from '../../lib/format';
import type { ChatSummary } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import { Badge, Button, cx, Grow, Icon, IconButton, Menu, MenuItem, Popover, usePopover } from '../../ui';
import { openDoc, setView } from '../workspace/navigation';
import { openHistory, startNewChat } from './actions';
import { Composer } from './Composer';
import { Thread } from './Thread';

export function ChatPane({ p }: { p: ProjectView }) {
  const chat = useChat();
  if (!chat) return null;
  const root = p.info.root;
  const asking = chat.pending.length > 0;
  return (
    <div className={cx('pane chat', asking && 'asking')} id="paneChat">
      <div className="chat-main">
        <div className="chatbar">
          <span className="ctitle" id="chatTitle">{chat.title || 'New chat'}</span><Grow />
          <ChatPill chat={chat} />
          <HistoryButton root={root} name={p.info.name} />
          <IconButton icon="plus" label="New chat" id="newChat" onClick={() => startNewChat(root)} />
        </div>
        <Thread root={root} chat={chat} />
        <Composer p={p} chat={chat} hidden={asking} />
      </div>
      <ChatFiles p={p} files={chat.files} />
    </div>
  );
}

/** Working, needs you, done or stopped, in the chat's own bar. */
function ChatPill({ chat }: { chat: ChatState }) {
  const flashing = !!chat.flash && chat.flash.until > Date.now();
  const now = useNow(1000, chat.busy || flashing);
  let kind = '';
  let body = null;
  if (chat.busy && chat.pending.length) { kind = 'needs'; body = <><i />Needs you</>; }
  else if (chat.busy) { kind = 'work'; body = chat.live?.state === 'starting' ? <><i />Starting</> : <><i />Working <span className="t">{elapsed(now - (chat.turnStart ?? now))}</span></>; }
  else if (chat.flash && chat.flash.until > now) { kind = chat.flash.kind; body = kind === 'done' ? <><Icon name="check" size={12} />Done</> : <><i />Stopped</>; }
  if (!kind) return null;
  return <span className="cpill" id="chatPill" data-k={kind}>{body}</span>;
}

/** Earlier chats of the project, from Claude Code's own transcripts. Opening one continues it. */
function HistoryButton({ root, name }: { root: string; name: string }) {
  const pop = usePopover();
  const [list, setList] = useState<ChatSummary[] | null>(null);
  return (
    <>
      <IconButton icon="history" label="Earlier chats" title="Earlier chats in this project" id="histBtn" onClick={async e => {
        const el = e.currentTarget;
        if (pop.open) return pop.close();
        setList(await api.chats(root));
        pop.toggle(el);
      }} />
      {pop.open && list ? (
        <Popover anchor={pop.anchor} onClose={pop.close} align="right" width={380}>
          <Menu title={`Earlier chats in ${name}`}>
            {list.length ? list.map(c => (
              <MenuItem key={c.id} className="histrow" onClick={() => { pop.close(); openHistory(root, c); }}>
                <span className="histtitle">{c.title.replace(/^\/\S+\s*/, '').slice(0, 90) || c.title}</span><em>{ago(c.at)}</em>
              </MenuItem>
            )) : <div className="muted small" style={{ padding: '8px 10px' }}>No earlier chats yet.</div>}
          </Menu>
        </Popover>
      ) : null}
    </>
  );
}

/** The documents this chat created or edited, to open them. */
function ChatFiles({ p, files }: { p: ProjectView; files: ChatState['files'] }) {
  const list = Object.entries(files);
  const unsaved = useApp(s => s.projects[p.info.root]?.git?.files?.length ?? 0);
  if (!list.length) return null;
  const named = (path: string) => { const d = p.docs.find(x => x.path === path); return { id: d?.meta.id ?? '', title: d?.meta.title || path.split('/').pop()! }; };
  return (
    <aside className="chatfiles" id="chatFiles" aria-label="Files changed in this chat">
      <div className="cf-head"><b>Changed in this chat</b><Badge>{list.length}</Badge></div>
      <div className="cf-list">
        {list.map(([path, kind]) => {
          const n = named(path);
          return (
            <button type="button" key={path} className="cfile" title={path} onClick={() => openDoc(path)}>
              <span className="kind" data-k={kind === 'created' ? 'new' : 'modified'}>{kind === 'created' ? 'New' : 'Edited'}</span>
              <span className="cf-main"><span className="cf-title">{n.title}</span><span className="mono small muted">{n.id || path.replace(/^docs\//, '')}</span></span>
            </button>
          );
        })}
      </div>
      <div className="cf-foot">
        {unsaved ? <Button variant="primary" size="small" onClick={() => setView('changes')}>Save changes · {unsaved}</Button> : <span className="muted small">Everything is saved.</span>}
      </div>
    </aside>
  );
}
