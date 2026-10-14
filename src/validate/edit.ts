// Small text edits to a file's frontmatter that keep the rest of the file as written.
import { parseDoc } from './doc.ts';

/** Sets a top-level frontmatter key to `value` (already YAML text; start it with a newline for a block value), replacing any multi-line value. */
export function setField(text: string, key: string, value: string): string {
  const doc = parseDoc('', '', undefined, text);
  const line = doc.fmKeyLines.get(key);
  if (line === undefined) throw new Error(`frontmatter has no ${key}`);
  const closing = doc.lines.indexOf('---', 1);
  const next = [...doc.fmKeyLines.values()].filter((l) => l > line).sort((a, b) => a - b)[0] ?? closing;
  const lines = [...doc.lines];
  lines.splice(line, next - line, value.startsWith('\n') ? `${key}:${value}` : `${key}: ${value}`);
  return lines.join('\n');
}

export function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Sets a top-level key in a plain YAML file such as scrumo.yaml (no --- block). */
export function setYamlKey(text: string, key: string, value: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start < 0) throw new Error(`scrumo.yaml has no ${key}`);
  const next = lines.findIndex((line, i) => i > start && /^[A-Za-z_][\w-]*:/.test(line));
  lines.splice(start, (next === -1 ? lines.length : next) - start, value.startsWith('\n') ? `${key}:${value}` : `${key}: ${value}`);
  return lines.join('\n');
}

/** Adds a top-level key to a plain YAML file, right after `after`, when it is missing. */
export function addYamlKey(text: string, key: string, value: string, after: string): string {
  const lines = text.split('\n');
  if (lines.some((line) => line.startsWith(`${key}:`))) return setYamlKey(text, key, value);
  const start = lines.findIndex((line) => line.startsWith(`${after}:`));
  if (start < 0) throw new Error(`scrumo.yaml has no ${after}`);
  const next = lines.findIndex((line, i) => i > start && /^[A-Za-z_][\w-]*:/.test(line));
  lines.splice(next === -1 ? lines.length : next, 0, `${key}: ${value}`);
  return lines.join('\n');
}
