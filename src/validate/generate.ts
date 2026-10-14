// SCRUMO7xx: the content of generated blocks, computed from story and epic
// frontmatter and the sprint tracker's frontmatter.
import type { Doc } from './doc.ts';
import type { Project } from './types.ts';

export const END_MARKER = '<!-- scrumo:end -->';
export const startMarker = (block: string): string => `<!-- scrumo:generated:${block} -->`;

interface Ticket {
  id: string;
  title: string;
  epic: string;
  status: string;
  priority: string;
  points: number | null;
  sprint: number | null;
  assignee: string | null;
}

export const idNumber = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const orNull = <T>(value: unknown, type: 'number' | 'string'): T | null => (typeof value === type ? (value as T) : null);

export function ticketOf(doc: Doc): Ticket {
  const fm = doc.fm ?? {};
  return {
    id: text(fm.id),
    title: text(fm.title),
    epic: text(fm.epic),
    status: text(fm.status),
    priority: text(fm.priority),
    points: orNull<number>(fm.points, 'number'),
    sprint: orNull<number>(fm.sprint, 'number'),
    assignee: orNull<string>(fm.assignee, 'string'),
  };
}

export function stories(project: Project): Ticket[] {
  return project.docs.filter((doc) => doc.kind === 'story' && doc.fm).map(ticketOf).sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

const cell = (value: unknown): string => (value === null || value === undefined || value === '' ? '-' : String(value).replaceAll('|', '\\|'));

function table(header: string[], rows: unknown[][], empty: string): string[] {
  if (rows.length === 0) return [empty];
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)];
}

interface Sprint {
  number: number;
  status: string;
  goal: string;
  start: string;
  end: string;
  capacity: number;
  committed: number | null;
  completed: number | null;
}

export function sprintsOf(tracker: Doc | undefined): Sprint[] {
  const list = tracker?.fm?.sprints;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object').map((item) => ({
    number: Number(item.number),
    status: text(item.status),
    goal: text(item.goal),
    start: text(item.start),
    end: text(item.end),
    capacity: Number(item.capacity),
    committed: orNull<number>(item.committed, 'number'),
    completed: orNull<number>(item.completed, 'number'),
  }));
}

/** The lines between the markers for a generated block, or undefined for an unknown block. */
export function generate(project: Project, doc: Doc, block: string): string[] | undefined {
  const all = stories(project);
  if (block === 'epic-stories') {
    const mine = all.filter((story) => story.epic === doc.fm?.id);
    return table(['ID', 'Title', 'Status', 'Points', 'Sprint'], mine.map((s) => [s.id, s.title, s.status, s.points, s.sprint]), '_No stories yet._');
  }
  if (block === 'overview') {
    const sprints = [...sprintsOf(project.tracker)].sort((a, b) => b.number - a.number);
    return table(
      ['Sprint', 'Status', 'Start', 'End', 'Goal', 'Capacity', 'Committed', 'Completed'],
      sprints.map((s) => [s.number, s.status, s.start, s.end, s.goal, s.capacity, s.committed, s.completed]),
      '_No sprints yet._',
    );
  }
  if (block === 'backlog') {
    const epicPriority = new Map(project.docs.filter((d) => d.kind === 'epic').map((d) => [text(d.fm?.id), text(d.fm?.priority)]));
    const rank = (value: string | undefined): string => value ?? 'P9';
    const backlog = all
      .filter((story) => story.sprint === null && story.status !== 'cancelled')
      .sort((a, b) => rank(a.priority).localeCompare(rank(b.priority)) || rank(epicPriority.get(a.epic)).localeCompare(rank(epicPriority.get(b.epic))) || idNumber(a.id) - idNumber(b.id));
    return table(['ID', 'Title', 'Epic', 'Priority', 'Points', 'Status'], backlog.map((s) => [s.id, s.title, s.epic, s.priority, s.points, s.status]), '_The backlog is empty._');
  }
  const sprint = /^sprint-(\d+)$/.exec(block);
  if (sprint) {
    const mine = all.filter((story) => story.sprint === Number(sprint[1]));
    return table(['ID', 'Title', 'Epic', 'Points', 'Status', 'Assignee'], mine.map((s) => [s.id, s.title, s.epic, s.points, s.status, s.assignee]), '_No stories yet._');
  }
  return undefined;
}

/** The whole block as it appears in a file, markers included. */
export function renderBlock(block: string, lines: string[]): string[] {
  return [startMarker(block), '', ...lines, '', END_MARKER];
}
