// scrumo impact <FR-001|NFR-001|AD-001|ticket ID>: what a change would touch.
import { findBody, tableRecords, type Doc } from '../validate/doc.ts';
import { idNumber, ticketOf } from '../validate/generate.ts';
import { findRoot, loadProject } from '../validate/project.ts';

interface Ref {
  id: string;
  title: string;
  type?: string;
  status: string;
  sprint: number | null;
  assignee: string | null;
}

export interface Impact {
  target: string;
  kind: string;
  summary: string;
  epics: Ref[];
  stories: Ref[];
  mentions: string[];
  notes: string[];
}

const ref = (doc: Doc): Ref => {
  const t = ticketOf(doc);
  return { id: t.id, title: t.title, type: String(doc.fm?.type ?? ''), status: t.status, sprint: t.sprint, assignee: t.assignee };
};
const byId = (a: Ref, b: Ref) => idNumber(a.id) - idNumber(b.id);

export function impact(root: string, target: string): Impact | undefined {
  const project = loadProject(root, () => {});
  if (!project) return undefined;
  const epics = project.docs.filter((d) => d.kind === 'epic');
  const stories = project.docs.filter((d) => d.kind === 'story');
  const result: Impact = { target, kind: '', summary: '', epics: [], stories: [], mentions: [], notes: [] };
  const mentionIn = (docs: Doc[]) => docs.filter((d) => new RegExp(`\\b${target}\\b`).test(d.lines.slice(d.bodyStart).join('\n'))).map((d) => d.file);
  const storiesOf = (epicIds: string[]) => stories.filter((s) => epicIds.includes(String(s.fm?.epic))).map(ref).sort(byId);

  if (/^FR-\d{3}$/.test(target)) {
    const row = tableRecords(project.prd ? findBody(project.prd, 'Functional Requirements') : undefined).find((r) => r.ID === target);
    if (!row) return undefined;
    result.kind = 'functional requirement';
    result.summary = row.Requirement ?? '';
    const owners = epics.filter((e) => Array.isArray(e.fm?.requirements) && (e.fm!.requirements as string[]).includes(target));
    result.epics = owners.map(ref).sort(byId);
    result.stories = storiesOf(owners.map((e) => String(e.fm?.id)));
    result.mentions = mentionIn(project.docs.filter((d) => d !== project.prd));
    if (owners.length === 0) result.notes.push('No epic covers this requirement yet.');
  } else if (/^NFR-\d{3}$/.test(target)) {
    const row = tableRecords(project.prd ? findBody(project.prd, 'Non-Functional Requirements') : undefined).find((r) => r.ID === target);
    if (!row) return undefined;
    result.kind = 'non-functional requirement';
    result.summary = `${row.Requirement ?? ''} (target: ${row.Target ?? ''})`;
    const mapped = tableRecords(project.architecture ? findBody(project.architecture, 'NFR Mapping') : undefined).find((r) => r.NFR === target);
    result.notes.push(mapped ? `Architecture approach: ${mapped.Approach}. Verified by: ${mapped.Verification}` : 'The architecture does not map this requirement yet.');
    result.mentions = mentionIn(project.docs.filter((d) => d !== project.prd));
    result.stories = stories.filter((s) => result.mentions.includes(s.file)).map(ref).sort(byId);
  } else if (/^AD-\d{3}$/.test(target)) {
    const heading = project.architecture?.headings.find((h) => h.level === 3 && h.text.startsWith(`${target}:`));
    if (!heading) return undefined;
    result.kind = 'architecture decision';
    result.summary = heading.text;
    result.mentions = mentionIn(project.docs.filter((d) => d !== project.architecture));
    result.stories = stories.filter((s) => result.mentions.includes(s.file)).map(ref).sort(byId);
    result.notes.push('Stories listed cite this decision. Components and NFR Mapping rows in the architecture may rely on it too.');
  } else {
    const doc = project.tickets.get(target);
    if (!doc) return undefined;
    result.kind = String(doc.kind === 'story' && doc.fm?.type === 'bug' ? 'bug' : doc.kind);
    result.summary = String(doc.fm?.title);
    if (doc.kind === 'epic') {
      result.stories = storiesOf([target]);
      result.notes.push(`Requirements: ${(doc.fm?.requirements as string[] | undefined)?.join(', ') || 'none'}`);
    } else {
      const epic = project.tickets.get(String(doc.fm?.epic));
      if (epic) result.epics = [ref(epic)];
      const dependents = stories.filter((s) => Array.isArray(s.fm?.depends_on) && (s.fm!.depends_on as string[]).includes(target));
      const bugs = stories.filter((s) => s.fm?.found_in === target);
      const deps = Array.isArray(doc.fm?.depends_on) ? (doc.fm!.depends_on as string[]) : [];
      result.stories = [...new Map([...dependents, ...bugs, ...deps.map((d) => project.tickets.get(d)).filter((d): d is Doc => !!d)].map((d) => [String(d.fm?.id), d])).values()].map(ref).sort(byId);
      if (deps.length) result.notes.push(`Depends on: ${deps.join(', ')}`);
      if (dependents.length) result.notes.push(`Depended on by: ${dependents.map((d) => d.fm?.id).join(', ')}`);
      if (bugs.length) result.notes.push(`Bugs found in it: ${bugs.map((d) => d.fm?.id).join(', ')}`);
      if (doc.fm?.found_in) result.notes.push(`Found in: ${String(doc.fm.found_in)}`);
    }
    result.mentions = mentionIn(project.docs.filter((d) => d !== doc));
  }
  return result;
}

const line = (r: Ref) => `  ${r.id}  ${r.status}${r.type === 'bug' ? ' bug' : ''}${r.sprint !== null ? `, sprint ${r.sprint}` : ''}${r.assignee ? `, ${r.assignee}` : ''}: ${r.title}`;

export function impactCommand(target: string | undefined, cwd: string, json: boolean): { code: number; out: string } {
  if (!target) return { code: 2, out: 'Usage: scrumo impact <FR-001|NFR-001|AD-001|ticket ID> [--json]\n' };
  const root = findRoot(cwd);
  const result = root ? impact(root, target) : undefined;
  if (!result) return { code: 1, out: `Nothing named ${target} was found in the project documents.\n` };
  if (json) return { code: 0, out: `${JSON.stringify(result, null, 2)}\n` };
  const lines = [`${result.target}: ${result.kind}`, `  ${result.summary}`];
  if (result.epics.length) lines.push('', 'Epics:', ...result.epics.map(line));
  if (result.stories.length) lines.push('', 'Stories:', ...result.stories.map(line));
  if (result.notes.length) lines.push('', ...result.notes);
  if (result.mentions.length) lines.push('', 'Also mentioned in:', ...result.mentions.map((m) => `  ${m}`));
  return { code: 0, out: `${lines.join('\n')}\n` };
}
