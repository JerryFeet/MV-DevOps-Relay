# Stage 5 Phase 1 — Payment-safe guest access and notifications

Date: 2026-08-22  
Scope: Task 706 / approved Stage 5 Phase 1 contract  
Revision: r2 acceptance update

## Delivered

- Removed ordinary guest registration's Waha prerequisite, four-guest quota, and `GUEST_DAY_PASS_REQUIRED` branch.
- Implemented H2 decision (b): a verified portal resident with an active linked resident record may request a Guest Day Pass when the unit holds an active Waha credential. The requester need not personally hold either credential.
- Added a central payment-purpose and stored-price registry for `guest_day_pass`, `waha_replacement`, and `facility_booking`.
- Removed the Tap adapter and all Tap configuration branches. Unsupported or missing payment configuration fails closed.
- Added durable payment attempts, signed callback validation, provider-side verification, amount/currency/metadata checks, and conditional exactly-once purpose-handler dispatch.
- Moved Guest Day Pass, Waha replacement, and facility booking confirmation behind the verified callback. Browser redirects and payment-result pages are display/status-only.
- Added `pending_payment` booking holds, a configurable 15-minute default expiry, admin exemption reason, and a shared transaction lock between confirmation and expiry release.
- Added durable notification outbox delivery with email and push channels, Arabic default rendering, retry backoff, idempotency, and announcement-only preference suppression. Mandatory events 9 and 12 are not suppressible.
- Wired the existing lifecycle sources for X3 events 1–12 and 15. X3 is **13/16** for Phase 1.
- Events 13, 14, and 16 are intentionally deferred to Stage 6 acceptance because their source flows are T14 renewal and the O3 ownership/lifecycle work. Stage 6 now explicitly cannot be accepted until these three events are wired and tested, bringing X3 to 16/16.
- Added development migration `0032_stage5_payment_and_notification_core.sql`.

## Verification

### Unit and component suites

All reported deltas are against the Stage 4 accepted baselines:

| Suite | Stage 4 baseline | Phase 1 result | Delta |
|---|---:|---:|---:|
| API Vitest | 1,374 tests | 1,392 passed | +18 |
| Portal Vitest | 1,368 tests | 1,368 passed | +0 |
| Mobile Vitest | 414 tests | 414 passed | +0 |

Shared library typecheck, API typecheck, portal typecheck, portal translation guard, and the single React-types pin guard also passed.

### Portal E2E

The reported result is the **broad 88-test portal suite**, not a focused subset:

- Phase 1: **82 passed / 6 skipped / 0 failed**
- Stage 4: **71 passed / 3 failed / 5 flaky / 9 skipped**, exit status 1

The eight Stage 4 failures/flaky results were the known portal route-load/hydration issue. In the Phase 1 broad run, the portal/API pre-flight passed and those hydration failures did not recur; the suite completed with no failed tests. This is positive evidence that the previously observed problem is intermittent or environmental rather than reproduced as a systemic Phase 1 regression. The go-live hydration investigation remains tracked separately until consolidated UAT confirms stability.

### Runtime and migration

- Development migration applied successfully.
- API health check: `{"status":"ok"}`.
- API restarted cleanly with payment fail-closed warning and both new schedulers started.
- No live payment credentials were added or used.

## Safety boundary

With `PAYMENT_PROVIDER=moyasar` but no secret configured, payment initiation rejects rather than creating a successful payment or issuing an entitlement.

## Intentionally excluded

VAT, tax invoices, ZATCA, and production deployment remain outside this phase and were not performed. Stage 6 owns the remaining three X3 lifecycle events and their acceptance tests.