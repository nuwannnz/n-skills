// Parses a managed Markdown file into frontmatter, headings, and body helpers.
// It is deliberately lenient: the checks decide what is an error.
import { parse } from 'yaml';

export interface Heading {
  level: number;
  text: string;
  line: number; // 0-based index into Doc.lines
}

export interface Doc {
  file: string; // path relative to the project root, used in findings
  rel: string; // path relative to the docs folder
  kind: string | undefined;
  text: string;
  raw: string; // the file as read, before line endings were normalised
  lines: string[];
  fm: Record<string, unknown> | null;
  fmError: string | undefined;
  fmKeyLines: Map<string, number>; // top-level key -> 0-based line
  bodyStart: number; // first line after the frontmatter
  headings: Heading[];
}

const PLACEHOLDER = /\b(?:TODO|TBD)\b|\?\?\?|<(?!https?:\/\/)[^<>\n]+>/;

export function parseDoc(file: string, rel: string, kind: string | undefined, text: string): Doc {
  const lines = text.split('\n');
  let fm: Record<string, unknown> | null = null;
  let fmError: string | undefined;
  const fmKeyLines = new Map<string, number>();
  let bodyStart = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) {
      fmError = 'frontmatter block is not closed with ---';
    } else {
      bodyStart = end + 1;
      try {
        const parsed: unknown = parse(lines.slice(1, end).join('\n'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fm = parsed as Record<string, unknown>;
        else fmError = 'frontmatter must be a YAML mapping';
      } catch (error) {
        fmError = `frontmatter is not valid YAML: ${(error as Error).message.split('\n')[0]}`;
      }
      for (let i = 1; i < end; i += 1) {
        const key = /^([A-Za-z_][\w-]*):/.exec(lines[i]!)?.[1];
        if (key !== undefined && !fmKeyLines.has(key)) fmKeyLines.set(key, i);
      }
    }
  } else {
    fmError = 'file must start with a --- frontmatter block';
  }

  const headings: Heading[] = [];
  let fence: string | undefined;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i]!;
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (opener) {
      if (fence === undefined) fence = opener[0]!.repeat(opener.length);
      else if (line.trim().startsWith(fence)) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const match = /^(#{1,6}) +(.*?)(?: +#+)?\s*$/.exec(line);
    if (match) headings.push({ level: match[1]!.length, text: match[2]!, line: i });
  }
  return { file, rel, kind, text, raw: text, lines, fm, fmError, fmKeyLines, bodyStart, headings };
}

export function status(doc: Doc): string | undefined {
  const value = doc.fm?.status;
  return typeof value === 'string' ? value : undefined;
}

/** Body lines with HTML comments removed (nsk markers kept) and blank lines dropped. */
export function content(lines: string[]): string[] {
  return lines
    .join('\n')
    .replace(/<!--(?!\s*nsk:)[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

/** True when text outside code and comments contains a placeholder. */
export function hasPlaceholder(lines: string[]): boolean {
  const kept: string[] = [];
  let fence: string | undefined;
  for (const line of content(lines)) {
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (opener) {
      fence = fence === undefined ? opener[0]!.repeat(opener.length) : undefined;
      continue;
    }
    if (fence !== undefined || /^<!-- nsk:/.test(line)) continue;
    kept.push(line.replace(/`[^`]*`/g, ''));
  }
  return PLACEHOLDER.test(kept.join('\n'));
}

export interface ListItems {
  items: string[]; // top-level items, continuation lines joined with a space
  bad: string[]; // lines that are not part of a dash list
}

export function listItems(lines: string[]): ListItems {
  const items: string[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    if (line.startsWith('- ')) items.push(line.slice(2).trim());
    else if (/^\s+(?:[-*+] |\d+\. )/.test(line) && items.length) continue;
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
    else bad.push(line);
  }
  return { items, bad };
}

export interface Table {
  header: string[];
  rows: string[][];
  bad: string[]; // lines that are not table rows
  malformed: string | undefined;
}

export function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

export function parseTable(lines: string[]): Table {
  const rowLines = lines.filter((line) => line.trim().startsWith('|'));
  const bad = lines.filter((line) => !line.trim().startsWith('|'));
  const table: Table = { header: [], rows: [], bad, malformed: undefined };
  if (rowLines.length === 0) return table;
  table.header = splitRow(rowLines[0]!);
  const delimiter = rowLines[1];
  if (delimiter === undefined || !splitRow(delimiter).every((cell) => /^:?-{3,}:?$/.test(cell))) {
    table.malformed = 'the second line must be a delimiter row like | --- | --- |';
    return table;
  }
  table.rows = rowLines.slice(2).map(splitRow);
  const wrong = table.rows.find((row) => row.length !== table.header.length);
  if (wrong) table.malformed = `a row has ${wrong.length} cells but the header has ${table.header.length}`;
  return table;
}

export interface Section {
  heading: Heading;
  /** First line after this section (next heading of the same or a higher level). */
  end: number;
  /** First line that belongs to a child heading, or `end`. */
  introEnd: number;
}

/** Sections at `level` between lines `from` (exclusive) and `to` (exclusive). */
export function sectionsAt(doc: Doc, level: number, from: number, to: number): Section[] {
  const here = doc.headings.filter((h) => h.level === level && h.line > from && h.line < to);
  return here.map((heading) => {
    const end = doc.headings.find((h) => h.line > heading.line && h.level <= level)?.line ?? to;
    const introEnd = doc.headings.find((h) => h.line > heading.line && h.level > level && h.line < end)?.line ?? end;
    return { heading, end: Math.min(end, to), introEnd };
  });
}

export function sectionBody(doc: Doc, section: Section, intro = true): string[] {
  return doc.lines.slice(section.heading.line + 1, intro ? section.introEnd : section.end);
}

/** First H2 with this exact text, or undefined. */
export function findSection(doc: Doc, heading: string): Section | undefined {
  return sectionsAt(doc, 2, -1, doc.lines.length).find((s) => s.heading.text === heading);
}

export function findBody(doc: Doc, heading: string): string[] | undefined {
  const section = findSection(doc, heading);
  return section ? content(sectionBody(doc, section)) : undefined;
}

export function tableRecords(lines: string[] | undefined): Array<Record<string, string>> {
  if (!lines) return [];
  const table = parseTable(lines);
  return table.rows.map((row) => Object.fromEntries(table.header.map((name, i) => [name, row[i] ?? ''])));
}
