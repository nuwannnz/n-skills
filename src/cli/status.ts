// scrumo status: the sprint and the project at a glance, what needs attention, and what to do next.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { findBody, tableRecords } from '../validate/doc.ts';
import { sprintsOf, stories } from '../validate/generate.ts';
import { validate } from '../validate/index.ts';
import { findRoot, loadProject } from '../validate/project.ts';

const STATUSES = ['draft', 'ready', 'in-progress', 'in-qa', 'done', 'blocked', 'cancelled'];

export interface Person {
  name: string;
  stories: number;
  points: number;
  open: number;
  /** Typical points per sprint from the team roster, if set. */
  capacity: number | null;
}

export interface Pace {
  expectedPct: number;
  actualPct: number;
  verdict: 'ahead' | 'on track' | 'behind' | 'at risk' | 'not started' | 'overdue';
}

export interface SprintView {
  number: number;
  status: string;
  goal: string;
  start: string;
  end: string;
  capacity: number;
  committed: number | null;
  completed: number | null;
  points: number;
  donePoints: number;
  stories: Record<string, number>;
  /** Working days (Monday to Friday) in the sprint, how many have passed including today, and how many are left. */
  days: { total: number; elapsed: number; left: number } | null;
  pace: Pace | null;
  people: Person[];
  blocked: Array<{ id: string; title: string; reason: string }>;
}

export interface EpicView {
  id: string;
  title: string;
  status: string;
  stories: number;
  doneStories: number;
  points: number;
  donePoints: number;
}

export interface Board {
  project: { name: string; key: string };
  documents: Record<string, string>;
  epics: Record<string, number>;
  stories: Record<string, number>;
  sprints: SprintView[];
  backlog: { ready: number; readyPoints: number; total: number };
  bugs: { open: number; ids: string[]; byPriority: Record<string, number> };
  epicProgress: EpicView[];
  requirements: { total: number; covered: number; uncovered: string[] };
  velocity: { history: number[]; average: number | null; readySprints: number | null };
  validation: { errors: number; warnings: number };
  team: { members: number; capacity: number };
  attention: string[];
  next: string[];
}

const DAY = 86_400_000;
const parseDay = (value: string): number => Date.parse(`${value}T00:00:00Z`);

/** Monday to Friday days from `from` to `to`, inclusive. */
export function workdays(from: string, to: string): number {
  let n = 0;
  for (let t = parseDay(from); t <= parseDay(to); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) n += 1;
  }
  return n;
}

function paceOf(sprint: { start: string; end: string; status: string }, done: number, committed: number, today: string): { days: SprintView['days']; pace: Pace | null } {
  const total = workdays(sprint.start, sprint.end);
  if (sprint.status !== 'active') return { days: null, pace: null };
  const elapsed = today < sprint.start ? 0 : workdays(sprint.start, today > sprint.end ? sprint.end : today);
  const days = { total, elapsed, left: Math.max(0, total - elapsed) };
  const actualPct = committed > 0 ? Math.round((done / committed) * 100) : 0;
  const expectedPct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
  let verdict: Pace['verdict'];
  if (today < sprint.start) verdict = 'not started';
  else if (today > sprint.end && done < committed) verdict = 'overdue';
  else if (committed === 0) verdict = 'on track';
  else if (actualPct - expectedPct >= 10) verdict = 'ahead';
  else if (actualPct - expectedPct >= -10) verdict = 'on track';
  else if (actualPct - expectedPct >= -30) verdict = 'behind';
  else verdict = 'at risk';
  return { days, pace: { expectedPct, actualPct, verdict } };
}

function count(values: string[], all: string[]): Record<string, number> {
  return Object.fromEntries(all.map((status) => [status, values.filter((v) => v === status).length]));
}

