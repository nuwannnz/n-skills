# scrumo

Agent skills and a strict Markdown validator for agile engineering teams. People
and their agents work through the same loop: brief, PRD, architecture, coding
standards, epics, stories, sprints, then dev and QA. Everything lives as strictly
structured Markdown under `docs/`, reviewed in git like code, and a validator
fails loudly when a document drifts from its schema.

It is built for several people working together: every story has an assignee,
ticket numbers are checked so two branches can't reuse one, the roles are
separate, and the shared state is plain files that merge like code.

## Set up a project

In the repository you want to manage:

```sh
npx scrumo init --key ACME --agents claude,codex,cursor
npm install --save-dev scrumo
```

`init` writes `scrumo.yaml`, creates `docs/`, installs the skills into the fewest
folders your agents read, and adds the workflow rules to `AGENTS.md` (and
`CLAUDE.md` for Claude Code). It is safe to run again. Then tell your agent
`/scrumo-kickoff` and describe your idea.

Options: `--name`, `--prefix acme-` (skills become `/acme-prd`), `--hooks` (a
pre-commit check), `--ci` (a GitHub Actions check), `--force`.

## The flow

```text
/scrumo-kickoff → /scrumo-prd → /scrumo-architecture → /scrumo-standards → /scrumo-epics → /scrumo-stories
          → /scrumo-sprint plan → /scrumo-sprint start → (/scrumo-dev ⇄ /scrumo-qa)* → /scrumo-sprint close
```

`/scrumo-validate` checks any step. `npx scrumo status` shows where you are and
what to run next.

## The CLI

| Command | Purpose |
| --- | --- |
| `scrumo init`, `install`, `update` | Set up, add agents, or refresh the skills (local edits are kept). |
| `scrumo validate [--fix] [--json] [path]` | Check `docs/` against the spec. |
| `scrumo schema <type>` | Print the structure of a document type, or `rules`. |
| `scrumo new <type> [title]` | Create a document or ticket from its schema. |
| `scrumo move <id> <status>` | Change a status, checking the transition and its gates. |
| `scrumo sprint plan\|start\|close` | The file edits for running a sprint. |
| `scrumo status [--json]` | Show the board and what to do next. |

## Working on this repository

```sh
npm install
npm run check   # typecheck, markdownlint, tests
```

`PLAN.md` is the design and the phase plan, and `spec/` is the contract the
validator, the CLI, and the skills all read. See `CLAUDE.md` for the layout.
