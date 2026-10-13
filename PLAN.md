# scrumo: Plan

A small, opinionated set of agent skills and a validator for agile engineering
teams. A team of people and their agents works from the first idea to the last
sprint through shared, strictly structured Markdown in the repository:
spec-driven development, with every document reviewed in git like code. It
works with any model and any agent: the skills follow the open Agent Skills
format (`SKILL.md`), and a deterministic CLI enforces structure.

It is built for several people (and their agents) working together, not for one
developer running the whole loop alone. That shows in the design: every story
has an assignee, ticket numbers are checked so two branches can't reuse one,
the roles are separate (analyst, architect, product owner, scrum master,
developer, QA), and the shared state is plain files that merge and review like
code.

Think of it as BMAD with less: fewer roles, fewer files, one schema per
artifact, and a validator that fails loudly.

The product and CLI are called `scrumo`, and the name is deliberately easy to
change: it lives in `spec/brand.yaml`, and `npm run rename -- <name>` rewrites
it everywhere (section 10). The GitHub repository is still `nuwannnz/n-skills`.

## 1. Design principles

1. **Structure is owned by code. Content is owned by the agent.** Skills never
   hand-write a file skeleton. They call `scrumo new <type>` to create a file from
   the schema, then fill it in. The CLI assigns IDs, frontmatter, and headings.
2. **Validation is deterministic.** No LLM decides whether a file is valid. The
   `scrumo validate` CLI does, and `/scrumo-validate` is a thin skill that runs it and
   fixes whatever it reports.
3. **One source of truth per fact.** A story's status lives only in that
   story's frontmatter. The sprint tracker's tables are generated from story
   frontmatter, and the validator fails when they go stale.
4. **Every skill ends with validation.** Each skill's last step runs
   `scrumo validate` and loops until it passes. Validation also runs in a
   pre-commit hook and in CI, so it doesn't depend on any one agent's hook
   system.
5. **The role is an expert, and the skill is short.** Each `SKILL.md` covers
   the persona, inputs, procedure, quality bar, and hand-off in roughly 150
   lines or less. Long templates are not embedded in skills, because
   `scrumo schema <type>` prints the spec on demand.
6. **Specs drive the work, and every link is traceable.** Code exists because a
   story asks for it, a story exists because an epic covers a requirement, and
   a requirement exists because the PRD states it. The chain
   `FR-001 → ACME-1 (epic) → ACME-4 (story) → AC-1 → test` is recorded in the
   files and checked by the validator, so nothing is built without a spec and
   no spec is silently left unbuilt.
7. **Nothing outside the agent-skills standard.** Frontmatter is `name` and
   `description` only. Skills don't rely on vendor-specific tools, so they run
   in Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, and similar
   agents.

## 2. Managed project layout (inside a target project)

```text
scrumo.yaml                    # project config (repo root)
docs/                       # managed root (configurable in scrumo.yaml)
├── brief.md                # raw idea, goals, constraints (from /scrumo-kickoff)
├── prd.md
├── architecture.md
├── coding-standards.md
├── sprint-tracker.md
├── epics/
│   └── ACME-1-user-accounts.md
└── stories/
    └── ACME-4-email-signup.md
```

### Ticket IDs

IDs work like Jira tickets:

- `/scrumo-kickoff` asks for a **project key**: 2 to 10 characters, uppercase letters
  and digits, starting with a letter (`ACME`, `PAW`, `HR2`).
- Epics and stories share **one counter**, so every ticket in the project has a
  unique number: `ACME-1` might be an epic and `ACME-2` its first story.
- The story's epic is recorded in its `epic:` field and shown next to it in
  every table (epic lists, sprint tables, the backlog). It is not part of the
  ID, so moving a story to another epic never renames it.
- `scrumo new` assigns the next number by scanning existing tickets. Numbers are
  never reused while the ticket exists, and the validator rejects duplicates,
  which can appear when two branches each create a ticket.

The layout is strict:

- Any file or folder in `docs/` that isn't listed above is an error, unless it
  matches `ignore` in `scrumo.yaml`.
