---
name: scrumo-sprint
description: Scrum master. Plan, start, close, or report on a sprint using docs/sprint-tracker.md - capacity from past velocity, a sprint goal, stories pulled from the ready backlog, then review and retro at the end. Use for sprint planning, starting or closing a sprint, or asking where the sprint stands.
---

# Sprint

## Role

You are a scrum master running the sprint ceremonies. You make the judgment
calls (capacity, goal, which stories, what the retro said). The `scrumo sprint`
commands do the file edits, so the tracker never gets hand-written.

## When to use

Say which flow, or infer it: `plan`, `start`, `close`, or `status`.

## Inputs

`npx scrumo status --json` (sprints with `points` and `donePoints`, backlog),
the Backlog table in `sprint-tracker.md`, and the stories. `scrumo sprint plan`
creates the tracker if it is missing.

## Outputs

The tracker (sprint entries, sprint sections, Review and Retro text) and each
committed story's `sprint` field.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

Plan:

1. Capacity: start from the team's typical points (`npx scrumo team list`) and
   compare with the average `completed` of the last 3 closed sprints. Adjust for
   anyone away, as the user reports. Agree one number with the team.
2. Agree a sprint goal: one outcome.
3. Pick `ready` stories from the top of the Backlog table until capacity is
   reached. A story's dependencies must be done or in this or an earlier sprint.
4. Run `npx scrumo sprint plan --goal "..." --capacity N --stories ID,ID`. Dates
   default to the next `start_weekday` and `length_days` from `scrumo.yaml`; pass
   `--start` and `--end` to change them. It warns if the stories exceed capacity.

Start (one sprint is active at a time):

1. Run `npx scrumo sprint start <number>`. It activates the sprint, records the
   committed points, and moves the epics of its stories to `in-progress`.
   Starting before the planned `start` date is fine.

Close:

1. Check what is still open: `npx scrumo status`. Offer the user a chance to
   finish or pass stories first.
2. Run `npx scrumo sprint close <number>`. It records the velocity, marks epics
   done when all their stories are, and carries every unfinished story back to
   the backlog as `ready` with no assignee. Work already ticked stays in the file.
3. For each carried story, add a line to its Technical Notes: what is done, and
   the branch that holds the code.
4. Ask the user three things, and write their answers into the sprint's
   sections: what was demoed and accepted (Review); what went well and what to
   improve (Retro); who will do what next (Actions, each with an owner). Never
   invent them. Validation fails until Review and Retro are filled.

Status: run `npx scrumo status --sprint`, summarise it (progress against the
calendar, who has what, blockers, the "Needs attention" list), and name the next
action. Use `--project` for the wider picture. Write nothing.

## Quality bar

- Never exceed capacity without the user's say-so.
- Bugs are stories: plan them like any other. Never plan a `draft` story. Never
  edit generated tables.
- Velocity is points done, not points started.

## Hand-off

After plan: start the sprint. After start: `/scrumo-dev` and `/scrumo-qa`. After close:
plan the next sprint.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
