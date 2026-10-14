// The skills under skills/ keep one skeleton, point only at things that exist,
// and call only scrumo commands that exist (plan section 6).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { loadSpec } from '../../src/spec/load.ts';

const DIR = new URL('../../skills/', import.meta.url).pathname;
const spec = loadSpec();
const EXPECTED = ['validate', 'kickoff', 'prd', 'architecture', 'standards', 'epics', 'stories', 'sprint', 'dev', 'qa', 'bug', 'refine', 'change'].map((name) => `scrumo-${name}`);
const SECTIONS = ['Role', 'When to use', 'Inputs', 'Outputs', 'Prerequisite: the scrumo CLI', 'Procedure', 'Quality bar', 'Hand-off', 'Exit: validate'];
const COMMANDS = ['init', 'validate', 'schema', 'new', 'move', 'status', 'sprint', 'impact', 'team', '--version'];
const NEW_TYPES = ['brief', 'prd', 'architecture', 'standards', 'tracker', 'epic', 'story', 'bug'];
const STATUSES = new Set([...spec.schemas.values()].flatMap((s) => s.statuses?.values ?? []));

const skills = readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const read = (name: string) => readFileSync(`${DIR}${name}/SKILL.md`, 'utf8');

function split(text: string): { fm: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(match, 'frontmatter block');
  return { fm: parse(match[1]!) as Record<string, unknown>, body: match[2]! };
}

describe('skills', () => {
  it('has exactly the planned skills, each with the scrumo- prefix', () => {
    assert.deepEqual(skills, [...EXPECTED].sort());
  });

  for (const name of skills) {
    describe(name, () => {
      const text = read(name);
      const { fm, body } = split(text);

      it('has a name equal to its folder and a useful description', () => {
        assert.deepEqual(Object.keys(fm), ['name', 'description']);
        assert.equal(fm.name, name);
        const description = String(fm.description);
        assert.ok(description.length >= 80 && description.length <= 1024, `description is ${description.length} characters`);
        assert.match(description, /Use (when|after|to|for)/);
      });

      it('follows the section skeleton and stays short', () => {
        const headings = body.split('\n').filter((line) => /^#{1,3} /.test(line));
        assert.match(headings[0]!, /^# /);
        assert.deepEqual(headings.slice(1).filter((h) => h.startsWith('## ')).map((h) => h.slice(3)), SECTIONS);
        assert.ok(text.split('\n').length <= 150, 'SKILL.md is over 150 lines');
      });

      it('references only skills and scrumo commands that exist', () => {
        for (const [, other] of text.matchAll(/\/(scrumo-[a-z]+)\b/g)) assert.ok(skills.includes(other!), `unknown skill /${other}`);
        for (const [, command] of text.matchAll(/npx scrumo ([\w-]+)/g)) assert.ok(COMMANDS.includes(command!), `unknown command scrumo ${command}`);
        for (const [, kind] of text.matchAll(/scrumo schema (\S+)/g)) {
          const clean = kind!.replace(/[`.,]/g, '');
          assert.ok(clean === 'rules' || clean === '<kind>' || clean === 'tracker' || spec.schemas.has(clean), `unknown schema ${clean}`);
        }
        for (const [, sub] of text.matchAll(/scrumo team (\w+)/g)) assert.ok(['list', 'add', 'set', 'remove', 'whoami'].includes(sub!), `unknown scrumo team ${sub}`);
        for (const [, sub] of text.matchAll(/scrumo sprint (\w+)/g)) assert.ok(['plan', 'start', 'close'].includes(sub!), `unknown scrumo sprint ${sub}`);
        for (const [, type] of text.matchAll(/scrumo new (\S+)/g)) assert.ok(NEW_TYPES.includes(type!.replace(/[`.,]/g, '')), `unknown scrumo new type ${type}`);
        for (const [, status] of text.matchAll(/scrumo move (?:<[^>]+>|\S+) (\S+)/g)) assert.ok(STATUSES.has(status!.replace(/[`.,]/g, '')), `unknown status ${status}`);
      });
    });
  }

  it('shares one identical Exit: validate section', () => {
    const exits = new Set(skills.map((name) => split(read(name)).body.split('## Exit: validate')[1]!.trim()));
    assert.equal(exits.size, 1);
  });

  it('shares one identical prerequisite that never tells an agent to npx a missing CLI', () => {
    const sections = new Set(skills.map((name) => /## Prerequisite: the scrumo CLI\n([\s\S]*?)\n## /.exec(read(name))![1]!.trim()));
    assert.equal(sections.size, 1);
    const [section] = [...sections];
    assert.match(section!, /node_modules\/\.bin\/scrumo/);
    assert.match(section!, /do not run `npx scrumo`/);
  });
});
