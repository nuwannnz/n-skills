// Reads the packaged skills and renames them to the project's prefix.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLS_DIR = fileURLToPath(new URL('../../skills/', import.meta.url));
export const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/', import.meta.url));
export const SOURCE_PREFIX = 'scrumo-';

export interface Skill {
  name: string; // with the project's prefix
  files: Map<string, string>; // path inside the skill folder -> text
}

function walk(dir: string, base = ''): string[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, `${base}${name}/`) : [`${base}${name}`];
  });
}

export function skillNames(source: string = SKILLS_DIR): string[] {
  return readdirSync(source, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith(SOURCE_PREFIX)).map((e) => e.name.slice(SOURCE_PREFIX.length)).sort();
}

/** Renames every `scrumo-<skill>` token (folder names, `name:` fields, `/scrumo-<skill>` references). */
export function applyPrefix(text: string, prefix: string, bare: string[]): string {
  if (prefix === SOURCE_PREFIX) return text;
  return text.replace(new RegExp(`(?<![\\w-])${SOURCE_PREFIX}(${bare.join('|')})(?![\\w-])`, 'g'), (_m, name: string) => `${prefix}${name}`);
}

export function readSkills(prefix: string, source: string = SKILLS_DIR): Skill[] {
  const bare = skillNames(source);
  return bare.map((name) => {
    const dir = join(source, `${SOURCE_PREFIX}${name}`);
    const files = new Map(walk(dir).map((file) => [file, applyPrefix(readFileSync(join(dir, file), 'utf8'), prefix, bare)] as const));
    return { name: `${prefix}${name}`, files };
  });
}

export function template(name: string, vars: Record<string, string>, prefix: string): string {
  let text = readFileSync(join(TEMPLATES_DIR, name), 'utf8');
  for (const [key, value] of Object.entries({ ...vars, prefix })) text = text.replaceAll(`{${key}}`, value);
  return applyPrefix(text, prefix, skillNames());
}