- Epic and story file names must match `^<KEY>-\d+-[a-z0-9-]+\.md$`, where
  `<KEY>` is the project key from `scrumo.yaml`.
- The ID in a file name must equal the `id` in its frontmatter.

`scrumo.yaml` looks like this:

```yaml
schema_version: 1
cli_version: 0.1.0               # the scrumo that last installed the skills
project:
  name: Acme Portal
  key: ACME
docs_dir: docs
sprint:
  length_days: 14
  start_weekday: monday
agents: [claude, codex, cursor]   # where skills are installed
skill_prefix: scrumo-                  # /scrumo-prd; must end with a hyphen
ignore: []
```

## 3. Artifacts and schemas

Every artifact has:

- YAML frontmatter, validated against a JSON schema and kept in a fixed key
  order.
- Exactly one H1, equal to the frontmatter `title`.
- A fixed, ordered list of H2 sections, each marked required or optional.
  Unknown H2 headings are errors.
- Section-level rules, such as "must contain a table with columns X, Y, Z",
  "list items must match a regex", or "no placeholders once approved".

The schemas live in `spec/schemas/*.yaml` and are the single contract. The
validator, `scrumo new`, and `scrumo schema` all read them.

### Planning documents

`brief.md`, `prd.md`, `architecture.md`, and `coding-standards.md` each use
`status: draft | approved`, a `version` (semver), and an `updated` date.

| Artifact | Required H2 sections (in order) | Notes |
| --- | --- | --- |
| `brief.md` | Idea, Problem, Target Users, Goals, Constraints, Raw Input | Raw Input keeps the user's original words verbatim. |
| `prd.md` | Overview, Goals, Non-Goals, Personas, Functional Requirements, Non-Functional Requirements, Assumptions, Risks, Open Questions, Changelog | Requirements go in tables with IDs `FR-001` and `NFR-001`. Open Questions must be empty before approval. |
| `architecture.md` | Context, Tech Stack, Components, Data Model, Interfaces, Decisions, NFR Mapping, Deployment, Risks, Changelog | Decisions use IDs `AD-001` with context, decision, and consequences. NFR Mapping must cover every NFR. |
| `coding-standards.md` | Stack & Versions, Project Structure, Naming, Formatting & Linting, Testing, Error Handling & Logging, Security, Git Workflow, Definition of Done | Definition of Done is a checklist that the `/scrumo-dev` and `/scrumo-qa` skills apply. |

### Epic

`docs/epics/ACME-1-*.md` has this frontmatter:

```yaml
id: ACME-1
title: User accounts
status: draft        # draft | ready | in-progress | done
priority: P1         # P0..P3, orders epics in the backlog
requirements: [FR-001, FR-002]
created: 2026-10-09
updated: 2026-10-09
```

Its sections are Goal, Scope, Out of Scope, Requirements Coverage, Stories (a
generated list), and Risks.

### Story

`docs/stories/ACME-4-*.md` has this frontmatter:

```yaml
id: ACME-4
title: Sign up with email
epic: ACME-1
status: draft        # draft | ready | in-progress | in-qa | done | blocked
priority: P1         # P0..P3
points: 3            # 1 2 3 5 8 13
sprint: null         # integer once planned
assignee: null
blocked_reason: null
created: 2026-10-09
updated: 2026-10-09
```

Its sections are:

- **Story:** As a / I want / so that.
- **Acceptance Criteria:** `AC-1 … AC-n`, written as Given/When/Then.
- **Technical Notes**
- **Tasks:** a checkbox list.
- **Test Plan:** written by QA.
- **Dev Record:** files changed, tests added, notes.
- **QA Record:** a table with the columns AC, Result, Evidence.

### Sprint tracker

`docs/sprint-tracker.md` is the team board. It lists every sprint, the stories
in each one and their current status, plus the backlog that sprint planning
draws from.

Sprint facts (number, status, goal, dates, capacity) live in the frontmatter as
a `sprints:` list, so they're easy to check. Status is
`planned | active | closed`, and at most one sprint is active.

The body is mostly generated from story and epic frontmatter:

