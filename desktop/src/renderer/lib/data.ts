// Turns a project's parsed documents and `scrumo status --json` into what the views draw.
import type { Doc, Sprint, Status, Team } from './types';

export type ProjectData = { docs: Doc[]; status: Status | null; team: Team | null };
export type Story = {
  id: string; title: string; path: string; type: string; epic: string | null; status: string; priority: string | null;
  points: number | null; sprint: number | null; assignee: string | null; reason: string | null; updated: string | null; dependsOn: string | null;
};
export type Epic = { id: string; title: string; path: string; status: string; priority: string | null; stories: number; doneStories: number; points: number; donePoints: number };

export const clean = (v: string | null | undefined) => (v == null || v === 'null' || v === '' ? null : v);
const day = (d: string) => new Date(`${d}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', ready: 'Ready', 'in-progress': 'In progress', 'in-qa': 'In QA', done: 'Done', blocked: 'Blocked', cancelled: 'Cancelled',
  active: 'Active', planned: 'Planned', closed: 'Closed',
};
export const BOARD_COLUMNS = ['ready', 'in-progress', 'in-qa', 'done'];
export const ROLE_LABEL: Record<string, string> = { owner: 'Product owner', 'scrum-master': 'Scrum master', architect: 'Architect', dev: 'Developer', qa: 'QA' };
export const ROLES = Object.keys(ROLE_LABEL);

export const isStory = (path: string) => path.includes('/stories/');
export const isEpic = (path: string) => path.includes('/epics/');

/** Stories and bugs, from their documents. */
export function storiesOf(p: ProjectData): Story[] {
  return p.docs.filter(d => isStory(d.path)).map(d => {
    const m = d.meta;
    return {
      id: m.id ?? '', title: m.title || d.path, path: d.path, type: m.type || 'story',
      epic: clean(m.epic), status: m.status ?? '', priority: clean(m.priority), points: clean(m.points) == null ? null : +m.points!,
      sprint: clean(m.sprint) == null ? null : +m.sprint!, assignee: clean(m.assignee), reason: clean(m.reason),
      updated: clean(m.updated), dependsOn: clean(m.depends_on),
    };
  });
}

export function epicsOf(p: ProjectData): Epic[] {
  const prog = new Map((p.status?.epicProgress ?? []).map(e => [e.id, e]));
  return p.docs.filter(d => isEpic(d.path)).map(d => {
    const { stories = 0, doneStories = 0, points = 0, donePoints = 0 } = prog.get(d.meta.id ?? '') ?? {};
    return { id: d.meta.id ?? '', title: d.meta.title || d.path, path: d.path, status: d.meta.status ?? '', priority: clean(d.meta.priority), stories, doneStories, points, donePoints };
  }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export const sprintsOf = (p: ProjectData): Sprint[] => p.status?.sprints ?? [];
/** The sprint shown by default: the active one, else the latest. */
export const currentSprint = (p: ProjectData) => sprintsOf(p).find(s => s.status === 'active') ?? sprintsOf(p).at(-1) ?? null;
export const sprintStories = (p: ProjectData, n: number) => storiesOf(p).filter(s => s.sprint === n && s.status !== 'cancelled');
export const points = (list: { points: number | null }[]) => list.reduce((n, s) => n + (s.points ?? 0), 0);
export const personName = (p: ProjectData, id: string) => (p.team?.team ?? []).find(m => m.id === id)?.name ?? id;

export const colorOfEpic = (id: string) => {
  const n = +(String(id).match(/\d+$/)?.[0] ?? NaN);
  const h = Number.isNaN(n) ? [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 11) : (n * 83 + 190) % 360;
  return `hsl(${h} 55% 52%)`;
};

/** Working days (Mon to Fri) from start to end, inclusive, as ISO dates. */
export function workdays(start: string, end: string) {
  const out: string[] = [];
  for (let d = day(start); d <= day(end); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) out.push(iso(d));
  return out;
}

export type Burndown = ReturnType<typeof burndown>;
/**
 * Burndown from the stories themselves: points still open at the end of each
 * working day, counting a story as finished on the date it was last updated to done.
 */
export function burndown(p: ProjectData, sprint: Sprint) {
  const days = workdays(sprint.start, sprint.end);
  const stories = sprintStories(p, sprint.number);
  const total = points(stories);
  const today = iso(new Date());
  const doneBy = (d: string) => points(stories.filter(s => s.status === 'done' && (s.updated ?? sprint.end) <= d));
  const last = days.filter(d => d <= today).length; // days that have happened
  const actual = days.slice(0, last).map((d, i) => ({ i: i + 1, remaining: total - doneBy(d) }));
  const remaining = actual.at(-1)?.remaining ?? total;
  const pace = actual.length ? (total - remaining) / actual.length : 0; // points burned per day so far
  const projectedEnd = Math.max(0, remaining - pace * (days.length - actual.length));
  return {
    days, total, actual, remaining, todayIndex: actual.length, // 0 = not started, days.length = over
    projectedEnd: Math.round(projectedEnd * 10) / 10,
    idealNow: actual.length ? total - (total * actual.length) / days.length : total,
    short: Math.max(0, Math.round(projectedEnd)),
  };
}

/** Next sprint dates: the day the sprint week starts after the last sprint ends, for the configured length. */
export function nextSprintDates(p: ProjectData, lengthDays = 14, startWeekday = 'monday') {
  const sprints = sprintsOf(p);
  const after = sprints.length ? day(sprints.at(-1)!.end) : new Date();
  after.setDate(after.getDate() + 1);
  const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(startWeekday);
  while (after.getDay() !== (target < 0 ? 1 : target)) after.setDate(after.getDate() + 1);
  const end = new Date(after);
  end.setDate(end.getDate() + lengthDays - 3);
  while (end.getDay() % 6 === 0) end.setDate(end.getDate() - 1); // finish on a weekday
  return { start: iso(after), end: iso(end) };
}

export const fmtDate = (d: string | null | undefined) => (d ? day(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
