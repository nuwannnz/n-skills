// The active sprint's stories by column.
import type { CSSProperties } from 'react';
import type { ProjectView } from '../../app/store';
import { BOARD_COLUMNS, colorOfEpic, currentSprint, points, sprintStories } from '../../lib/data';
import { ColorDot, cx, Empty, Grow, PageHead, StatusPill } from '../../ui';
import { opens, Person } from '../stories/StoryRow';

export function BoardView({ p }: { p: ProjectView }) {
  const sp = currentSprint(p);
  if (!sp) return <div className="page"><Empty title="No sprint yet">The board shows the stories of the active sprint.</Empty></div>;
  const stories = sprintStories(p, sp.number);
  const cols = [...BOARD_COLUMNS, ...(stories.some(s => s.status === 'blocked') ? ['blocked'] : [])];
  return (
    <div className="page wide">
      <PageHead title="Board" sub={`Sprint ${sp.number} · ${sp.goal}`} />
      <div className="board" style={{ '--cols': cols.length } as CSSProperties}>
        {cols.map(c => {
          const list = stories.filter(s => s.status === c);
          return (
            <div className="bcol" key={c}>
              <div className="bhead"><StatusPill status={c} /><span className="muted small">{list.length} · {points(list)} pts</span></div>
              {list.length ? list.map(s => {
                const o = opens(s.path, p.peek);
                return (
                  <div key={s.path} {...o} className={cx('bcard', o.className)}>
                    <div className="row"><span className="sid">{s.id}</span><Grow />{s.epic ? <ColorDot color={colorOfEpic(s.epic)} /> : null}</div>
                    <div>{s.title}</div>
                    {s.reason ? <div className="muted small">{s.reason}</div> : null}
                    <div className="row"><span className="pts">{s.points ?? '–'}</span><Grow /><Person p={p} id={s.assignee} /></div>
                  </div>
                );
              }) : <div className="muted small pad">Nothing here</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
