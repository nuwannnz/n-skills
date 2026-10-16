// The workflow guide's steps, from an empty project to a running sprint. Each reads its state from the project.
import type { View } from '../../app/store';
import type { Status, Team } from '../../lib/types';

export type GuideStep = {
  id: string; title: string; role: string; why: string; state: 'done' | 'review' | 'todo'; current: boolean; paths: string[];
  skill?: string; prompt?: string; docKey?: string; go?: View; cta?: string; note?: string;
};

export function guideSteps(p: { status: Status | null; team: Team | null }): GuideStep[] {
  const d = p.status?.documents ?? {};
  const e = p.status?.epics ?? {};
  const s = p.status?.stories ?? {};
  const doc = (key: string) => ({ state: (d[key] === 'approved' ? 'done' : d[key] && d[key] !== 'missing' ? 'review' : 'todo') as GuideStep['state'] });
  const readyEpics = (e.ready ?? 0) + (e['in-progress'] ?? 0) + (e.done ?? 0);
  const readyStories = (s.ready ?? 0) + (s['in-progress'] ?? 0) + (s['in-qa'] ?? 0) + (s.done ?? 0);
  const team = p.team?.team ?? [];
  const steps: Omit<GuideStep, 'current'>[] = [
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
  return steps.map((x, i) => ({ ...x, current: i === cur }));
}

export const guideDone = (p: { status: Status | null; team: Team | null }) => guideSteps(p).every(x => x.state === 'done');
export const nextStep = (p: { status: Status | null; team: Team | null }) => guideSteps(p).find(x => x.current) ?? null;
export const roleVerb = (r: string) => `Talk to the ${r.toLowerCase()}`;
export const docPath = (key: string) => `docs/${key === 'standards' ? 'coding-standards' : key}.md`;
