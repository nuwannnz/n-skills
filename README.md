# scrumo

Agent skills and a strict Markdown validator for agile engineering teams. People
and their agents work through the same loop: brief, PRD, architecture, coding
standards, epics, stories, sprints, then dev and QA. Everything lives as strictly
structured Markdown under `docs/`, reviewed in git like code, and a validator
fails loudly when a document drifts from its schema.

It is built for several people working together: every story has an assignee,
ticket numbers are checked so two branches can't reuse one, the roles are
separate, and the shared state is plain files that merge like code.

## Repository layout

This repository holds two packages that are released separately:

| Path | Package | What it is |
| --- | --- | --- |
| `/` (root) | [`scrumo`](https://www.npmjs.com/package/scrumo) | The CLI, the validator, the skills (`skills/`), the spec and the templates. |
| `desktop/` | `scrumo-desktop` | A desktop app for business analysts and architects: chat, sprint views, planning and team, over the same documents. See [desktop/README.md](desktop/README.md). |

It is an npm workspace, so one `npm install` at the root sets up both. The skills
stay at the root so that skill installers (`npx skills add nuwannnz/n-skills`)
keep finding them. Useful commands: `npm run check` (the CLI), `npm run
check:desktop`, `npm run desktop` (start the app on a demo project; run `npm run
demo:setup -w desktop` first). Setting `ELECTRON_SKIP_BINARY_DOWNLOAD=1` skips the
130 MB Electron download when you only work on the CLI.

Releases: the CLI is published by a GitHub release tagged `vX.Y.Z`; the desktop app by
a release tagged `desktop-vX.Y.Z` (the tag must match `desktop/package.json`). Each tag
runs its own workflow, so the two never publish together.

## Set up a project

In the repository you want to manage:

```sh
npx scrumo init --key ACME --agents claude,codex,cursor
npm install --save-dev scrumo
```

Then add your team: `npx scrumo team add --me`, and one `npx scrumo team add <id> --name "Full Name" --roles dev,qa --points 5` per teammate.

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

Around the loop: `/scrumo-bug` reports a bug, `/scrumo-refine` grooms the backlog,
`/scrumo-change` handles a change to approved scope, and `/scrumo-validate`
checks any step. `npx scrumo status` shows where you are at a glance and
what to run next: sprint progress against the calendar, who has what, epic progress,
velocity, open bugs, and a "Needs attention" list.

## The CLI

| Command | Purpose |
| --- | --- |
| `scrumo init`, `install`, `update` | Set up, add agents, or refresh the skills (local edits are kept). |
| `scrumo validate [--fix] [--json] [path]` | Check `docs/` against the spec. |
| `scrumo schema <type>` | Print the structure of a document type, or `rules`. |
| `scrumo new <type> [title]` | Create a document or ticket from its schema. |
| `scrumo move <id> <status>` | Change a status, checking the transition and its gates. |
| `scrumo sprint plan\|start\|close` | The file edits for running a sprint. |
| `scrumo team list\|add\|set\|remove\|whoami` | Who is on the project: handles, roles, typical points per sprint. Stories are assigned only to them. |
| `scrumo impact <id>` | Show what a requirement, decision, or ticket touches. |
| `scrumo status [--sprint\|--project] [--json]` | The sprint and project at a glance, what needs attention, and what to do next. |

## Working on this repository

```sh
npm install
npm run check   # typecheck, markdownlint, tests
```

`PLAN.md` is the design and the phase plan, and `spec/` is the contract the
validator, the CLI, and the skills all read. See `CLAUDE.md` for the layout.

## License

Open source under the [MIT license](LICENSE). Issues and pull requests are
welcome: run `npm run check` before sending one, and see `CLAUDE.md` for how the
repository is laid out.
