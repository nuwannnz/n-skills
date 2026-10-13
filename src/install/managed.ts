// Files scrumo partly owns: the AGENTS.md block, the pre-commit hook, the CI workflow.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { packageInfo } from './package.ts';
import { template } from './skills.ts';

const BEGIN = '<!-- scrumo:agents:begin -->';
const END = '<!-- scrumo:agents:end -->';

export type Change = 'created' | 'updated' | 'unchanged' | 'skipped';

/** Writes the scrumo block into a Markdown file, replacing an earlier copy and leaving the rest alone. */
export function writeBlock(root: string, file: string, docsDir: string, prefix: string, onlyIfPresent = false): Change {
  const path = join(root, file);
  const block = template('agents-block.md', { docs_dir: docsDir, package: packageInfo().name }, prefix).trimEnd();
  if (!existsSync(path)) {
    if (onlyIfPresent) return 'skipped';
    writeFileSync(path, `${block}\n`);
    return 'created';
  }
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  let next: string;
  if (start >= 0 && end > start) next = text.slice(0, start) + block + text.slice(end + END.length);
  else if (onlyIfPresent) return 'skipped';
  else next = `${text.replace(/\n*$/, '\n')}\n${block}\n`;
  if (next === text) return 'unchanged';
  writeFileSync(path, next);
  return 'updated';
}

export function writeHook(root: string, docsDir: string): Change {
  const git = join(root, '.git');
  if (!existsSync(git) || existsSync(join(git, 'HEAD')) === false) return 'skipped';
  const path = join(git, 'hooks', 'pre-commit');
  const text = template('pre-commit', { docs_dir: docsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }, 'scrumo-');
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (!current.includes('scrumo-managed')) return 'skipped';
    if (current === text) return 'unchanged';
  }
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  writeFileSync(path, text);
  chmodSync(path, 0o755);
  return existed ? 'updated' : 'created';
}

export function writeWorkflow(root: string, docsDir: string, packageName: string, force: boolean): Change {
  const path = join(root, '.github', 'workflows', 'scrumo-validate.yml');
  const text = template('scrumo-validate.yml', { docs_dir: docsDir, package: packageName }, 'scrumo-');
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current === text) return 'unchanged';
    if (!force) return 'skipped';
  }
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  writeFileSync(path, text);
  return existed ? 'updated' : 'created';
}
