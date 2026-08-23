# Stage 6B destructive-mutation inventory

**Inventory date:** 2026-08-23  
**Verified source commit:** `113935541565160090fd760f0c6a118b3691f878`

This inventory classifies the repository’s resident/tenancy destructive behavior after Stage 6B hardening. Terminal departure means a user/account exit that can affect a verified unit, Waha access, paid bookings, residency graph, or external identity.

## Shared release engine

| Mutation path | Classification | Reason |
|---|---|---|
| Tenant-requested release | Shared engine | Uses `releaseSubject`; releases the lifecycle graph under the per-unit transactional lock. |
| Expiry delayed terminal release | Shared engine | Scheduler invokes the tenancy release adapter, which calls `releaseSubject`. |
| Completed move-out form | Shared engine | Move-out scheduler invokes `releaseSubject`; related forms are closed only after canonical release succeeds. |
| Outgoing owner on ownership approval | Shared engine | Ownership review invokes `releaseSubject` with an ownership-change trigger. |
| Admin terminal lifecycle confirmation | Shared engine | The server returns the engine’s dry-run plan before the UI can call the execution route. |

## Documented legitimate exceptions

| Mutation path | Classification | Boundary |
|---|---|---|
| External Clerk identity deletion worker | Documented adapter exception | It deletes only a durable external-identity job created by the release engine and retains the release operation ID for idempotent retry/audit. |
| `DELETE /residents/:id` | Narrow housekeeping exception | It only deletes an unlinked household row. Linked portal-account residents are rejected with `TERMINAL_RELEASE_REQUIRED`. |
| Booking-only cancellation | Narrow non-release exception | Cancels a booking only; does not represent resident departure. |
| Waha credential/application revocation | Narrow non-release exception | Revokes credentials only; terminal departure routes through the engine. |
| Invitation, payment-hold, push-token, verification, and parking-lot cleanup | Narrow non-release exceptions | Each cleans a scoped record class without terminal resident/account release. |

## Defects repaired or retired

| Prior path | Result |
|---|---|
| Legacy direct account deletion helper | Retired. The helper was deleted from active source. |
| Ownership approval calling the helper | Repaired. Ownership release now passes through the shared release engine. |
| Administrative resident deletion usable as hidden release | Repaired. A linked resident cannot be deleted by the narrow endpoint. |

## Enforced source-level boundary

`releaseMutationBoundary.test.ts` scans production API source and fails if a new direct portal-user deletion or direct `moved_out` resident mutation appears outside the shared release engine. It also:

- rejects a synthetic direct-deletion route to prove the detector is live;
- rejects restoration of the retired legacy helper or its ownership-route import;
- allows only the documented asynchronous Clerk job worker for external identity deletion;
- checks that the worker is job-backed and operation-ID-associated.

This contract is intentionally fail-closed: an additional exception must be explicitly documented and tested rather than silently becoming another release path.