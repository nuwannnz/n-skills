// The workflow guide: where the project is in the scrumo process, what comes next, and who does it.
import { esc, icon } from './ui.js';

/** The steps from an empty project to a running sprint. Each reads its state from the project. */
export function guideSteps(p) {
  const d = p.status?.documents ?? {};
  const e = p.status?.epics ?? {};
  const s = p.status?.stories ?? {};
  const doc = key => ({ state: d[key] === 'approved' ? 'done' : d[key] && d[key] !== 'missing' ? 'review' : 'todo', status: d[key] ?? 'missing' });
  const readyEpics = (e.ready ?? 0) + (e['in-progress'] ?? 0) + (e.done ?? 0);
  const readyStories = (s.ready ?? 0) + (s['in-progress'] ?? 0) + (s['in-qa'] ?? 0) + (s.done ?? 0);
  const team = p.team?.team ?? [];
  const steps = [
    { id: 'team', title: 'Add your team', role: 'Anyone', why: 'Roles and points per sprint decide who is suggested for what, and how much fits in a sprint.', state: team.length ? 'done' : 'todo', note: team.length ? `${team.length} on the team` : '', go: 'team', cta: 'Open Team', paths: ['scrumo.yaml'] },
    { id: 'brief', title: 'Kickoff: capture the idea', role: 'Product strategist', skill: 'scrumo-kickoff', docKey: 'brief', paths: ['docs/brief.md'], why: 'A short brief in plain words: the problem, who it is for, and what is out of scope. Everything later traces back to it.', prompt: 'Describe the product in a few sentences: ', ...doc('brief') },
    { id: 'prd', title: 'Requirements (PRD)', role: 'Business analyst', skill: 'scrumo-prd', docKey: 'prd', paths: ['docs/prd.md'], why: 'Goals, personas and numbered requirements, written from the brief. Epics and stories refer to these numbers.', prompt: 'Write the PRD from the brief. ', ...doc('prd') },
    { id: 'architecture', title: 'Architecture', role: 'Architect', skill: 'scrumo-architecture', docKey: 'architecture', paths: ['docs/architecture.md'], why: 'How the system is built, and the decisions behind it, so stories stay consistent with each other.', prompt: 'Draft the architecture from the PRD. ', ...doc('architecture') },
    { id: 'standards', title: 'Coding standards', role: 'Tech lead', skill: 'scrumo-standards', docKey: 'standards', paths: ['docs/coding-standards.md'], why: 'The rules developers (and the agent) follow when building: style, tests, reviews.', prompt: 'Propose coding standards for this stack: ', ...doc('standards') },
    { id: 'epics', title: 'Epics', role: 'Product owner', skill: 'scrumo-epics', paths: ['docs/epics/'], why: 'Break the PRD into a few big pieces of the product, each tied to the requirements it delivers.', prompt: 'Break the PRD into epics. ', state: readyEpics ? 'done' : (e.draft ?? 0) ? 'review' : 'todo', note: `${(e.draft ?? 0) + readyEpics} epics` },
    { id: 'stories', title: 'Stories', role: 'Product owner', skill: 'scrumo-stories', paths: ['docs/stories/'], why: 'Small, estimated pieces of work with acceptance criteria. A story is "ready" when it can be built.', prompt: 'Write stories for the epics. ', state: readyStories ? 'done' : (s.draft ?? 0) ? 'review' : 'todo', note: `${(s.draft ?? 0) + readyStories} stories` },
    { id: 'sprint', title: 'Plan the first sprint', role: 'Scrum master', why: 'Pick a goal and the ready stories that fit the team\'s capacity. Best done together in a planning meeting.', state: (p.status?.sprints?.length ?? 0) ? 'done' : 'todo', paths: ['docs/sprint-tracker.md'], go: 'planning', cta: 'Plan Sprint 1' },
  ];
  const cur = steps.findIndex(x => x.state !== 'done');
  steps.forEach((x, i) => { x.current = i === cur; });
  return steps;
}

export const guideDone = p => guideSteps(p).every(x => x.state === 'done');
export const nextStep = p => guideSteps(p).find(x => x.current) ?? null;
const roleVerb = r => `Talk to the ${r.toLowerCase()}`;

