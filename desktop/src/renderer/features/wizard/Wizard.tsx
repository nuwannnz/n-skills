// New project: choose a folder, set it up, add the team, start the kickoff conversation.
import { useApp, useProjectByRoot, type Wizard as State } from '../../app/store';
import { homePath } from '../../lib/format';
import { Button, Card, Check, cx, Grow, Icon, LinkButton, Note, Slash, Spinner, Steps, Tag } from '../../ui';
import { openExistingFolder } from '../projects/actions';
import { TeamView } from '../team/TeamView';
import { closeWizard, createProject, editWizard, keyOk, pickFolder, suggestKey } from './actions';

const SETUP: [string, string][] = [['git', 'Track changes with git'], ['package', 'Prepare the folder'], ['cli', 'Install the scrumo CLI'], ['init', 'Set up scrumo'], ['me', 'Add you to the team'], ['commit', 'Save the first commit']];

export function Wizard() {
  const w = useApp(s => s.wizard);
  if (!w) return null;
  return (
    <div className="homeview" id="wizard">
      <div className="home-inner">
        <div className="wizard">
          <div className="wizard-head"><h1>New project</h1><Button variant="ghost" onClick={() => closeWizard(false)}>{w.root ? 'Close' : 'Cancel'}</Button></div>
          <Steps className="wsteps" steps={['Folder', 'Team', 'Kickoff'].map((label, i) => {
            const state = i + 1 < w.stage ? 'done' : i + 1 === w.stage ? 'now' : '';
            return { label, state, mark: state === 'done' ? <Icon name="check" size={11} /> : i + 1 };
          })} />
          {w.stage === 1 ? <FolderStage w={w} /> : w.stage === 2 ? <TeamStage w={w} /> : <KickoffStage w={w} />}
        </div>
      </div>
    </div>
  );
}

function FolderStage({ w }: { w: State }) {
  const ready = !!w.folder && !w.info?.isProject && !!w.name.trim() && keyOk(w.key) && !w.running;
  return (
    <Card pad className="wbody">
      <div><div className="lab">Project folder</div>
        <div className="folderrow">
          <div className={cx('folder', !w.folder && 'empty')}>{w.folder ? <span className="mono">{homePath(w.folder)}</span> : 'No folder chosen'}</div>
          <Button disabled={w.running} onClick={pickFolder}>{w.folder ? 'Change…' : 'Choose or create a folder…'}</Button>
        </div>
        {w.info?.isProject
          ? <Note tone="warn">This folder is already a scrumo project. <LinkButton onClick={() => openExistingFolder(w.folder!)}>Open it instead</LinkButton></Note>
          : w.folder && w.info?.hasFiles
            ? <Note>This folder already has files. scrumo only adds <span className="mono">docs/</span>, <span className="mono">scrumo.yaml</span> and its agent skills; your other files aren't touched.</Note>
            : null}
      </div>
      <div className="fields">
        <label>Project name<input id="wName" value={w.name} placeholder="PawPlan" autoComplete="off" disabled={w.running}
          onChange={e => { const v = e.target.value; editWizard(x => { x.name = v; if (!x.keyTouched) x.key = suggestKey(v); }); }} /></label>
        <label>Ticket key<input id="wKey" value={w.key} placeholder="PAW" maxLength={10} autoComplete="off" disabled={w.running}
          onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); editWizard(x => { x.key = v; x.keyTouched = true; }); }} />
          <span className={cx('muted small', w.key && !keyOk(w.key) && 'err-text')}>
            {w.key && !keyOk(w.key) ? '2 to 10 capital letters or digits, starting with a letter' : `Stories will be numbered ${w.key || 'KEY'}-1, ${w.key || 'KEY'}-2…`}
          </span></label>
      </div>
      {w.info?.isRepo ? null : (
        <Check checked={w.git} disabled={w.running} onChange={v => editWizard(x => { x.git = v; })}>Track changes with git <span className="muted small">(recommended: it's how your team reviews changes)</span></Check>
      )}
      {Object.keys(w.steps).length ? (
        <div className="progress">
          {SETUP.filter(([id]) => w.steps[id]).map(([id, label]) => {
            const st = w.steps[id]!;
            return (
              <div key={id} className={`prog ${st.state}`}>
                <span className="pi">{st.state === 'done' ? <Icon name="check" size={13} /> : st.state === 'err' ? <Icon name="x" size={13} /> : st.state === 'run' ? <Spinner /> : '–'}</span>
                <span>{label}</span>{st.msg ? <span className="muted small">{st.msg}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {w.error ? <Note tone="bad">{w.error}</Note> : null}
      <div className="row"><span className="muted small">{w.running ? 'This takes about half a minute.' : 'Needs Node.js and git on this computer.'}</span><Grow />
        <Button variant="primary" size="big" id="wCreate" disabled={!ready} onClick={createProject}>{w.running ? 'Setting up…' : w.error ? 'Try again' : 'Set up project'}</Button>
      </div>
    </Card>
  );
}

function TeamStage({ w }: { w: State }) {
  const p = useProjectByRoot(w.root);
  return <>
    <div className="muted wintro">Add the people who will work on <b>{w.name}</b>. Roles decide who is suggested for each skill, and points per sprint set the team's capacity for sprint planning. You can change this any time from the Team page.</div>
    {p ? <TeamView p={p} bare /> : null}
    <div className="row">
      <Button variant="ghost" size="big" onClick={() => editWizard(x => { x.stage = 3; })}>Skip for now</Button><Grow />
      <Button variant="primary" size="big" onClick={() => editWizard(x => { x.stage = 3; })}>Continue to kickoff</Button>
    </div>
  </>;
}

function KickoffStage({ w }: { w: State }) {
  return (
    <Card pad className="wbody">
      <div><b>Start with a kickoff</b>
        <div className="muted">The product strategist asks a few questions and writes the project brief (<span className="mono">docs/brief.md</span>), which everything else builds on. Describe the product in a few sentences to begin.</div></div>
      <textarea id="wBrief" rows={5} value={w.brief} onChange={e => { const v = e.target.value; editWizard(x => { x.brief = v; }); }}
        placeholder="For example: PawPlan is a booking app for a single vet clinic. Pet owners book and cancel appointments online, and the front desk sets each vet's hours." />
      <div className="row">
        <Button variant="ghost" size="big" onClick={() => closeWizard(true)}>Skip, open the project</Button><Grow />
        <Button variant="primary" size="big" disabled={!w.brief.trim()} onClick={() => closeWizard(true, { skill: 'scrumo-kickoff', text: w.brief.trim() })}>
          <Slash /> Start kickoff <Tag>Product strategist</Tag>
        </Button>
      </div>
    </Card>
  );
}