export function board(root: string, today: string = new Date().toISOString().slice(0, 10)): Board | undefined {
  const project = loadProject(root, () => {});
  if (!project) return undefined;
  const config = parse(readFileSync(join(root, 'scrumo.yaml'), 'utf8')) as { project: { name: string; key: string } };
  const all = stories(project);
  const epics = project.docs.filter((d) => d.kind === 'epic').map((d) => String(d.fm?.status));
  const documents = Object.fromEntries(['brief', 'prd', 'architecture', 'standards'].map((kind) => [kind, String(project.docs.find((d) => d.kind === kind)?.fm?.status ?? 'missing')]));
  const sprints: SprintView[] = sprintsOf(project.tracker).map((sprint) => {
    const mine = all.filter((s) => s.sprint === sprint.number);
    const points = mine.reduce((sum, s) => sum + (s.points ?? 0), 0);
    const donePoints = mine.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.points ?? 0), 0);
    const roster = project.config.team.map((m) => m.id);
    const others = [...new Set(mine.map((s) => s.assignee ?? 'unassigned'))].filter((n) => !roster.includes(n)).sort((a, b) => (a === 'unassigned' ? 1 : b === 'unassigned' ? -1 : a.localeCompare(b)));
    const names = [...roster, ...others];
    return {
      ...sprint,
      points,
      donePoints,
      stories: count(mine.map((s) => s.status), STATUSES),
      ...paceOf(sprint, donePoints, sprint.committed ?? points, today),
      people: names.map((name) => {
        const theirs = mine.filter((s) => (s.assignee ?? 'unassigned') === name);
        return { name, stories: theirs.length, points: theirs.reduce((sum, s) => sum + (s.points ?? 0), 0), open: theirs.filter((s) => s.status !== 'done').length, capacity: project.config.team.find((m) => m.id === name)?.points ?? null };
      }),
      blocked: mine.filter((s) => s.status === 'blocked').map((s) => ({ id: s.id, title: s.title, reason: String(project.tickets.get(s.id)?.fm?.reason ?? '') })),
    };
  });
  const backlog = all.filter((s) => s.sprint === null && s.status !== 'cancelled');
  const ready = backlog.filter((s) => s.status === 'ready');

  const next: string[] = [];
  const doc = (kind: string) => documents[kind]!;
  const planning: Array<[string, string, string]> = [['brief', '/scrumo-kickoff', 'capture the idea'], ['prd', '/scrumo-prd', 'write the PRD'], ['architecture', '/scrumo-architecture', 'design the architecture'], ['standards', '/scrumo-standards', 'write the coding standards']];
  const step = planning.find(([kind]) => doc(kind) !== 'approved');
  const active = sprints.find((s) => s.status === 'active');
  if (step) {
    next.push(doc(step[0]) === 'missing' ? `${step[1]}: ${step[2]}` : `${step[1]}: finish the ${step[0]} and approve it (${doc(step[0])})`);
  } else if (epics.length === 0) next.push('/scrumo-epics: slice the PRD into epics');
  else if (all.length === 0 || (ready.length === 0 && !active && !sprints.some((s) => s.status === 'planned'))) next.push('/scrumo-stories: write stories for the epics and make them ready');
  else if (!active && sprints.every((s) => s.status === 'closed') && ready.length > 0) next.push('/scrumo-sprint plan: plan the next sprint');
  else if (!active) {
    const planned = sprints.find((s) => s.status === 'planned');
    if (planned) next.push(`/scrumo-sprint start: start sprint ${planned.number}`);
  }
  if (active) {
    const mine = all.filter((s) => s.sprint === active.number);
    for (const s of mine.filter((x) => x.status === 'in-qa')) next.push(`/scrumo-qa ${s.id}: verify "${s.title}"`);
    for (const s of mine.filter((x) => x.status === 'in-progress')) next.push(`/scrumo-dev ${s.id}: keep building "${s.title}"`);
    for (const s of mine.filter((x) => x.status === 'ready')) next.push(`/scrumo-dev ${s.id}: start "${s.title}"`);
    for (const s of mine.filter((x) => x.status === 'blocked')) next.push(`unblock ${s.id}: ${String(project.tickets.get(s.id)?.fm?.reason)}`);
    if (mine.length > 0 && mine.every((s) => s.status === 'done')) next.push(`/scrumo-sprint close: sprint ${active.number} is fully done`);
  }
  const num = (id: string) => Number(id.split('-').at(-1));
  const bugDocs = project.docs.filter((d) => d.kind === 'story' && d.fm?.type === 'bug' && d.fm.status !== 'done' && d.fm.status !== 'cancelled').sort((a, b) => num(String(a.fm?.id)) - num(String(b.fm?.id)));
  const openBugs = bugDocs.map((d) => String(d.fm?.id));

  const epicProgress: EpicView[] = project.docs.filter((d) => d.kind === 'epic').map((d) => {
    const mine = all.filter((s) => s.epic === d.fm?.id && s.status !== 'cancelled');
    return {
      id: String(d.fm?.id),
      title: String(d.fm?.title),
      status: String(d.fm?.status),
      stories: mine.length,
      doneStories: mine.filter((s) => s.status === 'done').length,
      points: mine.reduce((sum, s) => sum + (s.points ?? 0), 0),
      donePoints: mine.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.points ?? 0), 0),
    };
  }).sort((a, b) => num(a.id) - num(b.id));

  const frIds = tableRecords(project.prd ? findBody(project.prd, 'Functional Requirements') : undefined).map((r) => r.ID ?? '');
  const coveredIds = new Set(project.docs.filter((d) => d.kind === 'epic').flatMap((d) => (Array.isArray(d.fm?.requirements) ? (d.fm!.requirements as string[]) : [])));
  const history = sprints.filter((s) => s.status === 'closed' && s.completed !== null).map((s) => s.completed as number);
  const recent = history.slice(-3);
  const average = recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10 : null;
  const readyPoints = ready.reduce((sum, s) => sum + (s.points ?? 0), 0);
  const findings = validate(root).findings;
  const validation = { errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warning').length };

  const attention: string[] = [];
  if (validation.errors) attention.push(`${validation.errors} validation error${validation.errors === 1 ? '' : 's'}: run scrumo validate`);
  const current = sprints.find((s) => s.status === 'active');
  if (current) {
    if (current.pace && (current.pace.verdict === 'behind' || current.pace.verdict === 'at risk' || current.pace.verdict === 'overdue')) {
      attention.push(`Sprint ${current.number} is ${current.pace.verdict}: ${current.pace.actualPct}% done, ${current.pace.expectedPct}% of the time used${current.days ? `, ${current.days.left} working day${current.days.left === 1 ? '' : 's'} left` : ''}`);
    }
    if (current.committed !== null && current.committed > current.capacity) attention.push(`Sprint ${current.number} committed ${current.committed} points against a capacity of ${current.capacity}`);
    for (const d of project.docs.filter((x) => x.kind === 'story' && x.fm?.sprint === current.number && x.fm.status === 'in-progress')) {
      const rows = tableRecords(findBody(d, 'QA Record'));
      const latest = Math.max(0, ...rows.map((r) => Number(r.Round)).filter(Number.isFinite));
      const failed = rows.filter((r) => Number(r.Round) === latest && r.Result === 'FAIL').map((r) => r.AC);
      if (failed.length) attention.push(`${d.fm?.id} failed QA round ${latest} (${failed.join(', ')}): back with dev`);
    }
    for (const p of current.people.filter((x) => x.capacity !== null && x.capacity > 0 && x.points > x.capacity)) {
      attention.push(`${p.name} holds ${p.points} points in sprint ${current.number} against a typical ${p.capacity}`);
    }
    for (const d of bugDocs.filter((x) => (x.fm?.priority === 'P0' || x.fm?.priority === 'P1') && x.fm.sprint !== current.number)) {
      attention.push(`${d.fm?.priority} bug ${d.fm?.id} is not in the active sprint`);
    }
  }
  for (const s of all.filter((x) => x.status === 'blocked')) attention.push(`${s.id} is blocked: ${String(project.tickets.get(s.id)?.fm?.reason)}`);
  const planned = sprints.find((s) => s.status === 'planned');
  if (planned && !current && today >= planned.start) attention.push(`Sprint ${planned.number} should have started on ${planned.start}`);
  if (frIds.length && frIds.some((id) => !coveredIds.has(id))) attention.push(`Requirements not covered by any epic: ${frIds.filter((id) => !coveredIds.has(id)).join(', ')}`);

  return {
    project: config.project,
    documents,
    epics: count(epics, ['draft', 'ready', 'in-progress', 'done']),
    stories: count(all.map((s) => s.status), STATUSES),
    sprints: sprints.sort((a, b) => a.number - b.number),
    backlog: { ready: ready.length, readyPoints: ready.reduce((sum, s) => sum + (s.points ?? 0), 0), total: backlog.length },
    bugs: { open: openBugs.length, ids: openBugs, byPriority: Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((p) => [p, bugDocs.filter((d) => d.fm?.priority === p).length])) },
    epicProgress,
    requirements: { total: frIds.length, covered: frIds.filter((id) => coveredIds.has(id)).length, uncovered: frIds.filter((id) => !coveredIds.has(id)) },
    velocity: { history, average, readySprints: average && average > 0 ? Math.round((readyPoints / average) * 10) / 10 : null },
    validation,
    team: { members: project.config.team.length, capacity: project.config.team.reduce((sum, m) => sum + (m.points ?? 0), 0) },
    attention,
    next,
  };
}

