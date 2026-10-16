// A project's short navigation, so it scales to hundreds of stories.
import type { ReactNode } from 'react';
import { setApp, useApp, type ProjectView, type View } from '../../app/store';
import { currentSprint, epicsOf, storiesOf } from '../../lib/data';
import { ago } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { Badge, Count, cx, Icon, Kbd, NavIcon, Spinner, type IconName } from '../../ui';
import { guideDone, guideSteps } from '../guide/steps';
import { syncNow } from '../projects/actions';
import { openDoc, setView } from './navigation';

const NAV_COLOR: Record<string, string> = {
  guide: 'var(--accent)', usage: '#0891b2', chat: 'var(--blue)', changes: 'var(--warn)', sprint: 'var(--accent)', backlog: 'var(--purple)', board: '#c2417a',
  epics: 'var(--ok)', docs: '#6b5ce0', checks: '#0e7c86', team: '#d9822b',
};
const PINNED = ['docs/prd.md', 'docs/architecture.md', 'docs/brief.md'];

export function SideNav({ p }: { p: ProjectView }) {
  useNow(30000); // keeps "synced 5 min ago" current
  const pending = useApp(s => s.projects[p.info.root]?.chat.pending.length ?? 0);
  const g = p.git;
  const sp = currentSprint(p);
  const open = storiesOf(p).filter(s => !['done', 'cancelled'].includes(s.status)).length;
  const changes = g?.files?.length ?? 0;
  const errs = p.validation && !p.validation.ok ? p.validation.findings.length : 0;
  const steps = guideSteps(p);
  const done = guideDone(p);
  const on = (v: View) => p.view === v || (v === 'docs' && p.view === 'doc') || (v === 'sprint' && p.view === 'planning');
  const item = (v: View & IconName, label: string, badge: ReactNode = null) => (
    <button type="button" className={cx('nav-item', on(v) && 'on')} onClick={() => setView(v)}><NavIcon name={v} color={NAV_COLOR[v]!} />{label}{badge}</button>
  );
  const sync = p.syncing ? <><Spinner />Updating…</> : g?.syncError ? <span className="err-text">Sync problem</span> : g?.remote ? `up to date · ${ago(g.syncedAt)}` : 'local only';
  const pinned = PINNED.map(path => p.docs.find(d => d.path === path)).filter(d => !!d);
  return (
    <aside className="sidenav" id="sideNav">
      <div className="sn-head"><b>{p.info.name}</b>
        {g?.repo
          ? <button type="button" className="syncline" title="Fetch the latest changes now" onClick={() => syncNow(p.info.root)}><Icon name="branch" size={13} />{g.branch} · {sync}</button>
          : <span className="muted small">Not a git repository</span>}
      </div>
      <button type="button" className="findbox" onClick={() => setApp(s => { s.paletteOpen = true; })}><Icon name="search" size={15} />Find a story or document<Kbd>⌘K</Kbd></button>
      {p.status ? <div>{item('guide', done ? 'Workflow' : 'Get started', done ? null : <Badge>{steps.filter(x => x.state === 'done').length}/{steps.length}</Badge>)}</div> : null}
      <div><div className="grp">Work with the agent</div>
        {item('chat', 'Chat', pending ? <Badge tone="warn">{pending}</Badge> : null)}
        {item('changes', 'Changes', changes ? <Badge>{changes}</Badge> : null)}
      </div>
      <div><div className="grp">Plan</div>
        {item('sprint', 'Sprint', sp ? <Count>{sp.number}</Count> : null)}
        {item('backlog', 'Backlog', <Count>{open}</Count>)}
        {item('board', 'Board')}
        {item('epics', 'Epics', <Count>{epicsOf(p).length}</Count>)}
      </div>
      <div><div className="grp">Project</div>
        {item('docs', 'Documents', <Count>{p.docs.length}</Count>)}
        {item('checks', 'Checks', errs ? <Badge tone="err">{errs}</Badge> : p.validation ? <Badge tone="ok">valid</Badge> : null)}
        {item('usage', 'Usage')}
        {item('team', 'Team', <Count>{p.team?.team?.length ?? ''}</Count>)}
      </div>
      {pinned.length ? (
        <div><div className="grp">Pinned</div>
          {pinned.map(d => <button type="button" key={d.path} className="nav-item small" onClick={() => openDoc(d.path, { full: true })}>{d.meta.title || d.path}</button>)}
        </div>
      ) : null}
    </aside>
  );
}
