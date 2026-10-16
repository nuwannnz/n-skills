# scrumo desktop

A proof of concept for a desktop app that lets business analysts and architects
run [scrumo](..) skills without a terminal. It runs **the user's own
Claude Code installation**, with whatever login it already has (a Claude
subscription, a Console API key, Bedrock, …), and shows the conversation as a
chat with approval cards, a live document preview, and the scrumo validator.

It answers one question: can an app drive the user's local Claude Code on their
own subscription, against a scrumo project, with the app in control of what
the agent may change? Packaging is covered below; the git and pull request
workflow is described under "Projects and git".

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
npm run demo:setup    # copies the repository's sample project to .demo/pawplan with the CLI and skills
npm start             # builds the window (Vite) and opens the app on .demo/pawplan
npm run dev           # the same, with the window served by Vite: React edits show up without a restart
npm run check         # syntax of the main-process files, renderer typecheck, renderer build
npm run icons         # rebuilds build/icon.{png,icns,ico} from build/icon.svg (macOS)
```

Needs Node 22 and Claude Code installed and signed in (`claude`, then `/login`).
`SCRUMO_REPO` points `demo:setup` at a scrumo package folder (default: the repository root),
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
- **Permission policy** (`decide()` in `src/engine.js`): scrumo, plain read-only
  commands and reading or planning tools (loading a skill, the to-do list) always
  run; edits outside `docs/` are always refused; the agent's questions always
  reach the person. The rest follows the **Permissions** setting, picked in the
  chat box or in settings and saved for every project: *Ask* puts edits inside
  `docs/` and other commands to the person as approval cards, *Accept edits* lets
  edits inside `docs/` through, and *Auto* lets edits and commands through except
  risky ones (deleting files, `sudo`, `git push`, hard resets), which still ask.
- `src/main.js` is the Electron main process: it lists `docs/`, watches it for
  changes, runs the project's own `node_modules/.bin/scrumo` for
  `validate --json` and `status --json`, and relays approvals.
- `src/renderer/` is the window: React 19 and TypeScript, built by Vite into
  `dist/renderer/` (which the main process loads, and which the npm package
  ships). The page's content security policy is added at build time, so the dev
  server can hot-reload. It is laid out by feature:
  - `app/`: the root component, the store (zustand with immer; one entry per
    open project, so switching projects keeps chats, filters and drafts) and
    `ipc.ts`, which turns the main process's events into store changes.
  - `features/<name>/`: one folder per part of the app (chat, sprint, backlog,
    board, epics, documents, planning, team, changes, guide, usage, wizard,
    projects, settings, palette, workspace). A feature keeps its components and
    its `actions.ts` together; components read the store, actions change it.
  - `ui/`: the reusable, presentational components (buttons, pills, cards,
    popover, menus, markdown, diffs). They take props only: no store, no IPC,
    no project knowledge. Import them from `ui/index.ts`.
  - `lib/`: plain code shared by features: the typed `window.api` bridge, the
    IPC data types, project data helpers, formatting.
  - `styles/`: the stylesheets, unchanged from before the move to React.

## Working in a project

The left side of a project is a short navigation instead of a tree of every
document, so it scales to hundreds of stories:

- **Chat** and **Changes**: the agent, and what is unsaved (see below).
- **Sprint**: status, burndown, points by status, what needs attention and the
  stories in the sprint. The burndown is worked out from the stories
  (a story counts as finished on the day it was last updated to done).
- **Backlog**: epics panel, search, filters (epic, status, assignee, hide done),
  sprints and the backlog as sections. **New story** opens the chat with the
  product owner skill.
- **Board** (the active sprint by column) and **Epics** (progress per epic).
- **Documents**, **Checks** and **Team**. ⌘K (Ctrl+K) finds any story or document.
- **Sprint planning** (Sprint, then *Plan next sprint*): a screen to share in a
  meeting. Write the goal, set capacity (defaults to the team's points), add
  ready stories from the backlog, then *Create Sprint N*, which runs
  `scrumo sprint plan`; *Start Sprint N* runs `scrumo sprint start`. An active
  sprint's unfinished stories can only move over after it is closed.
- **Team** edits the `team:` list in `scrumo.yaml` through `scrumo team
  add|set|remove` (roles: owner, scrum-master, architect, dev, qa; points per
  sprint feed capacity). The change shows up under Changes like any other.
- **Documents** open full window with an outline and who last changed them
  (from `git log`); the split icon in the header puts the chat beside any view.
- **New project** (the + in the rail, or on the home screen): pick or create a
  folder, name it and give it a ticket key, and the app runs `git init`, `npm
  init`, `npm install --save-dev scrumo`, `scrumo init`, `scrumo team add --me`
  and a first commit (progress is shown step by step). Then add the team, then
  start the kickoff: your description goes to the product strategist skill, which
  writes the brief. `SCRUMO_CLI` points the install at a local checkout of the
  scrumo package instead of the npm one.
- **Chat extras**: *History* lists earlier chats of the project (from Claude Code's
  own transcripts) and reopens one, so the next message continues it. A panel on the
  right lists the files the chat created or edited, and opens them. A ring shows how
  full the conversation is. Multiple-choice questions from the agent appear as option
  cards. The model picker lists what your Claude Code offers (asked at start, without
  sending anything, and kept for next time) and applies from the next message.
- **Appearance**: light, dark or match the system (settings).
- **Updates**: at start and every six hours the app asks the npm registry
  (`registry.npmjs.org/scrumo-desktop/latest`, nothing else is sent) whether a newer
  version is published. If so, an update icon appears at the bottom of the project rail.
  For a global npm install, *Update now* runs `npm install -g scrumo-desktop@latest` and
  offers a restart; any other copy shows the command. Nothing happens while the package
  isn't published. Turn it off in settings; `SCRUMO_UPDATE_URL` points the check elsewhere
  for testing.

## Projects and git

- **Many projects.** The app remembers every project you open (`projects.json`
  in the app's data folder). The home screen lists them, and a rail on the left
  switches between them like Slack workspaces. Each project keeps its own chat,
  open document and git state, and a chat keeps running while you look at
  another project. Right-click a project in the rail, or use the × on its card,
  to remove it from the list (files are never touched).
- **Git identity per project.** The header shows who commits are made as.
  Editing it runs `git config --local user.name` / `user.email` for that
  project only. If you're signed in to `gh`, one click fills in that account.
- **Stays current.** Every minute, and whenever the window gets focus, the app
  runs `git fetch` and fast-forwards the current branch when that is safe. It
  never merges, rebases or discards anything; a diverged branch is only reported.
- **Save changes.** The Changes tab lists unsaved edits with their diffs. Saving
  creates a `scrumo/…` branch (when you're on the default branch), commits,
  pushes and opens a pull request with `gh`. Saving again on that branch adds to
  the open pull request. Without `gh`, or without a GitHub remote, it still
  commits (and pushes, if there's a remote) and says what it couldn't do.
- **Review status.** Your pull requests are polled with `gh pr list`:
  waiting for review, approved, changes requested, merged, closed, plus checks
  and merge conflicts. A desktop notification fires when one changes, and the
  rail shows a green or red dot. When your branch's pull request is merged and
  the working tree is clean, the app switches back to the default branch and
  pulls.
- An approval request always brings the chat forward, since the agent waits on it.
  A project tile shows a pulsing dot while its agent works, amber when it needs you.

`SCRUMO_USER_DATA=<dir>` runs the app with a separate profile, for development
beside an installed copy.

## Known gaps

- **Git and PRs need `git` and `gh` on the machine's PATH**, and `gh` signed in
  (`gh auth login`). `gh` has one active account at a time, so the per-project
  identity only sets commit authorship; the pull request is opened as the active
  `gh` account. Opening a PR was not exercised against a live GitHub repo yet.
- The agent still edits the working tree directly (no worktree per chat).
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