const line = (counts: Record<string, number>): string => Object.entries(counts).filter(([, n]) => n > 0).map(([status, n]) => `${status} ${n}`).join(' · ') || 'none';
const bar = (done: number, total: number, width = 10): string => {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
};
const pct = (done: number, total: number): string => (total > 0 ? `${Math.round((done / total) * 100)}%` : '-');

function sprintLines(sprint: SprintView): string[] {
  const basis = sprint.committed ?? sprint.points;
  const lines = [`Sprint ${sprint.number} (${sprint.status}) ${sprint.start} to ${sprint.end}`, `  Goal: ${sprint.goal}`];
  lines.push(`  Progress  ${bar(sprint.donePoints, basis)} ${sprint.donePoints} of ${basis} ${sprint.committed === null ? 'planned' : 'committed'} points done (${pct(sprint.donePoints, basis)}), capacity ${sprint.capacity}`);
  if (sprint.days && sprint.pace) {
    lines.push(`  Time      ${bar(sprint.days.elapsed, sprint.days.total)} working day ${Math.min(sprint.days.elapsed, sprint.days.total)} of ${sprint.days.total}, ${sprint.days.left} left: ${sprint.pace.verdict}`);
  }
  lines.push(`  Stories   ${line(sprint.stories)}`);
  if (sprint.people.length) lines.push(`  People    ${sprint.people.map((p) => (p.stories === 0 ? `${p.name} free${p.capacity ? ` (${p.capacity} pts)` : ''}` : `${p.name} ${p.points}${p.capacity !== null ? `/${p.capacity}` : ''} pts, ${p.stories} ${p.stories === 1 ? 'story' : 'stories'}`)).join(' · ')}`);
  for (const b of sprint.blocked) lines.push(`  Blocked   ${b.id}: ${b.reason}`);
  return lines;
}

