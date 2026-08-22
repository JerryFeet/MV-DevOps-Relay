# Stage 5 Phase 1 — Payment-safe guest access and notifications

Date: 2026-08-22  
Scope: Task 706 / approved Stage 5 Phase 1 contract

## Delivered

- Removed ordinary guest registration's Waha prerequisite, four-guest quota, and `GUEST_DAY_PASS_REQUIRED` branch.
- Enforced H2 decision (b): a verified portal resident with an active linked resident record may request a Guest Day Pass when the unit holds an active Waha credential. The requester need not personally hold either credential.
- Added a central payment-purpose and stored-price registry for `guest_day_pass`, `waha_replacement`, and `facility_booking`.
- Removed the Tap adapter and all Tap configuration branches. Unsupported or missing payment configuration fails closed.
- Added durable payment attempts, signed callback validation, provider-side verification, amount/currency/metadata checks, and conditional exactly-once purpose-handler dispatch.
- Moved Guest Day Pass, Waha replacement, and facility booking confirmation behind the verified callback. Browser redirects and payment-result pages are display/status-only.
- Added `pending_payment` booking holds, a configurable 15-minute default expiry, admin exemption reason, and a shared transaction lock between confirmation and expiry release.
- Added durable notification outbox delivery with email and push channels, Arabic default rendering, retry backoff, idempotency, and announcement-only preference suppression. Mandatory events 9, 12, and the wired move-out event are not suppressible.
- Wired notification events to all existing relevant lifecycle mutations. Renewal reminder rows 13/14 and completed ownership-transfer row 16 have deterministic registration helpers because those lifecycle sources do not exist in the current application.
- Added development migration `0032_stage5_payment_and_notification_core.sql`.

## Verification

- Shared library typecheck: passed.
- API typecheck: passed.
- Portal typecheck: passed.
- API unit/integration suite: 86 files, 1,392 tests passed.
- Portal E2E suite: 82 passed, 6 skipped.
- Portal translation guard: passed.
- Single React types pin guard: passed.
- Development migration applied successfully.
- API health check: `{"status":"ok"}`.
- API restarted cleanly with payment fail-closed warning and both new schedulers started.

## Safety boundary

No live payment credentials were added or used. With `PAYMENT_PROVIDER=moyasar` but no secret configured, payment initiation rejects rather than creating a successful payment or issuing an entitlement.

## Intentionally excluded

VAT, tax invoices, ZATCA, and production deployment remain outside this phase and were not performed.