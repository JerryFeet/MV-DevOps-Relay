# Madain Village HOA Portal — Stage 3 Delivery Status Report (r5)

**Evidence date:** 2026-08-20  
**Classification:** **Correction status report — not a Stage 3 acceptance package**  
**Release decision:** **DO NOT DEPLOY**

## r5 purpose

r5 remediates the two confirmed mobile API-contract mismatches reported in r4:

1. **J7:** HOA-document actions now use the Clerk-authorized download endpoint instead of opening a stored `fileUrl` directly.
2. **H3:** guest history now consumes the paginated API until complete, presents the loaded/total range, and visibly warns whenever additional history has not yet loaded.

This revision is additive. It does not replace r4's standard source, migration, schema-only, F5, or development-database integrity evidence. Earlier revisions remain untouched. The r4 ZIP remains the fallback bundle for the unchanged Stage 3 evidence; r5 is the readable correction companion.

## r5 validation

| Suite | r4 baseline | r5 result | Delta |
|---|---:|---:|---:|
| API focused document authorization | Existing privacy suite | **1 file / 14 tests passing** | Re-run against the protected download route |
| Mobile | 12 files / 375 tests | **14 files / 380 tests passing** | **+2 files / +5 tests** |
| Mobile typecheck | N/A | **PASS** | New implementation and test fixtures type-check |

The r5 correction tests prove:

- a document download request targets `/api/documents/:id/download` and includes the current Clerk bearer token when available;
- the existing API route rejects unauthenticated callers and cross-resident access while permitting authorized access;
- a first guest page states the loaded and total counts, discloses omitted entries, and requests the next page;
- two fetched guest pages render as one complete history; and
- a failed continuation states that entries have not loaded instead of silently presenting a truncated list.

## Acceptance matrix

| ID | r5 status | Current evidence / limitation |
|---|---|---|
| D1 | **Implemented — UAT pending** | Focused role-guard and registry regression evidence passed; browser confirmation remains. |
| A2 (supplemental) | **Implemented — UAT pending** | Focused API evidence verifies names and phones; browser confirmation remains. |
| E1–E5 | **Implemented — UAT pending** | Vehicle eligibility, entitlement, controlled rejection, and Istimara authorization are automated. |
| F1 | **Implemented — UAT pending** | Opening-anchored grid and supported durations are automated. |
| F2 / F2b | **Implemented — UAT pending** | Whole-minute, non-negative buffers, exclusive use, and buffered-overlap policy are covered. |
| F3 / F4 | **Implemented — UAT pending** | Service-window, interval, duration, conflict, closing-boundary, and overnight Thursday behavior are covered. |
| F5 | **Implemented — UAT pending** | r4 rollback-only schema prerequisite evidence passed: normalizations, conflicts, no rounding, and no residual fixture rows. |
| G1–G5 | **Implemented — UAT pending** | Retired vehicle/contractor behavior, five renovation scopes, E.164 mobile, and common-area rules are covered. |
| G6 | **Open** | No-fee `move_out` and legacy move-form payment evidence remains required. |
| Waha Pass / Guest Day Pass payment regression | **Open** | Required payment regression evidence remains. |
| Renovation scope canonical `TEXT[]` migration | **Blocked** | The current JSON-in-text / legacy scalar state and orphan enum remain an acceptance blocker. |
| J7 — mobile authenticated HOA-document download | **Implemented — UAT pending** | r5 authenticated mobile request and API privacy evidence pass. Full document-library parity is Stage 4b. |
| H3 — mobile guest pagination | **Implemented — UAT pending** | r5 multi-page, total/range, omission-disclosure, and retry coverage pass. |
| Other mobile paginated lists | **Open separate defects** | Vehicles, permits, bookings, announcements, and administrator communications remain one-fetch/bounded-list hardening risks; r5 does not claim them fixed. |
| Focused browser/device UAT | **Open** | The direct Expo preview renders. The browser automation service could not target the Expo-specific host after programmatic authentication, so it does not replace resident/admin device UAT. |
| Repository evidence test | **PASS in r4** | Public GitHub relay, clean-clone, and exact-blob hash verification remain the governing publication protocol. |

## Acceptance criteria

Stage 3 can be marked **accepted** only when all of the following are complete:

1. Every D1, A2, E1–E5, F1–F5, and G1–G6 row has passing automated evidence and focused browser/device UAT evidence.
2. Renovation scope storage reaches canonical `TEXT[]`; recognized legacy scalars are preserved as one-element arrays; unknown values are queued for correction; and the obsolete enum is dropped only after dependency verification.
3. The no-fee move flows and Waha/Guest Day Pass payment regression cases have recorded evidence.
4. Resident mobile UAT confirms the r5 authenticated HOA-document download and guest pagination behavior.
5. Every cited artefact is published and hash-verifiable, while the existing standard four-file bundle and ZIP fallback remain available.
6. An authorized reviewer explicitly accepts Stage 3.

## Deviations and boundaries

- No production deployment, production database access, or production migration was performed.
- r5 includes no resident data, document contents, storage keys, credentials, secrets, or production output.
- The public relay must publish each new r5 artefact in its own commit and then publish a manifest-only commit. Exact SHA-256 values must be calculated from the pushed GitHub blobs.
- This report neither accepts Stage 3 nor authorizes deployment.