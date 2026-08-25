# Task 1 — H1–H3 implementation evidence (revision 2)

**Date:** 2026-08-25  
**Environment:** development only. No production access, deployment, automatic schema migration, live payment credential use, or real provider call occurred.

> This revision replaces the superseded H1 description in revision 1. It does not claim that Moyasar has delivered a real callback to this application.

## H1 — Payment callback integrity

### Callback-path resolution

| Path | Reachability | Settlement authority |
| --- | --- | --- |
| `POST /api/payments/webhook` | Public provider endpoint | The normal server-to-server callback route. It verifies the configured webhook `secret_token`, allows only `payment_paid` and `payment_failed`, and reads the documented event ID and nested `data.id` before settlement. |
| `POST /api/payments/reconcile` | Authenticated admin-only recovery route | A missed-callback recovery control. It accepts a dashboard Charge ID, reloads the stored attempt, obtains a fresh direct provider verification, and reuses the exact-once settlement path. |
| `/payment-result?attempt_id=…` | Resident browser-return display page | Read-only polling. It cannot settle a payment. |
| `POST /api/payments/verify` | Authenticated legacy route | Disabled (`410`). Browser redirects cannot settle a payment. |

### Current provider-contract status

- Moyasar's current published webhook documentation describes a JSON envelope containing `secret_token`, top-level event `id` and `type`, and nested payment ID `data.id`.
- The code implements that published contract with constant-time secret comparison. It never logs the secret token or request body, and it returns a status-only acknowledgement to the provider.
- The field names are **documentation-derived** until the connected Moyasar account delivers a real test-mode callback. A real test-mode payment remains a go-live prerequisite.
- Unsupported events, a missing/invalid secret, a missing event ID or `data.id`, and any malformed callback are rejected before settlement.

### Settlement and recovery safety

- A verified provider result must be `paid` and match the stored attempt's amount, currency, and payment metadata before an entitlement can issue.
- A browser redirect, an operator, and a raw dashboard status cannot force-settle an attempt.
- Reconciliation reports `provider_pending` without issuing anything when the direct provider lookup remains pending.
- Repeated webhook deliveries and repeated reconciliation are idempotent: a confirmed attempt remains `already_confirmed` and cannot issue the entitlement twice.
- The recovery route is admin-only, rate-limited, and emits a safe audit log containing only the attempt ID and outcome.

## H2 — Dalil / دليل knowledge-only assistant

- Chat context does not read or transmit user, unit, booking, permit, move-form, guest, vehicle, facility, payment, or other operational data.
- Retrieval is limited to AI knowledge documents/chunks. Restricted documents use the `verified_owners_admin` audience; missing role/verification claims fail closed to `all_portal_users`.
- Dalil states that it has no access to personal information and redirects residents to the relevant portal section for account records.
- The knowledge-repository empty state is intentional: Dalil says no documents are available rather than inventing an answer.
- Admin upload includes audience selection and a governance warning against personal, payment, resident, and confidential operational material.
- **Interim rate limiting only:** the 20/minute and nominal 200/day in-memory counters reset on process restart. They are not a durable daily ceiling and remain explicitly interim until H9 provides persistent distributed enforcement.

## H3 — Authenticated announcements

- Listing and direct-ID retrieval require authentication.
- Visibility is explicit (`all_portal_users` / `verified_owners_admin`); legacy `is_public` is inert and forced false on writes.
- The additive development migration was applied and the `announcements.visibility` and `ai_knowledge_documents.audience` columns were verified.

## Verification performed

- API contract generation and library typecheck passed.
- API typecheck and portal typecheck passed.
- API regression suite: **97 files, 1,383 passed, 21 skipped, 0 failed; 1,404 total**.
- The webhook and reconciliation coverage includes the documented nested event envelope, invalid secret rejection, unsupported event rejection, missing nested payment ID rejection, provider-pending recovery, confirmed recovery, and duplicate-safe settlement.
- Browser verification with a disposable Clerk admin account confirmed the Payment History recovery control renders alongside its filters, uses the correct API paths, and rejects a nonexistent Charge ID with `404 Payment attempt was not found.` No provider call, payment attempt, or entitlement was created.

## Remaining owner-only go-live proof

Follow [the Moyasar webhook operator runbook](Moyasar-Webhooks-Operator-Runbook-2026-08-25.md) after publishing this revision. The proof is complete only when a real Moyasar **test-mode** payment yields a `payment_paid` delivery with HTTP `200`, an issued portal entitlement, and the corresponding queued/dispatched resident notification.