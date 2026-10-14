---
id: PAW-9
title: Cancel an appointment
type: story
epic: PAW-2
status: blocked
priority: P1
points: 2
sprint: null
assignee: null
depends_on: [PAW-8]
found_in: null
reason: The clinic hasn't decided whether late cancellations are charged, which changes AC-2.
created: 2026-09-15
updated: 2026-09-30
---

# Cancel an appointment

## Story

As a pet owner, I want to cancel a booking I can no longer make, so that the slot is freed for someone else.

## Acceptance Criteria

- AC-1: Given a booking starts more than 24 hours from now, when I cancel it, then it is removed and the slot is open again.
- AC-2: Given a booking starts within 24 hours, when I try to cancel, then I am told to phone the clinic.

## Technical Notes

Deleting the booking row frees the slot. No changes to the exclusion
constraint are needed.

## Tasks

- [ ] Add cancel route with the 24-hour rule (AC-1, AC-2)
- [ ] Add a Cancel button to each booking (AC-1, AC-2)

## Test Plan

<!-- Written by /scrumo-qa, ideally while the story is ready. -->

## Dev Record

<!-- Filled by /scrumo-dev before moving to in-qa. -->

## QA Record

<!-- Filled by /scrumo-qa, one row per AC per round. -->
