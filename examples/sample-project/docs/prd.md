---
title: PawPlan Product Requirements
status: approved
version: 1.1.0
updated: 2026-09-08
---

# PawPlan Product Requirements

## Overview

PawPlan is a web app for a single veterinary clinic. Pet owners create an
account, see open appointment slots, and book or cancel them at any time.
Clinic staff set each vet's working hours and block out time. The first
release replaces phone booking for routine appointments; emergencies still go
by phone.

## Goals

- G-01: 50% of bookings made online within three months of launch.
- G-02: Front-desk booking calls down 40% within three months of launch.
- G-03: No double bookings.

## Non-Goals

- Multiple clinics or locations.
- Online payment.
- Medical records or prescriptions.

## Personas

- **Olivia, pet owner:** works office hours, has two cats, books from her
  phone in the evening.
- **Dev, front-desk lead:** runs the diary for four vets and wants fewer
  calls and no clashes.

## Functional Requirements

| ID | Requirement | Priority | Source |
| --- | --- | --- | --- |
| FR-001 | The system shall let an owner create an account with an email address and password. | P0 | Brief: Target Users |
| FR-002 | The system shall let an owner log in, log out, and reset a forgotten password by email. | P0 | Brief: Target Users |
| FR-003 | The system shall show an owner the open slots for a chosen vet and date. | P0 | Brief: Idea |
| FR-004 | The system shall let an owner book an open slot for one of their pets. | P0 | Brief: Idea |
| FR-005 | The system shall let an owner cancel a booking up to 24 hours before it starts. | P1 | Brief: Target Users |
| FR-006 | The system shall email the owner a reminder 24 hours before each booking. | P2 | Brief: Raw Input |
| FR-007 | The system shall let staff set each vet's working hours and block out dates. | P1 | Brief: Raw Input |

## Non-Functional Requirements

| ID | Category | Requirement | Target |
| --- | --- | --- | --- |
| NFR-001 | performance | Slot search responds quickly on a phone connection. | p95 under 300 ms server time |
| NFR-002 | security | Passwords are stored with a modern slow hash. | argon2id, OWASP parameters |
| NFR-003 | privacy | Owner data is stored and processed in the EU only. | All data stores in an EU region |
| NFR-004 | accessibility | Owner-facing pages are usable with a screen reader. | WCAG 2.2 AA |

## Assumptions

- Appointments are a fixed 20 minutes long.
- Owners book for their own pets only.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-001 | Owners keep phoning out of habit. | medium | high | Front desk points callers to the site; track the call count weekly. |
| R-002 | Reminder emails land in spam. | medium | medium | Use a reputable email provider with SPF and DKIM set up. |

## Open Questions

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.1.0 | 2026-09-08 | Added FR-007 for staff schedule management. |
| 1.0.0 | 2026-09-03 | First approved version. |
