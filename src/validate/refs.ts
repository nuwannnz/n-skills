// SCRUMO5xx: references between documents.
import { findBody, listItems, tableRecords, type Doc } from './doc.ts';
import { sprintsOf, stories } from './generate.ts';
import type { Project, Report } from './types.ts';

const ID = /^[A-Z][A-Z0-9]*-[1-9]\d*$/;

export function acIds(story: Doc): string[] {
  const body = findBody(story, 'Acceptance Criteria') ?? [];
  return listItems(body).items.map((item) => /^(AC-\d+):/.exec(item)?.[1]).filter((id): id is string => id !== undefined);
}

export interface Task {
  checked: boolean;
  text: string;
}

export function tasks(story: Doc): Task[] {
  const body = findBody(story, 'Tasks') ?? [];
  return listItems(body).items.map((item) => ({ checked: item.startsWith('[x] '), text: item.replace(/^\[[ x]\] /, '') }));
}

export function prdIds(prd: Doc | undefined, heading: string): Set<string> {
  return new Set(tableRecords(prd ? findBody(prd, heading) : undefined).map((row) => row.ID ?? ''));
}

const cited = (text: string): string[] => text.match(/AC-\d+/g) ?? [];

export function checkRefs(project: Project, report: Report): void {
  const { tickets, prd, tracker } = project;
  const sprintNumbers = new Set(sprintsOf(tracker).map((s) => s.number));
  const frs = prd ? prdIds(prd, 'Functional Requirements') : undefined;
  const nfrs = prd ? prdIds(prd, 'Non-Functional Requirements') : undefined;
  const coveredFrs = new Set<string>();

  for (const doc of project.docs) {
    const fm = doc.fm;
    if (!fm) continue;
    if (doc.kind === 'story') {
      const ref = (value: unknown, kind: 'epic' | 'story', field: string) => {
        if (typeof value !== 'string' || !ID.test(value)) return;
        const target = tickets.get(value);
        if (!target) report('SCRUMO502', doc.file, `${field} ${value} doesn't exist`);
        else if (target.kind !== kind) report('SCRUMO502', doc.file, `${field} ${value} is a ${target.kind}, not a ${kind}`);
      };
      ref(fm.epic, 'epic', 'epic');
      ref(fm.found_in, 'story', 'found_in');
      if (fm.found_in === fm.id) report('SCRUMO502', doc.file, 'found_in cannot be the story itself');
      if (Array.isArray(fm.depends_on)) fm.depends_on.forEach((id) => ref(id, 'story', 'depends_on'));
      if (typeof fm.sprint === 'number' && !sprintNumbers.has(fm.sprint)) report('SCRUMO505', doc.file, `sprint ${fm.sprint} isn't in the sprint tracker`);

      const defined = new Set(acIds(doc));
      const duplicates = listItems(findBody(doc, 'Acceptance Criteria') ?? []).items.map((item) => /^(AC-\d+):/.exec(item)?.[1]).filter((id, i, all) => id && all.indexOf(id) !== i);
      for (const id of new Set(duplicates)) report('SCRUMO507', doc.file, `${id} is defined more than once in Acceptance Criteria`);
      for (const heading of ['Tasks', 'Test Plan', 'QA Record']) {
        const body = findBody(doc, heading);
        for (const id of new Set(cited((body ?? []).join('\n')))) {
          if (!defined.has(id)) report('SCRUMO507', doc.file, `${heading} cites ${id}, which Acceptance Criteria doesn't define`);
        }
      }
    }
    if (doc.kind === 'epic') {
      const requirements = Array.isArray(fm.requirements) ? fm.requirements.filter((r): r is string => typeof r === 'string') : [];
      for (const fr of requirements) {
        coveredFrs.add(fr);
        if (frs && !frs.has(fr)) report('SCRUMO503', doc.file, `${fr} isn't defined in the PRD`);
      }
      const coverage = tableRecords(findBody(doc, 'Requirements Coverage')).map((row) => row.Requirement ?? '');
      if (findBody(doc, 'Requirements Coverage')?.length && [...coverage].sort().join() !== [...requirements].sort().join()) {
        report('SCRUMO509', doc.file, `Requirements Coverage rows (${coverage.join(', ') || 'none'}) differ from frontmatter requirements (${requirements.join(', ') || 'none'})`);
      }
    }
    if (doc.kind === 'architecture') {
      const mapped = tableRecords(findBody(doc, 'NFR Mapping')).map((row) => row.NFR ?? '');
      if (nfrs) {
        for (const id of mapped) if (!nfrs.has(id)) report('SCRUMO508', doc.file, `NFR Mapping cites ${id}, which the PRD doesn't define`);
        if (fm.status === 'approved') {
          for (const id of nfrs) if (!mapped.includes(id)) report('SCRUMO508', doc.file, `${id} is in the PRD but not in NFR Mapping`);
        }
      }
    }
  }
  if (prd && frs) {
    for (const fr of frs) if (!coveredFrs.has(fr)) report('SCRUMO504', prd.file, `${fr} isn't covered by any epic`);
  }

  // dependency cycles
  const deps = new Map(stories(project).map((s) => [s.id, (project.tickets.get(s.id)?.fm?.depends_on as unknown[] | undefined)?.filter((d): d is string => typeof d === 'string') ?? []]));
  const state = new Map<string, 'open' | 'done'>();
  const reported = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      const cycle = [...path.slice(path.indexOf(id)), id];
      const key = [...cycle.slice(0, -1)].sort().join();
      if (!reported.has(key)) {
        reported.add(key);
        report('SCRUMO506', project.tickets.get(id)!.file, `dependency cycle: ${cycle.join(' -> ')}`);
      }
      return;
    }
    state.set(id, 'open');
    for (const dep of deps.get(id) ?? []) if (deps.has(dep)) visit(dep, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of deps.keys()) visit(id, []);

  // sprint numbering
  if (tracker?.fm) {
    const numbers = sprintsOf(tracker).map((s) => s.number);
    if (numbers.some((n, i) => n !== i + 1)) report('SCRUMO510', tracker.file, `sprint numbers must be 1, 2, 3, ... in order, got ${numbers.join(', ') || 'none'}`);
    const sections = [...tracker.headings.filter((h) => h.level === 2)].map((h) => /^Sprint (\d+)$/.exec(h.text)?.[1]).filter((n): n is string => n !== undefined);
    for (const n of sections) if (!numbers.includes(Number(n))) report('SCRUMO510', tracker.file, `section "Sprint ${n}" has no matching sprint in the frontmatter`);
    for (const n of numbers) if (!sections.includes(String(n))) report('SCRUMO510', tracker.file, `sprint ${n} has no "## Sprint ${n}" section`);
  }
}
