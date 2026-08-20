# Madain Village HOA Portal — Stage 4b Delivery Status Report

**Date:** 2026-08-20  
**Revision:** r2 — corrective evidence delivery  
**Classification:** Corrected implementation; **pending reviewer approval**  
**Release decision:** **DO NOT DEPLOY.** This delivery does not accept Stage 4, close Stage 3, authorize production database work, or authorize a production deployment.

## Purpose of r2

r1 remains immutable evidence. Reviewer feedback identified one blocking migration defect: a legacy public financial or minutes document could be mapped into an owners-only folder while retaining `all_portal_users` visibility.

r2 corrects that defect and proves the replacement rule at the database boundary:

> A document may be more restrictive than its folder, but never less restrictive.

## Corrected acceptance scope

| Requirement | r2 status | Evidence |
|---|---|---|
| J2 — folder library model and seeded bilingual folders | Implemented — approval pending | Corrected initial migration and schema-only extract |
| J4 — folder lifecycle and unmapped legacy triage | Implemented — approval pending | Authenticated route suite and source snapshot |
| J5 — authenticated server-side visibility authorization | Implemented — approval pending | API privacy suite; database floor triggers |
| J6 — per-folder/document download mode | Implemented — approval pending | Source snapshot and existing portal/mobile tests |
| J7 — portal/mobile document-access parity | Implemented — approval pending | Portal folder-navigation E2E; mobile authenticated-download contract suite |
| J8 — replacement history through archived superseded records | Implemented — approval pending | Portal replacement race regression suite and API privacy suite |

Out of scope: J1 upload acceptance, J3 public-homepage removal, a user-facing archive/version-history UI, Stage 4 acceptance, production data work, deployment, and removal or revision of r1 evidence.

## r2 visibility-floor correction

### Backfill rule

The corrected first-run migration maps the legacy category to its folder first, then derives visibility from the folder floor:

| Legacy category | Destination folder | Resulting minimum visibility |
|---|---|---|
| `financials` | Financial Reports | `verified_owners` |
| `minutes` | Minutes of Meeting | `verified_owners` |
| recognized public-library categories | corresponding resident folder | `all_portal_users` |
| unmapped category | Unmapped legacy documents triage | `admin_only` |

Legacy `is_public` is deliberately not consulted by the new visibility decision. It described legacy homepage exposure; it cannot override a folder's restriction.

### Database invariant

The corrected initial migration and the r1-to-r2 repair both install:

1. `documents_visibility_floor_guard` — rejects an `INSERT` or relevant `UPDATE` when a document's visibility falls below its folder floor.
2. `document_folders_visibility_floor_guard` — rejects tightening a folder if an existing document would become less restrictive than that new floor.
3. A post-backfill assertion that aborts migration if any floor violation remains.

The API additionally rejects an unsafe folder update with a clear 400 response before the database trigger is reached.

### Legacy `is_public` retirement boundary

`documents.is_public` is **not an access-control source** for document listing, metadata retrieval, download authorization, or generated document links. New library writes set it false. It remains only as legacy rollout data during mapping.

It must not be removed during this corrective delivery. Its retirement boundary is a dedicated, reviewed post-Stage-4-acceptance migration after all retained legacy records have been reconciled to `folder_id` and `visibility`, the retired public-homepage contract is formally closed, and an authorization regression audit confirms no remaining consumer reads it.

## Reproducible rollback fixture

`Stage-4b-UAT-Folder-Floor-Rollback-Fixture-2026-08-20-r2.txt` is an isolated transaction transcript. It:

1. Creates a minimal pre-Stage-4b `documents` table in an isolated schema.
2. Seeds one public legacy `financials` document.
3. Executes the corrected initial migration.
4. Asserts that the seeded record is in **Financial Reports** with `verified_owners` visibility.
5. Proves a direct below-floor insert is rejected with `check_violation`.
6. Proves a direct unsafe folder-tightening update is rejected with `check_violation`.
7. Rolls back and confirms no fixture schema persists.

## Validation results

| Validation | Result |
|---|---|
| Isolated migration/rollback fixture | PASS — public `financials` → Financial Reports / `verified_owners`; both invalid direct writes rejected; transaction rolled back |
| Development r1-to-r2 repair migration | PASS — repair applied; both live trigger names verified |
| API test suite and typecheck | PASS — 76 files / 1,274 tests; TypeScript check passed |
| Portal test suite and typecheck | PASS — 60 files / 1,377 tests; TypeScript check passed |
| Mobile document contract suite | PASS — 15 files / 393 tests |
| Portal browser E2E after API restart | PASS — 68 passed, 9 data-dependent skips; readiness preflight passed and document folder navigation was exercised |

The mobile test renderer printed existing read-only input warnings; these are warnings only and no test failed.

## Required Stage 3 open-items summary

Stage 3 remains open. This r2 correction does not change any of the following:

1. Focused resident/admin browser and device UAT has not been formally recorded.
2. G6 still needs no-fee move-out and legacy payment evidence.
3. Waha Pass and Guest Day Pass payment regressions still need coverage/evidence.
4. Renovation scope still requires the canonical `TEXT[]` migration.
5. Five mobile list-pagination defects need remediation:
   - Vehicles silently omit item 51 for staff/all-record views; a normal resident's threshold is generally unreachable because unit parking entitlement caps registrations.
   - Permits silently omit item 201; normal resident accumulation is constrained by workflow validation, but staff/all-record views remain vulnerable.
   - Bookings silently omit item 51, including feasible resident booking history.
   - Announcements silently omit item 51 in a feasible resident-visible announcement set.
   - The reachable admin mobile Inbox silently omits communication 51 and later.
   These are recorded as P0 follow-up tasks #691, #692, and #693.
6. Explicit authorized Stage 3 acceptance is still required.

No Stage 3 acceptance, Stage 4b acceptance, production database access, production migration, or deployment is claimed.

## Evidence inventory

Each item is published separately. No ZIP archive is created for r2.

- `Stage-4b-UAT-Migration-2026-08-20-r2.sql` — corrected first-run migration
- `Stage-4b-UAT-Existing-Database-Correction-2026-08-20-r2.sql` — r1-to-r2 repair migration
- `Stage-4b-UAT-Schema-Only-2026-08-20-r2.sql` — sanitized live schema extract
- `HOA-Stage-4b-Schema-Source-2026-08-20-r2.md` — source/authorization snapshot
- `Stage-4b-UAT-Folder-Floor-Rollback-Fixture-2026-08-20-r2.txt` — transaction-rolled-back fixture transcript
- `MANIFEST.md` — detached SHA-256 manifest, published last