| Section | Content | Who writes it |
| --- | --- | --- |
| `## Overview` | One row per sprint: status, dates, goal, committed points, completed points, capacity. | Generated |
| `## Backlog` | Every story not in a sprint, ordered by priority, with its epic, points and status. Ready stories are what `/scrumo-sprint plan` picks from. | Generated |
| `## Sprint N` | One per sprint, newest first. | Mixed |
| `### Stories` | ID, title, epic, points, status, assignee. | Generated |
| `### Review` | What was demoed and accepted. Required once closed. | `/scrumo-sprint close` |
| `### Retro` | Went well, to improve, actions. Required once closed. | `/scrumo-sprint close` |

Generated blocks sit between `<!-- scrumo:generated:<name> -->` and
`<!-- scrumo:end -->` markers. `scrumo validate --fix` rewrites them, and the
validator fails if they're stale. Stories join a sprint only through their own
`sprint:` field, so the tracker never holds story status by hand.

Sprint planning (`/scrumo-sprint plan`) works like a real planning meeting:

1. Work out capacity: the last 3 sprints' average velocity, adjusted for
   availability, or a team-provided number for the first sprint.
2. Agree a sprint goal.
3. Pull `ready` stories from the top of the backlog until capacity is reached,
   checking dependencies.
4. Record the sprint as `planned` and set each story's `sprint:`.

The validator warns when committed points exceed capacity and errors when a
sprint contains a story that wasn't `ready` when it was planned.

### Status gates (validator-enforced invariants)

| Story status | Must be true |
| --- | --- |
| `ready` | Has at least 1 AC in Given/When/Then form. Every task names the AC IDs it serves. Points are set. No placeholders in Story, AC, or Tasks. Parent epic is not draft. `architecture.md` and `coding-standards.md` are approved. |
| `in-progress` | `sprint` is set and that sprint is `active`. `assignee` is set. |
| `in-qa` | All tasks are checked. Dev Record lists the changed files and tests. |
| `done` | QA Record has a row for every AC, and every row is `PASS`. |
| `blocked` | `blocked_reason` is set. |

Epics and documents have gates too:

- An epic can't be `ready` unless `prd.md` is approved.
- An epic can be `done` only when all of its stories are done.
- A document can't be `approved` while it contains placeholders or open
  questions.

`scrumo move <id> <status>` additionally checks that the transition itself is
legal, for example `draft → in-qa` is rejected. It also stamps `updated`.

## 4. The CLI: `scrumo`

The CLI is written in TypeScript and published as compiled ESM JavaScript for
Node 20 or later. It has two runtime dependencies: `markdownlint` (formatting
and lint rules) and `yaml`. Frontmatter is checked against the schema's own
field definitions, so there's no need for a JSON Schema library.

| Command | Purpose |
| --- | --- |
| `scrumo init --key KEY [--name N] [--agents …] [--prefix p-] [--hooks] [--ci]` | Creates `scrumo.yaml`, the `docs/` skeleton, and an AGENTS.md section, then installs the skills. Works for both new and existing repos, and re-running it is safe. |
| `scrumo install [--agents …] [--prefix p-]` | Copies the skills into the fewest skills directories that cover the chosen agents. |
| `scrumo update [--force]` | Re-syncs installed skills from the package version, using a manifest so local edits are detected and not overwritten. |
| `scrumo new prd\|architecture\|standards\|epic\|story …` | Creates an artifact from its schema and allocates the next ID. |
| `scrumo schema <type>` | Prints the spec (frontmatter fields, sections, rules) for an agent to read. |
| `scrumo validate [--fix] [--json] [path]` | Runs every check (section 5). `--fix` applies the deterministic fixes. |
| `scrumo move <id> <status>` | Changes status with transition and gate checks. |
| `scrumo status [--json]` | Shows a board summary: the current sprint, counts by status, and what's next. |
| `scrumo sprint plan\|start\|close` | The mechanical parts of a sprint: adds the sprint and its section, commits stories, activates it and starts its epics, then records velocity, carries unfinished stories back to the backlog, and closes finished epics. The agent supplies the goal, capacity, stories, Review, and Retro. |

