# Cross-project asymmetric invariant route enumeration

**Date:** 2026-09-07  
**Boundary:** confirmed runtime defects only. Audit-only candidates are listed
separately and do not authorize product changes.

## Five confirmed asymmetric enforcement paths

| # | Shared invariant | Enforcing route/path | Non-enforcing route/path | Runtime proof | Status |
|---|---|---|---|---|---|
| 1 | A booking start before now is unavailable. | Facility availability response classified elapsed starts unavailable. | Resident booking UI rendered the same elapsed starts enabled. | Section 1 browser 1a showed 13 enabled elapsed starts. | Fixed and permanently browser-regressed. |
| 2 | A booking start before now cannot be created. | Facility availability disabled/rejected elapsed starts. | `POST /api/bookings` accepted the same elapsed start. | Section 1 browser 1b created an elapsed booking pre-fix. | Fixed and permanently API/browser-regressed. |
| 3 | A rejected elapsed cancellation remains visibly rejected. | Booking cancellation API returned `409`. | Portal closed the cancellation dialog without showing the server rejection. | Section 1 browser 1c captured the rejected request and missing visible error. | Fixed and permanently browser-regressed. |
| 4 | A Waha self-read belongs to the user's current verified active unit and valid lifecycle. | Waha eligibility/apply used canonical active current occupancy. | `GET /api/waha-pass/mine` selected by applicant alone and could return a historical unit/application. | Section 3 browser 3a received current units 57/58 while `/mine` repeatedly returned unit 47. | Fixed and permanently browser-regressed. |
| 5 | Credential 2 assignment uses the same same-unit, active, DOB-present, adult, portal-enabled eligibility and occupancy boundary as apply. | `GET /api/waha-pass/eligibility` and `POST /api/waha-pass/apply`. | `POST /api/waha-pass/:id/assign-second` checked only active same-unit resident and omitted application/current-unit equality and the shared occupancy lock. | Section 3 browser 3b exposed the marked under-18 resident; four focused forbidden API calls returned `200`. | Fixed and permanently API/browser-regressed. |

The first and third entries cross an HTTP route and its resident-facing UI
consumer rather than two HTTP handlers. They are included because both paths
make the same business decision and produced contradictory outcomes visible to
the resident.

Section 2's monthly allowance defect is confirmed but is not part of this
enumeration: it was one invariant implemented with the wrong classification,
not two paths where only one enforced the invariant.

## Six Waha audit-only findings

These are audit findings only. They are not runtime-confirmed defects and do not
authorize a remedy.

1. **Lost card**
   - `report-lost` uses route-local applicant/application checks but does not
     re-establish canonical current occupancy under the shared unit lock.
   - It is asymmetric with revoke/release, so a stale application relationship
     could be mutated.

2. **Replacement**
   - Replacement review, payment initiation, and the provider callback do not
     yet have a proved shared lock/idempotency boundary.
   - Concurrent or replayed completion could issue twice or leave application,
     old credential, replacement credential, and payment state partially
     aligned.

3. **Credential 2 holder-removal**
   - Household and tenancy removal paths are not proved to invalidate or detach
     an active Credential 2 held by the departing resident.
   - A removed resident may retain a credential that still passes downstream
     status checks.

4. **Day pass**
   - Self-read, creation/payment, and gate verification derive
     purchaser/guest/unit/lifecycle scope differently.
   - No route-parity proof establishes that stale or wrong-unit day passes are
     hidden and rejected consistently.

5. **Scheduler**
   - Expiry/cleanup schedulers mutate Waha lifecycle state without deterministic
     clock coverage proving the same downstream booking/day-pass consequences
     as interactive revoke/release paths.

6. **Database cardinality**
   - Approval inserts Credential 1 and Credential 2 in application code, but
     the database does not prove exactly two credentials or uniqueness of
     application + credential index.
   - Missing or duplicate credentials remain possible under concurrency or
     direct/manual writes.

## Evidence sources

- `evidence/uat-round-3/section-1-past-slot/`
- `evidence/uat-round-3/section-3-waha-second-credential/`
- `Section-3-Waha-Invariant-Route-Matrix-2026-09-07.md`
- `Section-3-Post-Fix-Delivery-2026-09-07.md`