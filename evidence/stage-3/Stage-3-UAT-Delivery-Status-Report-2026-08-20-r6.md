# Madain Village HOA Portal — Stage 3 Delivery Status Report (r6)

**Evidence date:** 2026-08-20  
**Classification:** **Correction status report — not a Stage 3 acceptance package**  
**Release decision:** **DO NOT DEPLOY**

## r6 purpose

r6 supersedes r5 only for the web popup-policy correction in the immediate J7 document-download repair. r5 remains retained and immutable. The r4 standard delivery bundle, its ZIP fallback, and all pre-existing Stage 3 blockers remain unchanged.

## Corrected mobile result

| Requirement | r6 status | Evidence |
|---|---|---|
| J7 authenticated HOA-document access | **Implemented — UAT pending** | Press handlers create the web target synchronously, then use the Clerk-authorized `/api/documents/:id/download` response to populate it. Blocked and closed targets report clear errors. No direct `fileUrl` open remains. |
| H3 complete guest histories | **Implemented — UAT pending** | Typed infinite pagination, loaded/total range, explicit omission messaging, continuation control, loading/error/refresh states, and multi-page rendering are covered. |
| Other paginated mobile lists | **Open separate defects** | Vehicles, permits, bookings, announcements, and administrator communications are not part of this focused correction. |

## Test accounting

| Suite | r4 baseline | r5 | r6 result |
|---|---:|---:|---:|
| Mobile | 12 files / 375 tests | 14 files / 380 tests | **14 files / 383 tests passing** |
| API document privacy | Existing focused suite | 14 tests passing | **14 tests passing** |
| Mobile typecheck | N/A | PASS | **PASS** |

The three r6 test additions cover synchronous window creation, browser popup rejection, and an authorized response loaded into an existing target; the existing correction tests also cover the closed-target error, protected request headers, and guest pagination.

## Acceptance matrix

| ID | r6 status | Current evidence / limitation |
|---|---|---|
| D1, A2, E1–E5, F1–F5, G1–G5 | **Implemented — UAT pending** | r4 evidence remains governing and unchanged. |
| G6 | **Open** | No-fee `move_out` and legacy move-form payment evidence remains required. |
| Waha Pass / Guest Day Pass payment regression | **Open** | Required payment regression evidence remains. |
| Renovation scope canonical `TEXT[]` migration | **Blocked** | JSON-in-text / legacy scalar state and orphan enum remain blockers. |
| J7 mobile authenticated HOA-document download | **Implemented — UAT pending** | r6 resolves authenticated web/native document delivery, including browser popup policy. Full document-library parity is Stage 4b. |
| H3 mobile guest pagination | **Implemented — UAT pending** | r5/r6 multi-page and disclosure coverage pass. |
| Other mobile paginated lists | **Open separate defects** | The five r5 audit findings remain. |
| Focused browser/device UAT | **Open** | The Expo workflow and direct sign-in preview render, but formal resident/admin device UAT has not been recorded. |
| Repository evidence test | **PASS in r4; r6 relay verified** | r6 follows separate-content-commit plus manifest-only-commit publication and exact-blob SHA-256 verification. |

## Acceptance criteria and boundaries

Stage 3 still requires all formal browser/device UAT, the canonical renovation `TEXT[]` migration, remaining payment/move-flow evidence, complete published/hash-verified evidence, and explicit authorized acceptance. No production deployment, production database access, or production migration was performed. r6 contains no resident data, document contents, private object keys, credentials, secrets, or production output.