The installer's agent-to-directory map is data in `spec/agents.yaml`, so adding
an agent is a one-line change. Starting targets:

- `.claude/skills/` (Claude Code)
- `.agents/skills/` (Codex and other agents that read the shared location)
- `.cursor/skills/`
- `.gemini/skills/`
- `.github/skills/` (Copilot)

Each path was checked against the agent's documentation on 2026-10-13; the sources are in `spec/agents.yaml`.

## 5. Validation

Checks run in this order and produce stable rule codes:

| Code | Category | Examples |
| --- | --- | --- |
| `SCRUMO1xx` | Layout | Unknown file or folder, bad file name, ID doesn't match file name. |
| `SCRUMO2xx` | Markdown format | ATX headings, `-` bullets, fenced code with a language, one H1, no trailing spaces, final newline, well-formed tables (markdownlint, shipped config). |
| `SCRUMO3xx` | Frontmatter | Missing or unknown keys, wrong types or enums, key order, ISO dates. |
| `SCRUMO4xx` | Sections | Missing, out of order, or unknown H2. Required table columns. Item regexes. Placeholders (`TODO`, `TBD`, `<…>`) past draft. |
| `SCRUMO5xx` | References | Story's epic exists. Epic's requirements exist in the PRD. Every FR is covered by some epic (warning). Sprint exists. AC IDs are unique. Duplicate IDs. |
| `SCRUMO6xx` | Gates | The status invariants in section 3. |
| `SCRUMO7xx` | Generated content | Tracker tables or epic story lists are stale (`--fix` regenerates them). |

`--fix` only does safe, mechanical work: formatting, frontmatter key order,
regenerated blocks, and `updated` stamps. Anything that needs judgment is
reported for the agent to fix.

Output looks like this:

```text
docs/stories/ACME-5-login.md
  SCRUMO402  missing required section "## Acceptance Criteria" (after "## Story")
  SCRUMO601  status "in-qa" requires all tasks checked (2 of 5 unchecked)
✖ 2 errors, 0 warnings in 1 file
```

`--json` emits the same findings as machine-readable output, so the
`/scrumo-validate` skill can loop on it.

Validation is enforced in four places:

1. Every skill's exit step.
2. A rule in the project's AGENTS.md that any edit under `docs/` must be
   followed by `scrumo validate`.
3. A pre-commit hook, installed optionally by `scrumo init`.
4. A GitHub Actions workflow template.

Agents that support hooks, such as Claude Code, can also get an optional
post-edit hook.

## 6. Skills

There are 10 skills. Each one is a folder: `skills/<name>/SKILL.md`, plus an
optional `checklist.md`.

| Skill | Expert persona | Reads | Writes | Key behaviors |
| --- | --- | --- | --- | --- |
| `/scrumo-kickoff` | Product strategist | User input | `scrumo.yaml`, `brief.md` | Captures the idea and constraints, keeps the raw input verbatim, asks at most 5 sharp questions, and runs `scrumo init` if needed. |
| `/scrumo-prd` | Senior business analyst | brief, prd | `prd.md` | Elicits requirements in rounds, never invents them (unverified items go in Assumptions), and assigns FR/NFR IDs. Change mode bumps the version, adds a Changelog entry, and flags affected epics and stories. |
| `/scrumo-architecture` | Principal architect | prd | `architecture.md` | Proposes 1 or 2 options for each major decision with trade-offs and records the choice as `AD-xxx`. Maps every NFR. |
| `/scrumo-standards` | Staff engineer / tech lead | architecture | `coding-standards.md` | Turns the stack into concrete, checkable rules and defines the Definition of Done. |
| `/scrumo-epics` | Product owner | prd, architecture | `epics/*` | Slices the work into value-based epics, ensures full FR coverage, and orders them. |
| `/scrumo-stories` | Agile coach / PO | epic, architecture, standards | `stories/*` | Writes INVEST stories with Given/When/Then ACs and estimates, checks the Definition of Ready, and moves stories to `ready`. |
| `/scrumo-sprint` | Scrum master | tracker, stories | `sprint-tracker.md`, story `sprint` field | Has four sub-flows: `plan` (capacity, then select from ready stories), `start`, `close` (velocity and retro), and `status`. |
| `/scrumo-dev` | Senior developer | story, architecture, standards | Code, story Dev Record | Picks or receives a story, moves it to in-progress, works through the tasks test-first, self-reviews against the Definition of Done, then moves it to in-qa. |
| `/scrumo-qa` | QA engineer | story, standards | Story Test Plan and QA Record, tests | Writes the test plan (ideally at ready), verifies every AC with evidence, and either passes the story (done) or fails it back to in-progress with defects noted. |
| `/scrumo-validate` | Release gatekeeper | Everything under `docs/` | Fixes | Runs `scrumo validate --fix --json` and fixes what remains until it is clean (a maximum of N rounds, then it reports). |

