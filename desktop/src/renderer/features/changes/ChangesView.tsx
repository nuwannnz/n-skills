// Changes: what is unsaved, how to save it as a pull request, and where your pull requests stand.
import { useState } from 'react';
import { editProject, type ProjectView } from '../../app/store';
import { api } from '../../lib/api';
import { ago } from '../../lib/format';
import type { ChangedFile, GitState, Pr } from '../../lib/types';
import { Button, Card, cx, Empty, Grow, Icon, Label, Note, Pill, Steps, toast, UnifiedDiff, type Step } from '../../ui';
import { IdentityPopover } from '../settings/IdentityPopover';

const PR_LABEL: Record<string, string> = { review: 'Waiting for review', approved: 'Approved · ready to merge', changes: 'Changes requested', merged: 'Merged', closed: 'Closed', draft: 'Draft' };
const STEPS: [string, string][] = [['saved', 'Saved'], ['review', 'In review'], ['changes', 'Changes requested'], ['approved', 'Approved'], ['merged', 'Merged']];

export const openPrFor = (g: GitState | null) => g?.prs?.find(x => x.branch === g.branch && !['merged', 'closed'].includes(x.status)) ?? null;

/** The journey of one pull request, as a row of steps. */
function journey(pr: Pr): Step[] {
  const at = ({ review: 1, changes: 2, approved: 3, merged: 4, closed: 1, draft: 0 } as Record<string, number>)[pr.status] ?? 1;
  return STEPS.filter(([k]) => k !== 'changes' || pr.status === 'changes').map(([k, label]) => {
    const i = STEPS.findIndex(s => s[0] === k);
    const state = k === 'changes' ? 'bad' : i < at || pr.status === 'merged' ? 'done' : i === at ? 'now' : '';
    return { label, state, mark: state === 'done' ? <Icon name="check" size={11} /> : state === 'bad' ? '!' : null };
  });
}

const ChecksPill = ({ checks }: { checks: Pr['checks'] }) =>
  checks ? <Pill status={checks === 'passing' ? 'done' : checks === 'failing' ? 'blocked' : 'in-progress'}>checks {checks}</Pill> : null;

function PrRow({ pr }: { pr: Pr }) {
  const finished = pr.status === 'merged' || pr.status === 'closed';
  return (
    <button type="button" className="pr" onClick={() => api.openUrl(pr.url)}>
      <span className="pr-dot" data-pr={pr.status} />
      <span className="pr-main"><span className="pr-title">{pr.title}</span><span className="muted small">#{pr.number} · {pr.branch} · updated {ago(Date.parse(pr.updatedAt))}</span></span>
      <span className="pr-meta"><Pill pr={pr.status}>{PR_LABEL[pr.status]}</Pill>{finished ? null : <><ChecksPill checks={pr.checks} />{pr.conflicts ? <Pill status="blocked">merge conflicts</Pill> : null}</>}</span>
    </button>
  );
}

function FileRow({ root, f }: { root: string; f: ChangedFile }) {
  const [diff, setDiff] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('file-row', open && 'open')}>
      <button type="button" className="file-head" onClick={async () => { setOpen(!open); if (diff == null) setDiff((await api.git.diff(root, f.path)).text); }}>
        <span className="kind" data-k={f.kind}>{f.kind}</span><span className="mono">{f.path}</span><span className="chev">›</span>
      </button>
      {open ? <div className="file-diff">{diff != null ? <UnifiedDiff text={diff} /> : null}</div> : null}
    </div>
  );
}

