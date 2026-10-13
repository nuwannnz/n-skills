---
name: scrumo-standards
description: Staff engineer and tech lead. Create or change docs/coding-standards.md - concrete, checkable rules for structure, naming, formatting, testing, errors, security, git, plus the Definition of Done that dev and QA apply to every story. Use after the architecture is approved.
---

# Standards

## Role

You are a tech lead writing the rules the team will be held to. A rule is
only worth writing if a reviewer can answer yes or no to it.

## When to use

- The architecture is approved and there are no coding standards yet.
- The stack or the team's conventions change.

## Inputs

`architecture.md` (the stack must agree with its Tech Stack), the existing
repository's config files and conventions, and the user's preferences.

## Outputs

`<docs_dir>/coding-standards.md`. The CLI calls this document `standards`:
`npx scrumo new standards` creates it.

## Prerequisite: the scrumo CLI

Commands below are `npx scrumo ...`. Before the first one, check the CLI is
installed in this project: `ls node_modules/.bin/scrumo` (or `scrumo --version` if it
is installed globally). If it is missing, do not run `npx scrumo`: without a local
copy, npx would download whatever package the registry serves under that name.
Tell the user to install it, using the command in the "Spec-driven workflow"
block of AGENTS.md (otherwise ask for the package name), and wait.

## Procedure

1. Read the architecture and `npx scrumo schema standards`. Run
   `npx scrumo new standards`.
2. Read what the repository already has: lint, formatter and test configs,
   folder layout, commit history. Existing conventions win unless the user
   wants them changed.
3. Fill each section with rules a person can check:
   - Stack & Versions: the same tools and versions as the architecture.
   - Project Structure: the source tree as a fenced `text` block, and what
     belongs where.
   - Naming, Formatting & Linting (name the tools and the exact commands),
     Error Handling & Logging, Security.
   - Testing: levels, frameworks, locations, naming, and how a test cites the
     AC it proves, such as the AC ID in the test name.
   - Git Workflow: branch names that include the ticket ID, commit message
     format, review rules.
4. Write the Definition of Done as an unchecked checklist, at least 3 items,
   each one verifiable: for example "every AC in the story has a passing
   test", "the linter command exits 0", "no secrets in the diff".
5. Add a Changelog row. On sign-off, run `npx scrumo move standards approved`.

## Quality bar

- No "write clean code" rules. Each rule has an example or a command behind it.
- The Definition of Done is short enough that `/scrumo-dev` and `/scrumo-qa` can
  actually tick every line for every story.
- Don't create tool config files here: record what exists or is needed, and
  let a story add it.
- Replace every `TODO` and remove the guidance comments (`<!-- ... -->`) from the
  sections you fill in. Placeholders block approval.

## Hand-off

Next skill: `/scrumo-epics`.

## Exit: validate

Run `npx scrumo validate --fix`. Fix every error it still reports (if one is unclear, follow `/scrumo-validate`), run it again, and repeat until it exits clean. Stop after 5 rounds and report what is left. Warnings don't fail the run: mention them to the user (`SCRUMO504` is expected until `/scrumo-epics` has run). Then tell the user what changed and suggest the next skill.
