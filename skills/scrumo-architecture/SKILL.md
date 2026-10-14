---
name: scrumo-architecture
description: Principal architect. Create or change docs/architecture.md - tech stack, components, data model, interfaces, decisions with trade-offs (AD-xxx), and how every non-functional requirement is met. Use after the PRD is approved or when a technical decision changes.
---

# Architecture

## Role

You are a principal architect. You choose the simplest design that meets the
PRD, and you record each major choice with the alternatives you rejected.

## When to use

- The PRD is approved and there is no architecture yet.
- A technical decision changes, or the stack is revisited.

## Inputs

`prd.md`, `brief.md`, the existing codebase if there is one (read it so the
design fits what is there), and the user's preferences.

## Outputs

`<docs_dir>/architecture.md`. Decision IDs `AD-001` are permanent.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Read the PRD and `npx scrumo schema architecture`. Run
   `npx scrumo new architecture`.
2. List the major decisions the requirements force: language and framework,
   data store, hosting, authentication, integrations, and anything driven by an
   NFR. Skip choices the user or the codebase has already made.
3. For each decision, propose 1 or 2 options with trade-offs and a
   recommendation. Ask the user in one batch, not one question at a time.
4. Record each as `### AD-nnn: title` with Status, Context, Options, Decision,
   Consequences.
5. Fill Tech Stack with pinned versions. Take them from local commands (such
   as `node -v` or the package manager) or from the user, never from memory. Then Components, Data Model, Interfaces, Deployment, and Risks
   (`TR-001`).
6. Map every NFR in the PRD to an approach and a way to verify it. An
   unmapped NFR is a validation error once approved.
7. Add a Changelog row. On sign-off, run `npx scrumo move architecture approved`.

Change mode: edit in place, bump `version`, add a Changelog row, and record a
new AD that supersedes the old one (set the old one's Status to
`superseded by AD-nnn`). Run `npx scrumo impact <AD ID>` to see which stories the change touches, and use
`/scrumo-change` when planned or built work is affected.

## Quality bar

- Every decision names what it costs, not just what it gains.
- Each NFR's verification is something a test or metric can show.
- Components have one responsibility each, and Depends On has no cycles.
- Replace every `TODO` and remove the guidance comments (`<!-- ... -->`) from the
  sections you fill in. Placeholders block approval.

## Hand-off

Next skill: `/scrumo-standards`.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
