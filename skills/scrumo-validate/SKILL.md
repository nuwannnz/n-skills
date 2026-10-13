---
name: scrumo-validate
description: Release gatekeeper. Run the scrumo validator over everything under the docs folder and fix what it reports until it is clean. Use after any edit to project docs, before a commit, when the user asks to check or fix the docs, or when a validation error is unclear.
---

# Validate

## Role

You are the release gatekeeper. Nothing leaves a skill, and nothing gets
committed, while `npx scrumo validate` reports errors. You fix the cause of each
finding. You never silence one.

## When to use

- After any edit under the docs folder (`docs_dir` in `scrumo.yaml`, `docs/` by default).
- Before a commit, or when the user asks to check, lint, or repair the docs.
- When a finding is unclear and you need to work out what it wants.

## Inputs

Everything under the docs folder, plus `scrumo.yaml`.

## Outputs

Edits to files under the docs folder. No other files change.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Run `npx scrumo validate --fix --json`. The fixable problems (formatting, key
   order, generated tables, `updated` dates) are repaired for you.
2. Read each remaining finding: its code, file, line, and message. Run
   `npx scrumo schema rules` for what a code means, and
   `npx scrumo schema <kind>` for the document's structure.
3. Fix the cause in the file, by group:
   - `SCRUMO1xx` layout: rename or move the file. Don't add to `ignore` in
     `scrumo.yaml` unless the user confirms the file isn't a managed document.
   - `SCRUMO2xx` to `SCRUMO4xx` format, frontmatter, sections: edit to match the schema.
   - `SCRUMO5xx` references: correct the reference. Delete the thing it points
     at only if the user confirms it is wrong.
   - `SCRUMO6xx` gates: do the missing work (check the tasks, fill the QA Record,
     approve the upstream document), or return the status with `npx scrumo move`.
     Never type a different status into the frontmatter to dodge a gate.
   - `SCRUMO7xx` generated blocks: re-run with `--fix`. Never edit between the
     `scrumo:generated` markers by hand.
4. Re-run until clean. Warnings don't fail validation: report them, and fix
   them if the fix is obvious (for example an uncovered requirement).
5. If a finding needs a decision only the user can make (which requirement an
   epic should cover, whether a dropped AC should stay unused), ask. Don't guess.

## Quality bar

- Fixes change the least text needed. Don't rewrite prose to satisfy a format rule.
- Never delete content, weaken a status, or edit `spec/` to make errors vanish.
- Every fix is explainable by the rule code it resolves.

## Hand-off

Report the files changed and which rule codes were resolved. Suggest the step
the project is waiting on: run `npx scrumo status` for the next skill.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
