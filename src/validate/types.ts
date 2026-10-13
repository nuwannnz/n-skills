import type { Doc } from './doc.ts';
import type { Schema, Spec } from '../spec/types.ts';

export interface Finding {
  code: string;
  severity: 'error' | 'warning';
  file: string;
  line: number | undefined; // 1-based
  message: string;
}

export interface Config {
  key: string;
  docsDir: string; // relative to the project root
  ignore: string[];
}

export interface Project {
  root: string;
  config: Config;
  spec: Spec;
  docs: Doc[];
  /** Epic and story docs by ticket ID (first one wins when IDs repeat). */
  tickets: Map<string, Doc>;
  prd: Doc | undefined;
  architecture: Doc | undefined;
  standards: Doc | undefined;
  tracker: Doc | undefined;
}

export type Report = (code: string, file: string, message: string, line?: number) => void;

export function schemaOf(project: Project, kind: string): Schema {
  const schema = project.spec.schemas.get(kind);
  if (!schema) throw new Error(`no schema for ${kind}`);
  return schema;
}
