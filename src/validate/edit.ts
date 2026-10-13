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
