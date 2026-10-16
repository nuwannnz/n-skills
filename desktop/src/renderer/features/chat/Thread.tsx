// The conversation: messages, then the live status line, then the cards waiting for the person.
import { useLayoutEffect, useRef } from 'react';
import type { ChatState, Live, ThreadItem } from '../../app/store';
import { elapsed, plural } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { Button, cx, Icon, Markdown } from '../../ui';
import { setView } from '../workspace/navigation';
import { retry } from './actions';
import { ApprovalCard } from './ApprovalCard';
import { QuestionCard } from './QuestionCard';

export function Thread({ root, chat }: { root: string; chat: ChatState }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const t = ref.current; if (t) t.scrollTop = t.scrollHeight; }, [chat.items, chat.live, chat.pending.length]);
  const empty = !chat.items.length && !chat.live && !chat.pending.length;
  return (
    <div className="thread" id="thread" ref={ref}>
      <div className="thread-inner">
        {empty ? (
          <div className="empty"><b>Ask for what you need</b>The agent runs your own Claude Code with the project's scrumo skills.
            It can read the project, change documents under docs/ with your approval, and run scrumo checks.</div>
        ) : null}
        {chat.items.map(item => <Item key={item.id} root={root} item={item} />)}
        {chat.live ? <LiveLine live={chat.live} /> : null}
        {chat.pending.map(card => card.kind === 'approval'
          ? <ApprovalCard key={card.id} root={root} card={card} />
          : <QuestionCard key={card.id} root={root} card={card} />)}
      </div>
    </div>
  );
}

function Item({ root, item }: { root: string; item: ThreadItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="msg-user">{item.command ? <><span className="mono small">/{item.command}</span> </> : null}{item.text}</div>;
    case 'text':
      return <Markdown bare className={cx('msg-text', item.streaming && 'streaming')} text={item.text} />;
    case 'info':
      return <div className="info">{item.text}</div>;
    case 'decided':
      return (
        <div className={cx('decided', !item.ok && 'no')}>
          <Icon name={item.ok ? 'check' : 'x'} size={14} />
          {item.answers ? (
            <div className="qa"><b>{item.text}</b>{item.answers.map(a => <span key={a.label}><span className="muted">{a.label}:</span> {a.answer}</span>)}</div>
          ) : <span>{item.text}{item.mono ? <span className="mono">{item.mono}</span> : null}</span>}
        </div>
      );
    case 'turn-end':
      return (
        <div className={cx('turn-end', !item.ok && 'err')}>
          <span className="ti"><Icon name={item.ok ? 'check' : 'x'} size={12} /></span>
          <span>{item.text}{item.files ? ` · ${plural(item.files, 'document')} changed` : ''}{item.why ? <>: <span className="why">{item.why}</span></> : null}</span>
          {item.ok && item.files ? <Button size="small" onClick={() => setView('changes')}>Review changes</Button> : null}
          {item.retry ? <Button size="small" data-retry onClick={() => retry(root)}>Try again</Button> : null}
        </div>
      );
  }
}

/** What the agent is doing now, with how long it has been at it. */
function LiveLine({ live }: { live: Live }) {
  const now = useNow(1000, live.state !== 'needs' && live.state !== 'starting');
  if (live.state === 'needs') return <div className="live" role="status" data-s="needs"><span className="ldot" /><span>Paused · waiting for you below</span></div>;
  if (live.state === 'starting') return <div className="live" role="status" data-s="starting"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span>Starting Claude Code…</span></div>;
  const label = live.state === 'step' ? live.label : live.state === 'writing' ? 'Writing' : 'Thinking';
  return (
    <div className="live" role="status" data-s={live.state}>
      <span className="lspin" aria-hidden="true" /><span className="shimmer">{label}</span>
      {live.detail ? <span className="ldetail">{live.detail}</span> : null}
      <span className="live-time" aria-hidden="true">{elapsed(now - live.since)}</span>
    </div>
  );
}
