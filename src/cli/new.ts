// nsk new <type>: creates an artifact from its schema and allocates the next ticket ID.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FieldDef, Schema, SectionDef } from '../spec/types.ts';
import type { Doc } from '../validate/doc.ts';
import { fix } from '../validate/index.ts';
import { generate, idNumber, renderBlock } from '../validate/generate.ts';
import { findRoot, loadProject } from '../validate/project.ts';
import { resolveKind } from './schema.ts';

export interface NewOptions {
  title: string | undefined;
  epic: string | undefined;
  priority: string | undefined;
  requirements: string | undefined;
  dependsOn: string | undefined;
  today?: string;
}

const NEW_KINDS = ['brief', 'prd', 'architecture', 'standards', 'sprint-tracker', 'epic', 'story'];

function slugify(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

function scalar(field: FieldDef, value: string): string {
  if (field.type !== 'string') return value;
  return /^[A-Za-z][A-Za-z0-9 .'()/,-]*$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) ? value : JSON.stringify(value);
}

function emit(field: FieldDef, value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => emit(field.items!, item)).join(', ')}]`;
  return scalar(field, String(value));
}

function defaultValue(field: FieldDef, today: string): unknown {
  if (field.fixed !== undefined) return field.fixed;
  if (field.name === 'status') return field.values![0];
  if (field.name === 'version') return '0.1.0';
  if (field.type === 'date') return today;
  if (field.nullable) return null;
  if (field.type === 'list') return [];
  if (field.type === 'enum') return field.values![0];
  return '';
}

function body(def: SectionDef, ctx: { today: string; title: string; version: string }, render: (block: string) => string[]): string[] {
  const lines = [`## ${def.heading}`, ''];
  if (def.guidance) lines.push(`<!-- ${def.guidance.replace(/\s+/g, ' ').replace(/-->/g, '').trim()} -->`, '');
  if (def.content?.type === 'generated') {
    lines.push(...render(def.content.block), '');
  } else if (def.template !== undefined) {
    lines.push(def.template.replaceAll('{date}', ctx.today).replaceAll('{version}', ctx.version).replaceAll('{title}', ctx.title), '');
  } else if (def.content?.type === 'prose' && def.non_empty_in?.includes('draft')) {
    lines.push('TODO', '');
  }
  return lines;
}

export function render(schema: Schema, values: Record<string, unknown>, renderBlockFor: (block: string) => string[], today: string): string {
  const frontmatter = schema.frontmatter.map((f) => `${f.name}: ${emit(f, values[f.name!])}`);
  const title = String(values.title);
  const ctx = { today, title, version: String(values.version ?? '0.1.0') };
  const sections = schema.sections.filter((s) => s.heading !== undefined && !s.optional).flatMap((s) => body(s, ctx, renderBlockFor));
  return ['---', ...frontmatter, '---', '', `# ${title}`, '', ...sections].join('\n').replace(/\n+$/, '\n');
}

export function newCommand(kindArg: string | undefined, cwd: string, options: NewOptions): { code: number; out: string } {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const kind = kindArg === undefined ? undefined : resolveKind(kindArg);
  if (!kind || !NEW_KINDS.includes(kind)) return { code: 2, out: `Usage: nsk new <${[...NEW_KINDS.slice(0, 4), 'tracker', 'epic', 'story'].join('|')}> [title] [options]\n` };
  const root = findRoot(cwd);
  if (!root) return { code: 1, out: 'No nsk.yaml found in or above this folder.\n' };
  const problems: string[] = [];
  const project = loadProject(root, (code, file, message) => problems.push(`${file}: ${code} ${message}`));
  if (!project) return { code: 1, out: `${problems.join('\n')}\n` };
  const schema = project.spec.schemas.get(kind)!;
  const isTicket = kind === 'epic' || kind === 'story';
  const fixedTitle = schema.frontmatter.find((f) => f.name === 'title')?.fixed;
  const title = typeof fixedTitle === 'string' ? fixedTitle : options.title?.trim() || (isTicket ? undefined : schema.title);
  if (!title) return { code: 2, out: `nsk new ${kind} needs a title, for example: nsk new ${kind} "Sign up with email"\n` };

  const values: Record<string, unknown> = Object.fromEntries(schema.frontmatter.map((f) => [f.name, defaultValue(f, today)]));
  values.title = title;
  let rel = schema.path;
  if (isTicket) {
    const key = project.config.key;
    const used = [...project.tickets.keys()].map(idNumber);
    for (const folder of ['epics', 'stories']) {
      const dir = join(root, project.config.docsDir, folder);
      if (existsSync(dir)) used.push(...readdirSync(dir).map((name) => Number(new RegExp(`^${key}-(\\d+)-`).exec(name)?.[1] ?? 0)));
    }
    const n = Math.max(0, ...used) + 1;
    const slug = slugify(title);
    if (!slug) return { code: 2, out: 'The title needs at least one letter or digit.\n' };
    values.id = `${key}-${n}`;
    values.priority = options.priority ?? 'P2';
    if (!['P0', 'P1', 'P2', 'P3'].includes(String(values.priority))) return { code: 2, out: 'priority must be P0, P1, P2, or P3.\n' };
    if (kind === 'story') {
      const epic = options.epic;
      if (!epic) return { code: 2, out: 'nsk new story needs --epic <epic ID>.\n' };
      if (project.tickets.get(epic)?.kind !== 'epic') return { code: 1, out: `${epic} is not an existing epic.\n` };
      values.epic = epic;
      const depends = options.dependsOn?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
      const bad = depends.find((id) => project.tickets.get(id)?.kind !== 'story');
      if (bad) return { code: 1, out: `${bad} is not an existing story.\n` };
      values.depends_on = depends;
    } else {
      const requirements = options.requirements?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
      const bad = requirements.find((id) => !/^FR-\d{3}$/.test(id));
      if (bad) return { code: 2, out: `${bad} is not a requirement ID like FR-001.\n` };
      values.requirements = requirements;
    }
    rel = schema.path.replace('{key}', key).replace('{n}', String(n)).replace('{slug}', slug);
  }

  const target = join(root, project.config.docsDir, rel);
  if (existsSync(target)) return { code: 1, out: `${join(project.config.docsDir, rel)} already exists.\n` };
  const stub = { fm: { id: values.id } } as unknown as Doc;
  const text = render(schema, values, (block) => renderBlock(block, generate(project, stub, block) ?? []), today);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  fix(root, today, 'generated');
  return { code: 0, out: `created ${join(project.config.docsDir, rel)}\n` };
}
