---
id: PAW-4
title: Sign up with email
type: story
epic: PAW-1
status: done
priority: P0
points: 3
sprint: 1
assignee: alex
depends_on: []
found_in: null
reason: null
created: 2026-09-12
updated: 2026-09-24
---

# Sign up with email

## Story

As a pet owner, I want to create an account with my email address and a password, so that I can book appointments online.

## Acceptance Criteria

- AC-1: Given I am on the sign-up page, when I submit a new email and a password of at least 12 characters, then my account is created and I am logged in.
- AC-2: Given an account already uses my email, when I submit the sign-up form, then I see "This email is already registered" and no account is created.
- AC-3: Given I submit a password shorter than 12 characters, when the form is checked, then I see the length rule and no account is created.

## Technical Notes

Route `POST /api/v1/owners` in the web component. Hash with argon2id (NFR-002,
AD-003 for the session). Emails are stored lower-cased with a unique index.

## Tasks

- [x] Add owners table and unique email index (AC-1, AC-2)
- [x] Add signup route with Zod validation (AC-1, AC-3)
- [x] Hash passwords with argon2id and start a session (AC-1)
- [x] Return a duplicate-email error (AC-2)
- [x] Build the sign-up page with inline errors (AC-1, AC-2, AC-3)

## Test Plan

| AC | Scenario | Level | Automated |
| --- | --- | --- | --- |
| AC-1 | New owner signs up and lands logged in. | e2e | yes |
| AC-2 | Duplicate email, including different letter case, is rejected. | integration | yes |
| AC-3 | 11-character password is rejected; 12 is accepted. | unit | yes |

## Dev Record

- **Branch:** `PAW-4-email-signup`
- **Files changed:**
  - `src/db/schema/owners.ts`
  - `src/app/api/v1/owners/route.ts`
  - `src/domain/owners/sign-up.ts`
  - `src/app/(owner)/sign-up/page.tsx`
- **Tests added:**
  - `tests/unit/domain/sign-up.test.ts`
  - `tests/integration/api/owners.test.ts`
  - `tests/e2e/sign-up.spec.ts`
- **Notes:** Added the `argon2` dependency, as the architecture specifies.

## QA Record

| Round | AC | Result | Evidence |
| --- | --- | --- | --- |
| 1 | AC-1 | PASS | `sign-up.spec.ts` green in CI run 112; checked manually on a phone. |
| 1 | AC-2 | PASS | `owners.test.ts` duplicate and mixed-case cases green. |
| 1 | AC-3 | PASS | `sign-up.test.ts` boundary cases green. |