Every `SKILL.md` uses the same section skeleton, which the repo's own CI
lints:

```markdown
---
name: prd
description: Senior business analyst. Create or update docs/prd.md from the brief ... Use when ...
---
# PRD
## Role
## When to use
## Inputs
## Outputs
## Procedure
## Quality bar
## Hand-off
## Exit: validate
```

**Exit: validate** is identical in every skill. It runs
`npx scrumo validate --fix`, fixes any remaining errors, re-runs, and repeats
until the run is clean. It then reports what changed and the suggested next
skill.

Skill names carry an `scrumo-` prefix (`/scrumo-prd`, `/scrumo-sprint`), so they never clash
with a project's own skills or Claude Code's built-in commands (for example
`/init`). The prefix is part of each skill's folder name, its `name:` field, and
every cross-reference between skills. When `scrumo install` gets a `--prefix`
option (phase 4), it renames all three together.

The end-to-end flow:

```text
/scrumo-kickoff → /scrumo-prd → /scrumo-architecture → /scrumo-standards → /scrumo-epics → /scrumo-stories
        → /scrumo-sprint plan → /scrumo-sprint start → (/scrumo-dev ⇄ /scrumo-qa)* → /scrumo-sprint close
(/scrumo-validate runs after every step; /scrumo-prd change mode handles scope changes)
```

## 7. Distribution

Three install paths cover both "add to an existing project" and "start a new
project":

1. **npm package `scrumo`.** In an existing project, run
   `npx scrumo init --key ACME --agents claude,codex`. It writes
   `scrumo.yaml`, scaffolds `docs/`, installs the skills, and adds the workflow
   rules to AGENTS.md (and CLAUDE.md for Claude Code). It prints the
   `npm install --save-dev` command for the CLI rather than running it.
2. **GitHub template repo** (`scrumo-starter`), already initialized, for
   new projects.
3. **Plain Agent Skills layout.** The `skills/<name>/SKILL.md` structure works
   with generic skill installers such as `npx skills add nuwannnz/n-skills`.
   With this path you still need the CLI installed for validation. Every skill
   starts with a shared "Prerequisite: the scrumo CLI" section: it checks for
   `node_modules/.bin/scrumo` and, if it is missing, tells the user to install it
   instead of running `npx scrumo`. Without a local copy, `npx` would download
   whatever package the registry serves under that name, so the skills check
   for the local binary first. The package name equals the command, so once the
   package is published `npx scrumo` can only fetch this one.

Skills and the CLI are versioned together. `scrumo.yaml` records the version, and
`scrumo validate` warns (`SCRUMO106`) when it differs from the running CLI.

How the installer places skills:

- **Fewest folders.** Cursor, Gemini CLI, and Copilot also scan `.agents/skills`
  (Cursor and Copilot also `.claude/skills`). `spec/agents.yaml` records what
  each agent reads, and the installer picks the smallest set of folders that
  covers every selected agent, so a skill never shows up twice. Claude, Codex,
  and Cursor together need only `.claude/skills` and `.agents/skills`.
- **Manifest.** `.scrumo/manifest.json` (commit it) records a hash of every file
  installed. `scrumo update` overwrites a file only if it still matches its hash,
  reports locally edited files and leaves them, and removes files a newer
  package no longer ships. `--force` overrides.
