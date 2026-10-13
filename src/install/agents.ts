// Guesses which agents a repository already uses, from the folders they leave behind.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent } from '../spec/types.ts';

const MARKERS: Record<string, string[]> = {
  claude: ['.claude', 'CLAUDE.md'],
  codex: ['.codex'],
  cursor: ['.cursor', '.cursorrules'],
  gemini: ['.gemini', 'GEMINI.md'],
  copilot: ['.github/copilot-instructions.md'],
};

export function installedAgents(root: string, agents: Agent[]): string[] {
  return agents.filter((a) => (MARKERS[a.id] ?? []).some((marker) => existsSync(join(root, marker)))).map((a) => a.id);
}
