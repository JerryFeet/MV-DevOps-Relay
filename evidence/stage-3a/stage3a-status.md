# Madain Village HOA Portal — Stage 3a Delivery Status Report

**Evidence date:** 2026-08-21  
**Revision:** r3  
**Classification:** Stage 3a evidence package — awaiting formal acceptance  
**Release decision:** DO NOT DEPLOY

---

## Scope

Stage 3a covers the following requirements from `UAT-Change-Requirements-2026-08-18`:

| Spec ID | Requirement summary |
|---|---|
| D1 | Unit registry: owner/tenant/household resident full name, mobile, National ID/Iqama, role/relationship, verification; parking entitlement, resident count, Waha status; admin/supervisor only; guard blocked |
| A2 | Admin `/users` endpoint exposes full name (first + last) and phone; admin `/admin/summary` and `/admin/units/full` expose complete active-resident roster |
| E1 | Completed resident record required to submit a vehicle; eligible portal user sees registering full name read-only |
| E2 | Parking type must have a corresponding unit entitlement; server-side rejection with specified English/Arabic reason |
| E3 | Active vehicle count per parking type cannot exceed entitlement; concurrency-safe; deleting an active vehicle frees a slot |
| E4 | Admin request detail shows/downloads private Istimara via authenticated short-lived signed URL, with vehicle and resident identity details |
| E5 | Additional-vehicle rejection requires a controlled reason (name mismatch or entitlement exceeded), optional note, persisted and included in localized notification |
| F1 | Opening-anchored half-hour grid; slot/min/max durations multiples of 30; cleaning buffer explicitly exempt from multiple-of-30 |
| F2 | Configurable 15-minute default cleaning buffer; next available start is next grid mark at/after buffer end; buffer unavailable/unbillable |
| F2b | All facilities exclusive-use regardless of capacity; same-start second booking refused; `capacity_mode` does not alter admission |
| F3 | Valid grid/duration/window/non-overlap bookings accepted; reject only genuine named rule violations |
| F4 | Booking may end exactly at close; buffer may extend past close; bold configured-buffer cleaning disclaimer shown in English/Arabic |
| F5 | One-time migration rounds invalid interval/duration values upward to 30-minute multiples and logs every change; cleaning buffer never rounded |
| F6 | Authoritative operating-hours model; all facilities open 10:00; booking window depends on day of booking start (Thu/Fri/Sat = weekend: window 10:00–01:00 next day, last bookable start 00:30; other days: window 10:00–23:00, last bookable start 22:30) |
| F7 | Booking facility access requires an active individual Waha Pass; server returns HTTP 403 with code `WAHA_PASS_REQUIRED`; portal shows a bilingual amber warning |
| I5 | One Waha Pass per unit at a time; applicant age ≥ 18; DOB absent triggers specific error response |

All 16 items were addressed in Stage 3 r4 or earlier, except F7 (added in `UAT-Change-Requirements-2026-08-18`) and I5 (carried from earlier requirements). I5 conformance is **not satisfied** — see I5 conformance section below.

---

## Stage 3a r3 Δ summary

r3 addresses the two blocking items raised in the Stage 3a r2 reply, plus answers two open questions:

