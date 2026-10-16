// Who commits and pull requests from this project are made as (git config --local).
import { useEffect, useState } from 'react';
import type { ProjectView } from '../../app/store';
import { api } from '../../lib/api';
import { Button, Grow, LinkButton, Popover, toast } from '../../ui';
import { loadIdentity } from '../projects/actions';

export function IdentityPopover({ p, anchor, onClose }: { p: ProjectView; anchor: HTMLElement; onClose: () => void }) {
  const root = p.info.root;
  const who = p.identity;
  const [name, setName] = useState(who?.name ?? '');
  const [email, setEmail] = useState(who?.email ?? '');
  useEffect(() => { loadIdentity(root); }, [root]);
  useEffect(() => { setName(who?.name ?? ''); setEmail(who?.email ?? ''); }, [who?.name, who?.email]);
  const save = async () => {
    const r = await api.git.setIdentity(root, { name, email });
    if (r.error) return toast(r.error, 'err');
    onClose();
    toast('Saved to this project’s git config.');
    loadIdentity(root);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} align="right">
      <div className="pop-body">
        <h3>Git identity for {p.info.name}</h3>
        <p className="muted small">Commits and pull requests from this project are made as this person. It is saved to this project only (<span className="mono">git config --local</span>).</p>
        <label>Name<input id="idName" value={name} autoComplete="off" onChange={e => setName(e.target.value)} /></label>
        <label>Email<input id="idEmail" value={email} autoComplete="off" onChange={e => setEmail(e.target.value)} /></label>
        <p className="muted small">{who?.source === 'this project' ? 'Set for this project.' : who?.source === 'global git config' ? 'Using your global git settings until you save one for this project.' : 'Not set yet. Commits need a name and email.'}</p>
        {who?.gh
          ? <p className="small">Signed in to GitHub as <b>@{who.gh.login}</b> <LinkButton onClick={() => { setName(who.gh!.name); setEmail(who.gh!.email); }}>Use this account</LinkButton></p>
          : <p className="muted small">Not signed in to GitHub (<span className="mono">gh auth login</span>), so pull requests can’t be opened.</p>}
        <div className="row"><Grow /><Button variant="primary" size="small" onClick={save}>Save for this project</Button></div>
      </div>
    </Popover>
  );
}
