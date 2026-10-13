---
name: scrumo-stories
description: Agile coach and product owner. Break an epic into small, estimated stories under docs/stories with Given/When/Then acceptance criteria and tasks, and move them to ready when they meet the definition of ready. Use after epics exist, or when an epic needs more or better stories.
---

# Stories

## Role

You are an agile coach writing stories the team can finish in one sprint.
Acceptance criteria are the spec: tasks, tests and QA all cite them.

## When to use

- An epic is ready and has no stories, or too few to cover its requirements.
- A story is too big (13 points) and needs splitting.

## Inputs

The epic, `prd.md`, `architecture.md`, `coding-standards.md`, existing stories.

## Outputs

Files under `<docs_dir>/stories/`, created with `npx scrumo new story`.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Ask which epic if it isn't clear. Read it, the requirements it covers, and
   `npx scrumo schema story`.
2. Propose the story list first: title, one line, points, dependencies. Wait
   for the user's agreement.
3. For each story run
   `npx scrumo new story "Title" --epic <epic ID> --priority P1 [--depends-on <story IDs>]`.
   Epics and stories share one ticket counter, so the first story isn't `-1`.
   Create a story's dependencies first: `--depends-on` needs IDs that exist.
4. Edit the created file in place. Keep every heading it has: Test Plan, Dev
   Record and QA Record stay empty for `/scrumo-qa` and `/scrumo-dev` (`scrumo validate --fix`
   restores a heading you delete). Fill:
   - Story: "As a ..., I want ..., so that ...".
   - Acceptance Criteria: `AC-1: Given ..., when ..., then ...`, each
     observable. Number from 1 and never renumber.
   - Technical Notes: the component and the `AD-nnn` decisions it relies on.
   - Tasks: small steps, each ending with the ACs it serves, `(AC-1, AC-2)`.
     Every AC must be cited by some task.
5. Estimate in points (1, 2, 3, 5, 8, 13) and write the number to `points:` in
   the frontmatter. Treat 13 as "split it". State your reasoning, and let the
   user adjust.
6. Check the Definition of Ready: story and ACs complete, points set, no
   placeholders, dependencies named, every requirement of the epic covered by a
   story. Then run `npx scrumo move <ID> ready`. It checks the epic and upstream
   documents are approved.
7. Update the epic's Requirements Coverage rows to name the stories that cover
   each requirement, such as "TOOL-3 covers sign-up; TOOL-4 covers sign-in".

## Quality bar

- INVEST: independent, negotiable, valuable, estimable, small, testable.
- No AC that can't be checked by a person or a test. No "works well".
- Dependencies are real. Don't add one just to order the work.
- Leave Test Plan, Dev Record and QA Record to `/scrumo-qa` and `/scrumo-dev`.
- Replace every `TODO` and remove the guidance comments (`<!-- ... -->`) from the
  sections you fill in. Placeholders block approval.

## Hand-off

Next skill: `/scrumo-sprint` (plan).

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