| # | Reviewer requirement | r3 disposition |
|---|---|---|
| 1 | Wizard test must pass, not skip — rewrite to book a date within the accessible window | **Fixed in r3.** Root cause confirmed: `locator.isVisible({ timeout })` does not wait (the timeout parameter is silently ignored by Playwright); the slot availability check was returning `false` immediately while the API was still in flight. Fix: replaced with `locator.waitFor({ state: "visible", timeout: 15_000 })`. Additionally rewrote the target date from +45 days to +4 days (nearest confirmable window); changed slot locator to a time-pattern filter (`/^\d{1,2}:\d{2}/`) to target slot buttons precisely; added spinner-disappear wait to confirm API response received before checking slot visibility. Tests 23 and 71 ("admin can book a facility via the wizard and cancel from My Bookings") now pass in both Playwright projects. |
| 2 | Seed Waha Pass on verified-resident fixture — the booking panel must be accessible (not gated) for a verified resident who holds an active pass | **Fixed in r3.** `seedActiveWahaPassByEmail(email)` added to `e2e/helpers/db.ts`: inserts one `waha_pass_applications` row (status=`active`) and one `waha_pass_credentials` row (status=`active`, `credential_index=1`, `held_by_user_id` = verified-resident HOA user ID); idempotent. Called from `e2e/verified-resident.setup.ts` immediately after `seedVerifiedOwnerByEmail`. New describe block "Facility Booking — Verified Resident (Waha Pass seeded)" added to `facilities.spec.ts`; tests 22 and 70 ("booking panel is accessible for a resident with an active Waha Pass") pass in both Playwright projects. |
| 3 | F9 new requirement — advance booking window: section 2b (admin exemption) | **Answered.** Admin is exempt from the F9 advance-booking window; the window constraint applies to resident-role users only. Rationale: admins schedule on behalf of the community and must not be constrained by resident booking windows. Confirmed reversible; implementation is Stage 3b. The existing wizard E2E (now passing) runs under admin credentials and exercises the booking flow without a window restriction — this is correct for the current code state. |
| 4 | F9 new requirement — section 9d: what is the current advance-booking limit? | **Answered — no limit exists.** `POST /api/bookings` contains no advance-date check; `DatePickerField` in the booking wizard has no `maxDate` prop; there is dead client-side scaffolding (`cutoffError` / `BOOKING_CUTOFF_EXCEEDED`) that the server never triggers. No advance-booking guard is implemented anywhere in the codebase today. F9 implementation is Stage 3b. |

---

## Stage 3a r2 Δ summary (carried for reference)

r2 addressed all six items raised in the Stage 3a r1 blocking reply. These remain satisfied in r3.

| # | Reviewer requirement | r2 disposition |
|---|---|---|
| 1 | Booking wizard create-and-cancel must pass in browser | Fixed in r1: `facilities.spec.ts` uses `.animate-spin` wait. Wizard slot step was still skipping in r2 — timing issue fully resolved in r3 (see above). |
| 2 | Verified-resident fixture seeded; tests 27/49 unblocked | Fixed in r2. Tests 27 and 49 pass. Fixture extended in r3 to also seed Waha Pass. |
| 3 | I5 conformance reported | I5 not satisfied; 3 gaps documented; accepted as Stage 3b. |
| 4 | F7 E2E coverage: verified-resident booking panel accessible | r2 reported Waha Pass seed as pending; fully delivered in r3 (tests 22 + 70 pass). |
| 5 | F6 wording: last bookable start corrected | Fixed in r2; unchanged. |
| 6 | Manifest detached | Fixed in r2; unchanged. |

---

## Reviewer questions answered in r3

### 2b — Admin exemption from F9 advance-booking window

**Decision: admin is exempt; window applies to residents only.**

The F9 advance-booking window (max days ahead a resident may book) will be enforced only for users whose HOA role resolves to resident, tenant, or owner. Admins and supervisors booking on behalf of the community must remain unconstrained. The existing E2E wizard test (now passing) runs under admin credentials and correctly exercises the full booking flow without a window restriction — this alignment is intentional. Implementation of the server-side resident window check is Stage 3b. This decision is reversible before Stage 3b acceptance.

### 9d — Current advance-booking limit

**No advance-booking limit exists in the current codebase.**

Code search confirms:
- `POST /api/bookings` route: no date-range check; only validates date format, grid alignment, window, duration, and overlap.
- `DatePickerField` in `facilities.tsx` (line 514): accepts `minDate={todayStr()}` but no `maxDate` prop.
- Dead scaffolding exists: the client-side `cutoffError` state and `BOOKING_CUTOFF_EXCEEDED` constant are defined but the server never returns that code. This scaffolding was left from an earlier prototype and has not been wired up. It will be replaced or activated as part of F9 in Stage 3b.

---

## F9 new requirement — reporter note

F9 was raised by the reviewer during r2 review. It requires:

> Residents may only book a facility within a configurable advance-booking window (e.g. 30 days ahead). Bookings beyond the window must be rejected server-side with a localized reason.

**Stage 3a scope:** The r3 test framework change (wizard uses +4 days, runs under admin credentials) is already aligned with F9: admin is unrestricted; the test books 4 days ahead (well within any reasonable resident window). No functional implementation of F9 is required for Stage 3a acceptance; it is tracked as a Stage 3b item.

---

## I5 conformance

**Status: NOT SATISFIED — Stage 3b**

Three gaps confirmed by code inspection:

