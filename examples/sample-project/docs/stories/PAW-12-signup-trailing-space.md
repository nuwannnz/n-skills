---
id: PAW-12
title: Sign-up keeps a trailing space in the email
type: bug
epic: PAW-1
status: ready
priority: P1
points: 1
sprint: null
assignee: null
depends_on: []
found_in: PAW-4
reason: null
created: 2026-10-05
updated: 2026-10-06
---

# Sign-up keeps a trailing space in the email

## Story

As a pet owner, I want sign-up to ignore a trailing space in my email, so that I can log in with the address I meant to use.

## Acceptance Criteria

- AC-1: Given I type my email with a trailing space on the sign-up form, when I submit it, then my account is created with the trimmed address.
- AC-2: Given my account was created earlier with a trailing space in its email, when I log in with the trimmed address, then I get in.

## Technical Notes

Reported by a front-desk volunteer; found in PAW-4.

- **Steps:** open sign-up, enter `ann@example.com` (trailing space), a valid password, and submit.
- **Actual:** the account is created with the space, and logging in with `ann@example.com` fails.
- **Expected:** the address is trimmed before it is stored.
- **Environment:** production, Safari on iOS, which adds a space after autocomplete.

Trim in the sign-up route's input schema. AC-2 needs a one-off migration for existing rows.

## Tasks

- [ ] Trim the email in the sign-up input schema (AC-1)
- [ ] Add a migration that trims stored emails (AC-2)

## Test Plan

<!-- Written by /scrumo-qa, ideally while the story is ready. -->

## Dev Record

<!-- Filled by /scrumo-dev before moving to in-qa. -->

## QA Record

<!-- Filled by /scrumo-qa, one row per AC per round. -->
