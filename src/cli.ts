#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { impactCommand } from './cli/impact.ts';
import { initCommand, installCommand } from './cli/install.ts';
import { moveCommand } from './cli/move.ts';
import { newCommand } from './cli/new.ts';
import { sprintCommand } from './cli/sprint.ts';
import { schemaCommand } from './cli/schema.ts';
import { statusCommand } from './cli/status.ts';
import { teamCommand } from './cli/team.ts';
import { validateCommand } from './cli/validate.ts';

const HELP = `scrumo: agile engineering teams working from strictly structured specs.

Usage:
  scrumo init --key KEY [--name N] [--agents a,b]   Set up scrumo.yaml, docs/, and the skills in this repo
  scrumo install [--agents a,b] [--prefix p]        Copy the skills into each agent's skills folder
  scrumo update                                     Re-sync the skills, keeping local edits
  scrumo validate [--fix] [--json] [path]   Check docs/ against the spec
  scrumo schema <type> [--json]             Print the spec for a document type (or "rules")
  scrumo new <type> [title] [options]       Create a document (brief, prd, architecture, standards, tracker, epic, story, bug)
  scrumo move <id|document> <status>        Change a status, checking the transition and its gates
  scrumo sprint plan|start|close            Plan a sprint, start it, or close it
  scrumo team list|add|set|remove|whoami      The people on the project, kept in scrumo.yaml
  scrumo impact <id>                        What a requirement, decision, or ticket touches
  scrumo status [--sprint|--project] [--json]   The sprint and project at a glance, what needs attention

init/install/update options:
  --agents <a,b>           claude, codex, cursor, gemini, copilot (default: scrumo.yaml, or what the repo already uses)
  --prefix <p->            skill name prefix, default scrumo- (for example --prefix acme- gives /acme-prd)
  --key <KEY> --name <N>   init only: ticket key and product name
  --hooks --ci             init/install: also add a pre-commit hook / GitHub Actions workflow
  --force                  overwrite skills edited locally

new options:
  --epic <ID>              story: the epic it belongs to
  --priority <P0..P3>      epic and story priority (default P2)
  --requirements <FR-001,...>   epic: PRD requirements it delivers
  --depends-on <ID,...>    story: stories that must be done first
  --found-in <ID>          bug: the story whose behaviour is broken

sprint options (plan): --goal TEXT --capacity N --stories ID,ID [--start DATE] [--end DATE]
  sprint start <number> and sprint close <number> take the sprint number.

team options: --name "Full Name" --roles dev,qa --points 5 --emails a@b.c --me (add the git user) --force

move options:
  --assignee <name>        story: who is building it (needed for in-progress)
  --reason <text>          why it is blocked (needed for blocked)
`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      fix: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      epic: { type: 'string' },
      priority: { type: 'string' },
      requirements: { type: 'string' },
      'depends-on': { type: 'string' },
      assignee: { type: 'string' },
      reason: { type: 'string' },
      'found-in': { type: 'string' },
      agents: { type: 'string' },
      prefix: { type: 'string' },
      key: { type: 'string' },
      name: { type: 'string' },
      hooks: { type: 'boolean' },
      ci: { type: 'boolean' },
      force: { type: 'boolean' },
      sprint: { type: 'boolean' },
      roles: { type: 'string' },
      points: { type: 'string' },
      emails: { type: 'string' },
      me: { type: 'boolean' },
      project: { type: 'boolean' },
      goal: { type: 'string' },
      capacity: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
      stories: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command || values.help ? 0 : 2;
  }
  let result: { code: number; out: string };
  switch (command) {
    case 'validate':
      result = validateCommand(rest[0] ?? '.', { fix: values.fix === true, json: values.json === true });
      break;
    case 'schema':
      result = schemaCommand(rest, values.json === true);
      break;
    case 'new':
      result = newCommand(rest[0], process.cwd(), {
        title: rest.slice(1).join(' ') || undefined,
        epic: values.epic,
        priority: values.priority,
        requirements: values.requirements,
        dependsOn: values['depends-on'],
        foundIn: values['found-in'],
      });
      break;
    case 'init':
    case 'install':
    case 'update': {
      const o = { agents: values.agents, prefix: values.prefix, key: values.key, name: values.name, hooks: values.hooks === true, ci: values.ci === true, force: values.force === true };
      result = command === 'init' ? initCommand(process.cwd(), o) : installCommand(command, process.cwd(), o);
      break;
    }
    case 'move':
      result = moveCommand(rest[0], rest[1], process.cwd(), { assignee: values.assignee, reason: values.reason });
      break;
    case 'sprint':
      result = sprintCommand(rest[0], rest[1], process.cwd(), { goal: values.goal, capacity: values.capacity, start: values.start, end: values.end, stories: values.stories });
      break;
    case 'team':
      result = teamCommand(rest[0], rest[1], process.cwd(), { name: values.name, roles: values.roles, points: values.points, emails: values.emails, me: values.me === true, force: values.force === true, json: values.json === true });
      break;
    case 'impact':
      result = impactCommand(rest[0], process.cwd(), values.json === true);
      break;
    case 'status':
      result = statusCommand(process.cwd(), values.json === true, values.sprint === true ? 'sprint' : values.project === true ? 'project' : 'all');
      break;
    default:
      result = { code: 2, out: `Unknown command "${command}".\n\n${HELP}` };
  }
  (result.code === 0 || command === 'validate' ? process.stdout : process.stderr).write(result.out);
  return result.code;
}

process.exitCode = main(process.argv.slice(2));
