import { fix, validate } from '../validate/index.ts';
import type { Finding } from '../validate/types.ts';

export function format(findings: Finding[], files: number): string {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  if (findings.length === 0) return `✔ no problems found in ${files} file${files === 1 ? '' : 's'}\n`;
  const lines: string[] = [];
  let current: string | undefined;
  for (const f of findings) {
    if (f.file !== current) {
      lines.push(f.file);
      current = f.file;
    }
    lines.push(`  ${f.code}  ${f.severity === 'warning' ? '(warning) ' : ''}${f.message}${f.line ? ` (line ${f.line})` : ''}`);
  }
  const touched = new Set(findings.map((f) => f.file)).size;
  lines.push(`${errors ? '✖' : '⚠'} ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} in ${touched} file${touched === 1 ? '' : 's'}`);
  return `${lines.join('\n')}\n`;
}

export function validateCommand(path: string, options: { fix: boolean; json: boolean }): { code: number; out: string } {
  let fixed: string[] = [];
  if (options.fix) fixed = fix(path);
  const result = validate(path);
  const errors = result.findings.filter((f) => f.severity === 'error').length;
  if (options.json) {
    return { code: errors ? 1 : 0, out: `${JSON.stringify({ ok: errors === 0, errors, warnings: result.findings.length - errors, files: result.files, fixed, findings: result.findings }, null, 2)}\n` };
  }
  const note = fixed.length ? `fixed ${fixed.length} file${fixed.length === 1 ? '' : 's'}: ${fixed.join(', ')}\n` : '';
  return { code: errors ? 1 : 0, out: note + format(result.findings, result.files) };
}
