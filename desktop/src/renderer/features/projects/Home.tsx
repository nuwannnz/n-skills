// The home screen: every project as a card, and what needs your attention across them.
import type { CSSProperties, KeyboardEvent } from 'react';
import { useApp, type ProjectState, type View } from '../../app/store';
import { currentSprint, storiesOf } from '../../lib/data';
import { homePath, hue, initials, plural } from '../../lib/format';
import { Badge, Empty, Icon, IconButton, Pill, ProgressBar, StatusDot } from '../../ui';
import { openWizard } from '../wizard/actions';
import { addProject, removeProject, show } from './actions';
import { PR_LABEL } from './attention';

export function Home() {
  const projects = Object.values(useApp(s => s.projects));
  return (
    <div className="homeview" id="home">
      <div className="home-inner">
        <h1>Your projects</h1>
        <p className="muted">{projects.length ? 'Pick up where you left off, or start a new project.' : 'Start a new project, or open a folder that already has a scrumo.yaml.'}</p>
        <div className="home-grid">
          <div className="cards" id="cards">
            {projects.map(p => <ProjectCard key={p.info.root} p={p} />)}
            <button type="button" className="card add-card" onClick={openWizard}><span className="plus">+</span>New project…</button>
            <button type="button" className="card add-card" onClick={addProject}><span className="plus"><Icon name="home" size={22} /></span>Open existing…</button>
          </div>
          <Attention projects={projects} />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectState }) {
  const g = p.git;
  const sp = currentSprint(p);
  const pr = (g?.prs ?? []).find(x => ['changes', 'approved', 'review'].includes(x.status));
  const done = sp ? storiesOf(p).filter(s => s.sprint === sp.number && s.status === 'done').reduce((n, s) => n + (s.points ?? 0), 0) : 0;
  const open = () => show(p.info.root, 'sprint');
  return (
    <div className="card" tabIndex={0} role="button" onClick={open} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}>
      <div className="card-top">
        <span className="tile static" style={{ '--h': hue(p.info.root) } as CSSProperties}>{initials(p.info.name)}</span>
        <div className="card-title"><b>{p.info.name}</b><span className="muted small">{p.info.key}{sp ? ` · Sprint ${sp.number} ${sp.status}` : ''}</span></div>
        <IconButton icon="x" size={15} className="x" label={`Remove ${p.info.name} from list`} title="Remove from list" onClick={e => { e.stopPropagation(); removeProject(p.info.root); }} />
      </div>
      <div className="mono small muted path-line" title={p.info.root}>{homePath(p.info.root)}</div>
      <div className="row wrap">
        {g?.repo ? <Pill className="branch">{g.branch}</Pill> : null}
        {g?.files?.length ? <Pill status="in-progress">{plural(g.files.length, 'unsaved change')}</Pill> : null}
        {pr ? <Pill pr={pr.status}>PR #{pr.number}: {PR_LABEL[pr.status]}</Pill> : null}
      </div>
      {sp && sp.points ? <><ProgressBar pct={(100 * done) / sp.points} /><div className="muted small">{done} of {sp.points} points done</div></> : null}
    </div>
  );
}

type Item = { root: string; view: View; tone: string; title: string; sub: string };

function Attention({ projects }: { projects: ProjectState[] }) {
  const items: Item[] = [];
  for (const p of projects) {
    const name = p.info.name;
    const root = p.info.root;
    if (p.chat.pending.length) items.push({ root, view: 'chat', tone: 'in-progress', title: `${plural(p.chat.pending.length, 'approval')} waiting`, sub: `${name} · the agent is waiting for you` });
    for (const pr of p.git?.prs ?? []) {
      if (pr.status === 'changes') items.push({ root, view: 'changes', tone: 'blocked', title: `Changes requested on #${pr.number}`, sub: `${name} · ${pr.title}` });
      if (pr.status === 'approved') items.push({ root, view: 'changes', tone: 'done', title: `#${pr.number} approved, ready to merge`, sub: `${name} · ${pr.title}` });
    }
    const n = p.git?.files?.length ?? 0;
    if (n) items.push({ root, view: 'changes', tone: 'in-progress', title: `${plural(n, 'change')} not saved yet`, sub: `${name} · ${p.git!.files.slice(0, 2).map(f => f.path.replace(/^docs\//, '')).join(', ')}` });
    for (const a of (p.status?.attention ?? []).slice(0, 2)) items.push({ root, view: 'sprint', tone: 'blocked', title: a, sub: name });
  }
  return (
    <aside className="attention card" id="homeAttention">
      <h3>Needs your attention<Badge>{items.length}</Badge></h3>
      {items.length ? items.map((i, n) => (
        <button type="button" key={n} className="att-item" onClick={() => show(i.root, i.view)}>
          <StatusDot status={i.tone} /><div><b>{i.title}</b><div className="muted small">{i.sub}</div></div>
        </button>
      )) : <Empty small>Nothing needs you right now.</Empty>}
    </aside>
  );
}
