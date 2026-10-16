// Sprint planning: a screen meant to be shared in a meeting. Goal, capacity, then
// picking stories; "Create sprint" runs `scrumo sprint plan` with those choices.
import { editProject, type PlanDraft, type ProjectView } from '../../app/store';
import { colorOfEpic, epicsOf, fmtDate, nextSprintDates, points, sprintsOf, storiesOf, type Story } from '../../lib/data';
import { plural } from '../../lib/format';
import { skillRole } from '../../lib/skills';
import { Button, Card, ColorDot, Empty, Grow, Icon, LinkButton, Note, Pill, Slash, Tag } from '../../ui';
import { run } from '../projects/actions';
import { Person } from '../stories/StoryRow';
import { chatWith, setView } from '../workspace/navigation';

export function PlanningView({ p }: { p: ProjectView }) {
  const root = p.info.root;
  const sprints = sprintsOf(p);
  const number = (sprints.at(-1)?.number ?? 0) + 1;
  const active = sprints.find(s => s.status === 'active');
  const dates = nextSprintDates(p);
  const team = p.team?.team ?? [];
  const fresh: PlanDraft = { number, goal: '', start: dates.start, end: dates.end, capacity: null, picked: [] };
  const pl = p.plan?.number === number ? p.plan : fresh;
  const set = (fn: (d: PlanDraft) => void) => editProject(root, x => { if (x.plan?.number !== number) x.plan = fresh; fn(x.plan!); });
  const capacity = pl.capacity ?? p.team?.capacity ?? p.status?.velocity?.average ?? 0;

  const all = storiesOf(p).filter(s => s.status !== 'cancelled' && s.status !== 'done');
  const carried = active ? all.filter(s => s.sprint === active.number) : [];
  const backlog = all.filter(s => s.sprint == null)
    .sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const picked = all.filter(s => pl.picked.includes(s.id));
  const committed = points(picked);
  const over = capacity > 0 && committed > capacity;
  const unestimated = picked.filter(s => s.points == null);
  const ready = (s: Story) => s.status === 'ready' && s.sprint == null; // only ready stories outside a sprint can be planned
  const canCreate = picked.length > 0 && !!pl.goal.trim();

  const closeActive = async () => {
    if (!active || !confirm(`Close Sprint ${active.number}? Unfinished stories go back to the backlog.`)) return;
    if ((await run(root, ['sprint', 'close', String(active.number)])).ok) set(d => { d.picked = []; });
  };
  const create = async () => {
    const args = ['sprint', 'plan', '--goal', pl.goal.trim(), '--capacity', String(capacity), '--stories', pl.picked.join(','), '--start', pl.start, '--end', pl.end];
    if (!(await run(root, args)).ok) return;
    editProject(root, x => { x.plan = null; x.sprintShown = number; });
    setView('sprint');
  };

  const row = (s: Story, inSprint: boolean) => (
    <div key={s.id} className={!inSprint && !ready(s) ? 'prow dim' : 'prow'}>
      <span className="sid">{s.id}</span>
      <span className="stitle">{s.title}{s.epic ? <> <ColorDot color={colorOfEpic(s.epic)} title={epicsOf(p).find(e => e.id === s.epic)?.title ?? ''} /></> : null}</span>
      {!inSprint && !ready(s) ? <Pill status={s.status} title="Get this story to ready before planning it">{s.status}</Pill> : null}
      <span className="pts" title={s.points == null ? 'No estimate yet' : 'Story points'}>{s.points ?? '–'}</span>
      {inSprint ? <Person p={p} id={s.assignee} /> : null}
      {inSprint
        ? <button type="button" className="padd rm" aria-label={`Remove ${s.id} from the sprint`} title="Remove from the sprint" onClick={() => set(d => { d.picked = d.picked.filter(x => x !== s.id); })}><Icon name="x" size={13} /></button>
        : <button type="button" className="padd" disabled={!ready(s)} aria-label={`Add ${s.id} to the sprint`} title={ready(s) ? 'Add to the sprint' : 'Not ready to plan'} onClick={() => set(d => { d.picked.push(s.id); })}><Icon name="plus" size={14} /></button>}
    </div>
  );

  return (
    <div className="page wide plan">
      <div className="page-head">
        <div><div className="title-row"><h1>Plan Sprint {number}</h1></div>
          <div className="muted big">{fmtDate(pl.start)} – {fmtDate(pl.end)} · {team.length ? `planning with ${team.map(m => m.name.split(' ')[0]).join(', ')}` : 'no team members yet'}</div></div>
        <div className="head-actions">
          <Button title="The agent proposes a sprint for you to adjust" onClick={() => chatWith('scrumo-sprint', `Suggest which stories to plan for Sprint ${number}. Team capacity is ${capacity} points.`)}>
            <Slash />Suggest a sprint<Tag>{skillRole('scrumo-sprint')}</Tag>
          </Button>
          <Button variant="primary" size="big" id="create" disabled={!canCreate} title={pl.goal.trim() ? '' : 'Write a sprint goal first'} onClick={create}>Create Sprint {number}</Button>
        </div>
      </div>

      {active ? (
        <Note tone="warn">Sprint {active.number} is still active ({active.donePoints} of {active.points} points done). Its unfinished stories can only move to the next sprint once it is closed.
          {' '}<LinkButton onClick={closeActive}>Close Sprint {active.number} first</LinkButton></Note>
      ) : null}

      <Card className="goal">
        <div className="row"><span className="lab">Sprint goal</span><Grow />
          <label className="dates">From <input type="date" value={pl.start} onChange={e => { const v = e.target.value; if (v) set(d => { d.start = v; }); }} /></label>
          <label className="dates">to <input type="date" value={pl.end} onChange={e => { const v = e.target.value; if (v) set(d => { d.end = v; }); }} /></label>
        </div>
        <input id="goal" placeholder="What should be true for users at the end of this sprint?" value={pl.goal} maxLength={200} autoComplete="off" onChange={e => { const v = e.target.value; set(d => { d.goal = v; }); }} />
      </Card>

      <div className="two even">
        <Card pad>
          <div className="row"><span className="lab">Capacity</span><Pill status={over ? 'blocked' : 'done'}>{over ? 'Over capacity' : committed ? 'On target' : 'Nothing planned yet'}</Pill><Grow />
            <span className="cap"><b>{committed}</b> of <input type="number" min="0" value={capacity} aria-label="Capacity in points" onChange={e => { const v = Math.max(0, +e.target.value || 0); set(d => { d.capacity = v; }); }} /> points</span>
          </div>
          <div className="gauge"><i className={over ? 'over' : ''} style={{ width: `${capacity ? Math.min(100, Math.round((100 * committed) / capacity)) : 0}%` }} /></div>
          <div className="muted small row between">
            <span>{p.status?.velocity?.average ? `Average velocity ${p.status.velocity.average}` : 'No finished sprints yet'}{p.status?.velocity?.history?.length ? ` · last ${p.status.velocity.history.slice(-3).join(', ')}` : ''}</span>
            <span>{unestimated.length ? <span className="warn-text">{plural(unestimated.length, 'story', 'stories')} without points</span> : 'Team capacity comes from the Team page'}</span>
          </div>
        </Card>
        <Card pad><span className="lab">Who is on the team</span>
          <div className="people">
            {team.length ? team.map(m => (
              <div className="person" key={m.id}><Person p={p} id={m.id} /><div><b>{m.name.split(' ')[0]}</b><div className="muted small">{m.points == null ? 'not counted' : `${m.points} points`}</div></div></div>
            )) : <div className="muted small">Add people on the Team page.</div>}
          </div>
        </Card>
      </div>

      <div className="two even grow-cols">
        <Card list>
          <div className="list-head sec static"><b>Backlog</b><span className="muted small">ranked by priority · {plural(backlog.filter(s => !pl.picked.includes(s.id)).length, 'story', 'stories')}</span></div>
          {carried.length ? <><div className="group-label warn">Unfinished in Sprint {active!.number} · close it to carry these over</div>{carried.map(s => row(s, false))}<div className="group-label">Backlog</div></> : null}
          {backlog.some(s => !pl.picked.includes(s.id)) ? backlog.filter(s => !pl.picked.includes(s.id)).map(s => row(s, false)) : <Empty small>The backlog is empty.</Empty>}
        </Card>
        <Card list className="picked">
          <div className="list-head sec static accent"><b>Sprint {number}</b>
            <span className="small">{plural(picked.length, 'story', 'stories')} · {plural(committed, 'point')}{capacity ? ` · ${over ? `${committed - capacity} over` : `${capacity - committed} free`}` : ''}</span></div>
          {picked.map(s => row(s, true))}
          {picked.length ? null : <Empty small>Add stories from the backlog.</Empty>}
        </Card>
      </div>
    </div>
  );
}
