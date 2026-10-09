# n-skills: Plan

A small, opinionated set of agent skills that lets an agent work the way a real
software team does, from the first idea to the last sprint, using spec-driven
development. Every piece of project state is kept in strictly structured
Markdown. It works with any model and any agent: the skills follow the open
Agent Skills format (`SKILL.md`), and a deterministic CLI enforces structure.

Think of it as BMAD with less: fewer roles, fewer files, one schema per
artifact, and a validator that fails loudly.

`n-skills` and `nsk` are working names. Section 10 lists candidates for the
final name.

## 1. Design principles

1. **Structure is owned by code. Content is owned by the agent.** Skills never
   hand-write a file skeleton. They call `nsk new <type>` to create a file from
   the schema, then fill it in. The CLI assigns IDs, frontmatter, and headings.
2. **Validation is deterministic.** No LLM decides whether a file is valid. The
   `nsk validate` CLI does, and `/validate` is a thin skill that runs it and
   fixes whatever it reports.
3. **One source of truth per fact.** A story's status lives only in that
   story's frontmatter. The sprint tracker's tables are generated from story
   frontmatter, and the validator fails when they go stale.
4. **Every skill ends with validation.** Each skill's last step runs
   `nsk validate` and loops until it passes. Validation also runs in a
   pre-commit hook and in CI, so it doesn't depend on any one agent's hook
   system.
5. **The role is an expert, and the skill is short.** Each `SKILL.md` covers
   the persona, inputs, procedure, quality bar, and hand-off in roughly 150
   lines or less. Long templates are not embedded in skills, because
   `nsk schema <type>` prints the spec on demand.
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
nsk.yaml                    # project config (repo root)
docs/                       # managed root (configurable in nsk.yaml)
├── brief.md                # raw idea, goals, constraints (from /kickoff)
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

- `/kickoff` asks for a **project key**: 2 to 10 characters, uppercase letters
  and digits, starting with a letter (`ACME`, `PAW`, `HR2`).
- Epics and stories share **one counter**, so every ticket in the project has a
  unique number: `ACME-1` might be an epic and `ACME-2` its first story.
- The story's epic is recorded in its `epic:` field and shown next to it in
  every table (epic lists, sprint tables, the backlog). It is not part of the
  ID, so moving a story to another epic never renames it.
- `nsk new` assigns the next number by scanning existing tickets. Numbers are
  never reused while the ticket exists, and the validator rejects duplicates,
  which can appear when two branches each create a ticket.

The layout is strict:

- Any file or folder in `docs/` that isn't listed above is an error, unless it
  matches `ignore` in `nsk.yaml`.
- Epic and story file names must match `^<KEY>-\d+-[a-z0-9-]+\.md$`, where
  `<KEY>` is the project key from `nsk.yaml`.
- The ID in a file name must equal the `id` in its frontmatter.

`nsk.yaml` looks like this:

```yaml
schema_version: 1
project:
  name: Acme Portal
  key: ACME
docs_dir: docs
sprint:
  length_days: 14
  start_weekday: monday
agents: [claude, codex, cursor]   # where skills are installed
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
validator, `nsk new`, and `nsk schema` all read them.

### Planning documents

`brief.md`, `prd.md`, `architecture.md`, and `coding-standards.md` each use
`status: draft | approved`, a `version` (semver), and an `updated` date.

| Artifact | Required H2 sections (in order) | Notes |
| --- | --- | --- |
| `brief.md` | Idea, Problem, Target Users, Goals, Constraints, Raw Input | Raw Input keeps the user's original words verbatim. |
| `prd.md` | Overview, Goals, Non-Goals, Personas, Functional Requirements, Non-Functional Requirements, Assumptions, Risks, Open Questions, Changelog | Requirements go in tables with IDs `FR-001` and `NFR-001`. Open Questions must be empty before approval. |
| `architecture.md` | Context, Tech Stack, Components, Data Model, Interfaces, Decisions, NFR Mapping, Deployment, Risks, Changelog | Decisions use IDs `AD-001` with context, decision, and consequences. NFR Mapping must cover every NFR. |
| `coding-standards.md` | Stack & Versions, Project Structure, Naming, Formatting & Linting, Testing, Error Handling & Logging, Security, Git Workflow, Definition of Done | Definition of Done is a checklist that the `/dev` and `/qa` skills apply. |

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
| `## Backlog` | Every story not in a sprint, ordered by priority, with its epic, points and status. Ready stories are what `/sprint plan` picks from. | Generated |
| `## Sprint N` | One per sprint, newest first. | Mixed |
| `### Stories` | ID, title, epic, points, status, assignee. | Generated |
| `### Review` | What was demoed and accepted. Required once closed. | `/sprint close` |
| `### Retro` | Went well, to improve, actions. Required once closed. | `/sprint close` |

