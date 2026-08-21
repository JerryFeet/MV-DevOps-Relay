# Stage 3c r2 — Evidence MANIFEST

**Date:** 2026-08-21  
**Repo path:** `evidence/stage-3c/`

| File | Description |
|---|---|
| `evidence/stage-3c/stage3c-status-r2.md` | Delivery status report — r2 changes, delivery map, regression results |
| `evidence/stage-3c/stage3c-d2-fk-inventory-r2.md` | FK relationship inventory — all five D2 deliverables including §6 hardening proposal, Decision 75 (§1.2 correction), Decision 76 (orphan policy) |
| `evidence/stage-3c/migrations/0030_i5_waha_pass_one_per_unit.sql` | Partial unique index: one active Waha Pass per unit |
| `evidence/stage-3c/migrations/0031_f9_booking_advance_days_seed.sql` | Seed `booking_advance_days = 14` in `hoa_settings` |

## r2 items addressed

1. **D2 §6 hardening** — 4 enforced FK constraints vs 26 convention-only; Decision 76 orphan policy; incremental 3-batch constraint plan.
2. **§1.2 corrected** — outgoing owner hard-deleted with PII anonymisation (Decision 75); `deleteUserAccount.ts` docstring corrected.
3. **§3 corrected** — `waha_pass_applications.unit_id → units.id` is convention only (not a DB constraint as r1 claimed).
4. **`/api/bookings/config` 500** — root cause named (Clerk auth-context edge at page load); `logger.error` added to catch block.
5. **Evidence path** — moved from `stage3c/` root to `evidence/stage-3c/`.

## Regression suite results

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (Vitest) | 1292 | 0 | 0 |
| Portal (Vitest) | 1358 | 0 | 0 |
| Mobile (Vitest) | 405 | 0 | 0 |
| E2E (Playwright) | 81 | 0 | 6 |

Portal type-check: **clean**.
