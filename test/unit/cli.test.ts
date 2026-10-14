// The scrumo commands: validate --fix, new, schema, and the process-level contract.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { moveCommand } from '../../src/cli/move.ts';
import { newCommand } from '../../src/cli/new.ts';
import { sprintCommand } from '../../src/cli/sprint.ts';
import { impact, impactCommand } from '../../src/cli/impact.ts';
import { schemaCommand } from '../../src/cli/schema.ts';
import { board, statusCommand, workdays } from '../../src/cli/status.ts';
import { fix, validate } from '../../src/validate/index.ts';
import { EPIC3, Fixture, PRD, SAMPLE, STORY4, STORY6, STORY8, TRACKER } from '../support.ts';

const CLI = new URL('../../src/cli.ts', import.meta.url).pathname;
const fixtures: Fixture[] = [];
const fresh = (source: string | null = SAMPLE) => {
  const fixture = new Fixture(source);
  fixtures.push(fixture);
  return fixture;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

const scrumo = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const noOptions = { title: undefined, epic: undefined, priority: undefined, requirements: undefined, dependsOn: undefined, foundIn: undefined, today: '2026-10-13' };

describe('scrumo validate --fix', () => {
  it('repairs every fixable problem and stamps updated', () => {
    const f = fresh();
    f.write(PRD, f.read(PRD).replaceAll('\n', '\r\n').replace('# PawPlan Product Requirements', '# Wrong title'));
    f.edit(STORY4, 'status: done\npriority: P0', 'priority: P0\nstatus: done');
    f.edit(STORY4, 'reason: null', 'reason: stale');
    f.edit(EPIC3, '_No stories yet._', '_Edited by hand._');
    f.edit(TRACKER, '| 2 | active |', '| 3 | active |');
    f.write(STORY8, `${f.read(STORY8).replace('## Technical Notes', '## Technical Notes  ')}`);
    assert.ok(f.codes().length > 0);

    const changed = fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.ok(changed.includes(PRD) && changed.includes(STORY4) && changed.includes(EPIC3));
    assert.match(f.read(PRD), /^updated: 2026-10-13$/m);
    assert.match(f.read(STORY4), /^status: done$/m);
    assert.match(f.read(STORY4), /^reason: null$/m);
    assert.doesNotMatch(f.read(PRD), /\r/);
  });

  it('does nothing to a clean project', () => {
    const f = fresh();
    assert.deepEqual(fix(f.root, '2026-10-13'), []);
    assert.deepEqual(validate(f.root).findings, []);
  });

  it('leaves judgment calls for the agent', () => {
    const f = fresh();
    f.edit(STORY4, 'points: 3', 'points: "3"');
    fix(f.root, '2026-10-13');
    assert.ok(f.codes().includes('SCRUMO304'));
  });
});

describe('scrumo new', () => {
  it('creates an epic then a story, numbering them together and keeping generated blocks fresh', () => {
    const f = fresh();
    assert.equal(newCommand('epic', f.root, { ...noOptions, title: 'Billing: invoices', requirements: 'FR-001', priority: 'P1' }).code, 0);
    assert.ok(f.read('docs/epics/PAW-13-billing-invoices.md').includes('priority: P1'));
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'Pay an invoice', epic: 'PAW-13', dependsOn: 'PAW-8' }).code, 0);
    assert.match(f.read('docs/stories/PAW-14-pay-an-invoice.md'), /^depends_on: \[PAW-8\]$/m);
    assert.match(f.read('docs/epics/PAW-13-billing-invoices.md'), /\| PAW-14 \| Pay an invoice \| draft \| - \| - \|/);
    assert.match(f.read(TRACKER), /\| PAW-14 \| Pay an invoice \| PAW-13 \| P2 \| - \| draft \|/);
    assert.deepEqual(f.findings(), []);
  });

  it('rejects a story for a missing epic and an existing file', () => {
    const f = fresh();
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X', epic: 'PAW-99' }).code, 1);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X', epic: 'PAW-5' }).code, 1);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'X' }).code, 2);
    assert.equal(newCommand('prd', f.root, noOptions).code, 1);
    assert.equal(newCommand('widget', f.root, noOptions).code, 2);
  });

  it('creates every planning document as a valid draft in an empty project', () => {
    const f = fresh(null);
    f.write('scrumo.yaml', 'schema_version: 1\ncli_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nskill_prefix: scrumo-\nteam: []\nignore: []\n');
    mkdirSync(f.path('docs'));
    for (const kind of ['brief', 'prd', 'architecture', 'standards']) {
      assert.equal(newCommand(kind, f.root, { ...noOptions, today: '2026-10-13' }).code, 0, kind);
    }
    assert.equal(newCommand('epic', f.root, { ...noOptions, title: 'First epic' }).code, 0);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'First story', epic: 'DEMO-1' }).code, 0);
    assert.deepEqual(f.findings(), []);
  });
});

