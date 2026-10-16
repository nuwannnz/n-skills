// One open project: navigation, header, the chat pane and the current view (side by side when split), and the drawer.
import { useLayoutEffect, useRef } from 'react';
import type { ProjectView } from '../../app/store';
import { cx } from '../../ui';
import { BacklogView } from '../backlog/BacklogView';
import { BoardView } from '../board/BoardView';
import { ChangesView } from '../changes/ChangesView';
import { ChatPane } from '../chat/ChatPane';
import { ChecksView } from '../checks/ChecksView';
import { DocReader } from '../documents/DocReader';
import { DocsView } from '../documents/DocsView';
import { Drawer } from '../documents/Drawer';
import { EpicsView } from '../epics/EpicsView';
import { GuideView, NextBar } from '../guide/GuideView';
import { guideDone } from '../guide/steps';
import { Palette } from '../palette/Palette';
import { PlanningView } from '../planning/PlanningView';
import { SprintView } from '../sprint/SprintView';
import { TeamView } from '../team/TeamView';
import { UsageView } from '../usage/UsageView';
import { Header } from './Header';
import { SideNav } from './SideNav';

const WITH_NEXT_BAR = ['sprint', 'backlog', 'board', 'epics', 'docs'];

export function ProjectScreen({ p }: { p: ProjectView }) {
  return (
    <div className="project" id="project">
      <SideNav p={p} />
      <div className="content">
        <Header p={p} />
        <main className={cx('main', p.split && p.view !== 'chat' && 'split')} id="main" data-view={p.view}>
          <div className="panes">
            <ChatPane p={p} />
            <ViewPane p={p} />
          </div>
        </main>
        <Drawer p={p} />
      </div>
      <Palette p={p} />
    </div>
  );
}

function ViewPane({ p }: { p: ProjectView }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { ref.current?.scrollTo(0, 0); }, [p.info.root, p.view, p.view === 'doc' ? p.selected : '']);
  if (p.view === 'chat') return <div className="pane scroll" id="paneView" ref={ref} />;
  return (
    <div className="pane scroll" id="paneView" ref={ref}>
      {WITH_NEXT_BAR.includes(p.view) && p.status && !guideDone(p) ? <NextBar p={p} /> : null}
      <CurrentView p={p} />
    </div>
  );
}

function CurrentView({ p }: { p: ProjectView }) {
  switch (p.view) {
    case 'usage': return <UsageView />;
    case 'guide': return <GuideView p={p} />;
    case 'sprint': return <SprintView p={p} />;
    case 'planning': return <PlanningView p={p} />;
    case 'backlog': return <BacklogView p={p} />;
    case 'board': return <BoardView p={p} />;
    case 'epics': return <EpicsView p={p} />;
    case 'docs': return <DocsView p={p} />;
    case 'doc': return <DocReader p={p} />;
    case 'checks': return <ChecksView p={p} />;
    case 'team': return <TeamView p={p} />;
    case 'changes': return <ChangesView p={p} />;
    default: return null;
  }
}
