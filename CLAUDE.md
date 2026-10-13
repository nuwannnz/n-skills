# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A set of model-agnostic agent skills plus a CLI (`nsk`) that runs a project
the way a real software team does, using spec-driven development: brief → PRD
→ architecture → coding standards → epics → stories → sprints → dev ⇄ QA.
All project state lives in strictly structured Markdown under a target
project's `docs/`. `n-skills` and `nsk` are working names. `PLAN.md` is the
design and the phase plan, so read it before making structural changes.

Status: phases 0 (spec) and 1 (validator, `nsk validate`, `nsk schema`,
`nsk new`) are done. The 10 skills and `nsk move`/`nsk status`/`nsk sprint`
(phases 2 and 3) are built and were dry-run once by a fresh agent; multi-agent
runs are still to do. The installer (phase 4) isn't built.

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
  every validator rule code (`NSK1xx` layout through `NSK7xx` generated
  content). Codes are stable, so never renumber or reuse one. The validator,
  `nsk new`, and `nsk schema` must all derive their behaviour from these files
  rather than hard-coding structure.
- **`src/spec/`** loads the spec and rejects malformed schemas (`load.ts`),
  with matching types in `types.ts`. When you add a schema key, update
  `types.ts`, `load.ts`, and `spec/README.md` together.
- **`src/validate/`** is the validator. `project.ts` finds `nsk.yaml`, reads
  `docs/`, and checks the layout. `doc.ts` parses a file. `frontmatter.ts`,
  `sections.ts`, `markdown.ts`, `refs.ts`, and `gates.ts` hold the `NSK3xx`,
  `NSK4xx`, `NSK2xx`, `NSK5xx`, and `NSK6xx` checks. `generate.ts` builds the
  generated blocks, and `index.ts` ties it together and applies `--fix`. Every
  finding is reported through a rule code that must exist in `spec/rules.yaml`.
  `src/cli.ts` and `src/cli/` are the `nsk` commands.
- **`skills/n-*/SKILL.md`** are the 10 agent skills, all prefixed `n-`. Every
  one uses the same section skeleton and an identical `Exit: validate`
  section, stays under 150 lines, and refers only to skills and `nsk` commands
  that exist; `test/unit/skills.test.ts` enforces that. Skills learn structure
  from `nsk schema <kind>` and never embed templates.
- **`examples/sample-project/`** is a hand-written, fully valid project
  (key `PAW`). It covers every story status, a closed and an active sprint, and
  a story that failed a QA round. `test/unit/spec.test.ts` checks it structurally against the
  schemas, so any schema change must keep the sample passing, and vice versa.
  Generated blocks in it (`<!-- nsk:generated:<name> -->` … `<!-- nsk:end -->`)
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