describe('scrumo schema', () => {
  it('describes a type, accepts the tracker alias, and lists the rules', () => {
    assert.match(schemaCommand(['story'], false).out, /### Acceptance Criteria/);
    assert.match(schemaCommand(['tracker'], false).out, /# Sprint tracker/);
    assert.equal(JSON.parse(schemaCommand(['epic'], true).out).kind, 'epic');
    assert.match(schemaCommand(['rules'], false).out, /SCRUMO612/);
    assert.equal(schemaCommand(['nope'], false).code, 2);
  });
});

describe('scrumo process', () => {
  it('exits 0 and prints a summary for the sample project', () => {
    const result = scrumo(['validate', SAMPLE], process.cwd());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no problems found in 17 files/);
  });

  it('exits 1 with grouped findings and machine-readable output', () => {
    const f = fresh();
    f.edit(STORY8, '(AC-3)', '(AC-1)');
    const text = scrumo(['validate'], f.root);
    assert.equal(text.status, 1);
    assert.match(text.stdout, /docs\/stories\/PAW-8-book-appointment\.md\n {2}SCRUMO602 /);
    assert.match(text.stdout, /✖ 1 error, 0 warnings in 1 file/);
    const json = JSON.parse(scrumo(['validate', '--json'], f.root).stdout) as { ok: boolean; findings: Array<{ code: string }> };
    assert.equal(json.ok, false);
    assert.deepEqual(json.findings.map((x) => x.code), ['SCRUMO602']);
  });

  it('limits output to the path asked for, but still checks the whole project', () => {
    const f = fresh();
    f.edit(STORY8, '(AC-3)', '(AC-1)');
    assert.equal(scrumo(['validate', 'docs/stories/PAW-4-email-signup.md'], f.root).status, 0);
    assert.equal(scrumo(['validate', 'docs/stories'], f.root).status, 1);
  });

  it('exits 0 with only warnings', () => {
    const f = fresh();
    f.edit(TRACKER, 'capacity: 12', 'capacity: 5');
    fix(f.root, '2026-10-13'); // the overview table repeats capacity
    const result = scrumo(['validate'], f.root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /SCRUMO610 {2}\(warning\)/);
  });

  it('reports a missing project', () => {
    const f = fresh(null);
    const result = scrumo(['validate'], f.root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /SCRUMO104/);
    assert.equal(scrumo([], f.root).status, 2);
    assert.equal(scrumo(['bogus'], f.root).status, 2);
  });
});

const move = (f: Fixture, id: string, status: string, extra: { assignee?: string; reason?: string } = {}) =>
  moveCommand(id, status, f.root, { assignee: extra.assignee, reason: extra.reason, today: '2026-10-13' });

describe('scrumo move', () => {
  it('moves a story through its gates and keeps generated tables fresh', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-8', 'in-progress').code, 1); // needs an assignee
    assert.match(f.read(STORY8), /^status: ready$/m);
    assert.equal(move(f, 'PAW-8', 'in-progress', { assignee: 'jo' }).code, 0);
    assert.match(f.read(STORY8), /^status: in-progress$/m);
    assert.match(f.read(STORY8), /^assignee: "jo"$/m);
    assert.match(f.read(STORY8), /^updated: 2026-10-13$/m);
    assert.match(f.read(TRACKER), /\| PAW-8 \| Book an appointment \| PAW-2 \| 3 \| in-progress \| jo \|/);
    assert.deepEqual(f.findings(), []);
  });

  it('refuses illegal transitions and unmet gates without changing any file', () => {
    const f = fresh();
    const before = f.read(STORY6);
    assert.match(move(f, 'PAW-8', 'done').out, /from ready it can go to/i);
    const failed = move(f, 'PAW-6', 'done');
    assert.equal(failed.code, 1);
    assert.match(failed.out, /SCRUMO606/);
    assert.equal(f.read(STORY6), before);
    assert.equal(move(f, 'PAW-99', 'done').code, 1);
    assert.equal(move(f, 'PAW-8', 'blocked').code, 2); // needs a reason
  });

  it('sets and clears reason', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-8', 'blocked', { reason: 'Waiting on design' }).code, 0);
    assert.match(f.read(STORY8), /^reason: "Waiting on design"$/m);
    assert.equal(move(f, 'PAW-8', 'ready').code, 0);
    assert.match(f.read(STORY8), /^reason: null$/m);
  });

  it('moves documents too', () => {
    const f = fresh();
    assert.equal(move(f, 'prd', 'draft').code, 1); // would break approved epics
    assert.match(f.read(PRD), /^status: approved$/m);
  });
});

