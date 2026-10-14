// scrumo init, scrumo install, scrumo update.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { installedAgents } from '../install/agents.ts';
import { writeBlock, writeHook, writeWorkflow, type Change } from '../install/managed.ts';
import { packageInfo } from '../install/package.ts';
import { syncSkills, type SyncResult } from '../install/sync.ts';
import { loadAgents } from '../spec/load.ts';
import { addYamlKey, setYamlKey } from '../validate/edit.ts';
import { findRoot } from '../validate/project.ts';

export interface InstallOptions {
  agents: string | undefined;
  prefix: string | undefined;
  name: string | undefined;
  key: string | undefined;
  hooks: boolean;
  ci: boolean;
  force: boolean;
}

interface Config {
  cli_version: string;
  project: { name: string; key: string };
  docs_dir: string;
  agents: string[];
  skill_prefix: string;
  team?: unknown[];
}

const flow = (items: string[]) => `[${items.join(', ')}]`;
const fail = (code: number, out: string) => ({ code, out: `${out}\n` });

function describe(result: SyncResult): string[] {
  const lines = [`skills: ${result.added.length} added, ${result.updated.length} updated, ${result.unchanged} unchanged, ${result.removed.length} removed in ${result.dirs.join(', ')}`];
  if (result.conflicts.length) lines.push(`left alone because they were edited locally (use --force to overwrite):`, ...result.conflicts.map((p) => `  ${p}`));
  if (result.kept.length) lines.push('no longer shipped, but edited locally, so kept:', ...result.kept.map((p) => `  ${p}`));
  return lines;
}

function note(label: string, change: Change): string | undefined {
  return change === 'skipped' || change === 'unchanged' ? undefined : `${label}: ${change}`;
}

/** Shared by init, install and update: applies option overrides to scrumo.yaml, then syncs skills and managed blocks. */
function apply(root: string, options: InstallOptions, update: boolean): { code: number; out: string } {
  const agents = loadAgents();
  const path = join(root, 'scrumo.yaml');
  let text = readFileSync(path, 'utf8');
  const config = parse(text) as Config;
  const chosen = options.agents ? options.agents.split(',').map((a) => a.trim()).filter(Boolean) : config.agents;
  const unknown = chosen.filter((id) => !agents.some((a) => a.id === id));
  if (unknown.length || chosen.length === 0) return fail(2, `Unknown agent ${unknown.join(', ') || '(none given)'}. Choose from: ${agents.map((a) => a.id).join(', ')}.`);
  const prefix = options.prefix ?? config.skill_prefix ?? 'scrumo-';
  if (!/^[a-z][a-z0-9-]*-$/.test(prefix)) return fail(2, `The prefix "${prefix}" must be lowercase letters, digits and hyphens, and end with a hyphen, like "scrumo-".`);
  const { version, name } = packageInfo();

  if (chosen.join() !== config.agents.join()) text = setYamlKey(text, 'agents', flow(chosen));
  if (prefix !== config.skill_prefix) text = addYamlKey(text, 'skill_prefix', prefix, 'agents');
  if (config.team === undefined) text = addYamlKey(text, 'team', '[]', 'skill_prefix');
  if (version !== config.cli_version) text = setYamlKey(text, 'cli_version', version);
  if (text !== readFileSync(path, 'utf8')) writeFileSync(path, text);

  const result = syncSkills(root, { agents: agents.filter((a) => chosen.includes(a.id)), prefix, version, force: options.force });
  const lines = describe(result);
  const create = !update; // update only refreshes blocks that already exist
  const blocks: Array<[string, boolean]> = [['AGENTS.md', create], ['CLAUDE.md', create && chosen.includes('claude')]];
  for (const [file, make] of blocks) {
    const line = note(file, writeBlock(root, file, config.docs_dir, prefix, !make));
    if (line) lines.push(line);
  }
  if (options.hooks) lines.push(`pre-commit hook: ${writeHook(root, config.docs_dir)}`);
  if (options.ci) lines.push(`CI workflow: ${writeWorkflow(root, config.docs_dir, name, options.force)}`);
  return { code: result.conflicts.length ? 1 : 0, out: `${lines.join('\n')}\n` };
}

export function initCommand(cwd: string, options: InstallOptions): { code: number; out: string } {
  const existing = findRoot(cwd);
  const root = existing ?? cwd;
  const agents = loadAgents();
  if (!existing) {
    if (!options.key || !/^[A-Z][A-Z0-9]{1,9}$/.test(options.key)) return fail(2, 'scrumo init needs --key: 2 to 10 uppercase letters or digits, starting with a letter (for example ACME). It never changes once tickets exist.');
    const chosen = options.agents ? options.agents.split(',').map((a) => a.trim()).filter(Boolean) : installedAgents(root, agents);
    const prefix = options.prefix ?? 'scrumo-';
    const text = [
      'schema_version: 1',
      `cli_version: ${packageInfo().version}`,
      'project:',
      `  name: ${JSON.stringify(options.name ?? basename(root))}`,
      `  key: ${options.key}`,
      'docs_dir: docs',
      'sprint:',
      '  length_days: 14',
      '  start_weekday: monday',
      `agents: ${flow(chosen.length ? chosen : ['claude'])}`,
      `skill_prefix: ${prefix}`,
      'team: []',
      'ignore: []',
      '',
    ].join('\n');
    writeFileSync(join(root, 'scrumo.yaml'), text);
  }
  const config = parse(readFileSync(join(root, 'scrumo.yaml'), 'utf8')) as Config;
  for (const dir of ['', 'epics', 'stories']) {
    const folder = join(root, config.docs_dir, dir);
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  }
  for (const dir of ['epics', 'stories']) {
    const keep = join(root, config.docs_dir, dir, '.gitkeep');
    if (!existsSync(keep)) writeFileSync(keep, '');
  }
  const result = apply(root, options, false);
  const first = existing ? '' : `created scrumo.yaml and ${config.docs_dir}/ in ${root}\n`;
  const prefix = options.prefix ?? config.skill_prefix ?? 'scrumo-';
  const next = `\nNext: add your team (scrumo team add --me, then one scrumo team add <id> --name "Full Name" per teammate), then run /${prefix}kickoff in your agent. The skills call \`npx scrumo\`, so install the CLI too: npm install --save-dev ${packageInfo().name}\n`;
  return { code: result.code, out: first + result.out + next };
}

export function installCommand(sub: 'install' | 'update', cwd: string, options: InstallOptions): { code: number; out: string } {
  const root = findRoot(cwd);
  if (!root) return fail(1, 'No scrumo.yaml found in or above this folder. Run scrumo init first.');
  return apply(root, options, sub === 'update');
}
