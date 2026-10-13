#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { newCommand } from './cli/new.ts';
import { schemaCommand } from './cli/schema.ts';
import { validateCommand } from './cli/validate.ts';

const HELP = `nsk: run a project the way a software team does.

Usage:
  nsk validate [--fix] [--json] [path]   Check docs/ against the spec
  nsk schema <type> [--json]             Print the spec for a document type (or "rules")
  nsk new <type> [title] [options]       Create a document (brief, prd, architecture, standards, epic, story)

new options:
  --epic <ID>              story: the epic it belongs to
  --priority <P0..P3>      epic and story priority (default P2)
  --requirements <FR-001,...>   epic: PRD requirements it delivers
  --depends-on <ID,...>    story: stories that must be done first
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
    default:
      result = { code: 2, out: `Unknown command "${command}".\n\n${HELP}` };
  }
  (result.code === 0 || command === 'validate' ? process.stdout : process.stderr).write(result.out);
  return result.code;
}

process.exitCode = main(process.argv.slice(2));
