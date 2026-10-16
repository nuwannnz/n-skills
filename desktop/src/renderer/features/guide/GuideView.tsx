// The workflow guide: where the project is in the scrumo process, what comes next, and who does it.
import { editProject, type ProjectView, type View } from '../../app/store';
import { Button, Card, cx, Grow, Icon, LinkButton, Note, PageHead, Pill, ProgressBar, RolePill, Slash } from '../../ui';
import { run } from '../projects/actions';
import { chatWith, openDoc, setView } from '../workspace/navigation';
import { docPath, guideSteps, nextStep, roleVerb, type GuideStep } from './steps';

const LOOP: [string, string, string, string | null, View, string][] = [
  ['Plan', 'Choose the goal and stories for the sprint.', 'Scrum master', null, 'planning', 'Plan a sprint'],
  ['Build', 'Developers (and the agent) build one story at a time.', 'Developer', 'scrumo-dev', 'chat', 'Build a story'],
  ['Verify', 'QA checks each story against its acceptance criteria.', 'QA', 'scrumo-qa', 'chat', 'Verify a story'],
  ['Close', 'Review what finished, carry the rest over, start again.', 'Scrum master', null, 'sprint', 'See the sprint'],
];

export function GuideView({ p }: { p: ProjectView }) {
  const steps = guideSteps(p);
  const done = steps.filter(x => x.state === 'done').length;
  const complete = done === steps.length;
  const files = p.git?.files ?? [];
  const saveFor = (title: string) => { editProject(p.info.root, x => { x.saveTitle = title; }); setView('changes'); };
  return (
    <div className="page guide">
      <PageHead title={complete ? 'Workflow' : 'Get started'}
        sub={complete ? 'The steps this project went through, and what every sprint repeats.' : 'A guided path from an idea to a running sprint. You can leave and come back any time: this page always shows the next step.'}>
        <div className="gprog"><span className="muted small">{done} of {steps.length} done</span><ProgressBar pct={(100 * done) / steps.length} /></div>
      </PageHead>
      {files.length ? (
        <Note tone="warn">You have {files.length} unsaved {files.length === 1 ? 'change' : 'changes'}. Save at the end of your part, so the next person (for example the business analyst after the architect) starts from your work. <LinkButton onClick={() => saveFor('')}>Save changes</LinkButton></Note>
      ) : null}
      <div className="gsteps">{steps.map((x, i) => <StepCard key={x.id} p={p} x={x} n={i + 1} onSave={saveFor} />)}</div>
      <Card pad><b>Then, every sprint</b><div className="muted small">After the first sprint, the work repeats in a loop.</div>
        <div className="gloop">
          {LOOP.map(([t, d, role, skill, go, cta], i) => (
            <div className="gl" key={t}><span className="gnum small">{i + 1}</span><b>{t}</b><div className="muted small">{d}</div><RolePill>{role}</RolePill>
              <Button variant="ghost" size="small" onClick={() => (skill ? chatWith(skill, '') : setView(go))}>{cta}</Button></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StepCard({ p, x, n, onSave }: { p: ProjectView; x: GuideStep; n: number; onSave: (title: string) => void }) {
  const unsaved = (p.git?.files ?? []).filter(f => x.paths.some(pre => f.path === pre || (pre.endsWith('/') && f.path.startsWith(pre))));
  const status = x.state === 'done' ? 'done' : x.state === 'review' ? 'review' : x.current ? 'now' : 'todo';
  const draftNote = x.state === 'review' && x.docKey ? 'A draft exists. Read it, then approve it when you\'re happy.' : x.state === 'review' ? 'Drafts exist. They become ready when reviewed.' : '';
  const approve = async (key: string) => {
    if (!confirm('Approve this document? Approving is your decision: later documents are built on it.')) return;
    await run(p.info.root, ['move', key, 'approved']);
  };
  let actions = null;
  if (x.state === 'review' && x.docKey) {
    actions = <>
      <Button size="small" onClick={() => openDoc(docPath(x.docKey!), { full: true })}>Read the draft</Button>
      <Button variant="primary" size="small" onClick={() => approve(x.docKey!)}>Approve</Button>
      <Button variant="ghost" size="small" onClick={() => chatWith(x.skill!, 'Please revise the draft: ')}>Ask for changes</Button>
    </>;
  } else if (x.skill && x.state !== 'done') {
    actions = <Button size="small" variant={x.current ? 'primary' : undefined} onClick={() => chatWith(x.skill!, x.prompt ?? '')}><Slash />{roleVerb(x.role)}</Button>;
  } else if (x.go && x.state !== 'done') {
    actions = <Button size="small" variant={x.current ? 'primary' : undefined} onClick={() => setView(x.go!)}>{x.cta}</Button>;
  } else if (x.state === 'done' && x.docKey) {
    actions = <Button variant="ghost" size="small" onClick={() => openDoc(docPath(x.docKey!), { full: true })}>Open</Button>;
  } else if (x.state === 'done' && x.go) {
    actions = <Button variant="ghost" size="small" onClick={() => setView(x.go === 'planning' ? 'sprint' : x.go!)}>Open</Button>;
  }
  return (
    <div className={cx('gstep', status)}>
      <span className="gnum">{x.state === 'done' ? <Icon name="check" size={14} /> : n}</span>
      <div className="gmain">
        <div className="row"><b>{x.title}</b><RolePill>{x.role}</RolePill>
          {x.state === 'done' && x.note ? <span className="muted small">{x.note}</span> : null}
          {x.state === 'review' ? <Pill status="in-progress">Draft</Pill> : null}
          {unsaved.length ? <Pill status="in-progress">{unsaved.length} not saved</Pill> : null}
        </div>
        <div className="muted">{x.why}</div>
        {draftNote ? <div className="small gdraft">{draftNote}</div> : null}
        {unsaved.length ? <div className="small gsave">Save this so the next person can pick it up. <LinkButton onClick={() => onSave(`${x.title} (${x.role})`)}>Save for review</LinkButton></div> : null}
        {actions ? <div className="row gact">{actions}</div> : null}
      </div>
    </div>
  );
}

/** A slim "next step" bar shown above the planning views until the guide is complete. */
export function NextBar({ p }: { p: ProjectView }) {
  const x = nextStep(p);
  if (!x) return null;
  const go = () => {
    if (x.state === 'review' || (!x.skill && !x.go)) return setView('guide');
    if (x.skill) chatWith(x.skill, x.prompt ?? ''); else setView(x.go!);
  };
  return (
    <div className="nextbar">
      <span className="gnum small"><Icon name="bolt" size={12} /></span>
      <span><b>Next step:</b> {x.title} <span className="muted">· {x.role}</span></span><Grow />
      <Button variant="primary" size="small" onClick={go}>{x.skill ? <><Slash />{roleVerb(x.role)}</> : x.cta}</Button>
      <Button variant="ghost" size="small" onClick={() => setView('guide')}>See the workflow</Button>
    </div>
  );
}
