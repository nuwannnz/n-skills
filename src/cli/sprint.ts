// scrumo sprint plan|start|close: the mechanical parts of running a sprint.
// Judgment stays with the agent: the goal, the capacity, the stories, and the
// Review and Retro text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { setField } from '../validate/edit.ts';
import { sprintsOf, stories } from '../validate/generate.ts';
import { findRoot, loadProject } from '../validate/project.ts';
import { newCommand } from './new.ts';
import { describeErrors, transaction } from './transaction.ts';

export interface SprintOptions {
  goal: string | undefined;
  capacity: string | undefined;
  start: string | undefined;
  end: string | undefined;
  stories: string | undefined;
  today?: string;
}

type Sprint = ReturnType<typeof sprintsOf>[number];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const day = (value: string): Date => new Date(`${value}T00:00:00Z`);
const iso = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number): string => iso(new Date(day(value).getTime() + days * 86_400_000));

function nextWeekday(from: string, weekday: string): string {
  const wanted = WEEKDAYS.indexOf(weekday);
  const delta = (wanted - day(from).getUTCDay() + 7) % 7;
  return addDays(from, delta);
}

function sprintsYaml(list: Sprint[]): string {
  if (list.length === 0) return '[]';
  const plain = list.map((s) => ({ number: s.number, status: s.status, goal: s.goal, start: s.start, end: s.end, capacity: s.capacity, committed: s.committed, completed: s.completed }));
  return `\n${stringify(plain, { lineWidth: 0 }).trimEnd().split('\n').map((line) => `  ${line}`).join('\n')}`;
}

const fail = (code: number, out: string) => ({ code, out: `${out}\n` });

