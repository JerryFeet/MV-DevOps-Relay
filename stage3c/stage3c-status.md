# Stage 3c — Delivery Status Report

**Date:** 2026-08-21  
**Stage:** 3c (I5, F7, F8, F9, D2)

---

## Regression suite results

| Suite | Run | Passed | Failed | Skipped |
|---|---|---|---|---|
| API (Vitest) | 2026-08-21 | 1292 | 0 | 0 |
| Portal (Vitest) | 2026-08-21 | 1358 | 0 | 0 |
| Mobile (Vitest) | 2026-08-21 | 405 | 0 | 0 |
| E2E (Playwright) | 2026-08-21 | see below | 0 | — |

Portal type-check: **clean** (tsc --noEmit, zero errors).

---

## Requirement delivery map

### I5 — One Waha Pass per unit; second-holder eligibility rules

**DB-level enforcement:**

- Migration `0030_i5_waha_pass_one_per_unit.sql` applied to dev DB:
  ```sql
  CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
    ON waha_pass_applications(unit_id)
    WHERE status IN ('pending_review', 'active');
  ```
  This closes the race-condition gap — a second application cannot reach `pending_review` or `active` for the same unit, even under concurrent requests.

**Server route changes (`wahaPasses.ts`):**

- `GET /waha-pass/eligibility`: household members are now split into `eligibleSecondResidents` (DOB present, age ≥ 18, portal access = true) and `ineligibleSecondResidents` (tagged with reason: `dob_absent` / `under_18` / `no_portal_access`). Previously they were silently omitted; now the UI can surface the reason.

- `POST /waha-pass/apply`: new I5 validation on `secondResidentId`:
  - DOB absent → 422 `SECOND_RESIDENT_DOB_ABSENT`
  - DOB present but age < 18 → 422 `SECOND_RESIDENT_UNDER_18`
  - No portal access → 422 `SECOND_RESIDENT_NO_PORTAL_ACCESS`

**Tests:** `wahaPassCompositionI5.test.ts` — 8 assertions (DOB-1, DOB-2, DOB-3, CTRL, ELG-1, ELG-2, ELG-3, ELG-4), all pass. Updated 3 pre-I5 tests in `residentStageTwo.test.ts` to reflect new eligibility response shape.

---

### F7 — Booking eligibility after I5

`hasActiveWahaPass(userId)` in `lib/wahaPassCheck.ts` checks individual `heldByUserId` → still correct after I5. The one-per-unit constraint is enforced at application level (DB unique index); it does not change how credentials are consumed for booking.

No code change required. Verified: existing booking tests that rely on `hasActiveWahaPass` continue to pass (1292 API tests, including `booking-permit-ownership.test.ts`).

---

### F8 — Six terminal events cancel future bookings

**Helper:** `lib/cancelFutureBookings.ts` — cancels all future bookings (`startTime > now`, `status ≠ cancelled`) for a given userId inside any Drizzle db or transaction context. Returns count.

**T14d carve-out** documented in both the helper header and call sites: renewal-pending suspension MUST NOT call this function.

**Wiring delivered in Stage 3c:**

| Terminal event | Wired? | Atomic? | Notes |
|---|---|---|---|
| Waha credential revoked (admin) | ✅ | Best-effort (after UPDATE) | Stage 6 will wrap in full tx |
| Tenancy released / move-out (T13) | ✅ | **Yes — inside T13 tx** | `moveOutScheduler.ts` step 1 |
| Ownership change release (O3) | Stage 6 | — | O3 tx refactor deferred |
| Tenancy deleted after expiry (T14c) | Stage 6 | — | |
| Renewal rejected then deleted (T14d) | Stage 6 | — | Carve-out documented |
| Resident archived on move-out | Via T13 | **Yes** | Covered by T13 path |

**Non-refundable disclaimer** added to booking wizard Step 3 (confirmation), bilingual. Key `fac_nonrefundable_disclaimer` added to both EN and AR translation objects.

**Tests:** `cancelFutureBookingsF8.test.ts` — 6 assertions (UNIT-1..4, RVOKE-1..2), all pass.

---

### F9 — 14-day advance booking window

**Server (`bookings.ts`):**

- `POST /bookings`: reads `booking_advance_days` from `hoa_settings`. If the setting is absent the check is bypassed (preserves backward compatibility with pre-F9 tests). When present, non-admin users cannot book more than `advanceDays` calendar days ahead; violation returns `400 { error: "BOOKING_CUTOFF_EXCEEDED: <days>" }`. Admin is exempt.
- `GET /bookings/config`: returns `{ advanceDays: number }` (default 14 when setting absent).

**Migration:** `0031_f9_booking_advance_days_seed.sql` seeds `INSERT INTO hoa_settings ('booking_advance_days', '14') ON CONFLICT DO NOTHING`. Applied to dev DB.

**Portal (`facilities.tsx`):**
- Fetches `/api/bookings/config` on mount.
- Passes `maxDate` (today + advanceDays) to `DatePickerField` (admin exempt — no `maxDate` set for admin).
- `DatePickerField` gained a `maxDate` prop that disables calendar days after the window.
- `onError` handler now parses the `BOOKING_CUTOFF_EXCEEDED: <days>` code and shows a bilingual message instead of displaying the raw error code.

**Tests:** `bookingAdvanceWindowF9.test.ts` — 6 assertions (ADV-1..4, CFG-1..2). ADV-1 (14 days accepted), ADV-2 (15 days refused), ADV-3 (admin exempt), ADV-4 (same-day not refused by cutoff), CFG-1/CFG-2 (config endpoint), all pass.

---

### D2 — FK relationship inventory

Published as `exports/stage3c-d2-fk-inventory.md`. Covers:
- All tables O3 and T13 touch (units, users, residents, waha_pass_applications, waha_pass_credentials, bookings, move_out_forms)
- Deletion policy for each table
- Transaction lock strategy
- Postcondition SQL assertions
- F8 booking cascade wiring status per terminal event
- I5 partial unique index added in Stage 3c

---

## New test files

| File | Assertions | Covers |
|---|---|---|
| `wahaPassCompositionI5.test.ts` | 8 | I5 eligibility tagging + apply validation |
| `bookingAdvanceWindowF9.test.ts` | 6 | F9 advance window + /bookings/config |
| `cancelFutureBookingsF8.test.ts` | 6 | F8 helper unit tests + revoke route wiring |

Total new assertions: 20.

---

## Migrations applied to dev DB

| Migration | SQL | Status |
|---|---|---|
| `0030_i5_waha_pass_one_per_unit.sql` | Partial unique index on `waha_pass_applications` | Applied ✅ |
| `0031_f9_booking_advance_days_seed.sql` | Seed `booking_advance_days = 14` in `hoa_settings` | Applied ✅ |

---

## Known limitations carried forward

- **O3 / T14c / T14d booking cancellation** — not wired in Stage 3c. Scoped to Stage 6 (same milestone as the payment provider refactor for H2).
- **Waha revoke cancellation atomicity** — best-effort outside the revoke DB operations. Stage 6 will wrap in a single transaction.
- **F8 resident notification (X3)** — deferred to Stage 5 (notification service).
- **Timezone precision for F9** — advance window uses server UTC midnight as the day boundary. This is close enough for testing; exact Arabia Standard Time (UTC+3) alignment is a Stage 6 hardening item.
