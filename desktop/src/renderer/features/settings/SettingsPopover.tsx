// App settings, and what this copy of the app is running against.
import { useShallow } from 'zustand/react/shallow';
import { setApp, useApp, type ProjectView } from '../../app/store';
import { api } from '../../lib/api';
import { Button, Check, Popover } from '../../ui';
import { removeProject } from '../projects/actions';
import { PermissionSelect } from './PermissionSelect';

export function SettingsPopover({ p, anchor, onClose }: { p: ProjectView; anchor: HTMLElement; onClose: () => void }) {
  const { updatesOn, theme, appVersion, engine } = useApp(useShallow(s => ({ updatesOn: s.updatesOn, theme: s.theme, appVersion: s.appVersion, engine: s.engine })));
  return (
    <Popover anchor={anchor} onClose={onClose} align="right">
      <div className="pop-body">
        <h3>Settings</h3>
        <label>Permissions<PermissionSelect /></label>
        <p className="muted small">For every project, and kept when the app restarts. <b>Ask</b>: edits and commands ask first. <b>Accept edits</b>: edits under docs/ go ahead. <b>Auto</b>: edits and commands go ahead, but deleting files, git push and similar still ask. Edits outside docs/ are always refused.</p>
        <Check checked={updatesOn} onChange={v => { setApp(s => { s.updatesOn = v; if (!v) s.update = null; }); api.setUpdates(v); }}>Check for app updates</Check>
        <label>Appearance
          <select value={theme} onChange={e => { const v = e.target.value; setApp(s => { s.theme = v; }); api.setTheme(v); }}>
            <option value="system">Match my system</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
        <hr />
        <p className="small"><b>Scrumo</b> <span className="muted">{appVersion}</span></p>
        <p className="small"><b>Claude Code</b><br /><span className="muted">{engine.claudePath ? `${engine.version ?? ''} · ${engine.claudePath}` : 'Not found. Install it and sign in, then restart.'}</span></p>
        <p className="small"><b>This project</b><br /><span className="muted mono">{p.info.root}</span></p>
        <div className="row"><Button variant="danger" size="small" onClick={() => { onClose(); removeProject(p.info.root); }}>Remove from list</Button></div>
      </div>
    </Popover>
  );
}
