# Stage 5 Phase 2 — Deterministic payment exercise and evidence

Date: 2026-08-23  
Scope: Stage 5 Phase 2 acceptance exercise  
Status: Evidence submitted for review; no deployment performed

## Delivered

- Added a deterministic payment adapter for automated tests. It implements the same provider interface as Moyasar but can be selected only with `PAYMENT_TEST_PROVIDER=deterministic` outside production. Live payments remain Moyasar-only and fail closed when configuration is absent.
- Bound verified provider callback metadata to the payment attempt's amount, currency, attempt ID, user ID, and unit ID. A paid callback cannot settle an attempt for a different resident or unit.
- Added terminal stale-booking rejection. A callback received after a booking hold expires or is cancelled is rejected and cannot confirm the unavailable slot.
- Preserved callback-only entitlement issuance. Browser redirects and mobile deep links are status hints; they do not issue a Guest Day Pass, replacement credential, or booking confirmation.
- Extended the purpose registry so a payable product may add pricing and a callback handler without editing the payment core, provider adapter, callback route, or payment-attempt state machine.
- Strengthened the concurrent paid-booking test: two overlapping requests produce exactly one `pending_payment` reservation and one `409` refusal.

## H1 migration and data safety

The development database was reachable after the Phase 5 migration. A read-only count query returned:

| Surface | Count |
|---|---:|
| Guest history rows | 0 |
| Guest Day Pass rows | 0 |
| Issued Guest Day Pass rows | 0 |
| Revoked Guest Day Pass rows | 0 |
| Payment attempt rows | 0 |

There was no existing development history or Day Pass record to migrate, issue, or revoke. This is a runtime observation, not a claim about production data.

## H2 deterministic callback matrix

The focused callback matrix covers the following outcomes against the production callback code:

| Outcome | Expected result |
|---|---|
| Matching paid callback | One entitlement is issued and attempt becomes `confirmed` |
| Duplicate callback | Returns `already_confirmed`; no second issue |
| Provider failure / cancellation | Attempt becomes `failed`; no entitlement |
| Pending provider result / expiry | Attempt becomes `rejected`; no entitlement |
| Wrong amount | Attempt becomes `failed`; no entitlement |
| Wrong user metadata | Attempt becomes `failed`; no entitlement |
| Wrong unit metadata | Attempt becomes `failed`; no entitlement |
| Stale paid facility callback | Attempt becomes `rejected`; cancelled booking remains cancelled |

The deterministic adapter itself has paid, failed, pending, and unknown-charge coverage. No live payment credential was added or used.

## X7 dummy-purpose proof — touched-file list

The dummy service registration itself touched **one file only**:

| Purpose-extension file | Change |
|---|---|
| `artifacts/api-server/src/__tests__/paymentPurposeRegistry.test.ts` | Registers `phase2_dummy_service` with a price resolver and handler. |

The dummy registration did **not** edit any of the following:

- `artifacts/api-server/src/payments/PaymentCore.ts` — payment core / state transition logic
- `artifacts/api-server/src/payments/PaymentService.ts` — provider selection
- `artifacts/api-server/src/payments/providers/deterministic.ts` — provider adapter
- `artifacts/api-server/src/routes/payments.ts` — callback route
- payment-attempt schema or migration files

The Phase 2 registry seam that makes this possible is implemented in `PurposeRegistry.ts`; `PaymentCore.ts` looks up a registered handler generically. A real payable service would add its registry declaration and its own handler module, not a provider, callback-route, core, or state-machine change.

## Facility booking payment and mobile return

- The booking conflict test sends two overlapping requests concurrently from different households. It asserts one `201` response containing a `pending_payment` / `unpaid` hold, one `409` refusal, and exactly one reserved slot.
- The mobile booking screen opens the provider URL, then polls `/api/payments/attempts/:id` after either application resume or a deep-link URL event. It no longer calls the retired browser-verification endpoint.

## Verification results

All suite deltas are against the accepted Phase 1 baseline.

| Suite | Phase 1 baseline | Phase 2 result | Delta |
|---|---:|---:|---:|
| API Vitest | 1,392 passed | 1,404 passed | +12 |
| Portal Vitest | 1,368 passed | 1,368 passed | +0 |
| Mobile Vitest | 414 passed | 415 passed | +1 |

Focused verification:

- API typecheck: passed.
- Mobile typecheck: passed.
- H2 deterministic callback / provider / X7 registry tests: 12 passed.
- Booking ownership/concurrency plus focused payment tests: 112 passed.
- Portal suite: 63 test files, 1,368 passed.
- Mobile suite: 17 test files, 415 passed.
- API suite: 89 test files, 1,404 passed.

## Broad portal E2E and hydration evidence

The broad 88-test portal E2E suite was rerun for this phase:

- Pre-flight: portal and API server reachable.
- Result: **82 passed, 6 skipped, 0 failed** in 5.2 minutes.
- The six skips are conditional scenarios that require fixture data or a verified-user control; they are not failures.

The earlier failed E2E invocation has concrete pre-flight evidence: it reported HTTP 502 for both the portal and `/api/healthz` and instructed that the API and portal workflows be started. The current run's pre-flight passed before executing the tests.

This only establishes that the earlier E2E invocation began before its services were ready. It does **not** establish the root cause of the historic Stage 4 route-load/hydration failures. Those remain an open reliability investigation pending comparison with the completed broad run.

## Safety boundary

- Deployment remains prohibited.
- No live provider credentials were added or used.
- Missing Moyasar configuration continues to fail closed.