// A side drawer for a story or an epic, so you can read it without leaving the view you were in.
import type { ReactNode } from 'react';
import type { ProjectView } from '../../app/store';
import { clean, colorOfEpic, epicsOf, fmtDate, isEpic, personName, sprintsOf, storiesOf } from '../../lib/data';
import { ago, initials, personColor } from '../../lib/format';
import { Avatar, Button, ColorDot, Empty, Grow, Icon, IconButton, Markdown, Note, StatusPill } from '../../ui';
import { BugPill } from '../stories/StoryRow';
import { chatWith, closePeek, openFull, peek, peekBack } from '../workspace/navigation';
import { useFileLog } from './useFileLog';

export function Drawer({ p }: { p: ProjectView }) {
  if (!p.peek || p.view === 'doc') return null;
  return <aside className="drawer" id="drawer" aria-label="Details"><DrawerBody key={p.peek} p={p} path={p.peek} /></aside>;
}

function DrawerBody({ p, path }: { p: ProjectView; path: string }) {
  const d = p.docs.find(x => x.path === path);
  const log = useFileLog(p.info.root, path);
  if (!d) return <div className="drawer-body"><Empty small>That document isn't there any more.</Empty></div>;
  const epicDoc = isEpic(path);
  const stories = storiesOf(p);
  const epics = epicsOf(p);
  const m = d.meta;
  const epic = clean(m.epic) ? epics.find(e => e.id === m.epic) : null;
  const sprintNo = clean(m.sprint);
  const sprint = sprintNo ? sprintsOf(p).find(s => s.number === +sprintNo) : null;
  const assignee = clean(m.assignee);
  const reason = clean(m.reason);
  const deps = (clean(m.depends_on) ?? '').replace(/[[\]]/g, '').split(',').map(x => x.trim()).filter(Boolean);
  const children = epicDoc ? stories.filter(s => s.epic === m.id && s.status !== 'cancelled') : [];
  const link = (id: string, label?: string) => {
    const t = stories.find(s => s.id === id) ?? epics.find(e => e.id === id);
    return t ? <button type="button" key={id} className="chipbtn" onClick={() => peek(t.path, { push: true })}>{label ?? id}</button> : <span key={id} className="muted">{id}</span>;
  };
  const prop = (label: string, body: ReactNode) => <div className="dprop"><span className="lab">{label}</span><div>{body}</div></div>;

  return (
    <>
      <div className="drawer-head">
        {p.peekTrail.length ? <IconButton icon="chevron" size={16} turn={90} label="Back" onClick={peekBack} /> : null}
        <span className="mono small muted">{m.id ?? ''}</span>{m.status ? <StatusPill status={m.status} /> : null}{m.type === 'bug' ? <BugPill /> : null}
        <Grow />
        <IconButton icon="expand" label="Open as a full document" onClick={() => openFull(path)} />
        <IconButton icon="x" label="Close" title="Close (Esc)" onClick={closePeek} />
      </div>
      <div className="drawer-body">
        <h2 className="dtitle">{m.title || path}</h2>
        <div className="dprops">
          {epic ? prop('Epic', <span className="epicline"><ColorDot color={colorOfEpic(epic.id)} />{link(epic.id, epic.title)}</span>) : null}
          {clean(m.points) != null ? prop('Points', m.points) : null}
          {prop('Assignee', assignee
            ? <span className="who inline"><Avatar initials={initials(personName(p, assignee))} color={personColor(assignee)} />{personName(p, assignee)}</span>
            : <span className="muted">Unassigned</span>)}
          {sprintNo ? prop('Sprint', `Sprint ${sprintNo}${sprint ? ` · ${fmtDate(sprint.start)} – ${fmtDate(sprint.end)}` : ''}`) : null}
          {clean(m.priority) ? prop('Priority', m.priority) : null}
          {deps.length ? prop('Depends on', <>{deps.map((id, i) => <span key={id}>{i ? ' ' : ''}{link(id)}</span>)}</>) : null}
        </div>
        {reason ? <Note tone="bad"><b>Blocked.</b> {reason}</Note> : null}
        {epicDoc ? (
          <div className="dchildren"><div className="lab">Stories ({children.length})</div>
            {children.length ? children.map(s => (
              <button type="button" key={s.path} className="chiprow" onClick={() => peek(s.path, { push: true })}>
                <span className="sid">{s.id}</span><span className="stitle">{s.title}</span><StatusPill status={s.status} /><span className="pts">{s.points ?? '–'}</span>
              </button>
            )) : <div className="muted small">No stories yet.</div>}
          </div>
        ) : null}
        <Markdown className="dmd" text={d.body} />
      </div>
      <div className="drawer-foot">
        <span className="muted small">{log ? <>Last changed by <b>{log.name}</b> · {ago(log.at)}</> : null}</span><Grow />
        <Button size="small" onClick={() => chatWith(epicDoc ? 'scrumo-stories' : 'scrumo-refine', `About ${m.id} (${m.title}): `)}><Icon name="chat" size={14} /> Ask the agent</Button>
        <Button variant="primary" size="small" onClick={() => openFull(path)}>Open full document</Button>
      </div>
    </>
  );
}
