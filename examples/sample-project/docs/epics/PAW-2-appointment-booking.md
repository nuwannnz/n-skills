---
id: PAW-2
title: Appointment booking
status: in-progress
priority: P0
requirements: [FR-003, FR-004, FR-005, FR-006]
created: 2026-09-12
updated: 2026-10-06
---

# Appointment booking

## Goal

Owners can find a free slot, book it for a pet, cancel it if plans change, and
get reminded the day before, without phoning the clinic.

## Scope

- Show open slots for a vet and date.
- Book a slot for one of the owner's pets.
- Cancel a booking up to 24 hours before.
- Email a reminder 24 hours before.

## Out of Scope

- Rescheduling in one step; owners cancel and book again.
- Payment or deposits.

## Requirements Coverage

| Requirement | Coverage |
| --- | --- |
| FR-003 | PAW-7 shows open slots. |
| FR-004 | PAW-8 books a slot. |
| FR-005 | PAW-9 cancels a booking. |
| FR-006 | PAW-10 sends the reminder. |

## Stories

<!-- scrumo:generated:epic-stories -->

| ID | Title | Status | Points | Sprint |
| --- | --- | --- | --- | --- |
| PAW-7 | See open appointment slots | in-progress | 5 | 2 |
| PAW-8 | Book an appointment | ready | 3 | 2 |
| PAW-9 | Cancel an appointment | blocked | 2 | - |
| PAW-10 | Get a reminder before an appointment | draft | - | - |
| PAW-11 | Print a booking confirmation | cancelled | - | - |

<!-- scrumo:end -->

## Risks

- Slot calculation depends on working hours from PAW-3; until then, hours are
  seeded by a migration.