describe('scrumo status', () => {
  it('summarises the sample project and says what is next', () => {
    const result = board(SAMPLE)!;
    assert.equal(result.project.key, 'PAW');
    assert.equal(result.sprints.find((s) => s.status === 'active')!.points, 10);
    assert.deepEqual(result.stories, { draft: 1, ready: 2, 'in-progress': 1, 'in-qa': 1, done: 2, blocked: 1, cancelled: 1 });
    assert.deepEqual(result.bugs, { open: 1, ids: ['PAW-12'], byPriority: { P0: 0, P1: 1, P2: 0, P3: 0 } });
    assert.ok(result.next[0]!.startsWith('/scrumo-qa PAW-6'));
    assert.match(statusCommand(SAMPLE, false).out, /Sprint 2 \(active\)/);
  });

  it('points at the first missing planning document in a new project', () => {
    const f = fresh(null);
    f.write('scrumo.yaml', 'schema_version: 1\ncli_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nskill_prefix: scrumo-\nteam: []\nignore: []\n');
    mkdirSync(f.path('docs'));
    assert.match(board(f.root)!.next[0]!, /^\/scrumo-kickoff/);
    newCommand('tracker', f.root, noOptions);
    assert.deepEqual(f.findings(), []);
  });
});

describe('sprint planning edits (what /scrumo-sprint plan does by hand)', () => {
  it('a new planned sprint validates once --fix has filled the generated tables', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-9', 'ready').code, 0);
    f.edit(TRACKER, '    completed: null\n---', '    completed: null\n  - number: 3\n    status: planned\n    goal: Owners can cancel.\n    start: 2026-10-12\n    end: 2026-10-23\n    capacity: 8\n    committed: null\n    completed: null\n---');
    f.edit(TRACKER, '## Sprint 2\n', '## Sprint 3\n\n### Stories\n\n### Review\n\n### Retro\n\n## Sprint 2\n');
    f.edit('docs/stories/PAW-9-cancel-appointment.md', 'sprint: null', 'sprint: 3');
    assert.ok(f.codes().includes('SCRUMO702'));
    fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.match(f.read(TRACKER), /<!-- scrumo:generated:sprint-3 -->[\s\S]*\| PAW-9 \| Cancel an appointment \| PAW-2 \| 2 \| ready \| - \|/);
  });
});

const sprint = (f: Fixture, sub: string, arg: string | undefined, o: Partial<Parameters<typeof sprintCommand>[3]> = {}) =>
  sprintCommand(sub, arg, f.root, { goal: undefined, capacity: undefined, start: undefined, end: undefined, stories: undefined, today: '2026-10-13', ...o });

