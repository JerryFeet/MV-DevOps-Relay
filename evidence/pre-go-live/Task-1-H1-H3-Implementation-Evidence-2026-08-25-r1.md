# Task 1 — H1–H3 implementation evidence (revision 1)

**Date:** 2026-08-25  
**Environment:** development only. No production access, deployment, or live payment credentials were used.

## H1 — Payment callback integrity

### Public callback-path resolution

| Path | Reachability | Settlement authority |
| --- | --- | --- |
| `POST /api/payments/webhook` | Public provider endpoint | The only application route that can settle a payment. It verifies the raw-body signature before charge lookup or purpose handling. |
| `/payment-result?attempt_id=…` | Resident browser-return display page | Read-only polling of a payment attempt. It cannot settle a payment. |
| `POST /api/payments/verify` | Removed | No longer mounted or reachable. |

Moyasar charge creation currently supplies `/payment-result?attempt_id=…` as `callback_url`; this is the resident’s redirect location, not the server-to-server webhook destination. Before production promotion, the Moyasar dashboard webhook configuration must target `POST /api/payments/webhook` and use the matching `PAYMENT_WEBHOOK_SECRET`. That configuration cannot be validated in development without live provider credentials and is an explicit production-promotion prerequisite.

- The signed webhook verifies the exact raw request body before reading a charge ID or calling settlement.
- Unsigned and tampered callbacks return `400`, never invoke settlement, and emit a safe rejection signal without recording the signature or request body.
- Focused regression coverage proves exact HMAC-only acceptance and that the deterministic provider cannot activate in production.

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

## Verification and open manual checks

- API, portal, and mobile typechecks passed.
- Focused payment suite: **4 files, 12 tests passed**.
- Existing portal suite: **64 files, 1,372 tests passed**.
- API, portal, and mobile workflows restarted successfully.
- Signed-out browser smoke testing reached Clerk sign-in instead of a blank route. No signed-in test session was available, so Dalil’s protected UI was **not** visually accepted.
- The consolidated manual UAT checklist now includes five explicit Dalil checks for mobile/desktop, English/Arabic/RTL, empty state, placeholders, navigation/header consistency, and administrator knowledge controls.