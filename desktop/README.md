# n-skills-client

A proof of concept for a desktop app that lets business analysts and architects
run [scrumo](../n-skills) skills without a terminal. It runs **the user's own
Claude Code installation**, with whatever login it already has (a Claude
subscription, a Console API key, Bedrock, …), and shows the conversation as a
chat with approval cards, a live document preview, and the scrumo validator.

It answers one question: can an app drive the user's local Claude Code on their
own subscription, against a scrumo project, with the app in control of what
the agent may change? Git, pull requests, and packaging are out of scope.

## Install (as a user)

```sh
npm install -g scrumo-desktop      # not published yet: npm install -g ./scrumo-desktop-0.1.0.tgz
```

The install downloads Electron (about 130 MB) and adds an app launcher, so
after that nobody needs the terminal:

| OS | Launcher | Open it from |
| --- | --- | --- |
| macOS | `~/Applications/Scrumo.app` | Launchpad, Spotlight, Finder; keep it in the Dock |
| Windows | `Scrumo` Start menu shortcut | Start menu; pin to the taskbar (**untested**) |
| Linux | `~/.local/share/applications/scrumo.desktop` | the app menu (**untested**) |

No Apple Developer account or Windows certificate is involved. Gatekeeper and
SmartScreen only check files that a browser downloaded and marked as coming
from the internet. npm doesn't mark them, and the macOS launcher is built on
the user's own machine: a clone of npm's Electron.app, renamed, given our
icon, pointed at the installed package, and ad-hoc signed. Cloning on APFS
means it takes almost no extra disk space.

- `scrumo-desktop [folder]` opens the app from a terminal.
- `--install-launcher` re-adds the launcher, for example after
  `npm install --ignore-scripts`. The app also re-adds a missing launcher when
  it starts.
- `--uninstall-launcher` removes the launcher before `npm uninstall -g
  scrumo-desktop`, because npm no longer runs uninstall scripts. If you forget,
  the launcher says the app was removed and suggests moving it to the Trash.

The launcher points at the Node version that installed it, so with nvm it
keeps working only while that Node version is still installed. Behind a proxy
that blocks GitHub downloads, set `ELECTRON_MIRROR`.

## Run it (development)

```sh
npm install
npm run demo:setup    # copies n-skills' sample project to .demo/pawplan with the CLI and skills
npm start             # opens the app on .demo/pawplan
npm run icons         # rebuilds build/icon.{png,icns,ico} from build/icon.svg (macOS)
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

Checked 2026-10-15 against Claude Code's
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page.
A product may run Claude Code for its users if it accepts Anthropic's
Commercial Terms and:

- runs the Claude Code binary unmodified, without removing any of its sign-in methods;
- lets each user sign in through Anthropic's own flow, with their own
  subscription, API key or cloud provider, billed to them;
- never pays for, resells or intermediates their usage.

The page says this "does not prevent an end user from signing in to the
unmodified Claude Code binary with their own Claude subscription". This app
follows those rules: it runs the user's installed `claude`, and sign-in happens
in Claude Code (`/login`).

What stays off-limits:

- our own "Sign in with Claude" flow;
- reading or storing Claude credentials or session tokens;
- routing requests through users' plan credentials on their behalf, for example
  a server proxying their subscriptions.

The [Help Center](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
confirms third-party apps draw from the user's subscription limits.
