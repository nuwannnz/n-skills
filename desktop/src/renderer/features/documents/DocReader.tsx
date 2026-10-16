// A document, full window, with an outline and who last changed it.
import { useLayoutEffect, useRef, useState } from 'react';
import type { ProjectView } from '../../app/store';
import { ago, hue, initials } from '../../lib/format';
import { Empty, Markdown } from '../../ui';
import { useFileLog } from './useFileLog';

const PROPS = ['status', 'version', 'type', 'priority', 'points', 'sprint', 'assignee', 'epic'];

export function DocReader({ p }: { p: ProjectView }) {
  const d = p.docs.find(x => x.path === p.selected);
  if (!d) return <Empty title="Nothing selected">Pick a document from Documents, or search with ⌘K.</Empty>;
  return <Reader key={d.path} p={p} path={d.path} meta={d.meta} body={d.body} />;
}

function Reader({ p, path, meta, body }: { p: ProjectView; path: string; meta: Record<string, string>; body: string }) {
  const log = useFileLog(p.info.root, path);
  const md = useRef<HTMLDivElement>(null);
  const [heads, setHeads] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => { setHeads([...(md.current?.querySelectorAll<HTMLElement>('h2, h3') ?? [])]); }, [body]);
  const changed = p.git?.files?.some(f => f.path === path);
  return (
    <div className="reader">
      <article className="doc">
        <div className="path">{path}{changed ? <> <span className="edited">unsaved changes</span></> : null}</div>
        <div className="props">
          {PROPS.filter(k => meta[k] && meta[k] !== 'null').map(k => <span key={k}>{k} <b>{meta[k]}</b></span>)}
          <span className="byline">{log ? <>
            last updated by <span className="av" style={{ background: `hsl(${hue(log.email)} 42% 42%)` }}>{initials(log.name)}</span><b>{log.name}</b> · {ago(log.at)}{' '}
            <span className="mono faint" title={log.subject}>{log.hash}</span>
          </> : null}</span>
        </div>
        <Markdown ref={md} text={body} />
      </article>
      <aside className="outline">
        <div className="lab">On this page</div>
        {heads.map((h, i) => <a key={i} onClick={() => h.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{h.textContent}</a>)}
      </aside>
    </div>
  );
}
