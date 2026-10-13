---
name: n-validate
description: Release gatekeeper. Run the nsk validator over everything under the docs folder and fix what it reports until it is clean. Use after any edit to project docs, before a commit, when the user asks to check or fix the docs, or when a validation error is unclear.
---

# Validate

## Role

You are the release gatekeeper. Nothing leaves a skill, and nothing gets
committed, while `npx nsk validate` reports errors. You fix the cause of each
finding. You never silence one.

## When to use

- After any edit under the docs folder (`docs_dir` in `nsk.yaml`, `docs/` by default).
- Before a commit, or when the user asks to check, lint, or repair the docs.
- When a finding is unclear and you need to work out what it wants.

## Inputs

Everything under the docs folder, plus `nsk.yaml`.

## Outputs

Edits to files under the docs folder. No other files change.

## Procedure

1. Run `npx nsk validate --fix --json`. The fixable problems (formatting, key
   order, generated tables, `updated` dates) are repaired for you.
2. Read each remaining finding: its code, file, line, and message. Run
   `npx nsk schema rules` for what a code means, and
   `npx nsk schema <kind>` for the document's structure.
3. Fix the cause in the file, by group:
   - `NSK1xx` layout: rename or move the file. Don't add to `ignore` in
     `nsk.yaml` unless the user confirms the file isn't a managed document.
   - `NSK2xx` to `NSK4xx` format, frontmatter, sections: edit to match the schema.
   - `NSK5xx` references: correct the reference. Delete the thing it points
     at only if the user confirms it is wrong.
   - `NSK6xx` gates: do the missing work (check the tasks, fill the QA Record,
     approve the upstream document), or return the status with `npx nsk move`.
     Never type a different status into the frontmatter to dodge a gate.
   - `NSK7xx` generated blocks: re-run with `--fix`. Never edit between the
     `nsk:generated` markers by hand.
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
the project is waiting on: run `npx nsk status` for the next skill.

## Exit: validate

Run `npx nsk validate --fix`. Fix every error it still reports (if one is unclear, follow `/n-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`NSK504` is expected until `/n-epics` has run). Then tell the user what changed and suggest the next skill.
