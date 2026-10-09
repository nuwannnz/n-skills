---
title: PawPlan Coding Standards
status: approved
version: 1.0.0
updated: 2026-09-11
---

# PawPlan Coding Standards

## Stack & Versions

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 22 | Runtime. |
| TypeScript | 5.9 | Language, `strict` mode on. |
| Next.js | 15 | Web framework. |
| Drizzle ORM | 0.44 | Database access and migrations. |
| Vitest | 3 | Unit and integration tests. |
| Playwright | 1.55 | End-to-end tests. |
| Biome | 2 | Formatting and linting. |

## Project Structure

```text
src/
├── app/            # Next.js routes: pages and /api/v1 handlers only
├── domain/         # Business rules, no framework imports
├── db/             # Drizzle schema, migrations, queries
└── lib/            # Small shared helpers (mailer, time)
tests/
├── unit/
├── integration/    # Run against a real PostgreSQL in Docker
└── e2e/
```

## Naming

- Files and folders use kebab-case.
- Types and React components use PascalCase; functions and variables use
  camelCase.
- Database tables and columns use snake_case.

## Formatting & Linting

- Biome formats and lints everything; run `npm run check`.
- CI fails on any Biome error or warning.

## Testing

- Every acceptance criterion has at least one automated test, unless the
  story's Test Plan marks it manual.
- Test names start with the story and AC they prove, for example
  `PAW-4 AC-2: rejects a duplicate email`.
- Domain logic needs unit tests; API routes need integration tests.

## Error Handling & Logging

- Domain functions return typed results; only route handlers map them to HTTP
  status codes.
- Log as JSON with a request ID. Never log passwords, tokens, or full email
  addresses.

## Security

- Validate every request body with a Zod schema at the route boundary.
- Secrets come from environment variables, never from the repository.
- Dependabot is on, and high-severity advisories block a release.

## Git Workflow

- Branch names are `<ticket>-<slug>`, for example `PAW-4-email-signup`.
- Commit messages start with the ticket ID, for example
  `PAW-4: add signup route`.
- Every change goes through a pull request with green CI.

## Definition of Done

- [ ] Every task in the story is checked.
- [ ] Every AC has the tests its Test Plan lists, and they pass in CI.
- [ ] `npm run check` passes with no warnings.
- [ ] Dev Record lists the branch, changed files, and tests added.
- [ ] No new dependency without a note in Technical Notes.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-11 | First approved version. |
