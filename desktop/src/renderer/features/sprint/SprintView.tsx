// The sprint at a glance: status, burndown, points by status, what needs attention, and its stories.
import { editProject, type ProjectView } from '../../app/store';
import { burndown, currentSprint, fmtDate, points, sprintsOf, sprintStories, STATUS_LABEL } from '../../lib/data';
import { plural } from '../../lib/format';
import { Button, Card, Empty, Icon, Pill, StatusDot } from '../../ui';
import { run } from '../projects/actions';
import { StoryRow } from '../stories/StoryRow';
import { chatWith, setView } from '../workspace/navigation';
import { Burndown } from './Burndown';

const SEGMENTS: [string, string, string][] = [
  ['done', 'Done', 'done'], ['in-qa', 'In QA', 'qa'], ['in-progress', 'In progress', 'progress'], ['ready', 'Ready', 'ready'], ['blocked', 'Blocked', 'blocked'], ['draft', 'Draft', 'draft'],
];

export function SprintView({ p }: { p: ProjectView }) {
  const sprints = sprintsOf(p);
  if (!p.info.hasCli) return <div className="page"><Empty title="The scrumo CLI isn't installed here">Sprint views need the project's own scrumo CLI.</Empty></div>;
  if (!sprints.length) {
    return <div className="page"><Empty title="No sprints yet">Plan the first sprint with your team.<br /><br /><Button variant="primary" onClick={() => setView('planning')}>Plan Sprint 1</Button></Empty></div>;
  }
  const root = p.info.root;
  const sp = sprints.find(s => s.number === p.sprintShown) ?? currentSprint(p)!;
  const stories = sprintStories(p, sp.number);
  const burn = burndown(p, sp);
  const by = (st: string) => stories.filter(s => s.status === st);
  const expected = sp.pace ? Math.round((sp.pace.expectedPct / 100) * sp.points) : null;
  const blocked = by('blocked');
  const verdict = sp.pace?.verdict ?? sp.status;
  const days = sp.days;
  const attention = (p.status?.attention ?? []).slice(0, 4);
  const segs = SEGMENTS.map(([k, label, color]) => ({ k, label, color, n: points(by(k)) })).filter(x => x.n > 0);

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <div className="title-row"><h1>Sprint {sp.number}</h1><Pill status={verdict}>{STATUS_LABEL[verdict] ?? verdict}</Pill></div>
          <div className="muted">{sp.goal} · {fmtDate(sp.start)} – {fmtDate(sp.end)}</div>
        </div>
        <div className="head-actions">
          {sprints.length > 1 ? (
            <select id="sprintPick" aria-label="Sprint" value={sp.number} onChange={e => { const n = +e.target.value; editProject(root, x => { x.sprintShown = n; }); }}>
              {sprints.map(s => <option key={s.number} value={s.number}>Sprint {s.number} · {STATUS_LABEL[s.status]}</option>)}
            </select>
          ) : null}
          <Button title="Ask the agent about this sprint" onClick={() => chatWith('scrumo-sprint', `How is Sprint ${sp.number} going, and what should we do about it?`)}><Icon name="chat" size={15} /> Ask the agent</Button>
          {sp.status === 'planned'
            ? <Button variant="primary" onClick={() => run(root, ['sprint', 'start', String(sp.number)])}>Start Sprint {sp.number}</Button>
            : <Button variant="primary" onClick={() => setView('planning')}>Plan next sprint</Button>}
        </div>
      </div>

      <div className="kpis">
        <Card className="kpi"><span className="lab">Points done</span><b>{points(by('done'))} <small>of {points(stories)}</small></b><span className="muted small">{expected == null ? STATUS_LABEL[sp.status] : `Should be ${expected} by now`}</span></Card>
        <Card className="kpi"><span className="lab">Stories done</span><b>{by('done').length} <small>of {stories.length}</small></b><span className="muted small">{by('in-qa').length} in QA · {by('in-progress').length} in progress</span></Card>
        <Card className="kpi"><span className="lab">Days left</span><b>{days ? days.left : '–'} <small>{days ? `of ${days.total}` : ''}</small></b><span className="muted small">Ends {fmtDate(sp.end)}</span></Card>
        <Card className={blocked.length ? 'kpi bad' : 'kpi'}><span className="lab">Blocked</span><b>{blocked.length}</b><span className="muted small">{blocked.length ? `${blocked[0]!.id} ${(blocked[0]!.reason ?? '').slice(0, 60)}` : 'Nothing is waiting'}</span></Card>
      </div>

      <div className="two">
        <Card pad>
          <div className="row between"><b>Burndown</b>
            <span className="legend"><i className="l-ideal" />Ideal <i className="l-actual" />Actual <i className="l-proj" />Projected</span>
            {burn.total && burn.todayIndex && burn.remaining > burn.idealNow ? <Pill status="at risk">{burn.short ? `About ${plural(burn.short, 'point')} short at this pace` : 'Behind the ideal line'}</Pill> : null}
          </div>
          {burn.total ? <Burndown b={burn} /> : <Empty small>Give the stories points to see the burndown.</Empty>}
          <div className="muted small">Counts a story as finished on the day its status last changed to done.</div>
        </Card>
        <div className="col">
          <Card pad><b>Where the points are</b>
            <div className="stack">{segs.map(x => <i key={x.k} style={{ flex: x.n, background: `var(--s-${x.color})` }} title={`${x.label} ${x.n}`} />)}</div>
            <div className="legend-grid">{segs.length ? segs.map(x => <span key={x.k}><StatusDot status={x.k} />{x.label} · {x.n}</span>) : <span className="muted">No points yet</span>}</div>
          </Card>
          <Card pad><b>Needs attention</b>
            {attention.length
              ? attention.map(a => <div key={a} className="attn"><StatusDot status={/blocked|overdue|bug/i.test(a) ? 'blocked' : 'in-progress'} /><span>{a}</span></div>)
              : <div className="muted small">Nothing needs attention.</div>}
          </Card>
        </div>
      </div>

      <Card list>
        <div className="list-head"><b>Stories in this sprint</b><span className="muted small">{plural(stories.length, 'story', 'stories')} · {plural(points(stories), 'point')}</span></div>
        {stories.length ? stories.map(s => <StoryRow key={s.path} p={p} s={s} selected={p.peek} />) : <Empty small>No stories in this sprint.</Empty>}
      </Card>
    </div>
  );
}
