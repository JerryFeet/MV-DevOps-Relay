# Stage 3c — Delivery Status Report (r3)

**Date:** 2026-08-21  
**Revision:** r3 — addressing the three hardening-plan problems from the r2 review.

---

## Changes from r2

### 1. NOT NULL columns — DROP NOT NULL sequenced explicitly (blocking fix)

The r2 plan proposed `ON DELETE SET NULL` for columns that are `NOT NULL` in the
schema. A deletion under that constraint fails at runtime with a not-null violation.

**Fix:** every column in the plan is now listed with its actual nullability (from
`information_schema.columns`). Columns that require `DROP NOT NULL` before a SET NULL
constraint can be applied are flagged explicitly in the batch tables, and the step
template at the top of §6.3 sequences the four steps for every such column:

1. Orphan-detection query
2. Nullify orphans
3. `ALTER TABLE … ALTER COLUMN … DROP NOT NULL`
4. `ADD CONSTRAINT … ON DELETE SET NULL`

**NOT NULL columns in the plan** (must follow the four-step template):
`bookings.user_id`, `permits.user_id`, `vehicles.user_id`, `unit_verifications.user_id`,
`unit_verification_owner_id_attempts.user_id`, `waha_pass_applications.applicant_user_id`,
`communications.user_id`, `move_forms.user_id`.

Columns already nullable — no DROP NOT NULL needed: `units.verified_owner_id`,
`units.verified_tenant_id`, `residents.linked_user_id`, `residents.registered_by_id`,
`vehicles.unit_id`, `permits.unit_id`, `waha_pass_credentials.held_by_user_id`.

CASCADE and RESTRICT constraints: nullability of the column is irrelevant — CASCADE
deletes the row; RESTRICT prevents the referenced row from being deleted.

### 2. Bookings attribution corrected — `unit_id` denormalisation recommended

The r2 argument that `bookings.user_id` could safely become null because "grouped
historical queries still function because the booking row remains linked to a facility
and a unit" was wrong. **`bookings` has no `unit_id` column.** Nulling `user_id` leaves
the booking attributable only to a facility and a time-slot.

**Decision (§6.2):** Denormalise `unit_id` onto `bookings` at creation time as a
Stage 6 pre-requisite, before any SET NULL constraint is applied on `bookings.user_id`.
The table already carries `facility_name` as a denormalised field; this is consistent.
Recording the user's `unit_id` at booking time gives every historical record a durable
household anchor that survives user deletion, and gives F8 a unit-level view of
cancelled bookings. After `bookings.unit_id` is in place, `user_id SET NULL` is safe.

### 3. `unit_verifications` added to Batch 2

`unit_verifications.user_id` appeared in the r2 gap list but in no batch.
`unit_verifications.unit_id` was absent entirely.

Both are now in **Batch 2**:
- `unit_verifications.unit_id → units.id ON DELETE RESTRICT` — NOT NULL, RESTRICT (units
  never deleted; nullability irrelevant for RESTRICT); orphan check only.
- `unit_verifications.user_id → users.id ON DELETE SET NULL` — NOT NULL; must DROP NOT
  NULL first. After deletion the record retains unit, status, type, and dates — staff
  can still query verifications per unit. The unique constraints
  `uq_unit_verifications_claim_per_unit` and `uq_unit_verifications_approved_user` are
  on different columns and are unaffected.

### Additional fixes (reviewer's "also worth adding")

- `push_tokens.user_id` and `notification_preferences.user_id` confirmed as CASCADE and
  moved from Batch 3 to **Batch 1** — CASCADE rows are the simplest constraints in the
  plan (no orphan nullification, no column type change; the row is deleted, which is
  exactly what should happen when a user is gone).
- Nullability column added to every batch table and to the §3 cross-cutting table.
- `unit_verification_owner_id_attempts.user_id` (NOT NULL) added to Batch 2 gap —
  was absent in r2.
- §6.4 added: exact read paths requiring code updates when `bookings.user_id` becomes
  nullable (5 call sites across `routes/bookings.ts` and `routes/payments.ts`).

---

## Regression suite results (unchanged from r2 — no code changes in r3)

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (Vitest) | 1292 | 0 | 0 |
| Portal (Vitest) | 1358 | 0 | 0 |
| Mobile (Vitest) | 405 | 0 | 0 |
| E2E (Playwright) | 81 | 0 | 6 |

Portal type-check: clean.

No code changes in r3 — the only edits are to the D2 document. The regression
numbers are from the r2 run.

---

## Delivery map (unchanged from r2)

| Item | Status |
|---|---|
| I5 — one-active-pass-per-unit partial unique index | ✅ |
| I5 — eligibility split with named reasons | ✅ |
| I5 — apply endpoint validates DOB + age + portal access | ✅ |
| F7 — `hasActiveWahaPass` correctness post-I5 | ✅ |
| F8 — `cancelFutureBookings` helper (6 assertions) | ✅ |
| F8 — wired in T13 (atomic) | ✅ |
| F8 — wired in Waha revoke (best-effort) | ✅ |
| F8 — O3/T14c/T14d wiring | ⏳ Stage 6 |
| F9 — `GET /api/bookings/config` (fallback logged) | ✅ |
| F9 — `BOOKING_CUTOFF_EXCEEDED` error code activated | ✅ |
| F9 — portal calendar `maxDate`, admin exempt | ✅ |
| F9 — migration 0031 seeds `booking_advance_days = 14` | ✅ |
| D2 — relationship inventory (§1–§5) | ✅ |
| D2 — deletion policies | ✅ |
| D2 — transaction locks | ✅ |
| D2 — postcondition queries | ✅ |
| D2 — FK hardening proposal (§6, all five sub-items) | ✅ r3 |

---

*Generated: Stage 3c r3 delivery — 2026-08-21*