export function sprintCommand(sub: string | undefined, arg: string | undefined, cwd: string, options: SprintOptions): { code: number; out: string } {
  if (sub !== 'plan' && sub !== 'start' && sub !== 'close') {
    return fail(2, 'Usage:\n  scrumo sprint plan --goal "..." --capacity N --stories ID,ID [--start DATE] [--end DATE]\n  scrumo sprint start <number>\n  scrumo sprint close <number>');
  }
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const root = findRoot(cwd);
  if (!root) return fail(1, 'No scrumo.yaml found in or above this folder.');
  let project = loadProject(root, () => {});
  if (!project) return fail(1, 'scrumo.yaml is invalid; run scrumo validate.');
  if (!project.tracker) {
    const created = newCommand('tracker', root, { title: undefined, epic: undefined, priority: undefined, requirements: undefined, dependsOn: undefined, today });
    if (created.code !== 0) return created;
    project = loadProject(root, () => {})!;
  }
  const tracker = project.tracker!;
  const sprints = sprintsOf(tracker);
  const config = parse(readFileSync(join(root, 'scrumo.yaml'), 'utf8')) as { sprint: { length_days: number; start_weekday: string } };

  const rewrite = (list: Sprint[]) => setField(setField(tracker.text, 'sprints', sprintsYaml(list)), 'updated', today);
  const storyText = (id: string, edits: Record<string, string>): string => {
    let text = project!.tickets.get(id)!.text;
    for (const [key, value] of Object.entries(edits)) text = setField(text, key, value);
    return setField(text, 'updated', today);
  };

  if (sub === 'plan') {
    const capacity = Number(options.capacity);
    if (!options.goal?.trim()) return fail(2, 'scrumo sprint plan needs --goal "the one outcome".');
    if (!Number.isInteger(capacity) || capacity < 0) return fail(2, 'scrumo sprint plan needs --capacity <whole number of points>.');
    const ids = options.stories?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
    if (ids.length === 0) return fail(2, 'scrumo sprint plan needs --stories ID,ID with ready stories.');
    const bad = ids.map((id) => ({ id, doc: project!.tickets.get(id) })).filter(({ doc }) => doc?.kind !== 'story' || doc.fm?.status !== 'ready' || doc.fm?.sprint !== null);
    if (bad.length) return fail(1, `These aren't ready stories outside a sprint: ${bad.map((b) => b.id).join(', ')}.`);
    const number = Math.max(0, ...sprints.map((s) => s.number)) + 1;
    const start = options.start ?? nextWeekday(today, config.sprint.start_weekday);
    const end = options.end ?? addDays(start, config.sprint.length_days - 1);
    if (!DATE.test(start) || !DATE.test(end)) return fail(2, '--start and --end must be YYYY-MM-DD dates.');
    const points = stories(project).filter((s) => ids.includes(s.id)).reduce((sum, s) => sum + (s.points ?? 0), 0);
    const outcome = transaction(root, today, (_p, write) => {
      let text = rewrite([...sprints, { number, status: 'planned', goal: options.goal!.trim(), start, end, capacity, committed: null, completed: null }]);
      const section = [`## Sprint ${number}`, '', '### Stories', '', '### Review', '', '<!-- Filled at /scrumo-sprint close. -->', '', '### Retro', '', '<!-- Filled at /scrumo-sprint close. -->', '', ''].join('\n');
      const lines = text.split('\n');
      const first = lines.findIndex((line) => /^## Sprint \d+$/.test(line));
      text = first >= 0 ? [...lines.slice(0, first), ...section.split('\n').slice(0, -1), ...lines.slice(first)].join('\n') : `${text.replace(/\n*$/, '\n')}\n${section.trimEnd()}\n`;
      write(tracker.file, text);
      for (const id of ids) write(project!.tickets.get(id)!.file, storyText(id, { sprint: String(number) }));
    });
    if (!outcome.ok) return fail(1, `Can't plan the sprint; it would break these rules:\n${describeErrors(outcome.errors)}`);
    const over = points > capacity ? ` Warning: that is over capacity (${capacity}).` : '';
    return fail(0, `planned sprint ${number}: ${ids.length} stories, ${points} of ${capacity} points, ${start} to ${end}.${over}`);
  }

  const number = Number(arg);
  const sprint = sprints.find((s) => s.number === number);
  if (!sprint) return fail(2, `Usage: scrumo sprint ${sub} <number>. Sprints: ${sprints.map((s) => s.number).join(', ') || 'none'}.`);
  const mine = stories(project).filter((s) => s.sprint === number);
  const replace = (patch: Partial<Sprint>): Sprint[] => sprints.map((s) => (s.number === number ? { ...s, ...patch } : s));

  if (sub === 'start') {
    if (sprint.status !== 'planned') return fail(1, `Sprint ${number} is ${sprint.status}; only a planned sprint can start.`);
    const points = mine.reduce((sum, s) => sum + (s.points ?? 0), 0);
    const epics = [...new Set(mine.map((s) => s.epic))].filter((id) => project!.tickets.get(id)?.fm?.status === 'ready');
    const outcome = transaction(root, today, (_p, write) => {
      write(tracker.file, setField(setField(tracker.text, 'sprints', sprintsYaml(replace({ status: 'active', committed: points }))), 'updated', today));
      for (const id of epics) write(project!.tickets.get(id)!.file, setField(setField(project!.tickets.get(id)!.text, 'status', 'in-progress'), 'updated', today));
    });
    if (!outcome.ok) return fail(1, `Can't start sprint ${number}; it would break these rules:\n${describeErrors(outcome.errors)}`);
    return fail(0, `started sprint ${number}: ${points} points committed${epics.length ? `; epics now in-progress: ${epics.join(', ')}` : ''}.`);
  }

  if (sprint.status !== 'active') return fail(1, `Sprint ${number} is ${sprint.status}; only an active sprint can close.`);
  const carried = mine.filter((s) => s.status !== 'done');
  const donePoints = mine.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.points ?? 0), 0);
  const stillDone = new Set(stories(project).filter((s) => s.status === 'done').map((s) => s.id));
  const epicsDone = [...new Set(stories(project).map((s) => s.epic))].filter((id) => {
    const members = stories(project!).filter((s) => s.epic === id);
    return project!.tickets.get(id)?.fm?.status === 'in-progress' && members.length > 0 && members.every((s) => stillDone.has(s.id));
  });
  const outcome = transaction(
    root,
    today,
    (_p, write) => {
      write(tracker.file, setField(setField(tracker.text, 'sprints', sprintsYaml(replace({ status: 'closed', completed: donePoints }))), 'updated', today));
      for (const s of carried) write(project!.tickets.get(s.id)!.file, storyText(s.id, { status: 'ready', sprint: 'null', assignee: 'null', reason: 'null' }));
      for (const id of epicsDone) write(project!.tickets.get(id)!.file, setField(setField(project!.tickets.get(id)!.text, 'status', 'done'), 'updated', today));
    },
    (f) => f.file === tracker.file && (f.code === 'SCRUMO409' || f.code === 'SCRUMO411'),
  );
  if (!outcome.ok) return fail(1, `Can't close sprint ${number}; it would break these rules:\n${describeErrors(outcome.errors)}`);
  const lines = [`closed sprint ${number}: ${donePoints} of ${sprint.committed ?? 0} committed points done (velocity ${donePoints}).`];
  if (carried.length) lines.push(`carried over to the backlog as ready, with no assignee: ${carried.map((s) => `${s.id} (was ${s.status})`).join(', ')}. Note the partial work in each story's Technical Notes.`);
  if (epicsDone.length) lines.push(`epics now done: ${epicsDone.join(', ')}.`);
  lines.push('Now fill Sprint ' + number + ' Review and Retro in the tracker; validation fails until you do.');
  return fail(0, lines.join('\n'));
}
