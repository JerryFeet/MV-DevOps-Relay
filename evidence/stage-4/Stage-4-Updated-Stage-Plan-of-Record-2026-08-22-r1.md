# HOA Portal — UAT Stage Plan of Record

**Issued:** 2026-08-21  
**Status:** living document — update on each stage acceptance  

Decision 42 stands across every stage: nothing is promoted to production until every stage is complete and the consolidated manual UAT round has been performed.

---

## Accepted stages

| Stage | Scope summary | Accepted |
|---|---|---|
| **Stage 4b** | Secure document library — folder visibility floor cascade, tenant J5, admin document E2E, H4 P0 announcements + admin-communications pagination | 2026-08-21 |
| **Stage 3a** | Facilities F1–F6 + F2b, Unit Registry D1, Users A2, Vehicles E1–E5 — 82 E2E passed / 5 skipped / 0 failed | 2026-08-21 r3 |
| **Stage 3b** | Permits overhaul, supervisor-role removal, and payment regression | 2026-08-21 |
| **Stage 3c** | Waha Pass eligibility, booking rules, and D2 FK inventory | 2026-08-21 |
| **Stage 3d** | Mobile pagination — H3/H4 complete; 414 mobile tests passed (+9 from the 405 Stage 3c baseline); H5 approved separately for the portal filter-pagination finding | 2026-08-21 r2 |

---

## Completed scope reference

### Stage 3b — Permits overhaul, supervisor role removal, and payment regression

**Scope**

| Item | Description |
|---|---|
| **X6** | Remove the `supervisor` role entirely: drop from DB enum (requires type recreation), remove from all role-group arrays (`STAFF_ROLES`, `APPROVER_ROLES`, `GATE_ROLES`), remove from all portal route guards and dashboard role labels. Report supervisor account count before removal. |
| **G1** | Remove additional-vehicle permit type from selector and all UI; archive existing records; redirect resident links to Vehicles module |
| **G2** | Replace renovation scope categories with five bilingual multi-select values (TEXT[] storage): Exterior Affecting, Major Plumbing or Electrical Work, Structural Modifications, Major Interior Upgrades, Flooring |
| **G3** | Remove contractor licence field from form, admin view and validation; retain historical DB values |
| **G4** | Replace "Contractor Contact" with mandatory contractor mobile number — E.164, KSA default (X5 shared mobile component) |
| **G5** | All renovation permit fields mandatory on client and server; individual field errors, not one generic error |
| **G6** | Remove payment, deposit and fee mechanics from **all** permit types: renovation, move-in, move-out, and any surviving legacy `move_forms` path; add bilingual renovation damage disclaimer note |
| **G6 regression** | Waha Pass and Guest Day Pass payment paths exercised and results published as evidence — a passing regression run, not a confirmation |

---

### Stage 3c — Waha Pass eligibility, booking rules, and D2

**Dependency order:** I5 → F7 → F8; F9 independent but in same booking path; D2 delivered after F8 is implemented.

| Item | Description |
|---|---|
| **I5** | Waha Pass composition enforcement: one pass per unit at DB level; second credential holder must be aged ≥ 18 (from `residents.date_of_birth`); DOB-absent residents refused with specific reason, not silently omitted |
| **F7** | Re-verification after I5 lands: confirm individual-level gate satisfies one-pass-per-unit rule; server-side refusal with bilingual message; booking screen explains rather than showing unexplained empty state |
| **F8** | Future bookings cancelled on any terminal event: Waha Pass credential revoked, T13 tenancy release, T14c deletion after expiry, T14d rejection or deletion after delay, O3 ownership change, move-out archive. Non-refundable bilingual disclaimer on booking form. T14d renewal-pending suspension retains bookings (restores on approval, cancels on rejection/deletion). Runs inside same transaction as triggering event. |
| **F9** | 14-day advance booking window (configurable in `hoa_settings`, same pattern as `tenancyDeletionDelayDays`). Server-side enforcement on `POST /api/bookings`. Calendar `maxDate` prevents out-of-window selection. Activates dead `cutoffError` / `BOOKING_CUTOFF_EXCEEDED` scaffolding. Bilingual refusal message generated from configured value. Admin and supervisor exempt. |
| **D2** | FK relationship inventory, deletion policy, transaction locks, postcondition queries, and hardening proposal — includes F8 booking cascade |

---

### Stage 3d — Mobile pagination — accepted 2026-08-21 r2

| Item | Description |
|---|---|
| **H3** | Mobile guest list: retrieve and display complete history via load-more or infinite scroll; no silent truncation in any interim state; contract test covers multi-page response |
| **H4 P1** | Mobile bookings and vehicles lists: shared pagination hook/helper consuming `data`, `total` and paging; all list screens use it; contract test fails when a list renders `data` without handling `total`; no screen displays a count from current-page length |
| H4 P2 | Permits 201-record limit — recorded as accepted boundary, no build work |

---

## Remaining pipeline

### Stage 4 — Household, residency, and communications

| Item | Description |
|---|---|
| **K1–K5** | Household member management |
| **I3** | Waha Pass credential description wording change |
| **I4** | Owner and main tenant parity across all Waha Pass flows |
| **B1–B6** | Communications module |
| **J1** | Admin-only document upload enforcement |
| **J3** | Remove unauthenticated document exposure and public-homepage document access |

**Stage 4 reminders from the acceptance decision:** B4 moved into Stage 2b and is already delivered; do not rebuild it. K5 must restrict Contact HOA to verified owners and show tenants an explanatory screen. J1 and J3 remain deliberate access restrictions, with J3 closing unauthenticated document exposure.

---

### Stage 5 — Notifications and guest management

| Item | Description |
|---|---|
| **X3** | Notification service |
| **H1** | Decouple guest registration from Waha Pass |
| **H2** | Guest Day Pass — full payment, issuance, gate verification flow |

---

### Stage 6 — Ownership and lifecycle

| Item | Description |
|---|---|
| **O1–O7** | Ownership change flows |
| **T13** | Tenancy release by admin |
| **T14** | Tenancy expiry and renewal |

**D2 must be delivered (in Stage 3c) before Stage 6 is planned.** O3, T13, and T14 all perform cascading deletions; the FK inventory and hardening proposal are the prerequisite.

---

## Must-not-lose items

- **Decision 42** — no deployment until every stage is complete and consolidated manual UAT is done.
- **Decision 61** — where an acceptance criterion cannot be proven automatically, name it and carry it into the consolidated UAT round rather than blocking the stage.
- **Decision 71** — admin and supervisor exempt from F9 advance-booking window (supervisor is removed in Stage 3b; exemption applies to admin only from Stage 3c onward).
- **Decision 72** — supervisor role governance: product owner was unaware it existed; count and access confirmed before removal in Stage 3b.
- **D2** — FK relationship inventory due before Stage 6 planning; F8 cascade must be included before D2 is delivered.
- **H5** — Portal pagination and filter integrity is a separate approved requirement originating in Stage 3d: client-side filtering over a 50-record page window hid matching records beyond page 1.
