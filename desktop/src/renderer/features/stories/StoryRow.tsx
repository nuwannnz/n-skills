// Story pieces shared by the sprint, backlog, board, planning and drawer views.
import type { CSSProperties, HTMLAttributes, KeyboardEvent } from 'react';
import { colorOfEpic, epicsOf, personName, type ProjectData, type Story } from '../../lib/data';
import { initials, personColor } from '../../lib/format';
import { Avatar, cx, Pill, StatusPill } from '../../ui';
import { openDoc } from '../workspace/navigation';

/** Someone on the team, by their id, as an avatar (or the unassigned placeholder). */
export const Person = ({ p, id }: { p: ProjectData; id: string | null }) =>
  id ? <Avatar initials={initials(personName(p, id))} color={personColor(id)} title={personName(p, id)} /> : <Avatar />;

export const BugPill = () => <Pill status="blocked">bug</Pill>;

/** Click or Enter opens the document (stories and epics in the drawer unless `full`). The open one is highlighted. */
export const opens = (path: string, selected: string | null, full = false): HTMLAttributes<HTMLDivElement> & { 'data-doc': string } => ({
  'data-doc': path,
  tabIndex: 0,
  role: 'button',
  className: cx(selected === path && 'sel'),
  onClick: () => openDoc(path, { full }),
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') openDoc(path, { full }); },
});

export function StoryRow({ p, s, selected }: { p: ProjectData; s: Story; selected: string | null }) {
  const epic = s.epic ? epicsOf(p).find(e => e.id === s.epic)?.title ?? '' : '';
  const o = opens(s.path, selected);
  return (
    <div {...o} className={cx('srow', o.className)}>
      <span className="sid">{s.id}</span>
      <span className="stitle">{s.title}{s.type === 'bug' ? <> <BugPill /></> : null}</span>
      {s.epic ? <span className="epic-chip" style={{ '--c': colorOfEpic(s.epic) } as CSSProperties} title={epic}>{epic || s.epic}</span> : <span className="epic-chip empty" />}
      <StatusPill status={s.status} />
      <span className="pts" title="Story points">{s.points ?? '–'}</span>
      <Person p={p} id={s.assignee} />
    </div>
  );
}
