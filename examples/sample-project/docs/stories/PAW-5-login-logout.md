---
id: PAW-5
title: Log in and log out
type: story
epic: PAW-1
status: done
priority: P0
points: 3
sprint: 1
assignee: sam
depends_on: [PAW-4]
found_in: null
reason: null
created: 2026-09-12
updated: 2026-09-25
---

# Log in and log out

## Story

As a pet owner, I want to log in and out of my account, so that only I can see and change my bookings.

## Acceptance Criteria

- AC-1: Given I have an account, when I enter my email and correct password, then I am logged in and taken to my bookings.
- AC-2: Given I enter a wrong password, when I submit the form, then I see "Email or password is incorrect" without saying which one.
- AC-3: Given I am logged in, when I choose Log out, then my session ends and my bookings page asks me to log in.

## Technical Notes

Session cookies per AD-003. Sessions table with a 30-day expiry. The same
error message for an unknown email and a wrong password avoids account
enumeration.

## Tasks

- [x] Add sessions table (AC-1, AC-3)
- [x] Add login route that verifies argon2id hashes (AC-1, AC-2)
- [x] Add logout route that deletes the session (AC-3)
- [x] Build the login page (AC-1, AC-2)

## Test Plan

| AC | Scenario | Level | Automated |
| --- | --- | --- | --- |
| AC-1 | Owner logs in and sees their bookings page. | e2e | yes |
| AC-2 | Wrong password and unknown email give the same message. | integration | yes |
| AC-3 | After logout, the old session cookie is rejected. | integration | yes |

## Dev Record

- **Branch:** `PAW-5-login-logout`
- **Files changed:**
  - `src/db/schema/sessions.ts`
  - `src/app/api/v1/sessions/route.ts`
  - `src/app/(owner)/log-in/page.tsx`
- **Tests added:**
  - `tests/integration/api/sessions.test.ts`
  - `tests/e2e/log-in.spec.ts`
- **Notes:** None.

## QA Record

| Round | AC | Result | Evidence |
| --- | --- | --- | --- |
| 1 | AC-1 | PASS | `log-in.spec.ts` green in CI run 131. |
| 1 | AC-2 | PASS | `sessions.test.ts` covers both cases with identical responses. |
| 1 | AC-3 | PASS | `sessions.test.ts` reuses the cookie after logout and gets 401. |
