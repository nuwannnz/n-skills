// Everything under docs/, grouped: planning documents, epics, stories and bugs.
import { editProject, type ProjectView } from '../../app/store';
import { isEpic, isStory } from '../../lib/data';
import type { Doc } from '../../lib/types';
import { Card, cx, PageHead, SearchField, StatusDot, StatusPill } from '../../ui';
import { opens } from '../stories/StoryRow';

const ORDER = ['docs/brief.md', 'docs/prd.md', 'docs/architecture.md', 'docs/coding-standards.md', 'docs/sprint-tracker.md'];

export function DocsView({ p }: { p: ProjectView }) {
  const q = p.docQuery.toLowerCase();
  const hit = (d: Doc) => !q || `${d.meta.id ?? ''} ${d.meta.title ?? ''} ${d.path}`.toLowerCase().includes(q);
  const planning = p.docs.filter(d => !isEpic(d.path) && !isStory(d.path))
    .sort((a, b) => (ORDER.indexOf(a.path) + 1 || 99) - (ORDER.indexOf(b.path) + 1 || 99)).filter(hit);
  const unsaved = (d: Doc) => p.git?.files?.some(f => f.path === d.path);
  const group = (label: string, list: Doc[]) => list.length ? (
    <Card list>
      <div className="list-head"><b>{label}</b><span className="muted small">{list.length}</span></div>
      {list.map(d => {
        const o = opens(d.path, p.peek, true);
        return (
          <div key={d.path} {...o} className={cx('srow doc', o.className)}>
            <StatusDot status={d.meta.status} /><span className="sid">{d.meta.id ?? ''}</span><span className="stitle">{d.meta.title || d.path}</span>
            {d.meta.status ? <StatusPill status={d.meta.status} /> : null}{unsaved(d) ? <span className="edited">unsaved</span> : null}
          </div>
        );
      })}
    </Card>
  ) : null;
  return (
    <div className="page">
      <PageHead title="Documents" sub="Everything under docs/, as the agent and your team see it.">
        <SearchField id="dq" placeholder="Search documents" value={p.docQuery} onChange={v => editProject(p.info.root, x => { x.docQuery = v; })} />
      </PageHead>
      {group('Planning', planning)}
      {group('Epics', p.docs.filter(d => isEpic(d.path)).filter(hit))}
      {group('Stories and bugs', p.docs.filter(d => isStory(d.path)).filter(hit))}
    </div>
  );
}
