// scrumo schema <type>: prints a spec for an agent (or person) to read.
import { loadSpec } from '../spec/load.ts';
import type { Content, FieldDef, Schema, SectionDef } from '../spec/types.ts';

export const ALIASES: Record<string, string> = { tracker: 'sprint-tracker', 'sprint-tracker': 'sprint-tracker' };

export function resolveKind(name: string): string {
  return ALIASES[name] ?? name;
}

function field(f: FieldDef, indent: string): string[] {
  const traits = [f.type === 'enum' ? `one of ${f.values!.join(' | ')}` : f.type];
  if (f.type === 'integer' && f.values) traits[0] = `integer, one of ${f.values.join(' | ')}`;
  if (f.ref) traits.push(`ref: ${f.ref}`);
  if (f.pattern) traits.push(`pattern ${f.pattern}`);
  if (f.min !== undefined) traits.push(`min ${f.min}`);
  if (f.max !== undefined) traits.push(`max ${f.max}`);
  if (f.fixed !== undefined) traits.push(`always ${JSON.stringify(f.fixed)}`);
  if (f.nullable) traits.push('may be null');
  const lines = [`${indent}- ${f.name ?? 'item'} (${traits.join('; ')})${f.description ? `: ${f.description}` : ''}`];
  if (f.type === 'list' && f.items) {
    if (f.items.type === 'object') lines.push(...f.items.fields!.flatMap((child) => field(child, `${indent}  `)));
    else lines.push(`${indent}  - each item ${field(f.items, '')[0]!.replace(/^- item /, '')}`);
  }
  if (f.type === 'object') lines.push(...f.fields!.flatMap((child) => field(child, `${indent}  `)));
  return lines;
}

function contentRule(c: Content | undefined): string {
  if (!c) return 'free text';
  switch (c.type) {
    case 'prose': return 'free Markdown';
    case 'pattern': return `one paragraph matching ${c.pattern}`;
    case 'list': return `"-" bullet list${c.min_items ? `, at least ${c.min_items}` : ''}${c.item_pattern ? `, each matching ${c.item_pattern}` : ''}`;
    case 'checklist': return `checklist ("- [ ]" / "- [x]")${c.min_items ? `, at least ${c.min_items}` : ''}${c.item_pattern ? `, text matching ${c.item_pattern}` : ''}`;
    case 'table': {
      const rules = [`table with columns ${c.columns.join(' | ')}`];
      if (c.id_column) rules.push(`unique ${c.id_column}${c.id_pattern ? ` matching ${c.id_pattern}` : ''}`);
      for (const [column, pattern] of Object.entries(c.column_patterns ?? {})) rules.push(`${column} matching ${pattern}`);
      for (const [column, values] of Object.entries(c.column_values ?? {})) rules.push(`${column} one of ${values.join(', ')}`);
      if (c.min_rows) rules.push(`at least ${c.min_rows} row(s)`);
      return rules.join('; ');
    }
    case 'fields': return `"- **Label:** value" list${c.labels ? ` with labels ${c.labels.join(', ')} in that order` : ''}${c.min_items ? `, at least ${c.min_items}` : ''}`;
    case 'entries': return `"###" entries titled ${c.heading_pattern}, each a "- **Label:** value" list with labels ${c.labels.join(', ')}${c.min_entries ? `; at least ${c.min_entries}` : ''}`;
    case 'generated': return `generated block "${c.block}" between <!-- scrumo:generated:${c.block} --> and <!-- scrumo:end -->; never edit by hand`;
  }
}

function section(def: SectionDef, level: number): string[] {
  const mark = '#'.repeat(level);
  const lines = [`${mark} ${def.heading ?? `${def.heading_pattern} (pattern${def.repeat ? ', repeats' : ''})`}${def.optional ? ' (optional)' : ''}`, '', `- Content: ${contentRule(def.content)}`];
  if (def.non_empty_in) lines.push(`- Must have content when status is: ${def.non_empty_in.join(', ')}`);
  if (def.empty_in) lines.push(`- Must be empty when status is: ${def.empty_in.join(', ')}`);
  if (def.no_placeholders_in) lines.push(`- No TODO/TBD/???/<...> when status is: ${def.no_placeholders_in.join(', ')}`);
  if (def.guidance) lines.push(`- Guidance: ${def.guidance.trim()}`);
  lines.push('');
  for (const child of def.subsections ?? []) lines.push(...section(child, level + 1));
  return lines;
}

export function describeSchema(schema: Schema): string {
  const lines = [`# ${schema.title} (${schema.kind})`, '', schema.description.trim(), '', `File: ${schema.path}`, ''];
  if (schema.statuses) {
    lines.push('## Statuses', '');
    for (const status of schema.statuses.values) lines.push(`- ${status} -> ${schema.statuses.transitions[status]?.join(', ') || '(none)'}`);
    lines.push('');
  }
  lines.push('## Frontmatter (keys in this order)', '', ...schema.frontmatter.flatMap((f) => field(f, '')), '');
  if (schema.sections.length) lines.push('## Sections (H2, in this order; the H1 equals the title)', '', ...schema.sections.flatMap((s) => section(s, 3)));
  return `${lines.join('\n').trimEnd()}\n`;
}

export function schemaCommand(args: string[], json: boolean): { code: number; out: string } {
  const spec = loadSpec();
  const [name] = args;
  if (name === 'rules') {
    const out = json
      ? JSON.stringify(spec.rules, null, 2)
      : spec.rules.map((r) => `${r.code}  ${r.severity === 'warning' ? '(warning) ' : ''}${r.summary}${r.fixable ? ' [fixable]' : ''}`).join('\n');
    return { code: 0, out: `${out}\n` };
  }
  if (!name) {
    return { code: 0, out: `Usage: scrumo schema <type>\nTypes: ${[...spec.schemas.keys()].join(', ')}, rules\n` };
  }
  const schema = spec.schemas.get(resolveKind(name));
  if (!schema) return { code: 2, out: `Unknown type "${name}". Types: ${[...spec.schemas.keys()].join(', ')}, rules\n` };
  return { code: 0, out: json ? `${JSON.stringify(schema, null, 2)}\n` : describeSchema(schema) };
}
