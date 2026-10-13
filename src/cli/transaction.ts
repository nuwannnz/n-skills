// Applies an edit to the docs, refreshes generated blocks, and rolls every file
// back if the edit introduces an error that wasn't already there.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fix, validate } from '../validate/index.ts';
import { loadProject } from '../validate/project.ts';
import type { Finding, Project } from '../validate/types.ts';

const key = (f: Finding) => `${f.code}|${f.file}|${f.message}`;

export interface Outcome {
  ok: boolean;
  errors: Finding[];
}

/** `apply` writes files under `root` (relative paths in `write`). `allow` names new errors that are expected. */
export function transaction(root: string, today: string, apply: (project: Project, write: (file: string, text: string) => void) => void, allow: (f: Finding) => boolean = () => false): Outcome {
  const project = loadProject(root, () => {});
  if (!project) return { ok: false, errors: [] };
  const known = new Set(validate(root).findings.filter((f) => f.severity === 'error').map(key));
  const snapshot = new Map(project.docs.map((d) => [d.file, d.raw]));
  apply(project, (file, text) => writeFileSync(join(root, file), text));
  fix(root, today, 'generated');
  const errors = validate(root).findings.filter((f) => f.severity === 'error' && !known.has(key(f)) && !allow(f));
  if (errors.length) {
    for (const [file, raw] of snapshot) if (readFileSync(join(root, file), 'utf8') !== raw) writeFileSync(join(root, file), raw);
    return { ok: false, errors };
  }
  return { ok: true, errors: [] };
}

export const describeErrors = (errors: Finding[]): string => errors.map((f) => `  ${f.code}  ${f.file}: ${f.message}`).join('\n');
