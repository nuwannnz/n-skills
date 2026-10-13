// Runs every check (plan section 5) and the deterministic fixes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { loadSpec } from '../spec/load.ts';
import type { SectionDef, Spec } from '../spec/types.ts';
import { parseDoc, type Doc } from './doc.ts';
import { setField } from './edit.ts';
import { checkFields } from './frontmatter.ts';
import { checkGates } from './gates.ts';
import { END_MARKER, generate, renderBlock, sprintsOf, startMarker } from './generate.ts';
import { packageInfo } from '../install/package.ts';
import { checkMarkdown, fixMarkdown } from './markdown.ts';
import { checkLayout, findRoot, loadProject } from './project.ts';
import { checkRefs } from './refs.ts';
import { checkSections, type SectionHooks } from './sections.ts';
import type { Finding, Project, Report } from './types.ts';

export interface ValidateResult {
  root: string | undefined;
  findings: Finding[];
  files: number;
}

function makeReport(findings: Finding[], severities: Map<string, 'error' | 'warning'>): Report {
  return (code, file, message, line) => {
    const severity = severities.get(code);
    if (!severity) throw new Error(`rule ${code} is not in spec/rules.yaml`);
    findings.push({ code, severity, file, line, message });
  };
}

function generatedName(def: SectionDef, vars: Record<string, string>): string | undefined {
  return def.content?.type === 'generated' ? def.content.block.replace('{n}', vars.n ?? '') : undefined;
}

function hooksFor(project: Project, onGenerated: (name: string, def: SectionDef, section: Parameters<NonNullable<SectionHooks['section']>>[1]) => void): SectionHooks {
  const sprints = new Map(sprintsOf(project.tracker).map((s) => [String(s.number), s.status]));
  return {
    statusFor: (vars) => sprints.get(vars.n ?? ''),
    section: (def, section, vars) => {
      const name = generatedName(def, vars);
      if (name !== undefined) onGenerated(name, def, section);
    },
  };
}

function readRecordedVersion(root: string): string | undefined {
  const match = /^cli_version:\s*(\S+)/m.exec(readFileSync(join(root, 'scrumo.yaml'), 'utf8'));
  return match?.[1];
}

export function validate(path: string): ValidateResult {
  const findings: Finding[] = [];
  const root = findRoot(path);
  const report = makeReport(findings, new Map(getSpec().rules.map((r) => [r.code, r.severity])));
  if (!root) {
    report('SCRUMO104', 'scrumo.yaml', `no scrumo.yaml found in or above ${resolve(path)}`);
    return { root, findings, files: 0 };
  }
  const project = loadProject(root, report);
  if (!project) return { root, findings, files: 0 };
  checkLayout(project, report);
  const recorded = readRecordedVersion(root);
  if (recorded !== undefined && recorded !== packageInfo().version) {
    report('SCRUMO106', 'scrumo.yaml', `scrumo.yaml records scrumo ${recorded} but this is scrumo ${packageInfo().version}; run scrumo update to refresh the installed skills`);
  }

  for (const doc of project.docs) {
    const schema = project.spec.schemas.get(doc.kind!)!;
    checkMarkdown(doc, doc.raw, report);
    if (doc.fmError || !doc.fm) {
      report('SCRUMO301', doc.file, doc.fmError ?? 'frontmatter block missing');
      continue;
    }
    checkFields(schema.frontmatter, doc.fm, '', project.config.key, undefined, (code, message, key) => {
      const line = key === undefined ? undefined : doc.fmKeyLines.get(key);
      report(code, doc.file, message, line === undefined ? undefined : line + 1);
    });
    checkSections(doc, schema.sections, report, hooksFor(project, (name, _def, section) => {
      const problem = checkBlock(project, doc, name, section);
      if (problem) report(problem.code, doc.file, problem.message, section.heading.line + 1);
    }));
  }
  checkRefs(project, report);
  checkGates(project, report);

  const rel = relative(root, resolve(path)).split(sep).join('/');
  const scoped = rel === '' ? findings : findings.filter((f) => f.file === rel || f.file.startsWith(`${rel}/`) || f.file === 'scrumo.yaml');
  const order = new Map(project.docs.map((d, i) => [d.file, i]));
  scoped.sort((a, b) => (order.get(a.file) ?? -1) - (order.get(b.file) ?? -1));
  return { root, findings: scoped, files: project.docs.length };
}

let specCache: Spec | undefined;
const getSpec = (): Spec => (specCache ??= loadSpec());

interface Block {
  start: number; // first line index of the section body
  end: number; // exclusive
  found: string[];
}

function blockLines(doc: Doc, section: { heading: { line: number }; introEnd: number }): Block {
  return { start: section.heading.line + 1, end: section.introEnd, found: doc.lines.slice(section.heading.line + 1, section.introEnd).filter((l) => l.trim() !== '') };
}

function checkBlock(project: Project, doc: Doc, name: string, section: { heading: { line: number }; introEnd: number }): { code: string; message: string } | undefined {
  const { found } = blockLines(doc, section);
  const markers = found.filter((line) => line.startsWith('<!-- scrumo:'));
  if (found[0] !== startMarker(name) || found.at(-1) !== END_MARKER || markers.length !== 2) {
    return { code: 'SCRUMO702', message: `generated block "${name}" must be one block between ${startMarker(name)} and ${END_MARKER} and nothing else` };
  }
  const expected = generate(project, doc, name);
  if (expected === undefined) return { code: 'SCRUMO702', message: `unknown generated block "${name}"` };
  if (found.slice(1, -1).join('\n') !== expected.filter((l) => l.trim() !== '').join('\n')) {
    return { code: 'SCRUMO701', message: `generated block "${name}" is stale or was edited by hand; run scrumo validate --fix` };
  }
  return undefined;
}