Generated blocks sit between `<!-- nsk:generated:<name> -->` and
`<!-- nsk:end -->` markers. `nsk validate --fix` rewrites them, and the
validator fails if they're stale. Stories join a sprint only through their own
`sprint:` field, so the tracker never holds story status by hand.

Sprint planning (`/sprint plan`) works like a real planning meeting:

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

`nsk move <id> <status>` additionally checks that the transition itself is
legal, for example `draft → in-qa` is rejected. It also stamps `updated`.

## 4. The CLI: `nsk`

The CLI is written in TypeScript and published as compiled ESM JavaScript for
Node 20 or later. It has two runtime dependencies: `markdownlint` (formatting
and lint rules) and `yaml`. Frontmatter is checked against the schema's own
field definitions, so there's no need for a JSON Schema library.

| Command | Purpose |
| --- | --- |
| `nsk init [--agents …]` | Creates `nsk.yaml`, the `docs/` skeleton, and an AGENTS.md section, then installs the skills. Works for both new and existing repos. |
| `nsk install --agents claude,codex,…` | Copies the skills into each agent's skills directory. |
| `nsk update` | Re-syncs installed skills from the package version, using a manifest so local edits are detected and not overwritten. |
| `nsk new prd\|architecture\|standards\|epic\|story …` | Creates an artifact from its schema and allocates the next ID. |
| `nsk schema <type>` | Prints the spec (frontmatter fields, sections, rules) for an agent to read. |
| `nsk validate [--fix] [--json] [path]` | Runs every check (section 5). `--fix` applies the deterministic fixes. |
| `nsk move <id> <status>` | Changes status with transition and gate checks. |
| `nsk status [--json]` | Shows a board summary: the current sprint, counts by status, and what's next. |

The installer's agent-to-directory map is data in `spec/agents.yaml`, so adding
an agent is a one-line change. Starting targets:

- `.claude/skills/` (Claude Code)
- `.agents/skills/` (Codex and other agents that read the shared location)
- `.cursor/skills/`
- `.gemini/skills/`
- `.github/skills/` (Copilot)

Verify each path against that agent's current documentation during phase 4.

## 5. Validation

Checks run in this order and produce stable rule codes:

| Code | Category | Examples |
| --- | --- | --- |
| `NSK1xx` | Layout | Unknown file or folder, bad file name, ID doesn't match file name. |
| `NSK2xx` | Markdown format | ATX headings, `-` bullets, fenced code with a language, one H1, no trailing spaces, final newline, well-formed tables (markdownlint, shipped config). |
| `NSK3xx` | Frontmatter | Missing or unknown keys, wrong types or enums, key order, ISO dates. |
| `NSK4xx` | Sections | Missing, out of order, or unknown H2. Required table columns. Item regexes. Placeholders (`TODO`, `TBD`, `<…>`) past draft. |
| `NSK5xx` | References | Story's epic exists. Epic's requirements exist in the PRD. Every FR is covered by some epic (warning). Sprint exists. AC IDs are unique. Duplicate IDs. |
| `NSK6xx` | Gates | The status invariants in section 3. |
| `NSK7xx` | Generated content | Tracker tables or epic story lists are stale (`--fix` regenerates them). |