| Gap | Required by I5 | Current state |
|---|---|---|
| Per-unit uniqueness | One active Waha Pass per unit at a time | No unique constraint on `waha_pass_applications` for `unit_id + status='active'`; second application for same unit is accepted |
| Age check | Applicant must be ≥ 18 years old at submission | No age validation in `POST /api/waha-pass`; DOB is stored but not evaluated |
| DOB-absent error | If DOB is absent, return a specific error response | No DOB-absent check; `dateOfBirth: null` passes validation silently |

These gaps are documented, accepted as Stage 3b, and do not affect any of the 16 Stage 3a items. F7 (Waha Pass required for booking) is satisfied independently of I5.

---

## F7 conformance

**Status: SATISFIED**

| Requirement | Implementation | Evidence |
|---|---|---|
| Individual Waha Pass required | `hasActiveWahaPass(userId)` checks `waha_pass_credentials` where `held_by_user_id = userId` AND `status='active'` AND joined application's `unit_id = user.unit_id` | `artifacts/api-server/src/routes/bookings.ts` |
| Server returns HTTP 403 + `WAHA_PASS_REQUIRED` | Route returns `{ error: "WAHA_PASS_REQUIRED" }` with status 403 when no active credential | API test: 3 tests covering pass-required rejection |
| Portal shows bilingual amber warning | `facilities.tsx` renders amber warning block when `!isAdmin && !wahaPassLoading && !hasActivePass` | E2E: test 20 (resident without pass sees gate); test 22 (verified resident with seeded pass reaches booking panel) ★ r3 |

---

## Verified-resident E2E fixture

**Created in r2; extended in r3.**

| Property | Value |
|---|---|
| Email | `e2e-verified-resident+clerk_test@example.com` |
| Clerk ID | `user_3IDMLt6PwzxBsKMcNUP7wurtrKg` |
| HOA role | `tenant` |
| verification_status | `verified_owner` |
| unit_id | `2` |
| Waha Pass | Active (seeded in r3): `waha_pass_applications.status='active'`, `waha_pass_credentials.status='active'`, `credential_index=1`, `held_by_user_id` = HOA user ID (resolved from email) |

The fixture is idempotent: `seedVerifiedOwnerByEmail` and `seedActiveWahaPassByEmail` each check for existing rows before inserting. The setup file (`verified-resident.setup.ts`) seeds both the HOA user record and the active Waha Pass credential in a single pre-test hook, using the same Clerk-managed auth state. The spec files wait for `GET /api/users/me` to complete before interacting, ensuring `verificationStatus` is populated before dialogs are opened.

---

## Stage 3a relevant passing tests (full list)

| Test | Spec IDs | Evidence |
|---|---|---|
| `facilities.spec.ts` — Facility Booking: facilities list page loads (resident) | F-general | Facilities page loads; heading visible |
| `facilities.spec.ts` — at least one facility card or empty state is shown (resident) | F-general | Facility cards visible in browser |
| `facilities.spec.ts` — clicking a facility shows the booking panel (admin) ★ r1 | F1, F3 | Admin clicks facility card → booking panel visible |
| `facilities.spec.ts` — My Bookings tab shows existing bookings or empty state (resident) ★ r1 | F-general | My Bookings tab renders correctly for resident |
| `facilities.spec.ts` — booking panel is accessible for a resident with an active Waha Pass (resident project) ★ r3 | F7 | Verified-resident fixture with seeded Waha Pass reaches booking wizard step 2 |
| `facilities.spec.ts` — admin can book a facility via the wizard and cancel from My Bookings (resident project) ★ r3 | F1, F2, F3, F6 | Full create-and-cancel wizard: date picker → time slot → review → confirm → My Bookings cancel |
| `facilities.spec.ts` — facilities list page loads (admin) | F-general | Facilities page loads for admin |
| `facilities.spec.ts` — at least one facility card or empty state is shown (admin) | F-general | Facility cards visible in admin browser session |
| `facilities.spec.ts` — clicking a facility shows the booking panel (admin) ★ r1 | F1, F3 | Admin clicks facility card → booking panel visible |
| `facilities.spec.ts` — My Bookings tab shows existing bookings or empty state (admin) ★ r1 | F-general | My Bookings tab renders correctly for admin |
| `facilities.spec.ts` — booking panel is accessible for a resident with an active Waha Pass (admin project) ★ r3 | F7 | Same verified-resident fixture; both Playwright projects run setup |
| `facilities.spec.ts` — admin can book a facility via the wizard and cancel from My Bookings (admin project) ★ r3 | F1, F2, F3, F6 | Same end-to-end wizard flow in admin project |
| `guests.spec.ts` — Verified Resident: guest registration dialog ★ r2 | E-general | Verified-resident fixture opens guest registration dialog |
| `vehicles.spec.ts` — vehicles page loads with correct heading (resident) | E-general | Vehicles page loads |
| `vehicles.spec.ts` — register vehicle button or verification prompt is visible (resident) | E1, E2 | Unverified resident sees verification prompt (E1 gate confirmed) |
| `vehicles.spec.ts` — vehicle list shows existing vehicles or empty state (resident) | E-general | Vehicle list renders |
| `vehicles.spec.ts` — Verified Resident: add vehicle dialog ★ r2 | E1 | Verified-resident fixture opens add vehicle dialog |
| `admin.spec.ts` — admin dashboard loads; stat cards, Unit Verification Queue, Move Forms, Permits visible | D1, A2 | Admin dashboard shows unit registry entry point |
| `admin-access-guard.spec.ts` — resident API summary 403 | D1 | Guard/resident blocked from admin endpoints |
| `owner-admin-redirect.spec.ts` — owner cannot access retired unit-registry UI | D1 | Retired `/portal/unit-registry` route inaccessible |

