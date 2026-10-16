// The project's header: where you are, the chat split, Claude Code, git identity, saving and settings.
import { Fragment } from 'react';
import { editProject, useApp, type ProjectView, type View } from '../../app/store';
import { currentSprint, sprintsOf } from '../../lib/data';
import { initials } from '../../lib/format';
import { Button, cx, IconButton, usePopover } from '../../ui';
import { IdentityPopover } from '../settings/IdentityPopover';
import { SettingsPopover } from '../settings/SettingsPopover';
import { goBack, setView, toggleNav, toggleSplit } from './navigation';

const GROUP: Record<string, string> = {
  usage: 'Project', guide: 'Project', chat: 'Work with the agent', changes: 'Work with the agent', sprint: 'Plan', planning: 'Plan', backlog: 'Plan', board: 'Plan', epics: 'Plan',
  docs: 'Project', doc: 'Project', checks: 'Project', team: 'Project',
};
const NAME: Record<string, string> = { usage: 'Usage', guide: 'Get started', sprint: 'Sprint', chat: 'Chat', changes: 'Changes', backlog: 'Backlog', board: 'Board', epics: 'Epics', docs: 'Documents', checks: 'Checks', team: 'Team' };

/** Where clicking a group in the breadcrumb goes. */
const GROUP_HOME: Record<string, View> = { 'Work with the agent': 'chat', Plan: 'sprint', Project: 'docs' };

/** The breadcrumb as [label, the view a click opens]; the last entry is where you are. */
function trail(p: ProjectView): [string, View?][] {
  const group = GROUP[p.view]!;
  const t: [string, View?][] = [[group, GROUP_HOME[group]]];
  if (p.view === 'sprint') t.push([`Sprint ${p.sprintShown ?? currentSprint(p)?.number ?? ''}`.trim()]);
  else if (p.view === 'planning') t.push(['Sprint', 'sprint'], [`Plan Sprint ${(sprintsOf(p).at(-1)?.number ?? 0) + 1}`]);
  else if (p.view === 'doc') t.push(['Documents', 'docs'], [p.docs.find(d => d.path === p.selected)?.meta.title ?? p.selected]);
  else t.push([NAME[p.view]!]);
  return t;
}

function goCrumb(root: string, view: View) {
  if (view === 'sprint') editProject(root, x => { x.sprintShown = null; });
  setView(view);
}

export function Header({ p }: { p: ProjectView }) {
  const engine = useApp(s => s.engine);
  const navHidden = useApp(s => s.navHidden);
  const id = usePopover();
  const gear = usePopover();
  const t = trail(p);
  const unsaved = p.git?.files?.length ?? 0;
  const who = p.identity;
  return (
    <header className="pbar">
      {navHidden ? <IconButton icon="sidebar" size={18} label="Show the sidebar" title="Show the sidebar (⌘\)" id="navBtn" onClick={toggleNav} /> : null}
      {p.view === 'doc' && p.backTo ? <IconButton icon="chevron" size={18} turn={90} label="Back" id="backBtn" onClick={goBack} /> : null}
      <nav className="crumbs" id="crumbs" aria-label="Breadcrumb">
        {t.map(([label, go], i) => (i === t.length - 1 || !go
          ? <b key={i} aria-current="page">{label}</b>
          : <Fragment key={i}><button type="button" className="crumb" title={`Go to ${NAME[go] ?? label}`} onClick={() => goCrumb(p.info.root, go)}>{label}</button><i aria-hidden="true">/</i></Fragment>))}
      </nav>
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
