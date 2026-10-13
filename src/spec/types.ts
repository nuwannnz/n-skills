// Types for the files under spec/. See spec/README.md for what each key means.

export type FieldType =
  | 'string'
  | 'integer'
  | 'date'
  | 'semver'
  | 'enum'
  | 'ticket-id'
  | 'ticket-ref'
  | 'list'
  | 'object';

export interface FieldDef {
  name?: string;
  type: FieldType;
  values?: Array<string | number>;
  pattern?: string;
  min?: number;
  max?: number;
  ref?: 'epic' | 'story';
  items?: FieldDef;
  fields?: FieldDef[];
  nullable?: boolean;
  fixed?: string | number;
  description?: string;
}

export type Content =
  | { type: 'prose' }
  | { type: 'pattern'; pattern: string }
  | { type: 'list' | 'checklist'; item_pattern?: string; min_items?: number }
  | {
      type: 'table';
      columns: string[];
      id_column?: string;
      id_pattern?: string;
      column_patterns?: Record<string, string>;
      column_values?: Record<string, string[]>;
      min_rows?: number;
    }
  | { type: 'fields'; labels?: string[]; min_items?: number }
  | { type: 'entries'; heading_pattern: string; labels: string[]; min_entries?: number }
  | { type: 'generated'; block: string };

export interface SectionDef {
  heading?: string;
  heading_pattern?: string;
  repeat?: boolean;
  optional?: boolean;
  content?: Content;
  non_empty_in?: string[];
  empty_in?: string[];
  no_placeholders_in?: string[];
  subsections?: SectionDef[];
  guidance?: string;
  template?: string;
}

export interface Schema {
  kind: string;
  title: string;
  description: string;
  path: string;
  statuses?: { values: string[]; transitions: Record<string, string[]> };
  frontmatter: FieldDef[];
  sections: SectionDef[];
}

export interface Rule {
  code: string;
  severity: 'error' | 'warning';
  fixable: boolean | 'partial';
  summary: string;
}

export interface Spec {
  schemas: Map<string, Schema>;
  rules: Rule[];
}

export interface Agent {
  id: string;
  name: string;
  skills_dir: string;
  also_reads: string[];
  verified: string;
  source: string;
}