export function guideView(p, ctx) {
  const steps = guideSteps(p);
  const done = steps.filter(x => x.state === 'done').length;
  const complete = done === steps.length;
  const files = p.git?.files ?? [];
  const unsavedOf = x => files.filter(f => (x.paths ?? []).some(pre => f.path === pre || (pre.endsWith('/') && f.path.startsWith(pre))));
  const card = (x, i) => {
    const unsaved = unsavedOf(x);
    const status = x.state === 'done' ? 'done' : x.state === 'review' ? 'review' : x.current ? 'now' : 'todo';
    const badge = x.state === 'done' ? icon('check', 14) : i + 1;
    const draftNote = x.state === 'review' && x.docKey ? `A draft exists. Read it, then approve it when you're happy.` : x.state === 'review' ? 'Drafts exist. They become ready when reviewed.' : '';
    const actions = x.state === 'review' && x.docKey
      ? `<button class="btn small" data-open="docs/${x.docKey === 'standards' ? 'coding-standards' : x.docKey}.md">Read the draft</button><button class="btn small primary" data-approve="${x.docKey}">Approve</button><button class="btn small ghost" data-skill="${x.skill}" data-prompt="${esc('Please revise the draft: ')}">Ask for changes</button>`
      : x.skill && x.state !== 'done' ? `<button class="btn small ${x.current ? 'primary' : ''}" data-skill="${x.skill}" data-prompt="${esc(x.prompt)}"><span class="slash">/</span>${esc(roleVerb(x.role))}</button>`
        : x.go && x.state !== 'done' ? `<button class="btn small ${x.current ? 'primary' : ''}" data-go="${x.go}">${esc(x.cta)}</button>`
          : x.state === 'done' && x.docKey ? `<button class="btn small ghost" data-open="docs/${x.docKey === 'standards' ? 'coding-standards' : x.docKey}.md">Open</button>` : x.state === 'done' && x.go ? `<button class="btn small ghost" data-go="${x.go === 'planning' ? 'sprint' : x.go}">Open</button>` : '';
    return `<div class="gstep ${status}"><span class="gnum">${badge}</span>
      <div class="gmain"><div class="row"><b>${esc(x.title)}</b><span class="pill role">${esc(x.role)}</span>${x.state === 'done' && x.note ? `<span class="muted small">${esc(x.note)}</span>` : ''}${x.state === 'review' ? '<span class="pill" data-s="in-progress">Draft</span>' : ''}${unsaved.length ? `<span class="pill" data-s="in-progress">${unsaved.length} not saved</span>` : ''}</div>
        <div class="muted">${esc(x.why)}</div>${draftNote ? `<div class="small gdraft">${esc(draftNote)}</div>` : ''}
        ${unsaved.length ? `<div class="small gsave">Save this so the next person can pick it up. <button class="link" data-save="${esc(`${x.title} (${x.role})`)}">Save for review</button></div>` : ''}
        ${actions ? `<div class="row gact">${actions}</div>` : ''}</div></div>`;
  };

  const loop = [
    ['Plan', 'Choose the goal and stories for the sprint.', 'Scrum master', null, 'planning', 'Plan a sprint'],
    ['Build', 'Developers (and the agent) build one story at a time.', 'Developer', 'scrumo-dev', null, 'Build a story'],
    ['Verify', 'QA checks each story against its acceptance criteria.', 'QA', 'scrumo-qa', null, 'Verify a story'],
    ['Close', 'Review what finished, carry the rest over, start again.', 'Scrum master', null, 'sprint', 'See the sprint'],
  ];
  const html = `<div class="page guide">
    <div class="page-head"><div><div class="title-row"><h1>${complete ? 'Workflow' : 'Get started'}</h1></div>
      <div class="muted">${complete ? 'The steps this project went through, and what every sprint repeats.' : `A guided path from an idea to a running sprint. You can leave and come back any time: this page always shows the next step.`}</div></div>
      <div class="gprog"><span class="muted small">${done} of ${steps.length} done</span><div class="bar"><i style="width:${Math.round((100 * done) / steps.length)}%"></i></div></div></div>
    ${files.length ? `<div class="note warn">You have ${files.length} unsaved ${files.length === 1 ? 'change' : 'changes'}. Save at the end of your part, so the next person (for example the business analyst after the architect) starts from your work. <button class="link" data-save="">Save changes</button></div>` : ''}
    <div class="gsteps">${steps.map(card).join('')}</div>
    <div class="card pad"><b>Then, every sprint</b><div class="muted small">After the first sprint, the work repeats in a loop.</div>
      <div class="gloop">${loop.map(([t, d, role, skill, go, cta], i) => `<div class="gl"><span class="gnum small">${i + 1}</span><b>${t}</b><div class="muted small">${esc(d)}</div><span class="pill role">${esc(role)}</span>
        <button class="btn small ghost" ${skill ? `data-skill="${skill}" data-prompt=""` : `data-go="${go}"`}>${esc(cta)}</button></div>`).join('')}</div></div></div>`;
  return {
    html,
    bind(el) {
      el.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => ctx.chatWith(b.dataset.skill, b.dataset.prompt ?? ''));
      el.querySelectorAll('[data-save]').forEach(b => b.onclick = () => { p.saveTitle = b.dataset.save; ctx.go('changes'); });
      el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
      el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => ctx.openDoc(b.dataset.open, { full: true }));
      el.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
        if (!confirm('Approve this document? Approving is your decision: later documents are built on it.')) return;
        await ctx.run(p, ['move', b.dataset.approve, 'approved']);
      });
    },
  };
}

/** A slim "next step" bar shown above the planning views until the guide is complete. */
export function nextBar(p) {
  const x = nextStep(p);
  if (!x) return '';
  return `<div class="nextbar"><span class="gnum small">${icon('bolt', 12)}</span><span><b>Next step:</b> ${esc(x.title)} <span class="muted">· ${esc(x.role)}</span></span><span class="grow"></span><button class="btn small primary" id="nextGo">${x.skill ? `<span class="slash">/</span>${esc(roleVerb(x.role))}` : esc(x.cta)}</button><button class="btn small ghost" id="nextGuide">See the workflow</button></div>`;
}
