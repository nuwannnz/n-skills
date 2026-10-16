# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A set of model-agnostic agent skills plus a CLI (`scrumo`) for agile
engineering teams, so people and their agents work together the way a real
software team does, using spec-driven development: brief → PRD
→ architecture → coding standards → epics → stories → sprints → dev ⇄ QA.
All project state lives in strictly structured Markdown under a target
project's `docs/`. The product is `scrumo`; the repository is still named
`n-skills`. The name lives in `spec/brand.yaml` and is meant to change: run
`npm run rename -- <name>` (add `--dry-run` to preview) and never rename by hand.
It replaces the old name wherever it appears as a whole word, in file contents
and file names, so write the product name in full, as `scrumo`, not in fragments.
`PLAN.md` is the design and the phase plan, so read it before making structural
changes.

Status: phases 0 to 4 are built. The first 10 skills were dry-run once by a fresh
agent (the bug, refine and change skills haven't been); runs in other agents are still to do. Not done: the starter template
repo and publishing (owner's calls).

## Monorepo

The repository also contains the desktop app in `desktop/` (its own package,
`scrumo-desktop`, with its own README and CLAUDE-relevant notes there). The root
package stays the publishable `scrumo` CLI, and `skills/`, `spec/`, `templates/`
and `examples/` stay at the root. `npm run rename` renames the product in
`desktop/` too, since the app is built on the same name (`scrumo.yaml`, the
`scrumo-` skill prefix). Desktop commands: `npm run check:desktop`, `npm run desktop`.

## Commands

```sh
npm install
npm run check        # typecheck + markdownlint + tests; run before committing
npm run typecheck    # tsc --noEmit
npm test             # node --test on test/**/*.test.ts (Node runs the .ts directly)
npm run lint:md      # markdownlint with spec/markdownlint.json
npm run build        # compile src/ to dist/
node src/cli.ts validate examples/sample-project   # run the CLI straight from source
node --test --test-name-pattern "PAW-6" "test/**/*.test.ts"   # run a single test
```

Development needs Node 22.18 or later, because tests run TypeScript with
Node's built-in type stripping. The published CLI targets Node 20.

## Architecture

- **`spec/` is the contract.** `spec/schemas/<kind>.yaml` defines each artifact
  kind: frontmatter fields in their required key order, H2 sections in their
  required order, content rules, and status lists and transitions. The
  schema format is documented in `spec/README.md`. `spec/rules.yaml` lists
  every validator rule code (`SCRUMO1xx` layout through `SCRUMO7xx` generated
  content). Codes are stable, so never renumber or reuse one. The validator,
  `scrumo new`, and `scrumo schema` must all derive their behaviour from these files
  rather than hard-coding structure.
- **`src/spec/`** loads the spec and rejects malformed schemas (`load.ts`),
  with matching types in `types.ts`. When you add a schema key, update
  `types.ts`, `load.ts`, and `spec/README.md` together.
- **`src/validate/`** is the validator. `project.ts` finds `scrumo.yaml`, reads
  `docs/`, and checks the layout. `doc.ts` parses a file. `frontmatter.ts`,
  `sections.ts`, `markdown.ts`, `refs.ts`, and `gates.ts` hold the `SCRUMO3xx`,
  `SCRUMO4xx`, `SCRUMO2xx`, `SCRUMO5xx`, and `SCRUMO6xx` checks. `generate.ts` builds the
  generated blocks, and `index.ts` ties it together and applies `--fix`. Every
  finding is reported through a rule code that must exist in `spec/rules.yaml`.
  `src/cli.ts` and `src/cli/` are the `scrumo` commands.
- **`skills/scrumo-*/SKILL.md`** are the 13 agent skills, all prefixed `scrumo-`. Every
  one uses the same section skeleton and an identical `Exit: validate`
  section, stays under 150 lines, and refers only to skills and `scrumo` commands
  that exist; `test/unit/skills.test.ts` enforces that. Skills learn structure
  from `scrumo schema <kind>` and never embed templates.
- **`src/install/`** and `src/cli/install.ts` are the installer. `dirs.ts`
  picks the fewest skills folders that cover the chosen agents, using
  `spec/agents.yaml` (`also_reads` lists the other folders an agent scans).
  `sync.ts` copies skills and keeps `.scrumo/manifest.json` so updates never
  overwrite local edits. `skills.ts` applies the `skill_prefix`. `managed.ts`
  writes the AGENTS.md block, the pre-commit hook, and the CI workflow from
  `templates/`. `cli_version` in a project's `scrumo.yaml` must equal
  `package.json`'s version or validation warns (`SCRUMO106`), so bump
  `examples/sample-project/scrumo.yaml` with the package version.
- **`examples/sample-project/`** is a hand-written, fully valid project
  (key `PAW`). It covers every story status, a closed and an active sprint, and
  a story that failed a QA round. `test/unit/spec.test.ts` checks it structurally against the
  schemas, so any schema change must keep the sample passing, and vice versa.
  Generated blocks in it (`<!-- scrumo:generated:<name> -->` … `<!-- scrumo:end -->`)
  are written by hand for now and must match what the generator will produce.

`test/unit/rules.test.ts` holds one broken-project case per rule code in
`spec/rules.yaml`, each a small edit to a copy of the sample project, and fails
if a code has no case. Adding a rule means adding its case.

Key rules the design depends on:

- Ticket IDs are Jira-style `<KEY>-<n>`, with one counter shared by epics and
  stories. A story's epic lives in its `epic:` field, not in its ID.
- Each fact has one home. Story status lives only in the story's frontmatter.
  Sprint facts live in the sprint tracker's frontmatter. Every table that
  repeats them is a generated block.
- Structure rules apply in every status. Status only decides whether a section
  may be empty and whether placeholders (`TODO`, `TBD`, `???`, `<...>`
  outside code) are allowed.
- Source imports use `.ts` extensions (`erasableSyntaxOnly`, so no enums or
  namespaces). `tsc` rewrites them to `.js` on build.
