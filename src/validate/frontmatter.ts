// SCRUMO3xx: checks parsed frontmatter against a schema's field definitions.
import type { FieldDef } from '../spec/types.ts';

export type FieldReport = (code: string, message: string, key?: string) => void;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function describe(value: unknown): string {
  return Array.isArray(value) ? 'a list' : value === null ? 'null' : typeof value === 'object' ? 'a mapping' : `${typeof value} ${JSON.stringify(value)}`;
}

function checkValue(field: FieldDef, value: unknown, where: string, key: string, top: string, report: FieldReport): void {
  const bad = (code: string, message: string) => report(code, `field "${where}" ${message}`, top);
  if (value === null) {
    if (!field.nullable) bad('SCRUMO304', 'must not be null');
    return;
  }
  if (field.fixed !== undefined && value !== field.fixed) {
    bad('SCRUMO305', `must be ${JSON.stringify(field.fixed)}, got ${describe(value)}`);
    return;
  }
  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') return bad('SCRUMO304', `must be a string, got ${describe(value)}`);
      if (value.trim() === '') return bad('SCRUMO304', 'must not be empty');
      if (field.pattern && !new RegExp(field.pattern.replaceAll('{key}', key)).test(value)) bad('SCRUMO306', `${JSON.stringify(value)} doesn't match ${field.pattern}`);
      return;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return bad('SCRUMO304', `must be an integer, got ${describe(value)}`);
      if (field.values && !field.values.includes(value)) bad('SCRUMO305', `must be one of ${field.values.join(', ')}, got ${value}`);
      else if (field.min !== undefined && value < field.min) bad('SCRUMO305', `must be at least ${field.min}, got ${value}`);
      else if (field.max !== undefined && value > field.max) bad('SCRUMO305', `must be at most ${field.max}, got ${value}`);
      return;
    case 'date':
      if (typeof value !== 'string') return bad('SCRUMO304', `must be a YYYY-MM-DD date, got ${describe(value)}`);
      if (!validDate(value)) bad('SCRUMO306', `${JSON.stringify(value)} is not a YYYY-MM-DD date`);
      return;
    case 'semver':
      if (typeof value !== 'string') return bad('SCRUMO304', `must be a semver string like 1.0.0, got ${describe(value)}`);
      if (!/^\d+\.\d+\.\d+$/.test(value)) bad('SCRUMO306', `${JSON.stringify(value)} is not a semver like 1.0.0`);
      return;
    case 'enum':
      if (!field.values!.includes(value as string)) bad('SCRUMO305', `must be one of ${field.values!.join(', ')}, got ${describe(value)}`);
      return;
    case 'ticket-id':
    case 'ticket-ref': {
      if (typeof value !== 'string') return bad('SCRUMO304', `must be a ticket ID, got ${describe(value)}`);
      if (new RegExp(`^${key}-[1-9]\\d*$`).test(value)) return;
      if (/^[A-Z][A-Z0-9]*-[1-9]\d*$/.test(value)) bad('SCRUMO105', `${value} uses a key other than ${key}`);
      else bad('SCRUMO306', `${JSON.stringify(value)} is not a ticket ID like ${key}-1`);
      return;
    }
    case 'list':
      if (!Array.isArray(value)) return bad('SCRUMO304', `must be a list, got ${describe(value)}`);
      value.forEach((item, i) => checkValue(field.items!, item, `${where}[${i}]`, key, top, report));
      return;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) return bad('SCRUMO304', `must be a mapping, got ${describe(value)}`);
      checkFields(field.fields!, value as Record<string, unknown>, where, key, top, report);
  }
}

export function checkFields(fields: FieldDef[], data: Record<string, unknown>, where: string, key: string, top: string | undefined, report: FieldReport): void {
  const prefix = where === '' ? '' : `${where}.`;
  const known = new Set(fields.map((f) => f.name!));
  for (const field of fields) {
    const at = `${prefix}${field.name}`;
    const topKey = top ?? field.name!;
    if (!(field.name! in data)) report('SCRUMO302', `missing required field "${at}"`, topKey);
    else checkValue(field, data[field.name!], at, key, topKey, report);
  }
  for (const name of Object.keys(data)) {
    if (!known.has(name)) report('SCRUMO303', `unknown field "${prefix}${name}"`, top ?? name);
  }
  const present = Object.keys(data).filter((name) => known.has(name));
  const expected = fields.map((f) => f.name!).filter((name) => present.includes(name));
  if (present.join() !== expected.join()) report('SCRUMO307', `fields${where ? ` of "${where}"` : ''} are out of order; expected ${expected.join(', ')}`, top ?? present[0]);
}
