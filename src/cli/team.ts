// scrumo team list|add|set|remove|whoami: the roster in scrumo.yaml.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addYamlKey, setYamlKey } from '../validate/edit.ts';
import { findRoot, loadProject } from '../validate/project.ts';
import type { TeamMember } from '../validate/types.ts';

export const ROLES = ['owner', 'scrum-master', 'architect', 'dev', 'qa'];

export interface TeamOptions {
  name: string | undefined;
  roles: string | undefined;
  points: string | undefined;
  emails: string | undefined;
  me: boolean;
  force: boolean;
  json: boolean;
}

const fail = (code: number, out: string) => ({ code, out: `${out}\n` });
const split = (value: string | undefined): string[] => value?.split(',').map((v) => v.trim()).filter(Boolean) ?? [];
const scalar = (value: string): string => (/^[A-Za-z][A-Za-z0-9 .'()-]*$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) ? value : JSON.stringify(value));

export function renderTeam(team: TeamMember[]): string {
  if (team.length === 0) return '[]';
  const lines = team.flatMap((m) => [
    `  - id: ${m.id}`,
    `    name: ${scalar(m.name)}`,
    `    roles: [${m.roles.join(', ')}]`,
    `    points: ${m.points === null ? 'null' : m.points}`,
    `    emails: [${m.emails.join(', ')}]`,
  ]);
  return `\n${lines.join('\n')}`;
}

function git(cwd: string, key: string): string | undefined {
  try {
    return execFileSync('git', ['config', key], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9._-]+/g, '').replace(/^[^a-z]+/, '').slice(0, 32);

/** Which team member the git identity in `cwd` belongs to. */
export function whoami(team: TeamMember[], cwd: string): { member: TeamMember | undefined; email: string | undefined; name: string | undefined } {
  const email = git(cwd, 'user.email');
  const name = git(cwd, 'user.name');
  const member =
    team.find((m) => email !== undefined && m.emails.some((e) => e.toLowerCase() === email.toLowerCase())) ??
    team.find((m) => name !== undefined && (m.id === slug(name) || m.name.toLowerCase() === name.toLowerCase()));
  return { member, email, name };
}

export function teamCommand(sub: string | undefined, arg: string | undefined, cwd: string, options: TeamOptions): { code: number; out: string } {
  const root = findRoot(cwd);
  if (!root) return fail(1, 'No scrumo.yaml found in or above this folder.');
  const project = loadProject(root, () => {});
  if (!project) return fail(1, 'scrumo.yaml is invalid; run scrumo validate.');
  const team = project.config.team;
  const path = join(root, 'scrumo.yaml');
  const save = (next: TeamMember[]) => {
    const text = readFileSync(path, 'utf8');
    const has = /^team:/m.test(text);
    writeFileSync(path, has ? setYamlKey(text, 'team', renderTeam(next)) : addYamlKey(text, 'team', renderTeam(next), 'skill_prefix'));
  };

  if (sub === 'list' || sub === undefined) {
    if (options.json) return fail(0, JSON.stringify({ team, capacity: team.reduce((sum, m) => sum + (m.points ?? 0), 0) }, null, 2));
    if (team.length === 0) return fail(0, 'No team members yet. Add one: scrumo team add <id> --name "Full Name" --roles dev,qa --points 5 (or scrumo team add --me).');
    const width = Math.max(...team.map((m) => m.id.length));
    const lines = team.map((m) => `  ${m.id.padEnd(width)}  ${m.name}  [${m.roles.join(', ') || 'no role'}]  ${m.points === null ? 'no points set' : `${m.points} pts/sprint`}`);
    const total = team.reduce((sum, m) => sum + (m.points ?? 0), 0);
    return fail(0, `${team.length} team member${team.length === 1 ? '' : 's'}, typical capacity ${total} points per sprint\n${lines.join('\n')}`);
  }

  if (sub === 'whoami') {
    const { member, email, name } = whoami(team, cwd);
    if (member) return fail(0, member.id);
    return fail(1, `No team member matches the git user ${name ?? '(no name)'} <${email ?? 'no email'}>. Add yourself with: scrumo team add --me`);
  }

  if (sub !== 'add' && sub !== 'set' && sub !== 'remove') {
    return fail(2, 'Usage:\n  scrumo team list [--json]\n  scrumo team add <id> --name "Full Name" [--roles dev,qa] [--points 5] [--emails a@b.c]   (or scrumo team add --me)\n  scrumo team set <id> [--name ...] [--roles ...] [--points ...] [--emails ...]\n  scrumo team remove <id>\n  scrumo team whoami');
  }

  let id = arg;
  const next: Partial<TeamMember> = {};
  if (sub === 'add' && options.me) {
    const { email, name } = whoami(team, cwd);
    if (!name && !email) return fail(1, 'Git has no user.name or user.email set, so --me has nothing to use.');
    id ??= slug(email?.split('@')[0] ?? name ?? '');
    options.name ??= name;
    options.emails ??= email;
  }
  if (!id) return fail(2, `Usage: scrumo team ${sub} <id> ...`);
  if (sub !== 'remove' && sub !== 'set' && !/^[a-z][a-z0-9._-]{0,31}$/.test(id)) return fail(2, `"${id}" isn't a valid id: lowercase letters, digits, dots, hyphens, starting with a letter.`);
  const current = team.find((m) => m.id === id);

  if (options.roles !== undefined) {
    const roles = split(options.roles);
    const bad = roles.find((r) => !ROLES.includes(r));
    if (bad) return fail(2, `"${bad}" isn't a role. Roles: ${ROLES.join(', ')}.`);
    next.roles = roles;
  }
  if (options.points !== undefined) {
    const points = options.points === 'none' ? null : Number(options.points);
    if (points !== null && (!Number.isInteger(points) || points < 0)) return fail(2, '--points must be a whole number, or "none".');
    next.points = points;
  }
  if (options.emails !== undefined) {
    const emails = split(options.emails);
    const bad = emails.find((e) => !/^[^@\s]+@[^@\s]+$/.test(e));
    if (bad) return fail(2, `"${bad}" isn't an email address.`);
    next.emails = emails;
  }
  if (options.name !== undefined) next.name = options.name.trim();

  if (sub === 'add') {
    if (current) return fail(1, `${id} is already on the team. Change them with scrumo team set ${id} ...`);
    if (!next.name) return fail(2, 'scrumo team add needs --name "Full Name".');
    save([...team, { id, name: next.name, roles: next.roles ?? [], points: next.points ?? null, emails: next.emails ?? [] }]);
    return fail(0, `added ${id} to the team`);
  }
  if (!current) return fail(1, `${id} isn't on the team. Team: ${team.map((m) => m.id).join(', ') || 'empty'}.`);
  if (sub === 'set') {
    if (Object.keys(next).length === 0) return fail(2, 'Nothing to change: pass --name, --roles, --points, or --emails.');
    save(team.map((m) => (m.id === id ? { ...m, ...next } : m)));
    return fail(0, `updated ${id}`);
  }
  const open = project.docs.filter((d) => d.kind === 'story' && d.fm?.assignee === id && d.fm.status !== 'done' && d.fm.status !== 'cancelled').map((d) => String(d.fm?.id));
  if (open.length && !options.force) return fail(1, `${id} still has open stories: ${open.join(', ')}. Reassign them first, or pass --force (validation will then fail until they are reassigned).`);
  save(team.filter((m) => m.id !== id));
  return fail(0, `removed ${id} from the team`);
}

