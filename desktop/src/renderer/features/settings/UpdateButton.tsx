// The update icon at the bottom of the rail, and what it offers.
import { useState } from 'react';
import { useApp } from '../../app/store';
import { api } from '../../lib/api';
import { Button, CodeBox, Icon, Popover, Spinner, toast, usePopover } from '../../ui';

const CMD = 'npm install -g scrumo-desktop@latest';

export function UpdateButton() {
  const update = useApp(s => s.update);
  const version = useApp(s => s.appVersion);
  const pop = usePopover();
  const [state, setState] = useState<'idle' | 'running' | 'installed'>('idle');
  const [msg, setMsg] = useState('');
  if (!update) return null;
  const title = `Update available: ${update.version}`;
  const install = async () => {
    setState('running');
    const r = await api.installUpdate();
    if (r.error) { setState('idle'); setMsg(r.error); return; }
    setState('installed');
    setMsg(`Updated to ${update.version}. Restart to use it. Any chat in progress will stop.`);
  };
  return (
    <>
      <button type="button" className="tile update" id="updateBtn" title={title} aria-label={title} onClick={e => pop.toggle(e.currentTarget)}>
        <Icon name="update" size={22} /><span className="att" data-a="approved" />
      </button>
      {pop.open ? (
        <Popover anchor={pop.anchor} onClose={pop.close}>
          <div className="pop-body">
            <h3>Update available</h3>
            <p className="small">Scrumo <b>{update.version}</b> is out. You have {version}.</p>
            {update.canInstall
              ? <p className="muted small">Updating runs <span className="mono">{CMD}</span>. Your projects and settings stay as they are.</p>
              : <><p className="muted small">This copy wasn't installed with npm, so update it from a terminal:</p><CodeBox text={CMD} /></>}
            <div className="row">
              {state === 'installed' ? <Button variant="primary" size="small" onClick={() => api.restart()}>Restart now</Button> : <>
                {update.canInstall
                  ? <Button variant="primary" size="small" disabled={state === 'running'} onClick={install}>Update now</Button>
                  : <Button size="small" onClick={() => { navigator.clipboard?.writeText(CMD); toast('Command copied.'); }}>Copy command</Button>}
                <Button variant="ghost" size="small" onClick={() => api.openUrl('https://www.npmjs.com/package/scrumo-desktop')}>What's new</Button>
              </>}
            </div>
            <p className="muted small">{state === 'running' ? <><Spinner /> Updating…</> : msg}</p>
          </div>
        </Popover>
      ) : null}
    </>
  );
}
