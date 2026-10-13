// scrumo status: a board summary and what to do next.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { sprintsOf, stories } from '../validate/generate.ts';
import { findRoot, loadProject } from '../validate/project.ts';

const STATUSES = ['draft', 'ready', 'in-progress', 'in-qa', 'done', 'blocked'];

export interface Board {
  project: { name: string; key: string };
  documents: Record<string, string>;
  epics: Record<string, number>;
  stories: Record<string, number>;
  sprints: Array<{ number: number; status: string; goal: string; start: string; end: string; capacity: number; committed: number | null; completed: number | null; points: number; donePoints: number; stories: Record<string, number> }>;
  backlog: { ready: number; readyPoints: number; total: number };
  next: string[];
}

function count(values: string[], all: string[]): Record<string, number> {
  return Object.fromEntries(all.map((status) => [status, values.filter((v) => v === status).length]));
}

export function board(root: string): Board | undefined {
  const project = loadProject(root, () => {});
  if (!project) return undefined;
  const config = parse(readFileSync(join(root, 'scrumo.yaml'), 'utf8')) as { project: { name: string; key: string } };
  const all = stories(project);
  const epics = project.docs.filter((d) => d.kind === 'epic').map((d) => String(d.fm?.status));
  const documents = Object.fromEntries(['brief', 'prd', 'architecture', 'standards'].map((kind) => [kind, String(project.docs.find((d) => d.kind === kind)?.fm?.status ?? 'missing')]));
  const sprints = sprintsOf(project.tracker).map((sprint) => {
    const mine = all.filter((s) => s.sprint === sprint.number);
    return {
      ...sprint,
      points: mine.reduce((sum, s) => sum + (s.points ?? 0), 0),
      donePoints: mine.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.points ?? 0), 0),
      stories: count(mine.map((s) => s.status), STATUSES),
    };
  });
  const backlog = all.filter((s) => s.sprint === null);
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
    for (const s of mine.filter((x) => x.status === 'blocked')) next.push(`unblock ${s.id}: ${String(project.tickets.get(s.id)?.fm?.blocked_reason)}`);
    if (mine.length > 0 && mine.every((s) => s.status === 'done')) next.push(`/scrumo-sprint close: sprint ${active.number} is fully done`);
  }
  return {
    project: config.project,
    documents,
    epics: count(epics, ['draft', 'ready', 'in-progress', 'done']),
    stories: count(all.map((s) => s.status), STATUSES),
    sprints: sprints.sort((a, b) => a.number - b.number),
    backlog: { ready: ready.length, readyPoints: ready.reduce((sum, s) => sum + (s.points ?? 0), 0), total: backlog.length },
    next,
  };
}

const line = (counts: Record<string, number>): string => Object.entries(counts).filter(([, n]) => n > 0).map(([status, n]) => `${status} ${n}`).join(' · ') || 'none';

export function statusCommand(cwd: string, json: boolean): { code: number; out: string } {
  const root = findRoot(cwd);
  const result = root ? board(root) : undefined;
  if (!result) return { code: 1, out: 'No valid scrumo.yaml found; run scrumo validate.\n' };
  if (json) return { code: 0, out: `${JSON.stringify(result, null, 2)}\n` };
  const lines = [`${result.project.name} (${result.project.key})`, `Documents: ${Object.entries(result.documents).map(([k, v]) => `${k} ${v}`).join(', ')}`];
  const active = result.sprints.find((s) => s.status === 'active');
  const latest = active ?? result.sprints.filter((s) => s.status !== 'closed').at(0) ?? result.sprints.at(-1);
  if (latest) {
    lines.push('', `Sprint ${latest.number} (${latest.status}) ${latest.start} to ${latest.end}: ${latest.goal}`, `  ${latest.donePoints} of ${latest.committed ?? latest.points} ${latest.committed === null ? 'planned' : 'committed'} points done, capacity ${latest.capacity}`, `  ${line(latest.stories)}`);
  } else lines.push('', 'No sprints yet.');
  lines.push(`Backlog: ${result.backlog.total} stories, ${result.backlog.ready} ready (${result.backlog.readyPoints} points)`, `Epics: ${line(result.epics)}`, `Stories: ${line(result.stories)}`, '', 'Next:');
  lines.push(...(result.next.length ? result.next.map((n) => `  - ${n}`) : ['  - nothing pending']));
  return { code: 0, out: `${lines.join('\n')}\n` };
}
