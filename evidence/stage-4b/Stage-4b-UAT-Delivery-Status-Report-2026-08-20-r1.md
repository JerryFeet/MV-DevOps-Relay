# Madain Village HOA Portal — Stage 4b Delivery Status Report

**Date:** 2026-08-20  
**Revision:** r1  
**Classification:** Implementation complete; **pending reviewer approval**  
**Release decision:** This is a status/evidence delivery only. It does **not** accept Stage 4, close Stage 3, authorize production database work, or authorize deployment.

## Scope and boundaries

This delivery covers the secure HOA document library acceptance unit:

- **J2** folder-based library data model and seven bilingual seeded resident folders;
- **J4** administrator folder lifecycle and legacy-document triage;
- **J5** server-side authenticated visibility authorization;
- **J6** per-folder and per-document download/view-only modes;
- **J7** portal/mobile access parity; and
- **J8** storage-only replacement history through archived superseded rows.

It does not cover separate J1 upload acceptance, J3 public-homepage removal, H3 guest pagination, a user-facing archive/version-history interface, production work, Stage 4 acceptance, or deployment.

## Acceptance-criteria matrix

| Criterion | Evidence | Status |
|---|---|---|
| J2: approved visibility vocabulary and seven bilingual folders are seeded; unknown legacy records are routed to admin-only triage | `Stage-4b-UAT-Migration-2026-08-20-r1.sql`, `Stage-4b-UAT-Schema-Only-2026-08-20-r1.sql` | Implemented |
| J4: admins can manage folders; non-admin mutations are refused; resident folder lists exclude empty/inaccessible folders | API authorization suite, portal folder-management implementation | Implemented |
| J5: list, metadata, download, guessed-ID, and crafted-mutation requests enforce folder visibility floors server-side | API privacy suite: tenant/owner/admin matrix; owners-only and triage access assertions | Passed |
| J6: folder and document download modes are represented in the API contract and rendered consistently; view-only avoids app-provided save/share controls | Portal/mobile document clients; API response contract review | Implemented; native/browser viewer controls remain outside application control |
| J7: portal and mobile use authenticated document endpoints and do not expose direct private `fileUrl` access | Mobile contract suite; portal authenticated blob retrieval; focused portal E2E | Passed |
| J8: replacement writes a new current row, archives/linkages the old row, and archived rows cannot be listed/retrieved | API replacement/archived-row suite; portal replacement-race guard | Passed |
| Delivery integrity | This four-file package plus detached manifest and ZIP fallback; public relay verification pending below | In progress |

## Validation evidence

| Validation | Result | Notes |
|---|---:|---|
| API suite | 1,273 passed | Includes the 9-test Stage 4b cross-user privacy, visibility-floor, archive, legacy-external, and replacement suite. |
| Portal suite | 1,377 passed | +2 compared with the immediately preceding recorded total of 1,375; includes the two replacement-upload isolation assertions. |
| Mobile suite | 393 passed | Includes the two authenticated-access/no-`fileUrl` contract assertions. |
| Portal typecheck | Passed | Current portal source and generated contract compile. |
| Focused authenticated document E2E | 4 passed, 1 skipped | The skip is data-dependent: no resident-visible seeded document was present to download. Page, empty-state, and folder navigation passed. |
| Full portal E2E | 67 passed, 1 flaky/retried successfully, 9 skipped | The Stage 4b document E2E rows passed. The initial owner role-redirect context timeout passed on retry and is not a document-library defect. |
| Independent review | Passed | Confirmed replacement uploads are bound to dialog target/generation and all documented `DocumentFolder` response fields are returned consistently. |

Test-count note: the API and mobile totals are the final recorded suite totals; a comparable pre-Stage-4b full-suite total was not separately retained. The Stage 4b-specific additions above provide the reliable delta evidence.

## Security and data-handling findings

- A document can never be less restrictive than its folder. Crafted requests below an owners-only folder floor are rejected.
- Archived documents are absent from list, metadata, and download paths.
- Legacy external URLs return a re-upload-required response and are never redirected.
- Legacy/unmapped personal records remain admin-only in the triage folder.
- The portal and mobile clients use authenticated document endpoints rather than direct storage URLs.
- Replacement preserves storage-level audit linkage (`archived_at`, `archived_by_id`, `replaced_by_id`, and reason) without exposing a resident version-history interface.

## Deviations and approval dependencies

1. “View only” is an application-level deterrent: the applications do not show explicit save/share controls, but a native or browser document viewer may still expose controls outside application control.
2. No Stage 4b approval has been granted. The implementation task is awaiting reviewer approval.
3. Stage 3 remains open; therefore deployment remains prohibited regardless of this delivery.
4. This public evidence package intentionally excludes database rows, resident information, uploaded documents, object-storage keys, direct private URLs, credentials, and production data.

## Evidence inventory

1. `Stage-4b-UAT-Delivery-Status-Report-2026-08-20-r1.md` — this status report.
2. `Stage-4b-UAT-Migration-2026-08-20-r1.sql` — Stage 4b migration source; only static folder labels/defaults are seeded.
3. `Stage-4b-UAT-Schema-Only-2026-08-20-r1.sql` — sanitized, scope-limited development schema evidence for the document-library objects; no data rows.
4. `HOA-Stage-4b-Schema-Source-2026-08-20-r1.md` — source-level schema declaration for the same objects.
5. `MANIFEST.md` — detached SHA-256 integrity record calculated from the exact pushed GitHub blobs.
6. `Madain-Village-HOA-Portal-Stage-4b-Delivery-Status-2026-08-20-r1.zip` — download fallback containing the four named evidence files.

The manifest is deliberately detached because a report cannot contain its own final hash without changing that hash.
