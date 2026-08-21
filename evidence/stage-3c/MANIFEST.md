# Stage 3c r3 — Evidence MANIFEST

**Date:** 2026-08-21  
**Repo path:** `evidence/stage-3c/`

## r3 files (new in this revision)

| File | Description |
|---|---|
| `evidence/stage-3c/stage3c-d2-fk-inventory-r3.md` | FK inventory — corrected hardening plan: nullability per column, DROP NOT NULL sequenced, bookings.unit_id denormalisation decision, unit_verifications in Batch 2, push_tokens/notification_preferences moved to Batch 1, §6.4 read-path impact list |
| `evidence/stage-3c/stage3c-status-r3.md` | Delivery status report — r3 changes summary |
| `evidence/stage-3c/MANIFEST.md` | This file (updated) |

## r2 files (unchanged)

| File | Description |
|---|---|
| `evidence/stage-3c/migrations/0030_i5_waha_pass_one_per_unit.sql` | Partial unique index |
| `evidence/stage-3c/migrations/0031_f9_booking_advance_days_seed.sql` | Seed booking_advance_days = 14 |

## r3 items addressed

1. **NOT NULL blocking fix** — every SET NULL target column has its actual nullability stated; DROP NOT NULL is an explicit ordered step in the four-step template applied to all 8 NOT NULL / SET NULL columns.
2. **Bookings attribution** — bookings has no unit_id; r2 justification was wrong. Decision: denormalise unit_id onto bookings before applying SET NULL on user_id (Batch 3 pre-requisite).
3. **unit_verifications** — both user_id (SET NULL, DROP NOT NULL) and unit_id (RESTRICT) placed in Batch 2.
4. **push_tokens / notification_preferences** — confirmed CASCADE, moved to Batch 1.
5. **§6.4** — 5 call sites listed that must be updated before Batch 3 migration is applied.

## Regression suite results (r2, no code changes in r3)

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (Vitest) | 1292 | 0 | 0 |
| Portal (Vitest) | 1358 | 0 | 0 |
| Mobile (Vitest) | 405 | 0 | 0 |
| E2E (Playwright) | 81 | 0 | 6 |
