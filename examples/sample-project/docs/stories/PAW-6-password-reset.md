---
id: PAW-6
title: Reset a forgotten password
epic: PAW-1
status: in-qa
priority: P1
points: 2
sprint: 2
assignee: sam
depends_on: [PAW-5]
blocked_reason: null
created: 2026-09-12
updated: 2026-10-08
---

# Reset a forgotten password

## Story

As a pet owner, I want to reset my password by email, so that I can get back into my account if I forget it.

## Acceptance Criteria

- AC-1: Given I enter my account's email on the reset page, when I submit it, then I get an email with a link that works once within 1 hour.
- AC-2: Given I enter an email with no account, when I submit it, then I see the same confirmation message and no email is sent.
- AC-3: Given I set a new password through the link, when it is saved, then all my existing sessions are logged out.

## Technical Notes

Reset tokens are random 32-byte values, stored hashed, with a 1-hour expiry.
Sending goes through the mailer component. AC-3 relies on deleting rows from
the sessions table added in PAW-5.

## Tasks

- [x] Add reset tokens table (AC-1)
- [x] Add request-reset route with identical responses (AC-1, AC-2)
- [x] Send the reset email through the mailer (AC-1)
- [x] Add set-new-password route that ends all sessions (AC-3)
- [x] Expire tokens after one use or 1 hour (AC-1)

## Test Plan

| AC | Scenario | Level | Automated |
| --- | --- | --- | --- |
| AC-1 | Link works once, fails on reuse, and fails after 1 hour. | integration | yes |
| AC-2 | Unknown email gets the same message and no email is sent. | integration | yes |
| AC-3 | Two open sessions are both logged out after a reset. | integration | yes |
| AC-1 | Reset email arrives and renders in Gmail and Outlook. | manual | no |

## Dev Record

- **Branch:** `PAW-6-password-reset`
- **Files changed:**
  - `src/db/schema/reset-tokens.ts`
  - `src/app/api/v1/password-resets/route.ts`
  - `src/domain/owners/reset-password.ts`
- **Tests added:**
  - `tests/integration/api/password-resets.test.ts`
- **Notes:** Round 1 defect fixed: tokens are now marked used inside the same
  transaction that saves the password.

## QA Record

| Round | AC | Result | Evidence |
| --- | --- | --- | --- |
| 1 | AC-1 | FAIL | The same link worked twice when opened in two tabs at once. |
| 1 | AC-2 | PASS | `password-resets.test.ts` unknown-email case green. |
| 1 | AC-3 | PASS | `password-resets.test.ts` two-session case green. |
