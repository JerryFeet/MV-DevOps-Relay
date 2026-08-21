# Stage 4b — r3 Evidence Manifest
**Date:** 2026-08-21  
**E2E result:** 72 passed, 10 skipped (0 failed) — 4.0 minutes  
**Unit tests:** API 1,274 | Portal 1,377 | Mobile 393 — all pass  
**TypeScript:** API clean | Portal clean  
**Translation guard:** all keys translated

---

## Files in this delivery

| File | Description |
|---|---|
| `stage4b-r3-status.md` | Full status report covering all four outstanding items from r2 review |
| `stage4b-r3-schema-snapshot.sql` | Schema comments for document library tables and triggers as of r3 |
| `stage4b-r3-migrations.txt` | List of all three Stage 4b migrations applied to the development database |
| `stage4b-r3-rollback.sql` | Rollback fixture to revert migration 0028 if needed |
| `MANIFEST.md` | This file |

---

## Changes in r3

### 1. Cascade trigger (Decision 60)
- `lib/db/migrations/0028_stage4b_folder_cascade.sql` — AFTER/cascade replaces BEFORE/refuse on `document_folders`
- `artifacts/api-server/src/routes/documents.ts` — removes 400 refusal, wraps in `db.transaction`, returns `cascadedDocuments: N`
- `artifacts/api-server/src/__tests__/helpers/mockDb.ts` — `updateAll` semantics for bulk cascades
- `artifacts/api-server/src/__tests__/documentsCrossUserPrivacy.test.ts` — cascade assertion (was refusal assertion)

### 2. Automated browser evidence for visibility model
- `artifacts/hoa-portal/e2e/documents-admin.spec.ts` — NEW: 5 admin-session document tests
- `artifacts/hoa-portal/playwright.config.ts` — registers `documents-admin.spec.ts` in admin project
- `artifacts/hoa-mobile/__tests__/documentsLibraryContract.test.ts` — pre-existing; confirmed passing
- Tenant/household_member role E2E deferred to consolidated UAT (no Clerk test accounts; explicit per decision 61)

### 3. J6 print suppression + honest disclaimer
- `artifacts/hoa-portal/src/pages/portal/documents.tsx` — `openDocument()` wraps view-only blob in print-suppressing HTML iframe wrapper
- `artifacts/hoa-portal/src/lib/translations.ts` — English and Arabic `doc_view_only_warning` state honest limit (mentions print suppression, screenshot risk, and "do not publish if must not circulate")

### 4. J7 mobile parity (confirmed pre-existing)
- `artifacts/hoa-mobile/__tests__/documentsLibraryContract.test.ts` — both contract assertions pass
- No code changes required; mobile already uses authenticated endpoint and respects `canDownload`

---

## E2E test breakdown (82 tests, 1 worker)

- **72 passed** — all authentication, role-redirect, document library, announcements, facilities, guests, vehicles, key-contacts round-trip, admin dashboard, and waha-cred tests
- **10 skipped** — all data-dependent (no facilities seeded, no documents seeded in dev database, no guest-dialog trigger)
- **0 failed**

New tests added this revision:
- `[admin] Document Library — admin visibility model > admin sees the document management controls` ✓
- `[admin] Document Library — admin visibility model > admin document list renders or shows empty state` ✓
- `[admin] Document Library — admin visibility model > admin sees visibility restriction badges when documents exist` — SKIPPED (no documents in dev database)
- `[admin] Document Library — admin visibility model > API document response does not expose fileUrl to admin` ✓
- `[admin] Document Library — admin visibility model > folder navigation renders with both English and Arabic names` ✓

---

## Not included in r3
- Stage 3 work (separate deliverable)
- Deployment (Stage 3 still open; no deployment authorized)
- Stage 4b acceptance claim (submitted for reviewer sign-off)