★ r1 = first passed in Stage 3a r1 · ★ r2 = first passed in Stage 3a r2 · ★ r3 = first passed in Stage 3a r3

---

### Decision 61 — Named skipped tests (r3 update)

r3 reduces Decision 61 from 7 skips to 5. The two wizard skips (r2 items 4 and 5) are resolved; a new verified-resident Waha booking panel test (r3 items 22 + 70) replaces the r2 item 3 gating concern.

The following **5 tests** skip due to dev-environment preconditions. They are named here (Decision 61) and will be confirmed in consolidated UAT with the product owner.

| # | Test | File | Reason |
|---|---|---|---|
| 1 | download link present when documents exist | `documents.spec.ts` (resident) | No HOA documents seeded in dev DB; resident document-download is J7 (Stage 4b); not a Stage 3a spec item |
| 2 | admin sees visibility restriction badges when documents exist | `documents-admin.spec.ts` (admin) | Same: no documents in dev DB; this is J5 (Stage 4b); not a Stage 3a spec item |
| 3 | clicking a facility shows the booking panel | `facilities.spec.ts` (resident) | E2E resident account (`e2e-resident+clerk_test@example.com`) has no active Waha Pass; the amber gate warning is the correct F7 behavior; the verified-resident fixture (Waha Pass seeded) now separately confirms the booking panel is accessible when a pass is held (test 22 ★ r3 passes). This skip represents the intentional gate for pass-less residents |
| 4 | guest registration dialog opens when button is clicked (verified user) | `guests.spec.ts` (resident) | The E2E resident account is not unit-verified; guest registration correctly requires unit verification; confirmed separately by verified-resident fixture (test 28 ★ r2 passes) |
| 5 | add vehicle dialog opens when button is clicked (verified user) | `vehicles.spec.ts` (resident) | Same: E2E resident account is not unit-verified; E1 spec item confirmed by 74 API tests and verified-resident fixture (test 50 ★ r2 passes) |

**Note:** Items 1 and 2 are J-spec items from Stage 4b, not Stage 3a items. Their continued skip does not affect Stage 3a acceptance. Items 3–5 are all named and reasoned above; none represents a code regression.

---

## F5 migration evidence (carried from Stage 3 r4)

The F5 one-time normalization migration evidence from Stage 3 r4 remains unchanged:

- Migration script applied to dev DB: 2 facilities normalized, 2 conflicts detected and logged, 0 cleaning buffers rounded.
- Rollback transcript confirmed zero residual: re-running migration after rollback produced a deterministic idempotent result.
- Evidence file: `f5-migration-transcript.md` published in `evidence/stage-3/` (Stage 3 r4 delivery).

---

## Evidence summary (all Stage 3a items)

