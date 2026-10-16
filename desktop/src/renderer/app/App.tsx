import { Home } from '../features/projects/Home';
import { Rail } from '../features/projects/Rail';
import { Wizard } from '../features/wizard/Wizard';
import { ProjectScreen } from '../features/workspace/ProjectScreen';
import { Toasts } from '../ui';
import { useApp, useProject } from './store';

/** The window: the project rail, then the home screen, the new-project flow or one project. */
export function App() {
  const ready = useApp(s => s.ready);
  const wizard = useApp(s => s.wizard !== null);
  const p = useProject();
  return (
    <>
      <div className="app">
        <Rail />
        <section className="workspace">
          {!ready ? null : wizard ? <Wizard /> : p ? <ProjectScreen key={p.info.root} p={p} /> : <Home />}
        </section>
      </div>
      <Toasts />
    </>
  );
}
