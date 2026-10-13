---
id: PAW-7
title: See open appointment slots
epic: PAW-2
status: in-progress
priority: P0
points: 5
sprint: 2
assignee: alex
depends_on: []
blocked_reason: null
created: 2026-09-15
updated: 2026-10-06
---

# See open appointment slots

## Story

As a pet owner, I want to see the open slots for a vet on a chosen date, so that I can pick a time that suits me.

## Acceptance Criteria

- AC-1: Given a vet works 9:00 to 12:00 on a date with no bookings, when I choose that vet and date, then I see nine 20-minute slots from 9:00 to 11:40.
- AC-2: Given a slot is already booked, when I view that date, then the booked slot is not shown.
- AC-3: Given a date in the past, when I choose it, then I see "Choose today or a later date" and no slots.

## Technical Notes

Working hours are seeded by a migration until PAW-3 ships. Compute free slots
in one query (NFR-001) using the `(vet_id, period)` index from AD-002. Show
times in the clinic's time zone (TR-001).

## Tasks

- [x] Seed vets and working hours (AC-1)
- [x] Write the free-slot query (AC-1, AC-2)
- [ ] Add slots route with date validation (AC-1, AC-3)
- [ ] Build the slot picker page (AC-1, AC-2, AC-3)

## Test Plan

| AC | Scenario | Level | Automated |
| --- | --- | --- | --- |
| AC-1 | Morning shift returns nine slots in clinic time. | unit | yes |
| AC-2 | A booking removes exactly one slot. | integration | yes |
| AC-3 | Yesterday's date is rejected. | unit | yes |
| AC-1 | Slot search p95 stays under 300 ms with a year of bookings. | integration | yes |

## Dev Record

<!-- Filled by /n-dev before moving to in-qa. -->

## QA Record

<!-- Filled by /n-qa, one row per AC per round. -->