// ---- fixes ----

function fixKeyOrder(lines: string[], order: string[]): string[] {
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end === -1) return lines;
  const blocks: Array<{ key: string | undefined; lines: string[] }> = [];
  for (const line of lines.slice(1, end)) {
    const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
    if (key !== undefined || blocks.length === 0) blocks.push({ key, lines: [line] });
    else blocks.at(-1)!.lines.push(line);
  }
  const rank = (key: string | undefined) => (key !== undefined && order.includes(key) ? order.indexOf(key) : order.length);
  const sorted = [...blocks].sort((a, b) => rank(a.key) - rank(b.key));
  return ['---', ...sorted.flatMap((b) => b.lines), ...lines.slice(end)];
}

/** Inserts any required H2 section that is missing, empty, in schema order. */
function fixMissingSections(doc: Doc, defs: SectionDef[]): string {
  let text = doc.text;
  for (let round = 0; round < defs.length; round += 1) {
    const current = parseDoc(doc.file, doc.rel, doc.kind, text);
    const present = new Set(current.headings.filter((h) => h.level === 2).map((h) => h.text));
    const index = defs.findIndex((def) => def.heading !== undefined && !def.optional && !present.has(def.heading));
    if (index < 0) break;
    const def = defs[index]!;
    const anchor = defs.slice(index + 1).find((d) => d.heading !== undefined && present.has(d.heading));
    const at = anchor ? current.headings.find((h) => h.level === 2 && h.text === anchor.heading)!.line : current.lines.length;
    const block = [`## ${def.heading}`, '', ...(def.guidance ? [`<!-- ${def.guidance.replace(/\s+/g, ' ').replace(/-->/g, '').trim()} -->`, ''] : [])];
    const lines = [...current.lines];
    if (!anchor) while (lines.at(-1) === '') lines.pop();
    lines.splice(anchor ? at : lines.length, 0, ...(anchor ? [] : ['']), ...block);
    text = lines.join('\n');
  }
  return text;
}

function fixDoc(project: Project, doc: Doc): string {
  let text = fixMarkdown(doc.text);
  let current = parseDoc(doc.file, doc.rel, doc.kind, text);
  const schema = project.spec.schemas.get(doc.kind!)!;
  if (current.fm) {
    text = fixMissingSections(current, schema.sections);
    current = parseDoc(doc.file, doc.rel, doc.kind, text);
  }
  let lines = current.lines;
  const h1s = current.headings.filter((h) => h.level === 1);
  if (h1s.length === 1 && typeof current.fm?.title === 'string' && h1s[0]!.text !== current.fm.title) {
    lines = [...lines];
    lines[h1s[0]!.line] = `# ${current.fm.title}`;
  }
  lines = fixKeyOrder(lines, schema.frontmatter.map((f) => f.name!));
  text = lines.join('\n');
  current = parseDoc(doc.file, doc.rel, doc.kind, text);
  if (doc.kind === 'story' && current.fm?.status !== 'blocked' && current.fmKeyLines.has('blocked_reason') && current.fm?.blocked_reason !== null) {
    text = setField(text, 'blocked_reason', 'null');
  }
  return text;
}

function regenerateDoc(project: Project, doc: Doc): string {
  const edits: Array<{ start: number; end: number; lines: string[] }> = [];
  const schema = project.spec.schemas.get(doc.kind!)!;
  if (!doc.fm) return doc.text;
  checkSections(doc, schema.sections, () => {}, hooksFor(project, (name, _def, section) => {
    const lines = generate(project, doc, name);
    if (lines === undefined) return;
    const { start, end } = blockLines(doc, section);
    edits.push({ start, end, lines: ['', ...renderBlock(name, lines), ''] });
  }));
  const out = [...doc.lines];
  for (const edit of edits.sort((a, b) => b.start - a.start)) out.splice(edit.start, edit.end - edit.start, ...edit.lines);
  return out.join('\n');
}

function stamp(text: string, today: string): string {
  const end = text.split('\n').indexOf('---', 1);
  const lines = text.split('\n');
  const index = lines.slice(0, end === -1 ? 0 : end).findIndex((line) => /^updated:/.test(line));
  if (index >= 0) lines[index] = `updated: ${today}`;
  return lines.join('\n');
}

/** Applies the safe, mechanical fixes. Returns the files that changed. */
export function fix(path: string, today: string = new Date().toISOString().slice(0, 10), only: 'all' | 'generated' = 'all'): string[] {
  const root = findRoot(path);
  if (!root) return [];
  const changed = new Map<string, string>(); // file -> original raw
  const write = (doc: Doc, text: string) => {
    if (text === doc.raw) return;
    const original = changed.get(doc.file) ?? doc.raw;
    changed.set(doc.file, original);
    writeFileSync(join(root, doc.file), text);
  };
  const sink: Report = () => {};
  if (only === 'all') {
    const first = loadProject(root, sink);
    if (!first) return [];
    for (const doc of first.docs) write(doc, fixDoc(first, doc));
  }
  const second = loadProject(root, sink);
  if (!second) return [];
  for (const doc of second.docs) write(doc, regenerateDoc(second, doc));
  for (const file of changed.keys()) {
    const text = readFileSync(join(root, file), 'utf8');
    writeFileSync(join(root, file), stamp(text, today));
  }
  return [...changed.keys()];
}
