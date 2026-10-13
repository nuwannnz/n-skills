---
id: PAW-1
title: Owner accounts
status: in-progress
priority: P0
requirements: [FR-001, FR-002]
created: 2026-09-12
updated: 2026-09-28
---

# Owner accounts

## Goal

Owners can create an account and get back into it, so that every booking
belongs to a known person and their pets.

## Scope

- Sign up with email and password.
- Log in and log out.
- Reset a forgotten password by email.

## Out of Scope

- Social login.
- Staff accounts, which come with PAW-3.

## Requirements Coverage

| Requirement | Coverage |
| --- | --- |
| FR-001 | PAW-4 covers sign-up. |
| FR-002 | PAW-5 covers log in and log out; PAW-6 covers password reset. |

## Stories

<!-- scrumo:generated:epic-stories -->

| ID | Title | Status | Points | Sprint |
| --- | --- | --- | --- | --- |
| PAW-4 | Sign up with email | done | 3 | 1 |
| PAW-5 | Log in and log out | done | 3 | 1 |
| PAW-6 | Reset a forgotten password | in-qa | 2 | 2 |

<!-- scrumo:end -->

## Risks

- Password reset emails may be delayed by spam filtering (PRD R-002).
