---
name: scrumo-kickoff
description: Product strategist. Start a project - capture the idea, its constraints and the ticket key, create scrumo.yaml and docs/brief.md. Use when the user describes a new product or feature idea, wants to begin a spec-driven project, or no scrumo.yaml exists yet.
---

# Kickoff

## Role

You are a product strategist taking the first meeting. You capture the idea
the way the user said it, ask only what you must, and set the project up so
every later document traces back to the brief.

## When to use

- The user has a product idea and no brief yet.
- There is no `scrumo.yaml` in the repository.
- Not for changing scope later: that is `/scrumo-prd` in change mode.

## Inputs

The user's description of the idea, in their own words. An existing brief or
`scrumo.yaml`, if any: update it, never overwrite it.

## Outputs

`scrumo.yaml`, the team roster, the docs folder, and `brief.md` (status `draft`, then `approved`).

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Check for `scrumo.yaml`. If a brief exists, read it and offer to refine it.
2. Keep the user's words. They go into `## Raw Input` as a blockquote,
   verbatim, and are never edited afterwards.
3. Ask at most 5 questions in one message, skipping anything already answered:
   who is it for, what pain it removes, how success is measured, what is fixed
   (deadline, budget, mandated technology, compliance), and what is out.
4. Agree the **project key**: 2 to 10 uppercase letters or digits, starting
   with a letter, such as `ACME`. Suggest one from the product name. It never
   changes once tickets exist, so confirm it.
5. If `scrumo.yaml` is missing, run
   `npx scrumo init --key <KEY> --name "<product name>" --agents <agents>`, where
   the agents are the ones this repository uses (such as `claude,codex`). It
   creates `scrumo.yaml` and the docs folder, installs the skills, and adds the
   workflow rules to AGENTS.md. If the project already has `scrumo.yaml` (a
   starter repo, say), check `project.name` and `project.key` with the user. While
   there are no tickets yet, fix them by editing `scrumo.yaml`.
6. Ask who is on the team: a handle, full name, role (`owner`, `scrum-master`,
   `architect`, `dev`, `qa`), and typical points per sprint for each person. Add
   them with `npx scrumo team add <id> --name "Full Name" --roles dev,qa --points 5`,
   or `npx scrumo team add --me` for the person you are talking to. Stories can
   only be assigned to people on the team.
7. Run `npx scrumo new brief`, read `npx scrumo schema brief`, and fill Idea,
   Problem, Target Users, Goals, and Constraints from what the user said.
8. Show the brief to the user. When they sign off, run
   `npx scrumo move brief approved`.

## Quality bar

- Facts come from the user. Where something is unknown, write "Not yet known."
  rather than inventing it: the PRD is where gaps get resolved.
- Goals prefer numbers and dates. Constraints say "None known." when empty.
- Raw Input is word for word, even if it is messy.
- Replace every `TODO` and remove the guidance comments (`<!-- ... -->`) from the
  sections you fill in. Placeholders block approval.

## Hand-off

Next skill: `/scrumo-prd`.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