- **Prefix.** `--prefix acme-` renames every skill folder, `name:` field, and
  cross-reference at install time, and `scrumo update` keeps it from `scrumo.yaml`.
- **Optional extras.** `--hooks` writes a `.git/hooks/pre-commit` that runs
  `scrumo validate` when docs change, and `--ci` writes
  `.github/workflows/scrumo-validate.yml`.

## 8. Repository layout (this repo)

```text
scrumo/
├── package.json            # bin: scrumo → dist/cli.js
├── tsconfig.json
├── src/
│   ├── cli/                # init, install, update, new, schema, validate, move, status
│   ├── validate/           # layout, markdown, frontmatter, sections, refs, gates, generated
│   └── spec/               # loads and type-checks the schemas and rule catalogue
├── spec/
│   ├── schemas/            # brief, prd, architecture, standards, epic, story, tracker, config
│   ├── rules.yaml          # every rule code, severity, and whether --fix handles it
│   ├── agents.yaml         # agent → skills dir map
│   └── markdownlint.json   # shipped lint config
├── skills/                 # the 10 skills (source of truth)
├── templates/              # AGENTS.md snippet, pre-commit, CI workflow
├── test/
│   ├── unit/               # node:test, run against the .ts sources
│   └── fixtures/           # valid/ and invalid/ projects, one per rule code
├── examples/sample-project/  # fully worked, valid docs/ (also a regression fixture)
├── .github/workflows/ci.yml
└── README.md, AGENTS.md
```

## 9. Phased delivery

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Spec** | Write all schemas (section 3) and the rule catalogue (section 5) as `spec/schemas/*.yaml`, plus a hand-written `examples/sample-project`. | The schemas and the example agree, and you have reviewed them. |
| **1. Validator** | `scrumo validate` (+`--fix`, `--json`), `scrumo schema`, and `scrumo new`. Fixtures for every rule code. | Every invalid fixture fails with the expected code, and the sample project passes. |
| **2. Planning skills** | `/scrumo-validate`, `/scrumo-kickoff`, `/scrumo-prd`, `/scrumo-architecture`, `/scrumo-standards`, `/scrumo-epics`, `/scrumo-stories`. | A dry run from a one-paragraph idea to ready stories passes validation in at least 2 different agents. |
| **3. Delivery skills** | `scrumo move`, `scrumo status`, tracker generation, `/scrumo-sprint`, `/scrumo-dev`, `/scrumo-qa`. | One full sprint, from plan to close with dev and QA, runs on the sample project. |
| **4. Distribution** | `scrumo init`, `install`, `update`, the `--prefix` option, the agent map, the AGENTS.md snippet, pre-commit and CI templates, the starter template repo, and the npm publish workflow. | A fresh repo and an existing repo can each be set up with one command for Claude Code, Codex, and Cursor. |
| **5. Dogfood & trim** | Run it on a real small project and cut anything the skills or CLI didn't actually need. | The `SKILL.md` files stay at or under ~150 lines, and you are happy with the workflow. |

Status: phases 0 and 1 are done. The phase 2 and 3 skills (all 10) and the
`scrumo move`, `scrumo status`, `scrumo sprint`, and `scrumo new tracker` commands are
built and linted. A fresh agent dry-ran the whole flow on a toy project (idea
to a closed sprint with a failed-then-passed QA round and a carry-over) using
only the `SKILL.md` files, and the friction it found was fixed.

Phase 4 is built except for the outward-facing parts: `scrumo init`, `install`,
`update`, `--prefix`, the verified agent map, the AGENTS.md block, the
pre-commit and CI templates, this repository's CI, and the publish workflow.
Left to the owner: creating the `scrumo-starter` template repo (run
`scrumo init` in an empty repo and commit the result), and publishing (the name is settled).

The "done when" runs that remain: the idea-to-ready-stories flow in at least 2
different agents (now one `npx scrumo init` away), and a full sprint on the sample
project.

### Planned additions

Skills to add after the first 10 have been dogfooded:

