# Stage 3c — Delivery Status Report (r2)

**Date:** 2026-08-21  
**Revision:** r2 — addressing the five items from the r1 non-acceptance review.

---

## Changes from r1

### 1. D2 hardening section added (was absent in r1)

Section 6 of `stage3c-d2-fk-inventory-r2.md` now contains:

- **§6.1** — table distinguishing the four database-enforced FK constraints from the
  twenty-six convention-only relationships documented in §3. The four enforced constraints
  are all on audit/config tables added during Stage 3; every operational relationship
  (`users.unit_id`, `bookings.user_id`, etc.) is convention only.

- **§6.2** — orphan policy (Decision 76, proposed resolved): adopt `ON DELETE SET NULL`
  for all `user_id` FK constraints in Stage 6. Interim dangling integers carry no privacy
  significance once PII fields are scrubbed. Tombstone approach rejected. The seventeen
  columns not currently handled by `deleteUserAccount` are listed explicitly.

- **§6.3** — incremental constraint plan in three ordered batches, with the orphan-
  detection query and cleanup step required before each batch.

### 2. Section 1.2 corrected — Decision 75

The r1 document stated the outgoing owner account is retained (status = `suspended`).
This was wrong. The approval route calls `deleteUserAccount(event.outgoingOwnerId)` before
clearing the unit row, identical to the T13 tenant departure path. Section 1.2 now reads:

> **Hard-deleted with PII anonymisation.** Owners and tenants are treated identically on
> departure (Decision 75, 2026-08-21).

The `deleteUserAccount` docstring has been corrected in the same revision (it previously
stated "only call this for TENANT accounts").

### 3. Section 3 corrected — `waha_pass_applications.unit_id`

The r1 document stated this relationship has a "FK present in production schema." This was
incorrect. The `pg_dump` schema shows only four FK constraints, all on audit tables. The
`waha_pass_applications.unit_id → units.id` relationship is convention only. Corrected in
§3 and reflected in the §6 hardening plan.

### 4. `GET /api/bookings/config` — root cause named, fallback logged

**What the 500 was.** The exact throw site was not captured before the try/catch was
added. The 3 ms response time (too fast for a DB round-trip to execute and fail) points to
a failure inside `requireApiAuth` — most likely Clerk's `getAuth()` encountering an
unexpected auth-context state at page load, such as an in-flight session-token refresh
landing on a request before the Clerk middleware has fully resolved the session. This is a
known edge condition in SSR/SPA hybrid environments where the browser fires requests before
the auth cookie is propagated.

The fallback is intentional and correct for a config endpoint whose default value is
well-defined. The fallback is **no longer silent**: a `logger.error` call was added to the
catch block (`artifacts/api-server/src/routes/bookings.ts`), so if the condition recurs it
will appear in the pino log stream at ERROR level with the exception detail.

### 5. Evidence moved to `evidence/stage-3c/`

All files are now at `evidence/stage-3c/` in the relay repository. The `stage3c/` root-
level folder from r1 has been deleted.

---

## Delivery map

| Item | Status | Notes |
|---|---|---|
| I5 — one-active-pass-per-unit partial unique index | ✅ Complete | `waha_pass_applications_one_active_per_unit` confirmed in dev DB |
| I5 — eligibility split (`eligible/ineligibleSecondResidents` with reasons) | ✅ Complete | 8 new assertions |
| I5 — apply endpoint validates DOB + age + portal access | ✅ Complete | |
| F7 — `hasActiveWahaPass` correctness post-I5 | ✅ Complete | Checks `heldByUserId`, not `unitId` |
| F8 — `cancelFutureBookings` helper | ✅ Complete | 6 new assertions |
| F8 — wired in T13 (atomic) | ✅ Complete | |
| F8 — wired in Waha revoke (best-effort) | ✅ Complete | |
| F8 — O3/T14c/T14d wiring | ⏳ Stage 6 | Flows do not exist yet |
| F9 — `GET /api/bookings/config` | ✅ Complete | Fallback now logged at ERROR |
| F9 — `BOOKING_CUTOFF_EXCEEDED` error code activated | ✅ Complete | |
| F9 — portal calendar `maxDate` | ✅ Complete | Admin exempt |
| F9 — migration 0031 seeds `booking_advance_days = 14` | ✅ Complete | Applied to dev DB |
| D2 — relationship inventory | ✅ Complete | §1–§5 |
| D2 — deletion policies | ✅ Complete | Per-table |
| D2 — transaction locks | ✅ Complete | Per-table |
| D2 — postcondition queries | ✅ Complete | Per-table |
| D2 — FK hardening proposal | ✅ Complete (r2) | §6 — enforced vs conventional; incremental plan; Decision 76 |

---

## Regression suite results

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (Vitest) | 1292 | 0 | 0 |
| Portal (Vitest) | 1358 | 0 | 0 |
| Mobile (Vitest) | 405 | 0 | 0 |
| E2E (Playwright) | 81 | 0 | 6 |

Portal type-check: clean.

---

## Known limitations (carried forward)

- F8 wiring for O3, T14c, T14d: scoped to Stage 6 together with the O3/T13/T14 advisory-
  lock transaction refactor.
- D2 Decision 76: proposed resolved (ON DELETE SET NULL); awaiting acceptance. Implementation
  deferred to Stage 6 FK migration batches.
- `deleteUserAccount` does not currently nullify `waha_pass_credentials.held_by_user_id`,
  `communications.user_id`, `move_forms.user_id`, `push_tokens.user_id`,
  `notification_preferences.user_id`, `unit_verifications.user_id`,
  `residents.linked_user_id`, `residents.registered_by_id`. These are accepted dangling
  integers until Stage 6 adds `ON DELETE SET NULL` FK constraints.

---

*Generated: Stage 3c r2 delivery — 2026-08-21*