`--fix` only does safe, mechanical work: formatting, frontmatter key order,
regenerated blocks, and `updated` stamps. Anything that needs judgment is
reported for the agent to fix.

Output looks like this:

```text
docs/stories/ACME-5-login.md
  NSK402  missing required section "## Acceptance Criteria" (after "## Story")
  NSK601  status "in-qa" requires all tasks checked (2 of 5 unchecked)
✖ 2 errors, 0 warnings in 1 file
```

`--json` emits the same findings as machine-readable output, so the
`/validate` skill can loop on it.

Validation is enforced in four places:

1. Every skill's exit step.
2. A rule in the project's AGENTS.md that any edit under `docs/` must be
   followed by `nsk validate`.
3. A pre-commit hook, installed optionally by `nsk init`.
4. A GitHub Actions workflow template.

Agents that support hooks, such as Claude Code, can also get an optional
post-edit hook.

## 6. Skills

There are 10 skills. Each one is a folder: `skills/<name>/SKILL.md`, plus an
optional `checklist.md`.

| Skill | Expert persona | Reads | Writes | Key behaviors |
| --- | --- | --- | --- | --- |
| `/kickoff` | Product strategist | User input | `nsk.yaml`, `brief.md` | Captures the idea and constraints, keeps the raw input verbatim, asks at most 5 sharp questions, and runs `nsk init` if needed. |
| `/prd` | Senior business analyst | brief, prd | `prd.md` | Elicits requirements in rounds, never invents them (unverified items go in Assumptions), and assigns FR/NFR IDs. Change mode bumps the version, adds a Changelog entry, and flags affected epics and stories. |
| `/architecture` | Principal architect | prd | `architecture.md` | Proposes 1 or 2 options for each major decision with trade-offs and records the choice as `AD-xxx`. Maps every NFR. |
| `/standards` | Staff engineer / tech lead | architecture | `coding-standards.md` | Turns the stack into concrete, checkable rules and defines the Definition of Done. |
| `/epics` | Product owner | prd, architecture | `epics/*` | Slices the work into value-based epics, ensures full FR coverage, and orders them. |
| `/stories` | Agile coach / PO | epic, architecture, standards | `stories/*` | Writes INVEST stories with Given/When/Then ACs and estimates, checks the Definition of Ready, and moves stories to `ready`. |
| `/sprint` | Scrum master | tracker, stories | `sprint-tracker.md`, story `sprint` field | Has four sub-flows: `plan` (capacity, then select from ready stories), `start`, `close` (velocity and retro), and `status`. |
| `/dev` | Senior developer | story, architecture, standards | Code, story Dev Record | Picks or receives a story, moves it to in-progress, works through the tasks test-first, self-reviews against the Definition of Done, then moves it to in-qa. |
| `/qa` | QA engineer | story, standards | Story Test Plan and QA Record, tests | Writes the test plan (ideally at ready), verifies every AC with evidence, and either passes the story (done) or fails it back to in-progress with defects noted. |
| `/validate` | Release gatekeeper | Everything under `docs/` | Fixes | Runs `nsk validate --fix --json` and fixes what remains until it is clean (a maximum of N rounds, then it reports). |

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
`npx nsk validate --fix`, fixes any remaining errors, re-runs, and repeats
until the run is clean. It then reports what changed and the suggested next
skill.

Skill names are short and unprefixed, as you suggested (`/prd`). The exception
is `/kickoff`, because `/init` clashes with Claude Code's built-in command.
`nsk install --prefix n-` can rename them all (for example `/n-prd`) if a
project already has clashing skills.

The end-to-end flow:

```text
/kickoff → /prd → /architecture → /standards → /epics → /stories
        → /sprint plan → /sprint start → (/dev ⇄ /qa)* → /sprint close
(/validate runs after every step; /prd change mode handles scope changes)
```

