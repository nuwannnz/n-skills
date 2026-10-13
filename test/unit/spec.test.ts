// Phase 0 contract test: the schemas are well formed, and the hand-written
// sample project follows them. This is a structural check only; references,
// placeholders, and status gates are the validator's job (plan phase 1).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { loadSpec } from '../../src/spec/load.ts';
import type { FieldDef, Schema, SectionDef } from '../../src/spec/types.ts';

const spec = loadSpec();
const SAMPLE = new URL('../../examples/sample-project/', import.meta.url).pathname;
const config = parse(readFileSync(join(SAMPLE, 'scrumo.yaml'), 'utf8')) as { project: { key: string }; docs_dir: string };
const KEY = config.project.key;
const DOCS = join(SAMPLE, config.docs_dir);

function schema(kind: string): Schema {
  const found = spec.schemas.get(kind);
  assert.ok(found, `no schema for ${kind}`);
  return found;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function pathRegex(path: string): RegExp {
  const escaped = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace('{key}', KEY).replace('{n}', '(\\d+)').replace('{slug}', '[a-z0-9]+(?:-[a-z0-9]+)*')}$`);
}

function schemaFor(file: string): Schema {
  const rel = relative(DOCS, file);
  const matches = [...spec.schemas.values()].filter((s) => pathRegex(s.path).test(rel));
  assert.equal(matches.length, 1, `${rel} should match exactly one schema path`);
  return matches[0]!;
}

function checkValue(where: string, field: FieldDef, value: unknown): void {
  if (value === null) {
    assert.ok(field.nullable, `${where} must not be null`);
    return;
  }
  if (field.fixed !== undefined) assert.equal(value, field.fixed, `${where} is fixed`);
  switch (field.type) {
    case 'string':
      assert.equal(typeof value, 'string', `${where} must be a string`);
      if (field.pattern) assert.match(value as string, new RegExp(field.pattern.replaceAll('{key}', KEY)), where);
      break;
    case 'integer':
      assert.ok(Number.isInteger(value), `${where} must be an integer`);
      if (field.min !== undefined) assert.ok((value as number) >= field.min, `${where} below min`);
      if (field.max !== undefined) assert.ok((value as number) <= field.max, `${where} above max`);
      if (field.values) assert.ok(field.values.includes(value as number), `${where} not an allowed value`);
      break;
    case 'date':
      // yaml parses unquoted dates as strings in the core schema
      assert.match(String(value), /^\d{4}-\d{2}-\d{2}$/, `${where} must be YYYY-MM-DD`);
      break;
    case 'semver':
      assert.match(String(value), /^\d+\.\d+\.\d+$/, `${where} must be semver`);
      break;
    case 'enum':
      assert.ok(field.values!.includes(value as string), `${where}: ${String(value)} not in ${field.values!.join(', ')}`);
      break;
    case 'ticket-id':
    case 'ticket-ref':
      assert.match(String(value), new RegExp(`^${KEY}-[1-9]\\d*$`), `${where} must be a ${KEY} ticket ID`);
      break;
    case 'list':
      assert.ok(Array.isArray(value), `${where} must be a list`);
      (value as unknown[]).forEach((item, i) => checkValue(`${where}[${i}]`, field.items!, item));
      break;
    case 'object':
      checkObject(where, field.fields!, value);
      break;
  }
}

function checkObject(where: string, fields: FieldDef[], value: unknown): void {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${where} must be a mapping`);
  assert.deepEqual(Object.keys(value), fields.map((f) => f.name), `${where} keys must be exactly the schema fields, in order`);
  for (const field of fields) checkValue(`${where}.${field.name}`, field, (value as Record<string, unknown>)[field.name!]);
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

function parseDoc(text: string): { frontmatter: Record<string, unknown>; lines: string[]; headings: Heading[] } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, 'frontmatter block');
  const lines = text.slice(match[0].length).split('\n');
  const headings: Heading[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fenced = !fenced;
    const heading = !fenced && /^(#{1,6}) (.+)$/.exec(line);
    if (heading) headings.push({ level: heading[1]!.length, text: heading[2]!, line: i });
  });
  return { frontmatter: parse(match[1]!) as Record<string, unknown>, lines, headings };
}

