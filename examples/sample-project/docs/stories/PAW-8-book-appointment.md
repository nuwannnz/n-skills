---
id: PAW-8
title: Book an appointment
epic: PAW-2
status: ready
priority: P0
points: 3
sprint: 2
assignee: null
depends_on: [PAW-7]
blocked_reason: null
created: 2026-09-15
updated: 2026-09-26
---

# Book an appointment

## Story

As a pet owner, I want to book an open slot for one of my pets, so that the clinic expects us at that time.

## Acceptance Criteria

- AC-1: Given I am logged in and choose an open slot and one of my pets, when I confirm, then the booking is saved and shown in my bookings.
- AC-2: Given someone else books the same slot first, when I confirm, then I see "That slot was just taken" and the slot list refreshes.
- AC-3: Given I am not logged in, when I choose a slot, then I am asked to log in and returned to the same slot afterwards.

## Technical Notes

Rely on the exclusion constraint from AD-002 for AC-2 and map its violation
to a 409 response. Pets are created inline on first booking for now.

## Tasks

- [ ] Add bookings table with the exclusion constraint (AC-1, AC-2)
- [ ] Add booking route that maps the constraint violation to 409 (AC-1, AC-2)
- [ ] Add the confirm step to the slot picker (AC-1, AC-2)
- [ ] Redirect through log in and back to the slot (AC-3)

## Test Plan

<!-- Written by /qa, ideally while the story is ready. -->

## Dev Record

<!-- Filled by /dev before moving to in-qa. -->

## QA Record

<!-- Filled by /qa, one row per AC per round. -->