function projectLines(result: Board): string[] {
  const lines = [`Documents: ${Object.entries(result.documents).map(([k, v]) => `${k} ${v}`).join(', ')}`];
  if (result.requirements.total) lines.push(`Requirements: ${result.requirements.covered} of ${result.requirements.total} covered by an epic`);
  if (result.epicProgress.length) {
    lines.push('Epics:');
    const width = Math.max(...result.epicProgress.map((e) => e.id.length));
    for (const e of result.epicProgress) lines.push(`  ${e.id.padEnd(width)}  ${bar(e.donePoints, e.points)} ${e.doneStories}/${e.stories} stories, ${e.donePoints}/${e.points} pts  ${e.status}  ${e.title}`);
  }
  lines.push(`Backlog: ${result.backlog.total} stories, ${result.backlog.ready} ready (${result.backlog.readyPoints} points)${result.velocity.readySprints !== null ? `, about ${result.velocity.readySprints} sprint${result.velocity.readySprints === 1 ? '' : 's'} of ready work` : ''}`);
  lines.push(`Velocity: ${result.velocity.history.length ? `${result.velocity.history.join(', ')} (average of the last 3: ${result.velocity.average})` : 'no closed sprints yet'}`);
  const bugs = Object.entries(result.bugs.byPriority).filter(([, n]) => n > 0).map(([p, n]) => `${p} ${n}`).join(' · ');
  lines.push(`Bugs: ${result.bugs.open ? `${result.bugs.open} open (${bugs}): ${result.bugs.ids.join(', ')}` : 'none open'}`);
  lines.push(`Stories: ${line(result.stories)}`);
  return lines;
}

export type StatusView = 'all' | 'sprint' | 'project';

export function statusCommand(cwd: string, json: boolean, view: StatusView = 'all', today?: string): { code: number; out: string } {
  const root = findRoot(cwd);
  const result = root ? board(root, today) : undefined;
  if (!result) return { code: 1, out: 'No valid scrumo.yaml found; run scrumo validate.\n' };
  if (json) return { code: 0, out: `${JSON.stringify(result, null, 2)}\n` };
  const active = result.sprints.find((s) => s.status === 'active');
  const latest = active ?? result.sprints.filter((s) => s.status !== 'closed').at(0) ?? result.sprints.at(-1);
  const health = result.validation.errors ? `✖ ${result.validation.errors} validation error${result.validation.errors === 1 ? '' : 's'}` : result.validation.warnings ? `✔ valid, ${result.validation.warnings} warning${result.validation.warnings === 1 ? '' : 's'}` : '✔ valid';
  const lines = [`${result.project.name} (${result.project.key}) · ${health}`];
  if (view !== 'project') lines.push('', ...(latest ? sprintLines(latest) : ['No sprints yet.']));
  if (view !== 'sprint') lines.push('', ...projectLines(result));
  if (result.attention.length) lines.push('', 'Needs attention:', ...result.attention.map((a) => `  ! ${a}`));
  lines.push('', 'Next:', ...(result.next.length ? result.next.map((n) => `  - ${n}`) : ['  - nothing pending']));
  return { code: 0, out: `${lines.join('\n')}\n` };
}
