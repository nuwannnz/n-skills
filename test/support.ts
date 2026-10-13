// Helpers for tests that start from a copy of the sample project and break it.
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate } from '../src/validate/index.ts';

export const SAMPLE = new URL('../examples/sample-project/', import.meta.url).pathname;

export class Fixture {
  readonly root = mkdtempSync(join(tmpdir(), 'scrumo-'));

  constructor(source: string | null = SAMPLE) {
    if (source) cpSync(source, this.root, { recursive: true });
  }

  path(rel: string): string {
    return join(this.root, rel);
  }

  read(rel: string): string {
    return readFileSync(this.path(rel), 'utf8');
  }

  write(rel: string, text: string): this {
    writeFileSync(this.path(rel), text);
    return this;
  }

  remove(rel: string): this {
    rmSync(this.path(rel));
    return this;
  }

  rename(from: string, to: string): this {
    renameSync(this.path(from), this.path(to));
    return this;
  }

  /** Replaces the first occurrence of `from`, and fails the test setup if it isn't there. */
  edit(rel: string, from: string, to: string): this {
    const text = this.read(rel);
    if (!text.includes(from)) throw new Error(`${rel} doesn't contain ${JSON.stringify(from)}`);
    return this.write(rel, text.replace(from, () => to));
  }

  private bounds(rel: string, heading: string): { text: string; start: number; end: number } {
    const text = this.read(rel);
    const start = text.indexOf(`\n## ${heading}\n`) + 1;
    if (start === 0) throw new Error(`${rel} has no section ${heading}`);
    const next = text.indexOf('\n## ', start + 1);
    return { text, start, end: next === -1 ? text.length : next + 1 };
  }

  /** Replaces everything under a H2 heading (up to the next H2). */
  setSection(rel: string, heading: string, body: string): this {
    const { text, start, end } = this.bounds(rel, heading);
    const tail = end === text.length ? '' : '\n';
    return this.write(rel, `${text.slice(0, start)}## ${heading}\n\n${body}\n${tail}${text.slice(end)}`);
  }

  removeSection(rel: string, heading: string): this {
    const { text, start, end } = this.bounds(rel, heading);
    return this.write(rel, text.slice(0, start) + text.slice(end));
  }

  /** Cuts a section and appends it at the end, which puts it out of order. */
  moveSectionToEnd(rel: string, heading: string): this {
    const { text, start, end } = this.bounds(rel, heading);
    const cut = text.slice(start, end).trimEnd();
    return this.write(rel, `${(text.slice(0, start) + text.slice(end)).trimEnd()}\n\n${cut}\n`);
  }

  codes(): string[] {
    return validate(this.root).findings.map((f) => f.code);
  }

  findings() {
    return validate(this.root).findings;
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

export const STORY4 = 'docs/stories/PAW-4-email-signup.md';
export const STORY5 = 'docs/stories/PAW-5-login-logout.md';
export const STORY6 = 'docs/stories/PAW-6-password-reset.md';
export const STORY7 = 'docs/stories/PAW-7-open-slots.md';
export const STORY8 = 'docs/stories/PAW-8-book-appointment.md';
export const STORY9 = 'docs/stories/PAW-9-cancel-appointment.md';
export const EPIC1 = 'docs/epics/PAW-1-owner-accounts.md';
export const EPIC2 = 'docs/epics/PAW-2-appointment-booking.md';
export const EPIC3 = 'docs/epics/PAW-3-clinic-schedule.md';
export const PRD = 'docs/prd.md';
export const ARCH = 'docs/architecture.md';
export const TRACKER = 'docs/sprint-tracker.md';
export const CONFIG = 'scrumo.yaml';