describe('scrumo sprint', () => {
  it('closes a sprint, carries unfinished stories over, then plans and starts the next', () => {
    const f = fresh();
    assert.equal(sprint(f, 'close', '1').code, 1); // already closed
    const closed = sprint(f, 'close', '2');
    assert.equal(closed.code, 0, closed.out);
    assert.match(closed.out, /PAW-6 \(was in-qa\), PAW-7 \(was in-progress\), PAW-8 \(was ready\)/);
    assert.match(f.read(STORY6), /^status: ready$/m);
    assert.match(f.read(STORY6), /^assignee: null$/m);
    assert.match(f.read(STORY6), /^sprint: null$/m);
    assert.ok(f.codes().includes('SCRUMO409'), 'review and retro are still to be written');
    f.edit(TRACKER, '<!-- Filled at /scrumo-sprint close. -->', '- Nothing was accepted; everything carried over.');
    f.edit(TRACKER, '<!-- Filled at /scrumo-sprint close. -->', '- **Went well:** Test plans.\n- **To improve:** Estimates.\n- **Actions:**\n  - sam: re-estimate.');
    assert.deepEqual(f.findings(), []);

    const planned = sprint(f, 'plan', undefined, { goal: 'Finish booking.', capacity: '8', stories: 'PAW-7,PAW-8' });
    assert.equal(planned.code, 0, planned.out);
    assert.match(planned.out, /planned sprint 3: 2 stories, 8 of 8 points, 2026-10-19 to 2026-11-01/);
    assert.match(f.read(TRACKER), /^## Sprint 3$/m);
    assert.deepEqual(f.findings(), []);
    const started = sprint(f, 'start', '3');
    assert.equal(started.code, 0, started.out);
    assert.match(f.read(TRACKER), /status: active\n {4}goal: Finish booking\.[\s\S]*committed: 8/);
    assert.deepEqual(f.findings(), []);
  });

  it('rejects stories that are not ready and a second active sprint', () => {
    const f = fresh();
    assert.equal(sprint(f, 'plan', undefined, { goal: 'x', capacity: '5', stories: 'PAW-4' }).code, 1);
    assert.equal(sprint(f, 'plan', undefined, { goal: 'x', capacity: '5' }).code, 2);
    assert.equal(sprint(f, 'start', '2').code, 1);
    assert.equal(sprint(f, 'start', '9').code, 2);
  });

  it('creates the tracker as sprint 1 when the project has none', () => {
    const f = fresh();
    f.remove(TRACKER);
    for (const file of ['PAW-4-email-signup', 'PAW-5-login-logout', 'PAW-6-password-reset', 'PAW-7-open-slots', 'PAW-8-book-appointment']) {
      const rel = `docs/stories/${file}.md`;
      f.write(rel, f.read(rel).replace(/^sprint: \d+$/m, 'sprint: null'));
    }
    f.edit(STORY8, 'depends_on: [PAW-7]', 'depends_on: []');
    const planned = sprint(f, 'plan', undefined, { goal: 'First sprint.', capacity: '4', stories: 'PAW-8' });
    assert.equal(planned.code, 0, planned.out);
    assert.match(f.read(TRACKER), /^## Sprint 1$/m);
    assert.ok(!f.codes().includes('SCRUMO505'));
  });
});

describe('scrumo validate --fix with missing sections', () => {
  it('restores required sections that an edit dropped, empty and in order', () => {
    const f = fresh();
    f.edit(STORY8, '\n## Test Plan\n\n<!-- Written by /scrumo-qa, ideally while the story is ready. -->\n\n## Dev Record\n\n<!-- Filled by /scrumo-dev before moving to in-qa. -->\n\n## QA Record\n\n<!-- Filled by /scrumo-qa, one row per AC per round. -->\n', '');
    assert.ok(f.codes().includes('SCRUMO401'));
    fix(f.root, '2026-10-13');
    assert.deepEqual(f.findings(), []);
    assert.match(f.read(STORY8), /## Test Plan\n[\s\S]*## Dev Record\n[\s\S]*## QA Record\n/);
  });
});

describe('bugs and cancelled stories', () => {
  it('scrumo new bug creates a story of type bug linked to where it was found', () => {
    const f = fresh();
    const made = newCommand('bug', f.root, { ...noOptions, title: 'Booking page crashes on Mondays', foundIn: 'PAW-4', priority: 'P0' });
    assert.equal(made.code, 0, made.out);
    const text = f.read('docs/stories/PAW-13-booking-page-crashes-on-mondays.md');
    assert.match(text, /^type: bug$/m);
    assert.match(text, /^epic: PAW-1$/m, 'defaults to the epic of the story it was found in');
    assert.match(text, /^found_in: PAW-4$/m);
    assert.match(f.read(TRACKER), /\| PAW-13 \| Booking page crashes on Mondays \| PAW-1 \| P0 \| - \| draft \|/);
    assert.deepEqual(f.findings(), []);
    assert.equal(newCommand('bug', f.root, { ...noOptions, title: 'No origin' }).code, 2);
    assert.equal(newCommand('bug', f.root, { ...noOptions, title: 'Bad', foundIn: 'PAW-99' }).code, 1);
    assert.equal(newCommand('story', f.root, { ...noOptions, title: 'Not a bug', epic: 'PAW-1', foundIn: 'PAW-4' }).code, 2);
  });

  const STORY10 = 'docs/stories/PAW-10-appointment-reminder.md';

  it('cancelling needs a reason, and the story disappears from the backlog', () => {
    const f = fresh();
    assert.equal(move(f, 'PAW-10', 'cancelled').code, 2);
    const done = move(f, 'PAW-10', 'cancelled', { reason: 'Email reminders are out of scope' });
    assert.equal(done.code, 0, done.out);
    assert.match(f.read(STORY10), /^status: cancelled$/m);
    assert.match(f.read(STORY10), /^reason: "Email reminders are out of scope"$/m);
    const backlog = /<!-- scrumo:generated:backlog -->[\s\S]*?<!-- scrumo:end -->/.exec(f.read(TRACKER))![0];
    assert.ok(!backlog.includes('PAW-10'));
    assert.deepEqual(f.findings(), []);
    const back = move(f, 'PAW-10', 'draft');
    assert.equal(back.code, 0, back.out);
    assert.match(f.read(STORY10), /^reason: null$/m);
  });

  it('cancelling a committed story takes it out of its sprint, but not while others depend on it', () => {
    const f = fresh();
    const blocked = move(f, 'PAW-8', 'cancelled', { reason: 'Replaced' });
    assert.equal(blocked.code, 1);
    assert.match(blocked.out, /SCRUMO614/); // PAW-9 and PAW-10 depend on PAW-8
    assert.match(f.read(STORY8), /^status: ready$/m);
    assert.equal(move(f, 'PAW-7', 'cancelled', { reason: 'x' }).code, 1); // in-progress cannot be cancelled
  });
});

describe('scrumo impact', () => {
  it('lists the epics and stories a requirement touches', () => {
    const found = impact(SAMPLE, 'FR-004')!;
    assert.equal(found.kind, 'functional requirement');
    assert.deepEqual(found.epics.map((e) => e.id), ['PAW-2']);
    assert.deepEqual(found.stories.map((s) => s.id), ['PAW-7', 'PAW-8', 'PAW-9', 'PAW-10', 'PAW-11']);
    assert.equal(found.stories.find((s) => s.id === 'PAW-7')!.assignee, 'alex');
  });

  it('follows architecture decisions, NFRs, and ticket links', () => {
    assert.deepEqual(impact(SAMPLE, 'AD-002')!.stories.map((s) => s.id), ['PAW-7', 'PAW-8']);
    assert.match(impact(SAMPLE, 'NFR-001')!.notes.join(' '), /Architecture approach/);
    const story = impact(SAMPLE, 'PAW-4')!;
    assert.deepEqual(story.stories.map((s) => s.id), ['PAW-5', 'PAW-12']);
    assert.match(story.notes.join(' '), /Bugs found in it: PAW-12/);
    assert.equal(impact(SAMPLE, 'PAW-12')!.kind, 'bug');
    assert.equal(impact(SAMPLE, 'FR-999'), undefined);
  });

  it('prints text and JSON', () => {
    assert.match(impactCommand('FR-004', SAMPLE, false).out, /PAW-7 {2}in-progress, sprint 2, alex/);
    assert.equal(JSON.parse(impactCommand('PAW-1', SAMPLE, true).out).kind, 'epic');
    assert.equal(impactCommand('PAW-99', SAMPLE, false).code, 1);
  });
});

describe('scrumo status at a glance', () => {
  // Sprint 2 in the sample project runs Monday 2026-09-28 to Friday 2026-10-09: 10 working days.
  it('counts working days, skipping weekends', () => {
    assert.equal(workdays('2026-09-28', '2026-10-09'), 10);
    assert.equal(workdays('2026-10-03', '2026-10-04'), 0);
    assert.equal(workdays('2026-10-02', '2026-10-05'), 2);
  });

  it('compares progress with the calendar', () => {
    const sprintAt = (today: string) => board(SAMPLE, today)!.sprints.find((s) => s.status === 'active')!;
    assert.deepEqual(sprintAt('2026-10-02').days, { total: 10, elapsed: 5, left: 5 });
    assert.equal(sprintAt('2026-10-02').pace!.expectedPct, 50);
    assert.equal(sprintAt('2026-10-02').pace!.actualPct, 0);
    assert.equal(sprintAt('2026-10-02').pace!.verdict, 'at risk');
    assert.equal(sprintAt('2026-09-27').pace!.verdict, 'not started');
    assert.equal(sprintAt('2026-10-12').pace!.verdict, 'overdue');
    assert.equal(sprintAt('2026-10-12').days!.left, 0);
  });

  it('shows who has what, blockers, and what needs attention', () => {
    const b = board(SAMPLE, '2026-10-07')!;
    const sprint = b.sprints.find((s) => s.status === 'active')!;
    assert.deepEqual(sprint.people.map((p) => [p.name, p.stories, p.points, p.capacity]), [['alex', 1, 5, 5], ['sam', 1, 2, 4], ['jo', 0, 0, null], ['unassigned', 1, 3, null]]);
    assert.ok(b.attention.some((a) => /Sprint 2 is at risk/.test(a)));
    assert.ok(b.attention.some((a) => /P1 bug PAW-12 is not in the active sprint/.test(a)));
    assert.ok(b.attention.some((a) => /PAW-9 is blocked: The clinic/.test(a)));
    assert.deepEqual(b.requirements, { total: 7, covered: 7, uncovered: [] });
    assert.deepEqual(b.velocity, { history: [6], average: 6, readySprints: 0.2 });
    assert.deepEqual(b.epicProgress.map((e) => [e.id, e.doneStories, e.stories]), [['PAW-1', 2, 4], ['PAW-2', 0, 4], ['PAW-3', 0, 0]]);
    assert.deepEqual(b.bugs.byPriority, { P0: 0, P1: 1, P2: 0, P3: 0 });
  });

  it('reports validation health in the headline and as an attention item', () => {
    const f = fresh();
    f.edit(STORY8, '(AC-3)', '(AC-1)');
    const out = statusCommand(f.root, false, 'all', '2026-10-07').out;
    assert.match(out.split('\n')[0]!, /✖ 1 validation error/);
    assert.match(out, /! 1 validation error: run scrumo validate/);
  });

  it('can show only the sprint or only the project', () => {
    const sprintOnly = statusCommand(SAMPLE, false, 'sprint', '2026-10-07').out;
    assert.match(sprintOnly, /Progress {2}░+ 0 of 10 committed points done/);
    assert.doesNotMatch(sprintOnly, /Epics:/);
    const projectOnly = statusCommand(SAMPLE, false, 'project', '2026-10-07').out;
    assert.match(projectOnly, /Epics:\n {2}PAW-1 {2}█+░* 2\/4 stories/);
    assert.doesNotMatch(projectOnly, /Progress/);
    assert.deepEqual(Object.keys(JSON.parse(statusCommand(SAMPLE, true, 'all', '2026-10-07').out)).slice(0, 3), ['project', 'documents', 'epics']);
  });

  it('a closed sprint and an empty project still read sensibly', () => {
    const f = fresh();
    sprintCommand('close', '2', f.root, { goal: undefined, capacity: undefined, start: undefined, end: undefined, stories: undefined, today: '2026-10-13' });
    const out = statusCommand(f.root, false, 'all', '2026-10-13').out;
    assert.match(out, /Velocity: 6, 0 /);
    const none = fresh(null);
    none.write('scrumo.yaml', 'schema_version: 1\ncli_version: 0.1.0\nproject:\n  name: Demo\n  key: DEMO\ndocs_dir: docs\nsprint:\n  length_days: 14\n  start_weekday: monday\nagents: [claude]\nskill_prefix: scrumo-\nteam: []\nignore: []\n');
    mkdirSync(none.path('docs'));
    const empty = statusCommand(none.root, false, 'all', '2026-10-13').out;
    assert.match(empty, /No sprints yet\./);
    assert.match(empty, /Velocity: no closed sprints yet/);
  });
});
