// SCRUMO6xx: status invariants, plus the SCRUMO412 changelog check.
import { findBody, tableRecords, type Doc } from './doc.ts';
import { sprintsOf, stories } from './generate.ts';
import { acIds, tasks } from './refs.ts';
import type { Project, Report } from './types.ts';

const READY_OR_LATER = ['ready', 'in-progress', 'in-qa', 'done'];

type Sprints = Map<number, ReturnType<typeof sprintsOf>[number]>;

export function checkGates(project: Project, report: Report): void {
  const sprints: Sprints = new Map(sprintsOf(project.tracker).map((s) => [s.number, s]));
  for (const doc of project.docs) {
    if (!doc.fm) continue;
    if (typeof doc.fm.version === 'string') {
      const first = tableRecords(findBody(doc, 'Changelog'))[0];
      if (first && first.Version !== doc.fm.version) report('SCRUMO412', doc.file, `Changelog's newest version ${first.Version} differs from frontmatter version ${doc.fm.version}`);
    }
    if (doc.kind === 'epic') checkEpic(project, doc, report);
    if (doc.kind === 'story') checkStory(project, doc, sprints, report);
  }
  checkSprints(project, report);
}

function checkSprints(project: Project, report: Report): void {
  const { tracker } = project;
  if (!tracker?.fm) return;
  const list = sprintsOf(tracker);
  const active = list.filter((s) => s.status === 'active');
  if (active.length > 1) report('SCRUMO609', tracker.file, `more than one sprint is active (${active.map((s) => s.number).join(', ')})`);
  const all = stories(project);
  for (const sprint of list) {
    const at = `sprint ${sprint.number}`;
    if (sprint.end < sprint.start) report('SCRUMO609', tracker.file, `${at} ends (${sprint.end}) before it starts (${sprint.start})`);
    if (sprint.status !== 'planned' && sprint.committed === null) report('SCRUMO609', tracker.file, `${at} is ${sprint.status} but committed is null`);
    if (sprint.status === 'closed' && sprint.completed === null) report('SCRUMO609', tracker.file, `${at} is closed but completed is null`);
    const points = all.filter((s) => s.sprint === sprint.number).reduce((sum, s) => sum + (s.points ?? 0), 0);
    const committed = sprint.committed ?? points;
    if (sprint.status !== 'closed' && committed > sprint.capacity) report('SCRUMO610', tracker.file, `${at} commits ${committed} points against a capacity of ${sprint.capacity}`);
  }
}

function checkEpic(project: Project, doc: Doc, report: Report): void {
  const status = doc.fm!.status;
  if (typeof status !== 'string') return;
  if (READY_OR_LATER.includes(status) && project.prd?.fm?.status !== 'approved') {
    report('SCRUMO601', doc.file, `epic is ${status} but prd.md ${project.prd ? 'is not approved' : 'does not exist'}`);
  }
  if (status === 'done') {
    const mine = stories(project).filter((s) => s.epic === doc.fm!.id && s.status !== 'cancelled');
    const open = mine.filter((s) => s.status !== 'done');
    if (mine.length === 0) report('SCRUMO608', doc.file, 'epic is done but has no stories that are done');
    else if (open.length) report('SCRUMO608', doc.file, `epic is done but ${open.map((s) => s.id).join(', ')} ${open.length === 1 ? 'is' : 'are'} not`);
  }
}