## 7. Distribution

Three install paths cover both "add to an existing project" and "start a new
project":

1. **npm package** (name to be confirmed, e.g. `@nuwannnz/n-skills`). In an
   existing project, run `npx @nuwannnz/n-skills init --agents claude,codex`.
   It installs the skills, adds `nsk` as a devDependency, and scaffolds
   `docs/`.
2. **GitHub template repo** (`n-skills-starter`), already initialized, for
   new projects.
3. **Plain Agent Skills layout.** The `skills/<name>/SKILL.md` structure works
   with generic skill installers such as `npx skills add nuwannnz/n-skills`.
   With this path you still need `npx nsk` available for validation. Each
   skill detects a missing CLI and tells the user how to install it.

Skills and the CLI are versioned together. `nsk.yaml` records the version, and
`nsk validate` warns when the installed skills and the CLI differ.

## 8. Repository layout (this repo)

```text
n-skills/
├── package.json            # bin: nsk → dist/cli.js
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
| **1. Validator** | `nsk validate` (+`--fix`, `--json`), `nsk schema`, and `nsk new`. Fixtures for every rule code. | Every invalid fixture fails with the expected code, and the sample project passes. |
| **2. Planning skills** | `/validate`, `/kickoff`, `/prd`, `/architecture`, `/standards`, `/epics`, `/stories`. | A dry run from a one-paragraph idea to ready stories passes validation in at least 2 different agents. |
| **3. Delivery skills** | `nsk move`, `nsk status`, tracker generation, `/sprint`, `/dev`, `/qa`. | One full sprint, from plan to close with dev and QA, runs on the sample project. |
| **4. Distribution** | `nsk init`, `install`, `update`, the `--prefix` option, the agent map, the AGENTS.md snippet, pre-commit and CI templates, the starter template repo, and the npm publish workflow. | A fresh repo and an existing repo can each be set up with one command for Claude Code, Codex, and Cursor. |
| **5. Dogfood & trim** | Run it on a real small project and cut anything the skills or CLI didn't actually need. | The `SKILL.md` files stay at or under ~150 lines, and you are happy with the workflow. |

## 10. Decisions

Confirmed:

1. **CLI runtime: Node with TypeScript.** Go was considered. It would give a
   single binary and no Node requirement in target projects, but the Markdown
   tooling the validator relies on (markdownlint and its rule set) only exists
   in JavaScript, and `npx` is the simplest install path for skills users. If
   a Node-free install matters later, the CLI can be packaged as a standalone
   executable without a rewrite.
2. **Ticket IDs: Jira-style `<KEY>-<n>`** with one counter shared by epics and
   stories. The project key is asked for during `/kickoff`. See section 2.
3. **Sprint tracker: one `sprint-tracker.md`** that lists every sprint with
   its stories and their status, plus the backlog, and supports sprint
   planning. See section 3.
4. **Story statuses:** `draft, ready, in-progress, in-qa, done, blocked`.
5. **Managed root: `docs/`**, configurable in `nsk.yaml`.
6. **First agents to support:** Claude Code, Codex, and Cursor, then Gemini
   CLI and Copilot.

Still open: **the product name.** `n-skills` doesn't describe what the tool
does. Candidates (all free on npm as of 2026-10-09):

| Name | CLI | Why |
| --- | --- | --- |
| `specteam` | `specteam` / `stm` | A spec-driven team in a box. Says both halves of the idea. |
| `sprintspec` | `sprintspec` / `ssp` | Leads with the agile process. |
| `squadspec` | `squadspec` / `sqs` | Like `specteam`, a little more playful. |
| `specboard` | `specboard` / `sbd` | Leads with the board and tracker. Undersells the expert roles. |

Recommendation: `specteam`. Renaming is a find-and-replace until the first
publish, so this doesn't block any phase before 4.