export function ChangesView({ p }: { p: ProjectView }) {
  const g = p.git;
  if (!g) return <div className="page"><Empty>Reading the repository…</Empty></div>;
  if (!g.repo) return <div className="page"><Empty title="Not a git repository">Run git init in this folder to track changes.</Empty></div>;
  const root = p.info.root;
  const inPr = openPrFor(g);
  const prs = g.prs ?? [];
  const warn = !g.remote ? <Note tone="warn">This project has no remote on GitHub. Changes are saved as commits on this computer only.</Note>
    : g.prError?.startsWith('Install the GitHub CLI') ? <Note tone="warn">{g.prError}</Note> : null;
  return (
    <div className="page changes wide">
      <div className={cx('two even-wide', !(g.remote || inPr) && 'single')}>
        <div className="col">
          <div className="lab">Unsaved changes <span className="muted">on {g.branch}</span></div>
          {warn}
          {g.files.length ? <>
            <div className="files">{g.files.map(f => <FileRow key={f.path} root={root} f={f} />)}</div>
            <SaveBox p={p} g={g} inPr={inPr} />
          </> : <Note tone="ok">Everything is saved. Changes you or the agent make will show up here.</Note>}
        </div>
        <div className="col">
          {inPr ? <>
            <Label>Review journey · #{inPr.number}</Label>
            <Card pad><b>{inPr.title}</b>
              <div className="muted small">{inPr.branch} → {inPr.base} · updated {ago(Date.parse(inPr.updatedAt))}</div>
              <Steps steps={journey(inPr)} />
              {inPr.status === 'changes' ? <Note tone="bad">A reviewer asked for changes. Edit the documents and save again to answer.</Note> : null}
              <div className="row"><ChecksPill checks={inPr.checks} /><Button size="small" onClick={() => api.openUrl(inPr.url)}>Open on GitHub</Button></div>
            </Card>
          </> : null}
          {g.remote ? <>
            <Label>Recent pull requests</Label>
            {prs.length ? <div className="prs">{prs.map(pr => <PrRow key={pr.number} pr={pr} />)}</div> : <Empty small className="card">{g.prError ?? 'No pull requests from you yet.'}</Empty>}
          </> : null}
        </div>
      </div>
    </div>
  );
}

/** Commits the changes and opens (or adds to) a pull request. */
function SaveBox({ p, g, inPr }: { p: ProjectView; g: GitState; inPr: Pr | null }) {
  const root = p.info.root;
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [askIdentity, setAskIdentity] = useState<HTMLElement | null>(null);
  const target = g.onDefault || !inPr ? 'a new pull request' : `pull request #${inPr.number}`;
  const save = async (btn: HTMLElement) => {
    setSaving(true);
    const r = await api.git.save(root, { title: p.saveTitle, body });
    setSaving(false);
    if (r.error) { toast(r.error, 'err'); if (r.needsIdentity) setAskIdentity(btn); return; }
    editProject(root, x => { x.saveTitle = ''; });
    setBody('');
    toast(r.prUrl ? 'Pull request opened. Reviewers will see it on GitHub.' : r.updated ? 'Added to your open pull request.' : r.note ?? 'Saved.');
    if (r.compareUrl) api.openUrl(r.compareUrl);
  };
  return (
    <div className="save-box">
      <div className="save-title">Save to {target}</div>
      <input id="prTitle" placeholder="Summarise what changed (optional)" maxLength={120} value={p.saveTitle} onChange={e => { const v = e.target.value; editProject(root, x => { x.saveTitle = v; }); }} />
      <textarea id="prBody" rows={3} placeholder="Anything the reviewer should know (optional)" value={body} onChange={e => setBody(e.target.value)} />
      <div className="row">
        <span className="muted small">Commits as {p.identity?.name || 'you'}{p.identity?.email ? ` <${p.identity.email}>` : ''} · {g.remote ? `adds to ${target}` : 'kept on this computer'}</span><Grow />
        <Button variant="primary" id="doSave" disabled={saving} onClick={e => save(e.currentTarget)}>
          {saving ? 'Saving…' : g.remote ? (inPr && !g.onDefault ? 'Save and update pull request' : 'Save and open pull request') : 'Save changes'}
        </Button>
      </div>
      {askIdentity ? <IdentityPopover p={p} anchor={askIdentity} onClose={() => setAskIdentity(null)} /> : null}
    </div>
  );
}
