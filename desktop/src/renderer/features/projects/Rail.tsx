// The rail on the left: home, one tile per project (like Slack workspaces), and adding a project.
import type { CSSProperties } from 'react';
import { useApp } from '../../app/store';
import { hue, initials } from '../../lib/format';
import { cx, Icon, Menu, MenuItem, Popover, usePopover } from '../../ui';
import { UpdateButton } from '../settings/UpdateButton';
import { openWizard } from '../wizard/actions';
import { addProject, removeProject, show } from './actions';
import { attention } from './attention';

export function Rail() {
  const projects = useApp(s => s.projects);
  const active = useApp(s => s.active);
  const pop = usePopover();
  return (
    <nav className="rail" aria-label="Projects">
      <div className="rail-top">
        <button type="button" className={cx('tile home', active === null && 'active')} id="homeBtn" title="All projects" aria-label="All projects" onClick={() => show(null)}>
          <Icon name="home" size={20} />
        </button>
        <div className="rail-sep" />
        <div className="rail-projects" id="railProjects">
          {Object.values(projects).map(p => {
            const a = attention(p);
            return (
              <button type="button" key={p.info.root} className={cx('tile project-tile', p.info.root === active && 'active')} style={{ '--h': hue(p.info.root) } as CSSProperties}
                title={`${p.info.name}${p.git?.branch ? ` · ${p.git.branch}` : ''}${a === 'working' ? ' · the agent is working' : ''}`} aria-label={p.info.name}
                onClick={() => show(p.info.root)} onContextMenu={e => { e.preventDefault(); removeProject(p.info.root); }}>
                {initials(p.info.name)}{a ? <span className="att" data-a={a} /> : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="tile add" id="addBtn" title="Open a project…" aria-label="Open a project" onClick={e => pop.toggle(e.currentTarget)}>
          <Icon name="plus" size={18} />
        </button>
        {pop.open ? (
          <Popover anchor={pop.anchor} onClose={pop.close} width={230}>
            <Menu>
              <MenuItem onClick={() => { pop.close(); openWizard(); }}><span>New project…</span></MenuItem>
              <MenuItem onClick={() => { pop.close(); addProject(); }}><span>Open an existing project…</span></MenuItem>
            </Menu>
          </Popover>
        ) : null}
      </div>
      <UpdateButton />
    </nav>
  );
}
