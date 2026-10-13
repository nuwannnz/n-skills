// NSK2xx structure and NSK4xx sections: checks a document's headings and each
// section's content against the schema. Also walks sections for other checks.
import type { Content, SectionDef } from '../spec/types.ts';
import { content, hasPlaceholder, listItems, parseTable, sectionBody, sectionsAt, type Doc, type Section } from './doc.ts';
import { status as docStatus } from './doc.ts';
import type { Report } from './types.ts';

export interface SectionHooks {
  /** Called once for every matched section, with variables from repeated headings (for example `n`). */
  section?: (def: SectionDef, section: Section, vars: Record<string, string>) => void;
  /** Status that governs a repeated section's subsections, given its variables. */
  statusFor?: (vars: Record<string, string>) => string | undefined;
}

function matches(def: SectionDef, text: string): RegExpExecArray | boolean | null {
  return def.heading !== undefined ? text === def.heading : new RegExp(def.heading_pattern!).exec(text);
}

function name(def: SectionDef): string {
  return def.heading ?? def.heading_pattern!;
}

export function checkSections(doc: Doc, defs: SectionDef[], report: Report, hooks: SectionHooks = {}): void {
  const h1 = doc.headings.find((h) => h.level === 1);
  const from = h1 ? h1.line : doc.bodyStart - 1;
  checkLevel(doc, defs, 2, from, doc.lines.length, docStatus(doc), {}, report, hooks);
  for (const heading of doc.headings.filter((h) => h.level >= 4)) {
    report('NSK205', doc.file, `heading level ${heading.level} is not allowed ("${heading.text}"); use H2 sections and H3 subsections only`, heading.line + 1);
  }
}

function checkLevel(doc: Doc, defs: SectionDef[], level: number, from: number, to: number, status: string | undefined, vars: Record<string, string>, report: Report, hooks: SectionHooks): void {
  const mark = '#'.repeat(level);
  const found = sectionsAt(doc, level, from, to);
  const seenDef = new Set<number>();
  const seenText = new Set<string>();
  let furthest = -1;
  for (const section of found) {
    const text = section.heading.text;
    const line = section.heading.line + 1;
    const index = defs.findIndex((def) => matches(def, text));
    if (index < 0) {
      report('NSK403', doc.file, `unknown section "${mark} ${text}"`, line);
      continue;
    }
    const def = defs[index]!;
    if (seenText.has(text) || (seenDef.has(index) && !def.repeat)) {
      report('NSK404', doc.file, `section "${mark} ${text}" appears more than once`, line);
      continue;
    }
    seenText.add(text);
    seenDef.add(index);
    if (index < furthest) report('NSK402', doc.file, `section "${mark} ${text}" is out of order; it belongs before "${mark} ${name(defs[furthest]!)}"`, line);
    furthest = Math.max(furthest, index);

    const captured = def.heading_pattern ? new RegExp(def.heading_pattern).exec(text) : null;
    const own = captured?.[1] !== undefined ? { ...vars, n: captured[1] } : vars;
    hooks.section?.(def, section, own);
    const sectionStatus = captured?.[1] !== undefined && hooks.statusFor ? hooks.statusFor(own) : status;
    checkContent(doc, def, section, sectionStatus, report);
    if (def.subsections) {
      checkLevel(doc, def.subsections, level + 1, section.heading.line, section.end, sectionStatus, own, report, hooks);
    } else if (def.content?.type !== 'entries') {
      for (const child of doc.headings.filter((h) => h.level === level + 1 && h.line > section.heading.line && h.line < section.end)) {
        report('NSK205', doc.file, `"${'#'.repeat(level + 1)} ${child.text}" is not allowed inside "${mark} ${text}", which has no subsections`, child.line + 1);
      }
    }
  }
  defs.forEach((def, index) => {
    if (def.optional || def.repeat || seenDef.has(index)) return;
    const before = defs[index - 1];
    report('NSK401', doc.file, `missing required section "${mark} ${name(def)}"${before ? ` (after "${mark} ${name(before)}")` : ''}`);
  });
}

function inStatus(list: string[] | undefined, status: string | undefined): boolean {
  return status !== undefined && list?.includes(status) === true;
}

function checkContent(doc: Doc, def: SectionDef, section: Section, status: string | undefined, report: Report): void {
  const spec = def.content;
  if (!spec || spec.type === 'generated') return;
  const where = `section "${def.heading ?? section.heading.text}"`;
  const line = section.heading.line + 1;
  const fail = (code: string, message: string) => report(code, doc.file, `${where} ${message}`, line);
  const whole = spec.type === 'entries' ? doc.lines.slice(section.heading.line + 1, section.end) : sectionBody(doc, section);
  const body = content(spec.type === 'entries' ? whole : sectionBody(doc, section));
  if (body.length === 0) {
    if (inStatus(def.non_empty_in, status)) fail('NSK409', `is empty but must have content when status is ${status}`);
    return;
  }
  if (inStatus(def.empty_in, status)) {
    fail('NSK410', `must be empty when status is ${status}`);
    return;
  }
  if (inStatus(def.no_placeholders_in, status) && hasPlaceholder(whole)) {
    fail('NSK411', `contains placeholder text (TODO, TBD, ???, or <...>) but status is ${status}`);
  }
  checkType(doc, spec, body, section, fail);
}