function body(lines: string[], from: number, to: number): string[] {
  return lines
    .slice(from + 1, to)
    .join('\n')
    .replace(/<!--(?!\s*scrumo:)[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

function topLevelItems(lines: string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    if (line.startsWith('- ')) items.push(line.slice(2));
    else if (/^\s{2,}\S/.test(line) && items.length && !/^\s+- /.test(line)) items[items.length - 1] += ` ${line.trim()}`;
    else if (!/^\s+- /.test(line)) assert.fail(`expected a list item, got ${JSON.stringify(line)}`);
  }
  return items;
}

function checkContent(where: string, section: SectionDef, content: string[]): void {
  const spec = section.content;
  if (!spec || content.length === 0) return;
  switch (spec.type) {
    case 'pattern':
      assert.match(content.join(' '), new RegExp(spec.pattern), where);
      break;
    case 'list':
    case 'checklist':
      for (const item of topLevelItems(content)) {
        let text = item;
        if (spec.type === 'checklist') {
          assert.match(item, /^\[[ x]\] /, `${where}: checklist item`);
          text = item.slice(4);
        }
        if (spec.item_pattern) assert.match(text, new RegExp(spec.item_pattern), where);
      }
      break;
    case 'table': {
      const header = content[0]!.split('|').slice(1, -1).map((cell) => cell.trim());
      assert.deepEqual(header, spec.columns, `${where}: table columns`);
      const rows = content.slice(2).map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
      const ids = new Set<string>();
      for (const row of rows) {
        const cell = (column: string) => row[spec.columns.indexOf(column)]!;
        if (spec.id_column) {
          assert.ok(!ids.has(cell(spec.id_column)), `${where}: duplicate ${cell(spec.id_column)}`);
          ids.add(cell(spec.id_column));
          if (spec.id_pattern) assert.match(cell(spec.id_column), new RegExp(spec.id_pattern), where);
        }
        for (const [column, pattern] of Object.entries(spec.column_patterns ?? {})) assert.match(cell(column), new RegExp(pattern), where);
        for (const [column, values] of Object.entries(spec.column_values ?? {})) assert.ok(values.includes(cell(column)), `${where}: ${column} ${cell(column)}`);
      }
      break;
    }
    case 'fields': {
      const labels = topLevelItems(content).map((item) => /^\*\*(.+?):\*\*/.exec(item)?.[1]);
      assert.ok(labels.every(Boolean), `${where}: every item needs a **Label:**`);
      if (spec.labels) assert.deepEqual(labels, spec.labels, `${where}: labels`);
      break;
    }
    case 'generated':
      assert.equal(content[0], `<!-- scrumo:generated:${spec.block} -->`, `${where}: generated start marker`);
      assert.equal(content.at(-1), '<!-- scrumo:end -->', `${where}: generated end marker`);
      break;
  }
}

function checkSections(where: string, defs: SectionDef[], doc: ReturnType<typeof parseDoc>, level: number, from: number, to: number, vars: Record<string, string> = {}): void {
  const headings = doc.headings.filter((h) => h.level === level && h.line > from && h.line < to);
  let next = 0;
  for (const heading of headings) {
    while (next < defs.length) {
      const def = defs[next]!;
      const match = def.heading !== undefined ? heading.text === def.heading : new RegExp(def.heading_pattern!).test(heading.text);
      if (match) break;
      assert.ok(def.optional || (def.repeat && next > 0), `${where}: missing section ${def.heading ?? def.heading_pattern} before ${heading.text}`);
      next += 1;
    }
    const def = defs[next];
    assert.ok(def, `${where}: unknown or out-of-order section ${heading.text}`);
    const end = doc.headings.find((h) => h.line > heading.line && h.level <= level)?.line ?? to;
    const number = def.heading_pattern ? new RegExp(def.heading_pattern).exec(heading.text)?.[1] : undefined;
    const sectionVars = number ? { ...vars, n: number } : vars;
    const at = `${where} > ${heading.text}`;
    if (def.subsections) {
      checkSections(at, def.subsections, doc, level + 1, heading.line, end, sectionVars);
    } else if (def.content?.type === 'entries') {
      const entries = doc.headings.filter((h) => h.level === level + 1 && h.line > heading.line && h.line < end);
      assert.ok(entries.length >= (def.content.min_entries ?? 0), `${at}: entries`);
      entries.forEach((entry, i) => {
        assert.match(entry.text, new RegExp(def.content!.type === 'entries' ? def.content!.heading_pattern : ''), at);
        const entryEnd = entries[i + 1]?.line ?? end;
        checkContent(`${at} > ${entry.text}`, { content: { type: 'fields', labels: (def.content as { labels: string[] }).labels } }, body(doc.lines, entry.line, entryEnd));
      });
    } else {
      assert.equal(doc.headings.filter((h) => h.line > heading.line && h.line < end).length, 0, `${at}: unexpected subheading`);
      const content = def.content?.type === 'generated' ? { ...def.content, block: def.content.block.replace('{n}', sectionVars.n ?? '') } : def.content;
      checkContent(at, { ...def, ...(content ? { content } : {}) }, body(doc.lines, heading.line, end));
    }
    if (!def.repeat) next += 1;
  }
  for (const def of defs.slice(next)) {
    assert.ok(def.optional || def.repeat, `${where}: missing section ${def.heading ?? def.heading_pattern}`);
  }
}

describe('spec', () => {
  it('has a schema for every managed kind', () => {
    assert.deepEqual([...spec.schemas.keys()].sort(), ['architecture', 'brief', 'config', 'epic', 'prd', 'sprint-tracker', 'standards', 'story']);
  });

  it('scrumo.yaml follows the config schema', () => {
    checkObject('scrumo.yaml', schema('config').frontmatter, config);
  });

  for (const file of walk(DOCS).sort()) {
    const rel = relative(SAMPLE, file);
    it(`${rel} follows its schema`, () => {
      const s = schemaFor(file);
      const doc = parseDoc(readFileSync(file, 'utf8'));
      checkObject(`${rel} frontmatter`, s.frontmatter, doc.frontmatter);
      const id = doc.frontmatter.id;
      if (typeof id === 'string') assert.ok(relative(DOCS, file).split('/').at(-1)!.startsWith(`${id}-`), `${rel}: file name must start with ${id}-`);
      const h1s = doc.headings.filter((h) => h.level === 1);
      assert.equal(h1s.length, 1, `${rel}: exactly one H1`);
      assert.equal(h1s[0]!.text, doc.frontmatter.title, `${rel}: H1 equals title`);
      assert.ok(doc.headings.every((h) => h.level <= 3), `${rel}: no H4 or deeper`);
      checkSections(rel, s.sections, doc, 2, h1s[0]!.line, doc.lines.length);
    });
  }
});
