// NSK2xx: Markdown style via markdownlint with the shipped config, plus the
// H1 and line-ending rules that markdownlint can't express.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFixes } from 'markdownlint';
import { lint } from 'markdownlint/sync';
import { SPEC_DIR } from '../spec/load.ts';
import type { Doc } from './doc.ts';
import type { Report } from './types.ts';

const config = JSON.parse(readFileSync(join(SPEC_DIR, 'markdownlint.json'), 'utf8')) as Record<string, unknown>;

export function lintText(text: string) {
  const { content } = lint({ strings: { content: text }, config, handleRuleFailures: true });
  return content ?? [];
}

export function checkMarkdown(doc: Doc, raw: string, report: Report): void {
  if (raw.startsWith('﻿') || raw.includes('\r')) {
    report('NSK204', doc.file, 'file has CRLF line endings or a byte order mark; use LF and no BOM');
  }
  for (const error of lintText(doc.text)) {
    const alias = error.ruleNames.join('/');
    const detail = error.errorDetail ? `: ${error.errorDetail}` : '';
    report('NSK201', doc.file, `${alias} ${error.ruleDescription}${detail}`, error.lineNumber);
  }
  const h1s = doc.headings.filter((h) => h.level === 1);
  const first = doc.lines.findIndex((line, i) => i >= doc.bodyStart && line.trim() !== '');
  if (h1s.length !== 1) {
    report('NSK202', doc.file, `document must have exactly one H1, found ${h1s.length}`, h1s[1] ? h1s[1].line + 1 : undefined);
  } else if (h1s[0]!.line !== first) {
    report('NSK202', doc.file, 'the H1 must be the first thing after the frontmatter', h1s[0]!.line + 1);
  }
  const title = doc.fm?.title;
  if (h1s[0] && typeof title === 'string' && h1s[0].text !== title) {
    report('NSK203', doc.file, `H1 "${h1s[0].text}" differs from the frontmatter title "${title}"`, h1s[0].line + 1);
  }
}

/** Applies every markdownlint fix that has fix information. */
export function fixMarkdown(text: string): string {
  return applyFixes(text, lintText(text));
}
