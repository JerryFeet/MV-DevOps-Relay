# Security Guard — Consolidated SG Status

**Date:** 2026-08-25  
**Environment:** development/UAT only  
**Scope:** implementation and evidence status. This is not a production-release approval.

## Completed implementation and evidence

| Requirement | Status | Evidence / conclusion |
| --- | --- | --- |
| SG1 — five guard purposes | **Accepted** | The real Clerk-authenticated guard walkthrough exercised resident lookup, Guest Pass, paid Guest Day Pass, move-in, move-out, and renovation decisions against seeded development records. |
| SG2 — no guest-limit claim | **Complete** | The Day Pass flow reports whether a valid paid pass exists, its date, guest count, host, unit, and plate where supplied. It does not claim that a complimentary allowance was exceeded. |
| SG3 — permit projections | **Complete** | Published evidence covers the minimum gate fields for approved move-in, move-out, and renovation permits, including contractor name/mobile for renovation. |
| SG4 — one sign-in URL and role routing | **Complete** | The normal portal sign-in route directs a guard to Security Gate and protected resident/admin routes remain unavailable. This was exercised by the real guard walkthrough and the full E2E suite. |
| SG5 — guard idle timeout | **Accepted for automated proof** | A real Clerk guard session was signed out by the live portal timer after Playwright advanced the browser clock by 15 minutes. The visible result was Clerk sign-in, not a blank/protected gate page. |
| SG6 — National-ID lookup and rate limit | **Complete** | Published lookup evidence proves responses return only name, unit, and role. The durable per-identifier counter key is `gate-identifier:` plus a domain-separated HMAC-SHA-256 of the normalized identifier; failed-lookup review logging stores that keyed digest, not the raw value. |
| SG7 — immediate guard suspension | **Complete** | Published evidence covers a live session being refused on its next request after suspension. |
| SG8 — honest offline/error handling | **Complete** | Published evidence covers an explicit unavailable result rather than a stale, empty, or misleading validity verdict. |
| SG9 — unified credential scanner | **Complete for server-side classification** | Published evidence covers Guest Pass, paid Guest Day Pass, and Waha credentials through the live unified scanner, with minimum safe result fields. |
| SG10 — no resident photographs | **Complete** | Published evidence records the removal of resident-photo collection, storage, display, and app-controlled Clerk avatar collection. |
| SG11 — approval basis | **Complete** | Published evidence covers persisted approval basis and the required basis detail. |
| SG12 — gender record and Day Pass plate | **Complete** | Published evidence covers required record-only gender fields and optional Day Pass vehicle plates. |
| SG13 — logging, guard-account model, public verifier | **Complete** | Published evidence covers retained gate logging, shared/individual guard-account compatibility, and public-verifier hardening. |

## Remaining manual UAT actions

These are deliberate device/elapsed-time checks, not missing server-side implementation:

1. **Physical barcode/QR scan:** on a guard’s actual phone or tablet, present a real Guest Pass, paid Guest Day Pass, and Waha barcode/QR to the camera. The headless browser genuinely attempted camera access and captured the unavailable-camera fallback; manual text entry proved classification only and is not physical-scan evidence.
2. **Real-time guard inactivity:** leave a real guard session untouched for at least 15 elapsed minutes, then confirm the protected gate screen is replaced by Clerk sign-in. The automated browser-clock proof establishes the timer behavior without a wall-clock wait; the product-owner check establishes the same behavior under normal use.

The step-by-step phone path for both checks is published in `SG-Guard-Manual-UAT-Paths-2026-08-25.md`.

## SG6 persistence clarification

The resident-domain record retains `users.national_id` because the application must compare the typed identifier to a resident record. That is distinct from lookup telemetry:

- `api_rate_limit_counters.subject_key` receives the domain-separated HMAC-SHA-256 subject, never the raw query. It uses a dedicated server secret when configured and otherwise the existing server-only session secret.
- The explicit `gate_national_id_lookup_failed` audit event receives the same digest subject, never the raw query.
- The API request serializer stores only the path before `?`, so the query value is not written to standard request logs.

## API regression-gate repair and attribution

The complete API suite is green after correcting test contracts introduced by the H9 and SG9–SG12 implementation changes:

- **Current result:** 97 test files passed; 1,379 tests passed; 21 explicitly skipped.
- **Historical control:** the same eleven files that previously failed were run from detached commit `cbfe0f1c6fe52ef10fc883c828622fe15005ec06`, the actual pre-Stage-6A parent. All 11 files passed there.
- **H9 boundary:** commit `b1dfe0f` first produced the four H9 contract failures in `aiChat`, `aiKbPdfKeywordSearch.integration`, `pushNotifications`, and `roles-vehicles-announcements`. Tests now exercise the durable limiter and current Dalil/document/announcement contracts.
- **SG9–SG12 boundary:** commit `e339309` introduced the other seven failing files by making gender and approval-basis fields required. Their test fixtures now supply valid required values before asserting the behavior under test; production validation was not loosened.

No production data, deployment, automatic schema migration, or live payment configuration was used.