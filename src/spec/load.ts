import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { brand } from '../brand.ts';
import type { Agent, Content, FieldDef, Rule, Schema, SectionDef, Spec } from './types.ts';

export const SPEC_DIR = fileURLToPath(new URL('../../spec/', import.meta.url));

const FIELD_TYPES = new Set(['string', 'integer', 'date', 'semver', 'enum', 'ticket-id', 'ticket-ref', 'list', 'object']);
const CONTENT_TYPES = new Set(['prose', 'pattern', 'list', 'checklist', 'table', 'fields', 'entries', 'generated']);

export class SpecError extends Error {}

function fail(where: string, message: string): never {
  throw new SpecError(`${where}: ${message}`);
}

function checkRegex(where: string, source: string | undefined): void {
  if (source === undefined) return;
  try {
    new RegExp(source.replaceAll('{key}', 'KEY'));
  } catch (error) {
    fail(where, `invalid regular expression ${JSON.stringify(source)}: ${(error as Error).message}`);
  }
}

function checkField(where: string, field: FieldDef, named: boolean): void {
  if (named && typeof field.name !== 'string') fail(where, 'field is missing a name');
  const at = named ? `${where}.${field.name}` : where;
  if (!FIELD_TYPES.has(field.type)) fail(at, `unknown field type ${JSON.stringify(field.type)}`);
  if (field.type === 'enum' && !field.values?.length) fail(at, 'enum field needs values');
  if (field.type === 'ticket-ref' && field.ref !== 'epic' && field.ref !== 'story') fail(at, 'ticket-ref needs ref: epic or story');
  if (field.type === 'list') {
    if (!field.items) fail(at, 'list field needs items');
    checkField(`${at}[]`, field.items, false);
  }
  if (field.type === 'object') {
    if (!field.fields?.length) fail(at, 'object field needs fields');
    checkFields(at, field.fields);
  }
  checkRegex(at, field.pattern);
}

function checkFields(where: string, fields: FieldDef[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    checkField(where, field, true);
    if (seen.has(field.name!)) fail(where, `duplicate field ${field.name}`);
    seen.add(field.name!);
  }
}

function checkContent(where: string, content: Content): void {
  if (!CONTENT_TYPES.has(content.type)) fail(where, `unknown content type ${JSON.stringify(content.type)}`);
  switch (content.type) {
    case 'pattern':
      checkRegex(where, content.pattern);
      break;
    case 'list':
    case 'checklist':
      checkRegex(where, content.item_pattern);
      break;
    case 'table': {
      if (!content.columns?.length) fail(where, 'table needs columns');
      const named = [content.id_column, ...Object.keys(content.column_patterns ?? {}), ...Object.keys(content.column_values ?? {})];
      for (const column of named) {
        if (column !== undefined && !content.columns.includes(column)) fail(where, `unknown column ${column}`);
      }
      if (content.id_pattern !== undefined && content.id_column === undefined) fail(where, 'id_pattern needs id_column');
      checkRegex(where, content.id_pattern);
      for (const pattern of Object.values(content.column_patterns ?? {})) checkRegex(where, pattern);
      break;
    }
    case 'entries':
      checkRegex(where, content.heading_pattern);
      if (!content.labels?.length) fail(where, 'entries need labels');
      break;
    case 'generated':
      if (!content.block) fail(where, 'generated content needs a block name');
      break;
  }
}

function checkSections(where: string, sections: SectionDef[], statuses: string[] | undefined): void {
  const seen = new Set<string>();
  for (const section of sections) {
    const name = section.heading ?? section.heading_pattern;
    if (name === undefined) fail(where, 'section needs heading or heading_pattern');
    if (section.heading !== undefined && section.heading_pattern !== undefined) fail(where, `${name}: use heading or heading_pattern, not both`);
    if (section.repeat && section.heading_pattern === undefined) fail(where, `${name}: repeat needs heading_pattern`);
    if (seen.has(name)) fail(where, `duplicate section ${name}`);
    seen.add(name);
    const at = `${where} > ${name}`;
    checkRegex(at, section.heading_pattern);
    if (section.content) checkContent(at, section.content);
    if (section.subsections) checkSections(at, section.subsections, undefined);
    if (statuses) {
      for (const status of [...(section.non_empty_in ?? []), ...(section.empty_in ?? []), ...(section.no_placeholders_in ?? [])]) {
        if (!statuses.includes(status)) fail(at, `unknown status ${status}`);
      }
    }
  }
}

export function checkSchema(file: string, schema: Schema): void {
  for (const key of ['kind', 'title', 'description', 'path'] as const) {
    if (typeof schema[key] !== 'string') fail(file, `missing ${key}`);
  }
  if (!Array.isArray(schema.frontmatter)) fail(file, 'frontmatter must be a list');
  if (!Array.isArray(schema.sections)) fail(file, 'sections must be a list');
  checkFields(`${file} frontmatter`, schema.frontmatter);
  const statuses = schema.statuses?.values;
  if (schema.statuses) {
    for (const [from, targets] of Object.entries(schema.statuses.transitions)) {
      for (const status of [from, ...targets]) {
        if (!statuses!.includes(status)) fail(file, `transition uses unknown status ${status}`);
      }
    }
    const statusField = schema.frontmatter.find((field) => field.name === 'status');
    if (JSON.stringify(statusField?.values) !== JSON.stringify(statuses)) fail(file, 'status field values must equal statuses.values');
  }
  checkSections(`${file} sections`, schema.sections, statuses);
}

export function loadSpec(dir: string = SPEC_DIR): Spec {
  const schemas = new Map<string, Schema>();
  const schemaDir = join(dir, 'schemas');
  for (const file of readdirSync(schemaDir).filter((name) => name.endsWith('.yaml')).sort()) {
    const schema = parse(readFileSync(join(schemaDir, file), 'utf8')) as Schema;
    checkSchema(file, schema);
    if (`${schema.kind}.yaml` !== file) fail(file, `kind ${schema.kind} must match the file name`);
    schemas.set(schema.kind, schema);
  }

  const { rules } = parse(readFileSync(join(dir, 'rules.yaml'), 'utf8')) as { rules: Rule[] };
  const codes = new Set<string>();
  for (const rule of rules) {
    if (!new RegExp(`^${brand.name.toUpperCase()}[1-7]\\d{2}$`).test(rule.code)) fail('rules.yaml', `bad code ${rule.code}`);
    if (codes.has(rule.code)) fail('rules.yaml', `duplicate code ${rule.code}`);
    if (rule.severity !== 'error' && rule.severity !== 'warning') fail('rules.yaml', `${rule.code}: bad severity`);
    if (![true, false, 'partial'].includes(rule.fixable)) fail('rules.yaml', `${rule.code}: bad fixable`);
    codes.add(rule.code);
  }
  return { schemas, rules };
}

export function loadAgents(dir: string = SPEC_DIR): Agent[] {
  const { agents } = parse(readFileSync(join(dir, 'agents.yaml'), 'utf8')) as { agents: Agent[] };
  const ids = new Set<string>();
  for (const agent of agents) {
    const where = `agents.yaml: ${agent.id}`;
    if (!/^[a-z]+$/.test(agent.id) || ids.has(agent.id)) fail(where, 'bad or duplicate id');
    ids.add(agent.id);
    for (const path of [agent.skills_dir, ...agent.also_reads]) {
      if (!/^\.[a-z]+\/skills$/.test(path)) fail(where, `${path} must look like .<folder>/skills`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(agent.verified)) || !/^https:\/\//.test(agent.source)) fail(where, 'needs verified date and source URL');
  }
  return agents;
}