function checkStory(project: Project, doc: Doc, sprints: Sprints, report: Report): void {
  const fm = doc.fm!;
  const status = fm.status;
  if (typeof status !== 'string') return;
  const fail = (code: string, message: string) => report(code, doc.file, message);

  const reason = fm.reason;
  const needsReason = status === 'blocked' || status === 'cancelled';
  if (needsReason && !(typeof reason === 'string' && reason.trim() !== '')) fail('SCRUMO607', `story is ${status} but reason is not set`);
  if (!needsReason && reason !== null && reason !== undefined) fail('SCRUMO607', `reason is set but status is ${status}`);
  if (status === 'cancelled' && typeof fm.sprint === 'number') fail('SCRUMO613', `story is cancelled but still in sprint ${fm.sprint}`);
  for (const dep of Array.isArray(fm.depends_on) ? fm.depends_on : []) {
    if (typeof dep === 'string' && project.tickets.get(dep)?.fm?.status === 'cancelled') fail('SCRUMO614', `story depends on ${dep}, which is cancelled`);
  }

  const team = project.config.team.map((m) => m.id);
  if (team.length > 0 && typeof fm.assignee === 'string' && status !== 'done' && status !== 'cancelled' && !team.includes(fm.assignee)) {
    fail('SCRUMO615', `assignee "${fm.assignee}" isn't on the team (${team.join(', ')}); add them with scrumo team add`);
  }
  const number = typeof fm.sprint === 'number' ? fm.sprint : undefined;
  if (number !== undefined) {
    const sprint = sprints.get(number);
    if (status === 'draft' && (sprint?.status === 'planned' || sprint?.status === 'active')) fail('SCRUMO611', `story is draft but is in ${sprint.status} sprint ${number}`);
    for (const dep of Array.isArray(fm.depends_on) ? fm.depends_on : []) {
      const target = typeof dep === 'string' ? project.tickets.get(dep) : undefined;
      if (target?.kind !== 'story') continue;
      const depSprint = target.fm?.sprint;
      const placed = typeof depSprint === 'number' ? depSprint <= number : target.fm?.status === 'done';
      if (!placed) fail('SCRUMO612', `story is in sprint ${number} but depends on ${String(dep)}, which is ${typeof depSprint === 'number' ? `in later sprint ${depSprint}` : 'not in a sprint'}`);
    }
  }

  if (!READY_OR_LATER.includes(status)) return;
  for (const [name, upstream] of [['architecture.md', project.architecture], ['coding-standards.md', project.standards]] as const) {
    if (upstream?.fm?.status !== 'approved') fail('SCRUMO601', `story is ${status} but ${name} ${upstream ? 'is not approved' : 'does not exist'}`);
  }
  const epic = typeof fm.epic === 'string' ? project.tickets.get(fm.epic) : undefined;
  if (epic?.kind === 'epic' && epic.fm?.status === 'draft') fail('SCRUMO603', `story is ${status} but its epic ${String(fm.epic)} is still draft`);
  if (fm.points === null) fail('SCRUMO602', `story is ${status} but points is not set`);
  const taskList = tasks(doc);
  const covered = new Set(taskList.flatMap((t) => t.text.match(/AC-\d+/g) ?? []));
  const uncited = acIds(doc).filter((id) => !covered.has(id));
  if (uncited.length) fail('SCRUMO602', `story is ${status} but no task cites ${uncited.join(', ')}`);

  if (status === 'in-progress') {
    const sprint = number === undefined ? undefined : sprints.get(number);
    if (sprint?.status !== 'active') fail('SCRUMO604', `story is in-progress but ${number === undefined ? 'has no sprint' : `sprint ${number} is not active`}`);
    if (fm.assignee === null) fail('SCRUMO604', 'story is in-progress but has no assignee');
  }
  if ((status === 'in-qa' || status === 'done') && taskList.some((t) => !t.checked)) {
    fail('SCRUMO605', `story is ${status} but ${taskList.filter((t) => !t.checked).length} of ${taskList.length} tasks are unchecked`);
  }
  if (status === 'done') {
    const rows = tableRecords(findBody(doc, 'QA Record'));
    const latest = Math.max(0, ...rows.map((row) => Number(row.Round)).filter(Number.isFinite));
    const round = rows.filter((row) => Number(row.Round) === latest);
    const failing = acIds(doc).filter((id) => !round.some((row) => row.AC === id && row.Result === 'PASS'));
    if (rows.length === 0) fail('SCRUMO606', 'story is done but QA Record has no rows');
    else if (failing.length) fail('SCRUMO606', `story is done but QA round ${latest} has no PASS for ${failing.join(', ')}`);
  }
}
