// Team: the people in scrumo.yaml. Every change runs `scrumo team ...`, so it is
// validated by the CLI and shows up under Changes to be saved as a pull request.
import { useState } from 'react';
import { editProject, type MemberDraft, type ProjectView } from '../../app/store';
import { ROLE_LABEL, ROLES, storiesOf } from '../../lib/data';
import { initials, personColor, plural } from '../../lib/format';
import type { Member } from '../../lib/types';
import { Avatar, Button, Card, CheckMenu, Empty, Icon, LinkButton, Note, PageHead, Pill, Popover, RolePill, toast, usePopover } from '../../ui';
import { reloadTeam, run } from '../projects/actions';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
const ROLE_OPTIONS = ROLES.map(r => ({ value: r, label: ROLE_LABEL[r]! }));
const openStories = (p: ProjectView, id: string) => storiesOf(p).filter(s => s.assignee === id && !['done', 'cancelled'].includes(s.status)).length;

/** `bare` leaves out the heading, for the new-project flow. */
export function TeamView({ p, bare = false }: { p: ProjectView; bare?: boolean }) {
  const root = p.info.root;
  const team = p.team?.team ?? [];
  const me = (p.identity?.email ?? '').toLowerCase();
  const changed = p.git?.files?.some(f => f.path === 'scrumo.yaml');
  return (
    <div className={bare ? 'page team bare' : 'page team'}>
      {bare ? null : <PageHead title="Team" sub={`Everyone working on ${p.info.name}. This is the project's scrumo config, so changes are saved and reviewed like any other change.`} />}
      {changed && !bare ? <Note tone="ok">Team changes are not saved yet. Use <b>Save changes</b> to send them for review.</Note> : null}
      <Card>
        <div className="mrow-h"><span className="lab">Member</span><span className="lab">Roles</span><span className="lab">Points per sprint</span><span /></div>
        {team.length ? team.map(m => <MemberRow key={m.id} p={p} m={m} isMe={m.emails.some(e => e.toLowerCase() === me)} />) : <Empty small>No one on the team yet.</Empty>}
      </Card>
      <AddMember root={root} team={team} draft={p.newMember} capacity={p.team?.capacity ?? 0} />
    </div>
  );
}

function MemberRow({ p, m, isMe }: { p: ProjectView; m: Member; isMe: boolean }) {
  const root = p.info.root;
  const pop = usePopover();
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState(m.points == null ? '' : String(m.points));
  const setRoles = async (roles: string[]) => {
    if (!roles.length) return toast('A person needs at least one role.', 'err');
    setBusy(true);
    if ((await run(root, ['team', 'set', m.id, '--roles', roles.join(',')], { quiet: true })).ok) await reloadTeam(root);
    setBusy(false);
  };
  const savePoints = async () => {
    if (points === (m.points == null ? '' : String(m.points))) return;
    if ((await run(root, ['team', 'set', m.id, '--points', points === '' ? '0' : String(+points)], { quiet: true })).ok) reloadTeam(root);
  };
  const remove = async () => {
    const n = openStories(p, m.id);
    if (!confirm(`Remove ${m.name} from the project?${n ? `\n\n${plural(n, 'open story', 'open stories')} assigned to them will stay assigned until you change them.` : ''}\nNothing is deleted from the git history.`)) return;
    if ((await run(root, ['team', 'remove', m.id], { quiet: true })).ok) reloadTeam(root);
  };
  return (
    <div className="mrow-t">
      <div className="who"><Avatar big initials={initials(m.name)} color={personColor(m.id)} />
        <div><b>{m.name}</b>{isMe ? <> <Pill status="draft">You</Pill></> : null}<div className="muted small">{m.emails[0] ?? 'no email'} · <span className="mono">{m.id}</span></div></div>
      </div>
      <button type="button" className="rolebtn" title="Change roles" onClick={e => pop.toggle(e.currentTarget)}>
        {m.roles.length ? m.roles.map(r => <RolePill key={r}>{ROLE_LABEL[r] ?? r}</RolePill>) : <span className="muted">No role</span>}<Icon name="chevron" size={12} />
      </button>
      {pop.open ? (
        <Popover anchor={pop.anchor} onClose={pop.close} width={260}>
          <CheckMenu title={`Roles for ${m.name} (pick any)`} options={ROLE_OPTIONS} selected={m.roles} disabled={busy} onChange={setRoles}
            foot={<><span className="muted small">Changes save as you tick.</span><LinkButton onClick={pop.close}>Done</LinkButton></>} />
        </Popover>
      ) : null}
      <label className="ptsin">
        <input type="number" min="0" value={points} placeholder="–" aria-label={`Points per sprint for ${m.name}`} onChange={e => setPoints(e.target.value)} onBlur={savePoints}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="muted small">{m.points == null ? 'not counted' : 'points'}</span>
      </label>
      <button type="button" className="x" aria-label={`Remove ${m.name}`} title="Remove from the project" onClick={remove}><Icon name="x" size={15} /></button>
    </div>
  );
}

function AddMember({ root, team, draft, capacity }: { root: string; team: Member[]; draft: MemberDraft; capacity: number }) {
  const pop = usePopover();
  const set = (fn: (d: MemberDraft) => void) => editProject(root, x => fn(x.newMember));
  const add = async () => {
    const name = draft.name.trim();
    if (!name) return toast('Enter the person\'s name.', 'err');
    if (!draft.roles.length) return toast('Pick at least one role.', 'err');
    const id = slug(name.split(' ')[0]!);
    const args = ['team', 'add', team.some(m => m.id === id) ? slug(name) : id, '--name', name, '--roles', draft.roles.join(',')];
    if (draft.points !== '') args.push('--points', String(+draft.points));
    if (draft.email.trim()) args.push('--emails', draft.email.trim());
    if ((await run(root, args, { quiet: true })).ok) {
      set(d => Object.assign(d, { name: '', email: '', roles: ['dev'], points: '' }));
      toast(`${name} added to the team.`);
      reloadTeam(root);
    }
  };
  return (
    <Card pad><b>Add a team member</b>
      <div className="addrow">
        <input id="nName" placeholder="Full name" value={draft.name} autoComplete="off" onChange={e => { const v = e.target.value; set(d => { d.name = v; }); }} />
        <input id="nEmail" placeholder="Email" value={draft.email} autoComplete="off" onChange={e => { const v = e.target.value; set(d => { d.email = v; }); }} />
        <button type="button" className="rolebtn" id="nRoles" onClick={e => pop.toggle(e.currentTarget)}>
          {draft.roles.length ? draft.roles.map(r => <RolePill key={r}>{ROLE_LABEL[r]}</RolePill>) : 'Roles'}<Icon name="chevron" size={12} />
        </button>
        {pop.open ? (
          <Popover anchor={pop.anchor} onClose={pop.close} width={260}>
            <CheckMenu title="Roles (pick any)" options={ROLE_OPTIONS} selected={draft.roles} onChange={roles => set(d => { d.roles = roles; })}
              foot={<><span /><LinkButton onClick={pop.close}>Done</LinkButton></>} />
          </Popover>
        ) : null}
        <input id="nPoints" type="number" min="0" placeholder="Points" value={draft.points} aria-label="Points per sprint" onChange={e => { const v = e.target.value; set(d => { d.points = v; }); }} />
        <Button variant="primary" id="nAdd" onClick={add}><Icon name="plus" size={15} /> Add member</Button>
      </div>
      <div className="muted small">The team's capacity for the next sprint is the sum of everyone's points ({capacity} now). Product owners usually aren't counted.</div>
    </Card>
  );
}
