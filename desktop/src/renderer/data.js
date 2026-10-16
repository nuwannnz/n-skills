// Turns a project's parsed documents and `scrumo status --json` into what the views draw.
const val = v => (v == null || v === 'null' || v === '' ? null : v);
const day = d => new Date(`${d}T00:00:00`);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const STATUS_LABEL = {
  draft: 'Draft', ready: 'Ready', 'in-progress': 'In progress', 'in-qa': 'In QA', done: 'Done', blocked: 'Blocked', cancelled: 'Cancelled',
  active: 'Active', planned: 'Planned', closed: 'Closed',
};
export const BOARD_COLUMNS = ['ready', 'in-progress', 'in-qa', 'done'];

/** Stories and bugs, from their documents. */
export function storiesOf(p) {
  return p.docs.filter(d => d.path.includes('/stories/')).map(d => ({
    id: d.meta.id, title: d.meta.title || d.path, path: d.path, type: d.meta.type || 'story',
    epic: val(d.meta.epic), status: d.meta.status, priority: val(d.meta.priority), points: val(d.meta.points) == null ? null : +d.meta.points,
    sprint: val(d.meta.sprint) == null ? null : +d.meta.sprint, assignee: val(d.meta.assignee), reason: val(d.meta.reason),
    updated: val(d.meta.updated), dependsOn: val(d.meta.depends_on),
  }));
}

export function epicsOf(p) {
  const prog = new Map((p.status?.epicProgress ?? []).map(e => [e.id, e]));
  return p.docs.filter(d => d.path.includes('/epics/')).map(d => ({
    id: d.meta.id, title: d.meta.title || d.path, path: d.path, status: d.meta.status, priority: val(d.meta.priority),
    ...(prog.get(d.meta.id) ?? { stories: 0, doneStories: 0, points: 0, donePoints: 0 }),
  })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export const sprintsOf = p => p.status?.sprints ?? [];
/** The sprint shown by default: the active one, else the latest. */
export const currentSprint = p => sprintsOf(p).find(s => s.status === 'active') ?? sprintsOf(p).at(-1) ?? null;
export const sprintStories = (p, n) => storiesOf(p).filter(s => s.sprint === n && s.status !== 'cancelled');

export const colorOfEpic = id => {
  const n = +(String(id).match(/\d+$/)?.[0] ?? NaN);
  const h = Number.isNaN(n) ? [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 11) : (n * 83 + 190) % 360;
  return `hsl(${h} 55% 52%)`;
};

/** Working days (Mon to Fri) from start to end, inclusive, as ISO dates. */
export function workdays(start, end) {
  const out = [];
  for (let d = day(start); d <= day(end); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) out.push(iso(d));
  return out;
}

/**
 * Burndown from the stories themselves: points still open at the end of each
 * working day, counting a story as finished on the date it was last updated to done.
 */
export function burndown(p, sprint) {
  const days = workdays(sprint.start, sprint.end);
  const stories = sprintStories(p, sprint.number);
  const total = stories.reduce((n, s) => n + (s.points ?? 0), 0);
  const today = iso(new Date());
  const doneBy = d => stories.filter(s => s.status === 'done' && (s.updated ?? sprint.end) <= d).reduce((n, s) => n + (s.points ?? 0), 0);
  const last = days.filter(d => d <= today).length; // days that have happened
  const actual = days.slice(0, last).map((d, i) => ({ i: i + 1, remaining: total - doneBy(d) }));
  const left = total - (actual.at(-1) ? total - actual.at(-1).remaining : 0);
  const remaining = actual.at(-1)?.remaining ?? total;
  const pace = actual.length ? (total - remaining) / actual.length : 0; // points burned per day so far
  const projectedEnd = Math.max(0, remaining - pace * (days.length - actual.length));
  return {
    days, total, actual, remaining, left, todayIndex: actual.length, // 0 = not started, days.length = over
    ideal: days.map((_, i) => total - (total * (i + 1)) / days.length),
    projectedEnd: Math.round(projectedEnd * 10) / 10,
    idealNow: actual.length ? total - (total * actual.length) / days.length : total,
    short: Math.max(0, Math.round(projectedEnd)),
  };
}

/** Next sprint dates: the day the sprint week starts after the last sprint ends, for the configured length. */
export function nextSprintDates(p, lengthDays = 14, startWeekday = 'monday') {
  const sprints = sprintsOf(p);
  const after = sprints.length ? day(sprints.at(-1).end) : new Date();
  after.setDate(after.getDate() + 1);
  const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(startWeekday);
  while (after.getDay() !== (target < 0 ? 1 : target)) after.setDate(after.getDate() + 1);
  const end = new Date(after);
  end.setDate(end.getDate() + lengthDays - 3 + (lengthDays > 7 ? 0 : 0));
  while (end.getDay() % 6 === 0) end.setDate(end.getDate() - 1); // finish on a weekday
  return { start: iso(after), end: iso(end) };
}

export const fmtDate = d => (d ? day(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
export const ROLE_LABEL = { owner: 'Product owner', 'scrum-master': 'Scrum master', architect: 'Architect', dev: 'Developer', qa: 'QA' };
export const ROLES = Object.keys(ROLE_LABEL);
