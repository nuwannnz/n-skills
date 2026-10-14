---
title: Sprint Tracker
updated: 2026-10-08
sprints:
  - number: 1
    status: closed
    goal: Owners can create an account and log in.
    start: 2026-09-14
    end: 2026-09-25
    capacity: 8
    committed: 6
    completed: 6
  - number: 2
    status: active
    goal: Owners can book their first appointment online.
    start: 2026-09-28
    end: 2026-10-09
    capacity: 12
    committed: 10
    completed: null
---

# Sprint Tracker

## Overview

<!-- scrumo:generated:overview -->

| Sprint | Status | Start | End | Goal | Capacity | Committed | Completed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | active | 2026-09-28 | 2026-10-09 | Owners can book their first appointment online. | 12 | 10 | - |
| 1 | closed | 2026-09-14 | 2026-09-25 | Owners can create an account and log in. | 8 | 6 | 6 |

<!-- scrumo:end -->

## Backlog

<!-- scrumo:generated:backlog -->

| ID | Title | Epic | Priority | Points | Status |
| --- | --- | --- | --- | --- | --- |
| PAW-9 | Cancel an appointment | PAW-2 | P1 | 2 | blocked |
| PAW-12 | Sign-up keeps a trailing space in the email | PAW-1 | P1 | 1 | ready |
| PAW-10 | Get a reminder before an appointment | PAW-2 | P2 | - | draft |

<!-- scrumo:end -->

## Sprint 2

### Stories

<!-- scrumo:generated:sprint-2 -->

| ID | Title | Epic | Points | Status | Assignee |
| --- | --- | --- | --- | --- | --- |
| PAW-6 | Reset a forgotten password | PAW-1 | 2 | in-qa | sam |
| PAW-7 | See open appointment slots | PAW-2 | 5 | in-progress | alex |
| PAW-8 | Book an appointment | PAW-2 | 3 | ready | - |

<!-- scrumo:end -->

### Review

<!-- Filled at /scrumo-sprint close. -->

### Retro

<!-- Filled at /scrumo-sprint close. -->

## Sprint 1

### Stories

<!-- scrumo:generated:sprint-1 -->

| ID | Title | Epic | Points | Status | Assignee |
| --- | --- | --- | --- | --- | --- |
| PAW-4 | Sign up with email | PAW-1 | 3 | done | alex |
| PAW-5 | Log in and log out | PAW-1 | 3 | done | sam |

<!-- scrumo:end -->

### Review

- Demoed sign-up and log-in on a phone to the front-desk lead; both accepted.
- PAW-6 (password reset) was pulled from this sprint at planning to protect
  the goal and went into Sprint 2.

### Retro

- **Went well:** Writing the Test Plan before coding caught the mixed-case
  email bug in PAW-4 early.
- **To improve:** Sprint 1 capacity was a guess; 6 of 8 points were used.
- **Actions:**
  - alex: use Sprint 1 velocity (6) as the baseline for Sprint 2 planning.
  - sam: set up the Postmark sandbox before PAW-6 starts.
