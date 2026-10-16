// The project's header: where you are, the chat split, Claude Code, git identity, saving and settings.
import { Fragment } from 'react';
import { useApp, type ProjectView } from '../../app/store';
import { currentSprint, sprintsOf } from '../../lib/data';
import { initials } from '../../lib/format';
import { Button, cx, IconButton, usePopover } from '../../ui';
import { IdentityPopover } from '../settings/IdentityPopover';
import { SettingsPopover } from '../settings/SettingsPopover';
import { goBack, setView, toggleSplit } from './navigation';

const GROUP: Record<string, string> = {
  usage: 'Project', guide: 'Project', chat: 'Work with the agent', changes: 'Work with the agent', sprint: 'Plan', planning: 'Plan', backlog: 'Plan', board: 'Plan', epics: 'Plan',
  docs: 'Project', doc: 'Project', checks: 'Project', team: 'Project',
};
const NAME: Record<string, string> = { usage: 'Usage', guide: 'Get started', chat: 'Chat', changes: 'Changes', backlog: 'Backlog', board: 'Board', epics: 'Epics', docs: 'Documents', checks: 'Checks', team: 'Team' };

function trail(p: ProjectView) {
  const t = [GROUP[p.view]!];
  if (p.view === 'sprint') t.push(`Sprint ${p.sprintShown ?? currentSprint(p)?.number ?? ''}`.trim());
  else if (p.view === 'planning') t.push('Sprint', `Plan Sprint ${(sprintsOf(p).at(-1)?.number ?? 0) + 1}`);
  else if (p.view === 'doc') t.push('Documents', p.docs.find(d => d.path === p.selected)?.meta.title ?? p.selected);
  else t.push(NAME[p.view]!);
  return t;
}

export function Header({ p }: { p: ProjectView }) {
  const engine = useApp(s => s.engine);
  const id = usePopover();
  const gear = usePopover();
  const t = trail(p);
  const unsaved = p.git?.files?.length ?? 0;
  const who = p.identity;
  return (
    <header className="pbar">
      {p.view === 'doc' && p.backTo ? <IconButton icon="chevron" size={18} turn={90} label="Back" id="backBtn" onClick={goBack} /> : null}
      <div className="crumbs" id="crumbs">
        {t.map((x, i) => (i === t.length - 1 ? <b key={i}>{x}</b> : <Fragment key={i}><span>{x}</span><i>/</i></Fragment>))}
      </div>
      <div className="pright">
        {p.view !== 'chat' ? <IconButton icon="split" size={18} label="Side by side with chat" id="splitBtn" className={cx(p.split && 'on')} onClick={toggleSplit} /> : null}
        <span className={cx('chip static', !engine.claudePath && 'err')} id="engineChip" title="Using your own Claude Code and login">
          {engine.claudePath
            ? <><i className="sdot" data-s="done" />Claude Code {String(engine.version ?? '').split(' ')[0]} · connected</>
            : <><i className="sdot" data-s="blocked" />Claude Code not found</>}
        </span>
        <button type="button" className="chip" id="idBtn" title="Who your commits are made as" onClick={e => id.toggle(e.currentTarget)}>
          <span className="avatar">{initials(who?.name || who?.gh?.login || '?')}</span><span>{who?.name || 'Set git identity'}</span>
        </button>
        {unsaved ? <Button variant="primary" size="small" id="saveBtn" onClick={() => setView('changes')}>Save changes · {unsaved}</Button> : null}
        <IconButton icon="gear" size={18} label="Settings" id="gearBtn" onClick={e => gear.toggle(e.currentTarget)} />
      </div>
      {id.anchor ? <IdentityPopover p={p} anchor={id.anchor} onClose={id.close} /> : null}
      {gear.anchor ? <SettingsPopover p={p} anchor={gear.anchor} onClose={gear.close} /> : null}
    </header>
  );
}
