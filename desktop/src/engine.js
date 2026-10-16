// Runs scrumo skills through the user's own Claude Code installation, using
// whatever login that installation already has (a Claude subscription, a
// Console API key, Bedrock, ...). The app never sees or stores credentials.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';

const APPEND = `You are running inside the scrumo client, a desktop app for business
analysts and architects. The person may not be a developer: explain what you
do in plain language, never ask them to run commands, and only change files
under the project's docs/ folder (and only through the scrumo skills' rules).
Status moves to approved are the person's decision.`;

/** The PATH a login shell has. Apps started from Finder or the Dock get a minimal PATH without node or claude. */
export function loginShellPath() {
  if (process.platform === 'win32') return process.env.PATH ?? '';
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__P__%s__P__" "$PATH"'], { encoding: 'utf8', timeout: 8000 });
    const m = out.match(/__P__(.*)__P__/s);
    if (m) return m[1];
  } catch { /* fall back below */ }
  return process.env.PATH ?? '';
}

/** Finds the user's own `claude` executable. */
export function findClaude(path) {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const dirs = [...path.split(delimiter), join(homedir(), '.local/bin'), join(homedir(), '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const d of dirs) {
    const p = join(d, exe);
    if (d && existsSync(p)) return p;
  }
  return null;
}

export function claudeVersion(claudePath, env) {
  try { return execFileSync(claudePath, ['--version'], { encoding: 'utf8', env, timeout: 15000 }).trim(); } catch { return null; }
}

/**
 * The environment for Claude Code. Strips every CLAUDE_ and ANTHROPIC_ variable so a
 * stray ANTHROPIC_API_KEY in the user's shell can't silently change who pays:
 * 'local' uses the installation's own login, 'api-key' passes the key given.
 */
export function engineEnv(path, auth = { mode: 'local' }) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/.test(k) && k !== 'CLAUDE_CONFIG_DIR') continue;
    if (k.startsWith('ELECTRON_')) continue;
    env[k] = v;
  }
  env.PATH = path;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'n-skills-client/0.0.1';
  if (auth.mode === 'api-key') env.ANTHROPIC_API_KEY = auth.key;
  return env;
}

const SCRUMO = /^(npx\s+(--no-install\s+)?)?(\.\/)?(node_modules\/\.bin\/)?scrumo(\s+[\w\-./=:,@ ]*)?$/;
const READ_ONLY = /^(ls|cat|head|tail|wc|grep|rg|pwd|echo|find)(\s|$)/;

/**
 * Commands that run without asking: scrumo itself, and plain read-only commands
 * (no redirection, substitution, or find actions) chained with ; && || or |.
 */
export function isSafeCommand(cmd) {
  if (/[<>`]|\$\(|\n/.test(cmd)) return false;
  return cmd.split(/\s*(?:;|&&|\|\||\|)\s*/).every(part => {
    const p = part.trim();
    if (SCRUMO.test(p)) return true;
    return READ_ONLY.test(p) && !/\s-(exec|execdir|delete|ok|fprint\w*)\b/.test(p);
  });
}

/**
 * The app's permission policy, applied before asking the person: scrumo and
 * read-only commands run, edits outside docs/ are refused, and everything else
 * (edits inside docs/, other commands) is put to the person.
 */
export function decide(toolName, input, root) {
  if (toolName === 'Bash') return isSafeCommand(String(input.command ?? '')) ? { allow: true } : { ask: true };
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    const file = String(input.file_path ?? input.notebook_path ?? '');
    const rel = relative(join(root, 'docs'), resolve(root, file));
    if (rel.startsWith('..') || isAbsolute(rel)) return { deny: 'This app only lets the agent change files under docs/. Explain the change to the person instead.' };
    return { ask: true, docEdit: true };
  }
  return { ask: true };
}

/** One conversation: a long-lived Claude Code process fed with user messages. */
export class ChatSession {
  constructor({ root, claudePath, env, onMessage, askPerson, autoApproveDocEdits = false }) {
    Object.assign(this, { root, claudePath, env, onMessage, askPerson, autoApproveDocEdits });
    this.queue = [];
    this.wake = null;
    this.closed = false;
    this.abort = new AbortController();
  }

  async *input() {
    while (!this.closed) {
      if (this.queue.length) { yield this.queue.shift(); continue; }
      await new Promise(r => { this.wake = r; });
    }
  }

  start() {
    this.q = query({
      prompt: this.input(),
      options: {
        cwd: this.root,
        pathToClaudeCodeExecutable: this.claudePath,
        env: this.env,
        permissionMode: 'default',
        settingSources: ['project'],
        skills: 'all',
        // Only the tools this app chooses: no claude.ai connectors or MCP servers from the user's own setup.
        strictMcpConfig: true,
        mcpServers: {},
        settings: { disableClaudeAiConnectors: true },
        systemPrompt: { type: 'preset', preset: 'claude_code', append: APPEND },
        abortController: this.abort,
        canUseTool: async (toolName, input, { signal }) => {
          const d = decide(toolName, input, this.root);
          if (d.allow) return { behavior: 'allow', updatedInput: input };
          if (d.deny) return { behavior: 'deny', message: d.deny };
          if (d.docEdit && this.autoApproveDocEdits) return { behavior: 'allow', updatedInput: input };
          const answer = await this.askPerson({ toolName, input }, signal);
          return answer.allow
            ? { behavior: 'allow', updatedInput: input }
            : { behavior: 'deny', message: answer.message || 'The person declined this step.' };
        },
      },
    });
    this.done = (async () => {
      try {
        for await (const msg of this.q) this.onMessage(msg);
      } catch (err) {
        if (!this.closed) this.onMessage({ type: 'app_error', message: String(err?.message ?? err) });
      }
    })();
    return this;
  }

  send(text) {
    this.queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    this.wake?.();
  }

  async interrupt() { await this.q?.interrupt().catch(() => {}); }

  close() {
    this.closed = true;
    this.wake?.();
    this.q?.close();
  }
}
