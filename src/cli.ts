#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { moveCommand } from './cli/move.ts';
import { newCommand } from './cli/new.ts';
import { sprintCommand } from './cli/sprint.ts';
import { schemaCommand } from './cli/schema.ts';
import { statusCommand } from './cli/status.ts';
import { validateCommand } from './cli/validate.ts';

const HELP = `nsk: run a project the way a software team does.

Usage:
  nsk validate [--fix] [--json] [path]   Check docs/ against the spec
  nsk schema <type> [--json]             Print the spec for a document type (or "rules")
  nsk new <type> [title] [options]       Create a document (brief, prd, architecture, standards, tracker, epic, story)
  nsk move <id|document> <status>        Change a status, checking the transition and its gates
  nsk sprint plan|start|close            Plan a sprint, start it, or close it
  nsk status [--json]                    Show the board and what to do next

new options:
  --epic <ID>              story: the epic it belongs to
  --priority <P0..P3>      epic and story priority (default P2)
  --requirements <FR-001,...>   epic: PRD requirements it delivers
  --depends-on <ID,...>    story: stories that must be done first

sprint options (plan): --goal TEXT --capacity N --stories ID,ID [--start DATE] [--end DATE]
  sprint start <number> and sprint close <number> take the sprint number.

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
      });
      break;
    case 'move':
      result = moveCommand(rest[0], rest[1], process.cwd(), { assignee: values.assignee, reason: values.reason });
      break;
    case 'sprint':
      result = sprintCommand(rest[0], rest[1], process.cwd(), { goal: values.goal, capacity: values.capacity, start: values.start, end: values.end, stories: values.stories });
      break;
    case 'status':
      result = statusCommand(process.cwd(), values.json === true);
      break;
    default:
      result = { code: 2, out: `Unknown command "${command}".\n\n${HELP}` };
  }
  (result.code === 0 || command === 'validate' ? process.stdout : process.stderr).write(result.out);
  return result.code;
}

process.exitCode = main(process.argv.slice(2));
