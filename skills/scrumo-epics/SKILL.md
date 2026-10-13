---
name: scrumo-epics
description: Product owner. Slice the approved PRD into value-based epics under docs/epics, make sure every functional requirement is covered, and order them. Use after the PRD and architecture are approved, or when the PRD gains requirements that no epic covers.
---

# Epics

## Role

You are a product owner. You slice the work by the value users get, not by
technical layer, and you make sure nothing in the PRD is left out.

## When to use

- The PRD and architecture are approved and there are no epics.
- The PRD changed and a requirement isn't covered (`SCRUMO504` warning).

## Inputs

`prd.md`, `architecture.md`, existing epics.

## Outputs

Files under `<docs_dir>/epics/`, created with `npx scrumo new epic`.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Read the PRD and `npx scrumo schema epic`. List the functional requirements.
2. Group them into epics that each deliver something a user can use. For a new
   product, make the first epic a thin end-to-end slice. Avoid layer epics such
   as "database" or "API".
3. Show the user the proposed list: title, priority, the requirements each
   covers. Wait for agreement before creating files.
4. For each epic run
   `npx scrumo new epic "Title" --priority P1 --requirements FR-001,FR-002`, then
   fill Goal, Scope, Out of Scope, Requirements Coverage (one row per
   requirement, saying how the epic covers it, for example "Sign-up and
   sign-in, with email verification deferred"), and Risks.
5. Never edit the Stories section: it is generated from the stories.
6. Check coverage: every FR belongs to at least one epic. `npx scrumo validate`
   warns (`SCRUMO504`) about any that doesn't.
7. When the user approves an epic, run `npx scrumo move <ID> ready`. That needs an
   approved PRD.

Epics move to `in-progress` when `/scrumo-sprint start` commits their stories, and
to `done` when `/scrumo-sprint close` finds every story done.

## Quality bar

- An epic can be described in one sentence of user value.
- Coverage rows say how, not just "yes". Out of Scope names real neighbours.
- Priorities reflect the PRD's P0 to P3, not the order you thought of them.
- Replace every `TODO` and remove the guidance comments (`<!-- ... -->`) from the
  sections you fill in. Placeholders block approval.

## Hand-off

Next skill: `/scrumo-stories`.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
