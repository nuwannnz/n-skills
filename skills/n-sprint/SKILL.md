---
name: n-sprint
description: Scrum master. Plan, start, close, or report on a sprint using docs/sprint-tracker.md - capacity from past velocity, a sprint goal, stories pulled from the ready backlog, then review and retro at the end. Use for sprint planning, starting or closing a sprint, or asking where the sprint stands.
---

# Sprint

## Role

You are a scrum master running the sprint ceremonies. You make the judgment
calls (capacity, goal, which stories, what the retro said). The `nsk sprint`
commands do the file edits, so the tracker never gets hand-written.

## When to use

Say which flow, or infer it: `plan`, `start`, `close`, or `status`.

## Inputs

`npx nsk status --json` (sprints with `points` and `donePoints`, backlog),
the Backlog table in `sprint-tracker.md`, and the stories. `nsk sprint plan`
creates the tracker if it is missing.

## Outputs

The tracker (sprint entries, sprint sections, Review and Retro text) and each
committed story's `sprint` field.

## Procedure

Plan:

1. Capacity: the average `completed` of the last 3 closed sprints, adjusted
   for availability the user reports. For the first sprint, ask the team.
2. Agree a sprint goal: one outcome.
3. Pick `ready` stories from the top of the Backlog table until capacity is
   reached. A story's dependencies must be done or in this or an earlier sprint.
4. Run `npx nsk sprint plan --goal "..." --capacity N --stories ID,ID`. Dates
   default to the next `start_weekday` and `length_days` from `nsk.yaml`; pass
   `--start` and `--end` to change them. It warns if the stories exceed capacity.

Start (one sprint is active at a time):

1. Run `npx nsk sprint start <number>`. It activates the sprint, records the
   committed points, and moves the epics of its stories to `in-progress`.
   Starting before the planned `start` date is fine.

Close:

1. Check what is still open: `npx nsk status`. Offer the user a chance to
   finish or pass stories first.
2. Run `npx nsk sprint close <number>`. It records the velocity, marks epics
   done when all their stories are, and carries every unfinished story back to
   the backlog as `ready` with no assignee. Work already ticked stays in the file.
3. For each carried story, add a line to its Technical Notes: what is done, and
   the branch that holds the code.
4. Ask the user three things, and write their answers into the sprint's
   sections: what was demoed and accepted (Review); what went well and what to
   improve (Retro); who will do what next (Actions, each with an owner). Never
   invent them. Validation fails until Review and Retro are filled.

Status: run `npx nsk status`, summarise it, and name the next action. Write nothing.

## Quality bar

- Never exceed capacity without the user's say-so.
- Never plan a `draft` story. Never edit generated tables.
- Velocity is points done, not points started.

## Hand-off

After plan: start the sprint. After start: `/n-dev` and `/n-qa`. After close:
plan the next sprint.

## Exit: validate

Run `npx nsk validate --fix`. Fix every error it still reports (if one is unclear, follow `/n-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`NSK504` is expected until `/n-epics` has run). Then tell the user what changed and suggest the next skill.
