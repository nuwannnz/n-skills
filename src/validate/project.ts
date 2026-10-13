// Finds a project, reads its files, and checks the layout (SCRUMO1xx).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { loadSpec } from '../spec/load.ts';
import type { Schema } from '../spec/types.ts';
import { parseDoc, type Doc } from './doc.ts';
import { checkFields } from './frontmatter.ts';
import type { Config, Finding, Project, Report } from './types.ts';

export function findRoot(from: string): string | undefined {
  let dir = resolve(from);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    if (existsSync(join(dir, 'scrumo.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === '*' && glob[i + 1] === '*') {
      source += '.*';
      i += 1;
      if (glob[i + 1] === '/') i += 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function pathRegex(path: string, key: string): RegExp {
  const escaped = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace('{key}', key).replace('{n}', '(\\d+)').replace('{slug}', '[a-z0-9]+(?:-[a-z0-9]+)*')}$`);
}

/** Epics and stories are recognised by folder, so a badly named file is still checked. */
function kindOf(rel: string, schemas: Schema[], key: string): string | undefined {
  if (/^epics\/[^/]+\.md$/.test(rel)) return 'epic';
  if (/^stories\/[^/]+\.md$/.test(rel)) return 'story';
  return schemas.find((schema) => !schema.path.startsWith('..') && !schema.path.includes('{') && pathRegex(schema.path, key).test(rel))?.kind;
}

export function loadProject(root: string, report: Report): Project | undefined {
  const spec = loadSpec();
  const configFile = 'scrumo.yaml';
  let raw: unknown;
  try {
    raw = parse(readFileSync(join(root, configFile), 'utf8'));
  } catch (error) {
    report('SCRUMO104', configFile, `scrumo.yaml is missing or not valid YAML: ${(error as Error).message.split('\n')[0]}`);
    return undefined;
  }
  const data = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const project = data.project as Record<string, unknown> | undefined;
  const key = typeof project?.key === 'string' && /^[A-Z][A-Z0-9]{1,9}$/.test(project.key) ? project.key : 'KEY';
  let valid = true;
  checkFields(spec.schemas.get('config')!.frontmatter, data, '', key, undefined, (_code, message) => {
    valid = false;
    report('SCRUMO104', configFile, message);
  });
  if (!valid || typeof data.docs_dir !== 'string') return undefined;

  const config: Config = { key, docsDir: data.docs_dir, ignore: Array.isArray(data.ignore) ? (data.ignore as string[]) : [] };
  const docsRoot = join(root, config.docsDir);
  if (!existsSync(docsRoot)) {
    report('SCRUMO104', configFile, `docs_dir "${config.docsDir}" does not exist`);
    return undefined;
  }
  const ignore = config.ignore.map(globToRegExp);
  const schemas = [...spec.schemas.values()];
  const docs: Doc[] = [];
  for (const path of walk(docsRoot)) {
    const rel = relative(docsRoot, path).split(sep).join('/');
    const file = relative(root, path).split(sep).join('/');
    if (ignore.some((pattern) => pattern.test(rel)) || /(^|\/)\.gitkeep$/.test(rel)) continue;
    const kind = kindOf(rel, schemas, key);
    if (kind === undefined || !rel.endsWith('.md')) {
      report('SCRUMO101', file, `"${rel}" isn't allowed in ${config.docsDir}/; see "scrumo schema" for the layout, or add it to ignore in scrumo.yaml`);
      continue;
    }
    const raw = readFileSync(path, 'utf8');
    const doc = parseDoc(file, rel, kind, raw.replace(/^﻿/, '').replaceAll('\r\n', '\n'));
    doc.raw = raw;
    docs.push(doc);
  }
  const tickets = new Map<string, Doc>();
  for (const doc of docs) {
    const id = doc.fm?.id;
    if (doc.kind !== 'epic' && doc.kind !== 'story') continue;
    if (typeof id !== 'string') continue;
    if (tickets.has(id)) report('SCRUMO501', doc.file, `${id} is also used by ${tickets.get(id)!.file}`);
    else tickets.set(id, doc);
  }
  const one = (kind: string) => docs.find((doc) => doc.kind === kind);
  return { root, config, spec, docs, tickets, prd: one('prd'), architecture: one('architecture'), standards: one('standards'), tracker: one('sprint-tracker') };
}

export function checkLayout(project: Project, report: Report): void {
  const schemas = project.spec.schemas;
  for (const doc of project.docs) {
    if (doc.kind !== 'epic' && doc.kind !== 'story') continue;
    const name = doc.rel.split('/').at(-1)!;
    const schema = schemas.get(doc.kind)!;
    const expected = pathRegex(schema.path.split('/').at(-1)!, project.config.key);
    const other = /^([A-Z][A-Z0-9]*)-\d+-/.exec(name);
    if (!expected.test(name)) {
      if (other && other[1] !== project.config.key) report('SCRUMO105', doc.file, `file name uses key ${other[1]} but the project key is ${project.config.key}`);
      else report('SCRUMO102', doc.file, `file name "${name}" must match ${schema.path.split('/').at(-1)!.replace('{key}', project.config.key)}`);
      continue;
    }
    const id = typeof doc.fm?.id === 'string' ? doc.fm.id : undefined;
    if (id !== undefined && !name.startsWith(`${id}-`)) report('SCRUMO103', doc.file, `file name starts with ${/^(.+?-\d+)-/.exec(name)![1]} but the frontmatter id is ${id}`);
  }
}
