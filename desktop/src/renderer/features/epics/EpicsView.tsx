// Progress per epic.
import { editProject, filterDefaults, type ProjectView } from '../../app/store';
import { colorOfEpic, epicsOf } from '../../lib/data';
import { plural } from '../../lib/format';
import { Button, ColorDot, cx, Empty, Grow, PageHead, ProgressBar, StatusPill } from '../../ui';
import { opens } from '../stories/StoryRow';
import { setView } from '../workspace/navigation';

export function EpicsView({ p }: { p: ProjectView }) {
  const epics = epicsOf(p);
  const seeStories = (id: string) => {
    editProject(p.info.root, x => { x.filters = { ...filterDefaults(), epics: [id] }; });
    setView('backlog');
  };
  return (
    <div className="page">
      <PageHead title="Epics" sub="Bigger pieces of the product, and how far along each one is." />
      {epics.length ? epics.map(e => {
        const o = opens(e.path, p.peek);
        return (
          <div key={e.path} {...o} className={cx('card pad epic-card', o.className)}>
            <div className="row">
              <ColorDot big color={colorOfEpic(e.id)} /><b>{e.title}</b><span className="mono small muted">{e.id}</span><StatusPill status={e.status} /><Grow />
              <Button size="small" onClick={ev => { ev.stopPropagation(); seeStories(e.id); }}>See stories</Button>
            </div>
            <ProgressBar pct={e.points ? (100 * e.donePoints) / e.points : 0} color={colorOfEpic(e.id)} />
            <div className="muted small">{e.doneStories} of {plural(e.stories, 'story', 'stories')} done · {e.donePoints} of {plural(e.points, 'point')}</div>
          </div>
        );
      }) : <Empty title="No epics yet">Ask the agent to break the PRD into epics.</Empty>}
    </div>
  );
}
