// Chooses the fewest skills directories that every selected agent reads.
import type { Agent } from '../spec/types.ts';

/** Directory -> ids of the selected agents it serves. */
export function chooseDirs(selected: Agent[]): Map<string, string[]> {
  const chosen = new Map<string, string[]>();
  let uncovered = [...selected];
  while (uncovered.length > 0) {
    const reads = (agent: Agent) => [agent.skills_dir, ...agent.also_reads];
    const candidates = [...new Set(uncovered.flatMap(reads))];
    const own = new Set(uncovered.map((a) => a.skills_dir));
    const score = (dir: string) => uncovered.filter((a) => reads(a).includes(dir)).length;
    candidates.sort((a, b) => score(b) - score(a) || Number(own.has(b)) - Number(own.has(a)) || a.localeCompare(b));
    const dir = candidates[0]!;
    chosen.set(dir, uncovered.filter((a) => reads(a).includes(dir)).map((a) => a.id));
    uncovered = uncovered.filter((a) => !reads(a).includes(dir));
  }
  return chosen;
}
