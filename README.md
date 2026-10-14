# n-skills-client

A proof of concept for a desktop app that lets business analysts and architects
run [scrumo](../n-skills) skills without a terminal. It runs **the user's own
Claude Code installation**, with whatever login it already has (a Claude
subscription, a Console API key, Bedrock, …), and shows the conversation as a
chat with approval cards, a live document preview, and the scrumo validator.

It answers one question: can an app drive the user's local Claude Code on their
own subscription, against a scrumo project, with the app in control of what
the agent may change? Git, pull requests, and packaging are out of scope.

## Run it

```sh
npm install
npm run demo:setup    # copies n-skills' sample project to .demo/pawplan with the CLI and skills
npm start             # opens the app on .demo/pawplan
```

Needs Node 22 and Claude Code installed and signed in (`claude`, then `/login`).
`SCRUMO_REPO` points `demo:setup` at the n-skills checkout (default: `../n-skills`),
and `SCRUMO_PROJECT` opens a different project. **Open project…** picks any
folder with a `scrumo.yaml`.

`npm run smoke` runs one request through the engine without Electron and prints
which login Claude Code used.

## What it showed (2026-10-14, Claude Code 2.1.290, Agent SDK 0.3.299)

| Check | Result |
| --- | --- |
| Runs the user's local `claude`, not a bundled one | Yes, via `pathToClaudeCodeExecutable` |
| Uses the user's Claude login, no API key | Yes: `apiKeySource` is `none` (a claude.ai login) |
| Loads the project's scrumo skills | All 13, from `.claude/skills` |
| Skill as a slash command (`/scrumo-change …`) | Works in streaming input |
| Read-only status question | 7.6 s, 2 turns, $0.06 API-equivalent |
| `/scrumo-change` for the late-fee decision (PRD + PAW-9) | 93 s, 17 turns, $0.34 API-equivalent; validator passes after |
| One small PRD edit with an approval in the app | 13.8 s, 5 turns, $0.10 API-equivalent |
| Approval cards, live preview, "edited" marks, validation badge | Work in the Electron window |

On a subscription the dollar figures are what the same tokens would cost on the
API; the user pays nothing extra, but the usage counts against their plan's
limits.

## How it works

- `src/engine.js` wraps the Claude Agent SDK. It finds the user's `claude` on
  their login-shell `PATH` (apps started from Finder don't get one), and starts
  it with every `CLAUDE_*` and `ANTHROPIC_*` variable removed, so a stray
  `ANTHROPIC_API_KEY` can't silently change who pays. One long-lived Claude
  Code process per chat, fed through streaming input.
- Only the project's settings and skills load (`settingSources: ['project']`),
  and the user's claude.ai connectors and MCP servers are switched off, so the
  agent only has the tools this app chooses.
- **Permission policy** (`decide()` in `src/engine.js`): scrumo and plain read-only
  commands run; edits outside `docs/` are refused; edits inside `docs/` and any
  other command go to the person as an approval card. "Approve doc edits
  automatically" skips the card for edits inside `docs/` only.
- `src/main.js` is the Electron main process: it lists `docs/`, watches it for
  changes, runs the project's own `node_modules/.bin/scrumo` for
  `validate --json` and `status --json`, and relays approvals.
- `src/renderer/` is plain HTML and JavaScript, no framework.

## Known gaps

- **No git yet.** The agent edits the working tree directly. Next: one git
  worktree per chat, then "Submit for review" (branch, commit, PR).
- **Approval cards appear after the tool card** they belong to; they should
  replace it.
- **One chat at a time**, and chats don't survive a restart (the SDK can
  `resume` a session; not wired up).
- **No scrumo MCP server yet**, so Claude Code run elsewhere (a terminal, an IDE)
  can't drive the app.
- **Electron's binary download** can fail on some networks during `npm install`; if
  `node_modules/electron/dist` is missing, run `node node_modules/electron/install.js`.

## The subscription question

Anthropic's Agent SDK docs say third-party developers may not offer claude.ai
login or rate limits in their products "unless previously approved". Running
the user's own Claude Code with their own login, as this app does, falls under
that sentence. It works today and the app never handles credentials, but get
Anthropic's approval before releasing it publicly. API-key, Bedrock and Vertex
logins are fine without approval.
