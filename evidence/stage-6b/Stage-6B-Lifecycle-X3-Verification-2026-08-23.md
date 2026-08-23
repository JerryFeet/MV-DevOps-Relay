# Stage 6B lifecycle and X3 verification

**Verification date:** 2026-08-23  
**Verified source commit:** `113935541565160090fd760f0c6a118b3691f878`  
**Scope:** Stage 6B only — tenancy release (T13), expiry/renewal (T14), and X3 notification completion.  
**Out of scope:** Stage 6C, deployment, production-database access, and live payment credentials.

## Delivered behavior

### T13 — terminal tenancy release

- Every terminal tenant or owner departure now enters the shared `releaseSubject` engine.
- Completed move-out forms retain the canonical release path and now persist X3 event 15 email and push intent **before** subject-account deletion.
- Ownership-change approval no longer invokes a legacy account-deletion cascade. It invokes the shared engine with the ownership-change trigger, preserving release locks, audit operation, Waha treatment, booking graph handling, and durable external identity deletion work.
- The former direct account-deletion helper was removed from active source.
- An admin may preview a lifecycle terminal release at `/portal/admin`. The preview is calculated by the server-side release engine, then exposes affected-record counts and paid future Day Pass value before a separate irreversible confirmation action.
- `DELETE /residents/:id` remains a narrow housekeeping exception only for an **unlinked** household record. It returns `409 TERMINAL_RELEASE_REQUIRED` for a resident linked to a portal account.

### T14 — expiry, renewal, suspension, and restoration

- A pending renewal at lease expiry suspends the tenant portal account and Waha credentials while retaining paid future bookings.
- A late verified-owner approval restores the lifecycle, tenant access, Waha credential usability, and the retained paid booking; no terminal release occurs.
- Repeated/concurrent scheduler work cannot turn a paid future booking into a contradictory cancelled state while an expiry suspension is being applied.
- Administration may cancel a pending renewal, but may never approve or reject one. The verified owner remains the only renewal decision-maker.

### X3 — 16/16 producer coverage

| Event | Production producer | Delivery contract |
|---|---|---|
| 12 | Tenancy-expiry scheduler | Mandatory email and push warning at 30/14/7/1 days; the key includes lifecycle, lease boundary, and reminder boundary, so scheduler reruns deduplicate. |
| 13 | Tenant release request | Existing producer retained. |
| 14 | Tenancy renewal state transitions | Existing producer retained. |
| 15 | Canonical completed move-out release | Email and push intent saved before account removal; one key per move-out form. |
| 16 | Existing lifecycle release/expiry producer | Existing producer retained. |

Event 12 is mandatory and bypasses notification preferences. Its bilingual catalogue message now explicitly states that account deletion is permanent and irreversible.

## Required interaction contracts

The following tests were written before the production implementation:

1. **Pending renewal through expiry then late approval** — proves suspended access, Waha suspension, paid-booking retention, and late owner restoration.
2. **Concurrent expiry scheduler and paid booking confirmation** — proves no duplicate terminal release and no conflicting paid/cancelled booking state.

The API contract suite also verifies event-12 email/push creation, mandatory policy, and repeated-scheduler deduplication.

## Carry-forward positions

- **X8b / T10 evidence:** `tenantVerificationAdminBlock.test.ts` explicitly asserts that an admin receives `403` from `POST /api/unit-verify/1/approve` and `POST /api/unit-verify/1/reject` when the verification is `tenant_request`; the same file includes the unit-owner `200` positive control.
- **O1 owner-path position:** the verified owner remains the only actor allowed to approve or reject the tenant path for that unit. Stage 6B does not grant this decision to administrators; administration can cancel a pending renewal but can never approve or reject it.
- **HOA COMMON:** release planning continues to reject the immutable system unit as a tenant/owner release anchor.
- **`bookings.unit_id`:** remains non-null; no Stage 6B migration or release behavior weakens that constraint.

## Validation record

| Check | Result |
|---|---|
| API type-check | Passed |
| API suite | **93 files, 1,468 tests passed** |
| Portal type-check | Passed |
| Portal suite | **63 files, 1,368 tests passed** |
| Full browser E2E | **76 passed, 6 expected skips** |
| Focused admin E2E | **8 passed**, including “Tenancy releases panel is visible for an admin” |
| Independent browser review | Passed — authenticated admin dashboard rendered the new Tenancy releases section with no runtime/page errors; screenshot reference `7lysk2` |
| API workflow restart | Passed; service listening on port 8080 |
| Portal workflow restart | Passed; Vite ready without startup errors |
