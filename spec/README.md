# Spec

This folder is the contract for every file the tool manages. The validator,
`scrumo new`, and `scrumo schema` all read it, and the skills learn the rules from
`scrumo schema <kind>` instead of embedding templates.

| File | Contents |
| --- | --- |
| `schemas/*.yaml` | One schema per artifact kind. |
| `rules.yaml` | Every validator rule code, its severity, and whether `--fix` handles it. |
| `markdownlint.json` | The Markdown style every managed file must follow. |
| `agents.yaml` | Where each supported agent reads skills from. |

## Schema format

```yaml
kind: story                  # artifact kind, also the `scrumo new` argument
title: Story                 # human name
description: ...             # one paragraph, shown by `scrumo schema`
path: stories/{key}-{n}-{slug}.md   # relative to docs_dir
statuses:                    # optional: allowed values and legal moves
  values: [draft, ready]
  transitions:
    draft: [ready]
frontmatter: [...]           # fields, in the required key order
sections: [...]              # H2 sections, in the required order
```

### Frontmatter fields

Every field listed must be present, in the listed order, and no other keys are
allowed. A field that may be empty is `nullable: true` and holds `null`.

| Key | Meaning |
| --- | --- |
| `name` | Key name. |
| `type` | `string`, `integer`, `date` (`YYYY-MM-DD`), `semver`, `enum`, `ticket-id`, `ticket-ref`, `list`, or `object`. |
| `values` | Allowed values for `enum`. |
| `pattern` | Regular expression a `string` (or each `list` item) must match. |
| `min`, `max` | Bounds for `integer`. |
| `ref` | For `ticket-ref`: the kind the ticket must be (`epic` or `story`). |
| `items` | For `list`: the field definition every item must satisfy. |
| `fields` | For `object` (and `list` items that are objects): nested fields. |
| `nullable` | `true` if the value may be `null`. Defaults to `false`. |
| `fixed` | A value the field must always have. |
| `description` | What the field means, shown by `scrumo schema`. |

`{key}` in a pattern is replaced with the project key from `scrumo.yaml`.

### Sections

Each entry describes one H2 section. Sections must appear in the listed order,
and unknown H2 headings are errors.

| Key | Meaning |
| --- | --- |
| `heading` | Exact H2 text. |
| `heading_pattern` | Instead of `heading`: a regular expression, for repeated sections like `Sprint 3`. |
| `repeat` | `true` if the section may appear more than once (with `heading_pattern`). |
| `optional` | `true` if the heading may be left out. Defaults to `false`. |
| `content` | What the body must look like (below). |
| `non_empty_in` | Statuses in which the section must have content. |
| `empty_in` | Statuses in which the section must be empty. |
| `no_placeholders_in` | Statuses in which `TODO`, `TBD`, `???`, and `<...>` placeholders are errors. |
| `subsections` | H3 sections inside this section, same format as `sections`. |
| `guidance` | What to write, shown by `scrumo schema` and inserted by `scrumo new` as a comment. |
| `template` | Body `scrumo new` writes for the section, with `{date}`, `{version}`, and `{title}` filled in. Needed where an empty body or `TODO` would fail the schema in a draft. |

A section is empty when its body holds nothing but whitespace and HTML
comments.

Placeholders are `TODO`, `TBD`, `???`, and angle-bracket text like `<role>`.
Text inside code spans and fenced code blocks is never treated as a placeholder.

`non_empty_in`, `empty_in`, and `no_placeholders_in` refer to the file's
`status`. In the sprint tracker, a sprint section's subsections refer to that
sprint's status instead.

### Content types

| `content.type` | Body must be |
| --- | --- |
| `prose` | Any Markdown. |
| `pattern` | Paragraph text matching `content.pattern`. |
| `list` | A `-` bullet list. `item_pattern` applies to each top-level item. `min_items` sets a minimum. |
| `checklist` | A list where every top-level item is `- [ ]` or `- [x]`. `item_pattern` applies to the text after the box. |
| `table` | One table with exactly `columns`, in order. `id_column` names a column whose values must be unique, and `id_pattern` checks them. `column_patterns` and `column_values` restrict any column to a regular expression or fixed values. `min_rows` sets a minimum. |
| `fields` | A `-` list whose top-level items are `**Label:** value`. With `labels`, exactly those labels in that order; without, any labels. Nested lists are allowed under a label. `min_items` sets a minimum. |
| `entries` | H3 subsections whose headings match `heading_pattern`, each holding a `fields` list with `labels`. `min_entries` sets a minimum. |
| `generated` | Only the generated block named `block`, between `<!-- scrumo:generated:<block> -->` and `<!-- scrumo:end -->`. |