| Skill | Why |
| --- | --- |
| `/scrumo-change` | Change requests to an approved PRD or architecture. Today `/scrumo-prd` and `/scrumo-architecture` have a change mode. A dedicated skill would also work out the ripple through epics and stories, and re-open the affected ones. |
| `/scrumo-refine` | Backlog grooming: estimating, splitting 13-point stories, adding dependencies, and moving stories to `ready`. Today this is split between `/scrumo-stories` and `/scrumo-sprint plan`. |

## 10. Decisions

Confirmed:

1. **CLI runtime: Node with TypeScript.** Go was considered. It would give a
   single binary and no Node requirement in target projects, but the Markdown
   tooling the validator relies on (markdownlint and its rule set) only exists
   in JavaScript, and `npx` is the simplest install path for skills users. If
   a Node-free install matters later, the CLI can be packaged as a standalone
   executable without a rewrite.
2. **Ticket IDs: Jira-style `<KEY>-<n>`** with one counter shared by epics and
   stories. The project key is asked for during `/scrumo-kickoff`. See section 2.
3. **Sprint tracker: one `sprint-tracker.md`** that lists every sprint with
   its stories and their status, plus the backlog, and supports sprint
   planning. See section 3.
4. **Story statuses:** `draft, ready, in-progress, in-qa, done, blocked`.
5. **Managed root: `docs/`**, configurable in `scrumo.yaml`.
6. **First agents to support:** Claude Code, Codex, and Cursor, then Gemini
   CLI and Copilot.
7. **Skill prefix: `scrumo-`.** Skills are `/scrumo-prd`, `/scrumo-sprint`, and so on. See
   section 6.

8. **Product name: `scrumo`, kept in one place.** The name, the package, and
   everything derived from them live in `spec/brand.yaml`:

   | Where the name appears | Example |
   | --- | --- |
   | CLI command and bin | `scrumo validate` |
   | npm package | `scrumo` |
   | Project config file | `scrumo.yaml` |
   | State folder | `.scrumo/manifest.json` |
   | Generated-block markers | `<!-- scrumo:generated:overview -->` |
   | Rule codes | `SCRUMO101` |
   | Skill prefix and folders | `/scrumo-prd`, `skills/scrumo-prd/` |
   | Generated workflow | `.github/workflows/scrumo-validate.yml` |

   Because most short names already belong to similar products, renaming is a
   supported operation: `npm run rename -- <new-name> [--package @scope/new-name]`
   rewrites every file and renames the paths above, `--dry-run` previews it, and
   a test proves renaming and renaming back restores every file byte for byte.
   Pick names of 2 to 12 lowercase letters or digits. The script replaces the
   old name wherever it appears as a whole word, so avoid a new name that is also
   an ordinary word the docs use.

   Why `scrumo`: it is short, says "scrum" at once, and is easy to say and
   spell. It is a coined word, because every short real word was already taken
   on npm. Checked 2026-10-13: free on npm, PyPI, and crates.io, with no
   look-alike packages in an npm search, so the package is unscoped and
   `npx scrumo` resolves to this package. A GitHub user named `scrumo` exists
   (it doesn't matter while the repository lives under `nuwannnz`), and
   `scrumo.dev` and `scrumo.io` don't resolve, though that isn't a registration
   check. Names considered and dropped: `faber` (crowded by `@fractary/faber`
   and a terminal coding agent of the same name), `ver` (taken on npm by a
   version bumper that installs a command of the same name, and a built-in
   command in Windows `cmd.exe`), `agilecrew`, the Latin names, and several
   compound names. Domains and trademarks haven't been checked.

### Renaming the product

After `npm run rename`, review `git diff`, run `npm run check`, and publish under
the new package name. A project already set up with the old name keeps files the
old CLI wrote: the `<old>.yaml` config, the `.<old>/` manifest, the
`<old>:generated` markers, and the `OLD###` codes in anything that quotes them.
Renaming the product is a format change for those projects: run the rename
script on their `docs/` and config too (it works on any folder of text files
once you copy it there), or rename them by hand. Do it before the first release
if you can.