type Fail = (code: string, message: string) => void;

function checkType(doc: Doc, spec: Content, body: string[], section: Section, fail: Fail): void {
  switch (spec.type) {
    case 'prose':
      return;
    case 'pattern': {
      const text = body.map((line) => line.trim()).join(' ');
      if (!new RegExp(spec.pattern).test(text)) fail('NSK408', `must match ${spec.pattern}`);
      return;
    }
    case 'list':
    case 'checklist': {
      const { items, bad } = listItems(body);
      if (bad.length) return fail('NSK405', `must be a "-" bullet list, but has other content: ${JSON.stringify(bad[0])}`);
      let texts = items;
      if (spec.type === 'checklist') {
        const unchecked = items.find((item) => !/^\[[ x]\] /.test(item));
        if (unchecked !== undefined) return fail('NSK405', `must be a checklist of "- [ ]" or "- [x]" items, but has ${JSON.stringify(unchecked)}`);
        texts = items.map((item) => item.slice(4));
      }
      if (spec.item_pattern) {
        const pattern = new RegExp(spec.item_pattern);
        const wrong = texts.find((text) => !pattern.test(text));
        if (wrong !== undefined) fail('NSK408', `item ${JSON.stringify(wrong)} must match ${spec.item_pattern}`);
      }
      if (spec.min_items !== undefined && items.length < spec.min_items) fail('NSK409', `needs at least ${spec.min_items} item(s), has ${items.length}`);
      return;
    }
    case 'table': {
      const table = parseTable(body);
      if (table.bad.length || table.header.length === 0) return fail('NSK405', 'must contain only a table');
      if (table.malformed) return fail('NSK406', `table is malformed: ${table.malformed}`);
      if (table.header.join('|') !== spec.columns.join('|')) return fail('NSK406', `table columns must be ${spec.columns.join(' | ')}, got ${table.header.join(' | ')}`);
      const ids = new Set<string>();
      for (const row of table.rows) {
        const cell = (column: string) => row[spec.columns.indexOf(column)] ?? '';
        if (spec.id_column !== undefined) {
          const id = cell(spec.id_column);
          if (ids.has(id)) fail('NSK407', `has a duplicate ${spec.id_column} ${JSON.stringify(id)}`);
          ids.add(id);
          if (spec.id_pattern && !new RegExp(spec.id_pattern).test(id)) fail('NSK407', `${spec.id_column} ${JSON.stringify(id)} must match ${spec.id_pattern}`);
        }
        for (const [column, pattern] of Object.entries(spec.column_patterns ?? {})) {
          if (!new RegExp(pattern).test(cell(column))) fail('NSK406', `column ${column} value ${JSON.stringify(cell(column))} must match ${pattern}`);
        }
        for (const [column, values] of Object.entries(spec.column_values ?? {})) {
          if (!values.includes(cell(column))) fail('NSK406', `column ${column} value ${JSON.stringify(cell(column))} must be one of ${values.join(', ')}`);
        }
      }
      if (spec.min_rows !== undefined && table.rows.length < spec.min_rows) fail('NSK409', `needs at least ${spec.min_rows} row(s), has ${table.rows.length}`);
      return;
    }
    case 'fields':
      checkFields(body, spec.labels, spec.min_items, fail);
      return;
    case 'entries': {
      const intro = content(sectionBody(doc, section));
      if (intro.length) fail('NSK405', 'must contain only "###" entries');
      const entries = sectionsAt(doc, 3, section.heading.line, section.end);
      const ids = new Set<string>();
      for (const entry of entries) {
        const text = entry.heading.text;
        if (!new RegExp(spec.heading_pattern).test(text)) {
          fail('NSK407', `entry heading ${JSON.stringify(text)} must match ${spec.heading_pattern}`);
          continue;
        }
        const id = text.split(':')[0]!;
        if (ids.has(id)) fail('NSK407', `has a duplicate entry ${id}`);
        ids.add(id);
        checkFields(content(sectionBody(doc, entry)), spec.labels, undefined, (code, message) => fail(code, `entry ${id} ${message}`));
      }
      if (spec.min_entries !== undefined && entries.length < spec.min_entries) fail('NSK409', `needs at least ${spec.min_entries} entry, has ${entries.length}`);
    }
  }
}

function checkFields(body: string[], labels: string[] | undefined, minItems: number | undefined, fail: Fail): void {
  const { items, bad } = listItems(body);
  if (bad.length) return fail('NSK405', `must be a "- **Label:** value" list, but has other content: ${JSON.stringify(bad[0])}`);
  const found = items.map((item) => /^\*\*(.+?):\*\*/.exec(item)?.[1]);
  const wrong = items.find((_, i) => found[i] === undefined);
  if (wrong !== undefined) return fail('NSK408', `item ${JSON.stringify(wrong)} must start with **Label:**`);
  if (labels && found.join('|') !== labels.join('|')) fail('NSK408', `must have the labels ${labels.join(', ')} in that order, got ${found.join(', ') || 'none'}`);
  if (minItems !== undefined && items.length < minItems) fail('NSK409', `needs at least ${minItems} item(s), has ${items.length}`);
}
