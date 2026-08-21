# Stage 3c — Evidence MANIFEST

**Date:** 2026-08-21  
**Repo path:** `stage3c/`

| File | Description | SHA |
|---|---|---|
| `stage3c/stage3c-status.md` | Delivery status report (I5, F7, F8, F9, D2) | d32862c8 |
| `stage3c/stage3c-d2-fk-inventory.md` | FK relationship inventory — O3, T13 tables, deletion policies, postconditions, F8 cascade wiring | 824d20d3 |
| `stage3c/migrations/0030_i5_waha_pass_one_per_unit.sql` | Partial unique index: one active Waha Pass per unit | 71380f90 |
| `stage3c/migrations/0031_f9_booking_advance_days_seed.sql` | Seed `booking_advance_days = 14` in `hoa_settings` | bd13bf60 |

## Regression suite results

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (Vitest) | 1292 | 0 | 0 |
| Portal (Vitest) | 1358 | 0 | 0 |
| Mobile (Vitest) | 405 | 0 | 0 |
| E2E (Playwright) | 81 | 0 | 6 |

Portal type-check: **clean**.

## Dev DB index confirmation

```sql
-- pg_dump output confirming I5 index in dev database:
CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
  ON public.waha_pass_applications USING btree (unit_id)
  WHERE (status = ANY (ARRAY['pending_review'::public.waha_pass_application_status,
                              'active'::public.waha_pass_application_status]));
```
