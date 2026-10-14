<!-- scrumo:agents:begin -->
## Spec-driven workflow (scrumo)

This project keeps its specification and backlog as strict Markdown under
`{docs_dir}/`, managed by the `scrumo` CLI and the `{prefix}` skills.

- The CLI must be installed in this project: `npm install --save-dev {package}`. Check with `ls node_modules/.bin/scrumo`, and don't run `npx scrumo` without it.
- The people on the project are in `scrumo.yaml`: see them with `npx scrumo team list`, and assign stories only to them. Add someone with `npx scrumo team add`.
- Run `npx scrumo status` to see where the project stands and which skill to run next.
- After any edit under `{docs_dir}/`, run `npx scrumo validate --fix` and fix whatever it still reports.
- Change a status only with `npx scrumo move`. Never edit a `status:` field by hand, and never edit between `<!-- scrumo:generated:... -->` markers.
- Learn a document's structure from `npx scrumo schema <type>` instead of guessing it.
- The flow: `/scrumo-kickoff`, `/scrumo-prd`, `/scrumo-architecture`, `/scrumo-standards`, `/scrumo-epics`, `/scrumo-stories`, then `/scrumo-sprint` with `/scrumo-dev` and `/scrumo-qa` for each story. Around the loop: `/scrumo-bug` reports a bug, `/scrumo-refine` grooms the backlog, `/scrumo-change` handles a change to approved scope, and `/scrumo-validate` checks any step.
<!-- scrumo:agents:end -->
