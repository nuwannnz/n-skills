// The backlog: epics on the left, search and filters, then the sprints and the backlog as sections.
import type { ReactNode } from 'react';
import { editProject, filterDefaults, type Filters, type ProjectView } from '../../app/store';
import { colorOfEpic, epicsOf, fmtDate, personName, points, sprintsOf, STATUS_LABEL, storiesOf, type Epic, type Story } from '../../lib/data';
import { plural } from '../../lib/format';
import { skillRole } from '../../lib/skills';
import {
  AllNone, Button, Card, CheckMenu, ColorDot, Empty, Grow, Icon, LinkButton, Pill, Popover, ProgressBar, SearchField, Switch, Tag, usePopover, type CheckOption,
} from '../../ui';
import { StoryRow } from '../stories/StoryRow';
import { chatWith } from '../workspace/navigation';

type FilterKey = 'epics' | 'statuses' | 'assignees';
type Section = { key: string | number; title: string; tag: ReactNode; list: Story[]; all: Story[]; collapsed?: boolean };

export function BacklogView({ p }: { p: ProjectView }) {
  const root = p.info.root;
  const f = p.filters;
  const setF = (fn: (f: Filters) => void) => editProject(root, x => fn(x.filters));
  const all = storiesOf(p).filter(s => s.status !== 'cancelled');
  const match = (s: Story) => (!f.q || `${s.id} ${s.title}`.toLowerCase().includes(f.q.toLowerCase()))
    && (!f.epics.length || f.epics.includes(s.epic ?? 'none'))
    && (!f.statuses.length || f.statuses.includes(s.status))
    && (!f.assignees.length || f.assignees.includes(s.assignee ?? 'none'))
    && !(f.hideDone && s.status === 'done');
  const shown = all.filter(match);
  const sprints = sprintsOf(p);
  const sections: Section[] = [
    ...sprints.filter(s => s.status !== 'closed').map(s => ({
      key: s.number, title: `Sprint ${s.number}`, list: shown.filter(x => x.sprint === s.number), all: all.filter(x => x.sprint === s.number),
      tag: <Pill status={s.status === 'active' ? 'in-progress' : 'draft'}>{STATUS_LABEL[s.status]} · {fmtDate(s.start)} – {fmtDate(s.end)}</Pill>,
    })),
    { key: 'backlog', title: 'Backlog', tag: null, list: shown.filter(x => x.sprint == null), all: all.filter(x => x.sprint == null) },
    ...sprints.filter(s => s.status === 'closed').map(s => ({
      key: s.number, title: `Sprint ${s.number}`, tag: <Pill status="done">Closed</Pill>, list: shown.filter(x => x.sprint === s.number), all: all.filter(x => x.sprint === s.number), collapsed: true,
    })),
  ];
  const collapsed = p.collapsed ?? sections.filter(s => s.collapsed).map(s => s.key);
  const toggle = (key: string | number) => editProject(root, x => { x.collapsed = collapsed.includes(key) ? collapsed.filter(k => k !== key) : [...collapsed, key]; });
  const epics = epicsOf(p);
  const filtering = f.epics.length || f.statuses.length || f.assignees.length || f.q || !f.hideDone;

  return (
    <div className="split-page">
      <aside className="epic-panel">
        <div className="lab">Epics</div>
        <button type="button" className={f.epics.length ? 'epic-item' : 'epic-item on'} onClick={() => setF(x => { x.epics = []; })}>All epics<span>{all.length}</span></button>
        {epics.map(e => (
          <button type="button" key={e.id} className={f.epics.includes(e.id) ? 'epic-item on' : 'epic-item'}
            onClick={() => setF(x => { x.epics = f.epics.includes(e.id) && f.epics.length === 1 ? [] : [e.id]; })}>
            <div className="row"><ColorDot color={colorOfEpic(e.id)} /><b>{e.title}</b><span className="mono small">{e.id}</span></div>
            <ProgressBar pct={e.points ? (100 * e.donePoints) / e.points : 0} color={colorOfEpic(e.id)} />
            <div className="muted small">{e.doneStories} of {plural(e.stories, 'story', 'stories')} done</div>
          </button>
        ))}
      </aside>
      <div className="backlog-main">
        <div className="page-head"><div><h1>Backlog</h1></div>
          <Button variant="primary" title={`Opens the chat with the ${skillRole('scrumo-stories')} agent`} onClick={() => chatWith('scrumo-stories', 'New story: ')}>
            <Icon name="plus" size={15} /> New story<Tag>{skillRole('scrumo-stories')}</Tag>
          </Button>
        </div>
        <div className="filters">
          <SearchField id="bq" placeholder="Search title or ID" value={f.q} onChange={v => setF(x => { x.q = v; })} />
          <span className="vsep" />
          <FilterChip p={p} label="Epic" k="epics" all={all} epics={epics} />
          <FilterChip p={p} label="Status" k="statuses" all={all} epics={epics} />
          <FilterChip p={p} label="Assignee" k="assignees" all={all} epics={epics} />
          <Switch checked={f.hideDone} onChange={v => setF(x => { x.hideDone = v; })}>Hide done</Switch>
          <Grow />
          <span className="muted small">Showing <b>{shown.length}</b> of {all.length}{filtering ? <> · <LinkButton onClick={() => editProject(root, x => { x.filters = filterDefaults(); })}>Clear filters</LinkButton></> : null}</span>
        </div>
        {sections.map(s => {
          const closed = collapsed.includes(s.key);
          return (
            <Card list key={s.key}>
              <button type="button" className="list-head sec" onClick={() => toggle(s.key)}>
                <Icon name="chevron" size={14} {...(closed ? { turn: -90 } : {})} /><b>{s.title}</b>{s.tag}
                <Grow /><span className="muted small">{plural(s.list.length, 'story', 'stories')} · {plural(points(s.list), 'point')}</span>
              </button>
              {closed ? null : s.list.length
                ? s.list.map(x => <StoryRow key={x.path} p={p} s={x} selected={p.peek} />)
                : <Empty small>{s.all.length ? 'No stories match the filters.' : s.key === 'backlog' ? 'The backlog is empty.' : 'No stories yet.'}</Empty>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const TITLES: Record<FilterKey, string> = { epics: 'Show stories from', statuses: 'Status', assignees: 'Assigned to' };

/** A filter as a chip: shows what is picked, opens a menu of choices, and clears with its ×. */
function FilterChip({ p, label, k, all, epics }: { p: ProjectView; label: string; k: FilterKey; all: Story[]; epics: Epic[] }) {
  const pop = usePopover();
  const picked = p.filters[k];
  const set = (values: string[]) => editProject(p.info.root, x => { x.filters[k] = values; });
  const options: CheckOption[] = k === 'epics'
    ? [...epics.map(e => ({ value: e.id, label: e.title, dot: colorOfEpic(e.id), count: all.filter(s => s.epic === e.id).length })), { value: 'none', label: 'No epic', count: all.filter(s => !s.epic).length }]
    : k === 'statuses'
      ? ['draft', 'ready', 'in-progress', 'in-qa', 'done', 'blocked'].map(v => ({ value: v, label: STATUS_LABEL[v]!, count: all.filter(s => s.status === v).length }))
      : [...(p.team?.team ?? []).map(m => ({ value: m.id, label: m.name, count: all.filter(s => s.assignee === m.id).length })), { value: 'none', label: 'Unassigned', count: all.filter(s => !s.assignee).length }];
  const name = (v: string) => (v === 'none' ? 'None' : k === 'epics' ? epics.find(e => e.id === v)?.title || v : k === 'assignees' ? personName(p, v) : STATUS_LABEL[v] ?? v);
  return (
    <>
      <span className={picked.length ? 'fchip on' : 'fchip'} onClick={e => pop.toggle(e.currentTarget)}>
        {picked.length ? <>
          <span>{label}: {picked.length === 1 ? name(picked[0]!) : `${picked.length} selected`}</span>
          <button type="button" className="fx" aria-label={`Clear ${label}`} onClick={e => { e.stopPropagation(); set([]); }}><Icon name="x" size={11} /></button>
        </> : <>{label}<Icon name="chevron" size={12} /></>}
      </span>
      {pop.open ? (
        <Popover anchor={pop.anchor} onClose={pop.close} width={270}>
          <CheckMenu title={TITLES[k]} options={options} selected={picked} onChange={set}
            foot={<AllNone onAll={() => { set(options.map(o => o.value)); pop.close(); }} onNone={() => { set([]); pop.close(); }} />} />
        </Popover>
      ) : null}
    </>
  );
}