| Spec | Status | Evidence |
|---|---|---|
| D1 | **Evidence complete** | Full HOA role ACL covering all access-control paths and registry content; admin dashboard E2E; browser confirmation of Unit Verification Queue entry point |
| A2 | **Evidence complete** | 17 API tests covering full name + phone on `/users`, `/admin/summary`, and `/admin/units/full` for admin and supervisor |
| E1 | **Evidence complete** | 74 E1–E5 API tests; E2E verification prompt confirmed for unverified resident; verified-resident dialog confirmed for `verified_owner` user (r2 ★) |
| E2 | **Evidence complete** | Parking type entitlement enforcement verified in API tests |
| E3 | **Evidence complete** | Advisory-lock concurrency and slot-freeing on delete verified in API tests |
| E4 | **Evidence complete** | Signed-URL access control for Istimara: owner 200, guard 403, other-resident 403, admin 200, no-doc 404 |
| E5 | **Evidence complete** | Rejection reason gate: approver role, controlled reason, persistence |
| F1 | **Evidence complete** | Opening-anchored grid, multiple-of-30 for slots/min/max, buffer exempt |
| F2 | **Evidence complete** | Cleaning buffer, next-mark conflict detection |
| F2b | **Evidence complete** | Exclusive-use, same-start refusal |
| F3 | **Evidence complete** | Valid bookings accepted; named-rule violations rejected |
| F4 | **Evidence complete** | Closing boundary; overnight Thursday pass-through |
| F5 | **Evidence complete** | r4 rollback transcript; 2 normalizations, 2 conflicts, no buffer rounding, zero residual |
| F6 | **Evidence complete** | 6 operating-hours tests; Thu/Fri/Sat weekend model; last bookable start 00:30 (next day), booking window closes at 01:00; post-midnight anchor |
| F7 | **Evidence complete** | Individual `heldByUserId` check; HTTP 403 + `WAHA_PASS_REQUIRED`; bilingual amber portal warning; 3 API tests; verified-resident booking panel passes with seeded Waha Pass (r3 ★) |
| I5 | **Not satisfied — Stage 3b** | No unique per-unit constraint, no age check, no DOB-absent error; gaps documented in I5 conformance section |
| **E2E: facilities browser** | **Complete ★ r3** | 7 facility tests pass (list, cards, click→panel, My Bookings); full create-cancel wizard now passes in both Playwright projects (r3 ★); Waha Pass booking panel confirmed for verified-resident (r3 ★); regular-resident gate skip retained as correct F7 behavior |
| **E2E: vehicles browser** | **Complete** | List, verification-prompt, and verified-resident add-vehicle dialog all pass (r2 ★) |
| **E2E: guests browser** | **Complete** | Guest page loads, verification prompt visible, and verified-resident dialog all pass (r2 ★) |

**Final E2E result (r3):** 82 passed / 5 skipped / 0 failed (87 total tests)

---

## Deviations declared in Stage 3a

| Decision | Deviation | Direction |
|---|---|---|
| Decision 61 | 5 E2E tests skip due to dev-environment preconditions (no Waha Pass for regular E2E resident; no seeded documents) — reduced from 7 in r2 (wizard skip resolved, Waha booking panel confirmed by verified-resident fixture) | Named and deferred to consolidated UAT; no code gap |
| Decision 68 | Supervisors do not receive `nationalId` in unit registry responses; D1 literally grants both admin and supervisor read | Safe narrowing of PII exposure; accepted in r1 review |

---

## Acceptance criteria status

Stage 3a can be marked **accepted** when the following are confirmed:

1. D1, A2, E1–E5, F1–F7 API evidence reviewed and approved (this package).
2. I5 accepted as Stage 3b (not satisfied; gaps documented above).
3. Decision 61 named skips (items 3–5) accepted for deferral to consolidated UAT.
4. Decision 68 (supervisor nationalId exclusion) acknowledged.
5. F9 new requirement acknowledged as Stage 3b; admin-exempt decision (section 2b) and no-existing-limit finding (section 9d) noted.
6. An authorized reviewer explicitly approves Stage 3a.

Stage 3a does NOT cover G1–G6, renovation TEXT[] migration, payment flows, or Waha/Guest Day Pass regression — those remain Stage 3b.

---

## Boundaries

- No production deployment, production database access, or production schema migration was performed.
- Stage 3a contains no resident data, document contents, private object keys, credentials, secrets, or production output.
- The E2E fixes in r1 (`facilities.spec.ts` timing), r2 (`guests.spec.ts`, `vehicles.spec.ts` verified-resident fixture + API-response wait), and r3 (`facilities.spec.ts` `waitFor` fix + time-pattern slot locator + Waha Pass seed + +4-day date window) are test-harness corrections only; no application source code was changed.
