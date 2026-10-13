// Copies skills into the chosen directories and keeps a manifest, so an update
// can tell its own files from local edits and never overwrite those.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Agent } from '../spec/types.ts';
import { chooseDirs } from './dirs.ts';
import { readSkills } from './skills.ts';

export const MANIFEST = '.scrumo/manifest.json';

export interface Manifest {
  cli_version: string;
  prefix: string;
  agents: string[];
  files: Record<string, string>; // path from the project root -> sha256 of the installed text
}

export interface SyncResult {
  dirs: string[];
  added: string[];
  updated: string[];
  unchanged: number;
  removed: string[];
  /** Differs from the package and was edited locally (or isn't ours): left alone. */
  conflicts: string[];
  /** Obsolete, but edited locally: left in place. */
  kept: string[];
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

export function readManifest(root: string): Manifest | undefined {
  try {
    return JSON.parse(readFileSync(join(root, MANIFEST), 'utf8')) as Manifest;
  } catch {
    return undefined;
  }
}

function pruneEmpty(root: string, file: string): void {
  let dir = dirname(join(root, file));
  while (dir.startsWith(root) && dir !== root && existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

export function syncSkills(root: string, options: { agents: Agent[]; prefix: string; version: string; force?: boolean; source?: string }): SyncResult {
  const result: SyncResult = { dirs: [], added: [], updated: [], unchanged: 0, removed: [], conflicts: [], kept: [] };
  const dirs = chooseDirs(options.agents);
  result.dirs = [...dirs.keys()].sort();
  const skills = readSkills(options.prefix, options.source);
  const previous = readManifest(root);
  const files: Record<string, string> = {};
  const desired = new Map<string, string>();
  for (const dir of result.dirs) {
    for (const skill of skills) {
      for (const [file, text] of skill.files) desired.set(`${dir}/${skill.name}/${file}`, text);
    }
  }

  for (const [path, text] of desired) {
    const target = join(root, path);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
      result.added.push(path);
      files[path] = sha(text);
      continue;
    }
    const current = readFileSync(target, 'utf8');
    if (current === text) {
      result.unchanged += 1;
      files[path] = sha(text);
    } else if (options.force || previous?.files[path] === sha(current)) {
      writeFileSync(target, text);
      result.updated.push(path);
      files[path] = sha(text);
    } else {
      result.conflicts.push(path);
      if (previous?.files[path]) files[path] = previous.files[path]!;
    }
  }

  for (const [path, hash] of Object.entries(previous?.files ?? {})) {
    if (desired.has(path) || !existsSync(join(root, path))) continue;
    if (sha(readFileSync(join(root, path), 'utf8')) === hash || options.force) {
      rmSync(join(root, path));
      pruneEmpty(root, path);
      result.removed.push(path);
    } else {
      result.kept.push(path);
    }
  }

  const manifest: Manifest = { cli_version: options.version, prefix: options.prefix, agents: options.agents.map((a) => a.id), files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
  mkdirSync(join(root, '.scrumo'), { recursive: true });
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return result;
}
