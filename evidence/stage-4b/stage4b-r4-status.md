# Stage 4b — Status Report r4
**Date:** 2026-08-21  
**Revision:** r4 (supersedes r3)

---

## r4 Δ — Changes from r3

Three items were required before r4 could be accepted:

| # | r3 gap | r4 resolution |
|---|--------|--------------|
| 1 | Schema snapshot was hand-written (migration SQL), not a genuine `pg_dump` | Added `stage4b-r4-schema-only.sql` — genuine `pg_dump --schema-only` against the development database (3165 lines, PostgreSQL 16.10) |
| 2 | Tenant J5 coverage was implicit — not stated explicitly | Stated explicitly below with named test + line references |
| 3 | 10 skipped E2E tests were reported by count only | All 10 named below; one (visibility badges) unblocked by fixture and confirmed passing |

---

## Delivered artefacts (Stage 4b scope)

### J1 — Folder visibility floor cascade (migration 0028)
- Migration: `lib/db/migrations/0028_stage4b_folder_cascade.sql`
- BEFORE/refuse trigger replaced by AFTER/cascade trigger
- `cascade_folder_visibility_floor()` — tightens documents in the same transaction
- `enforce_document_visibility_floor()` — loosen guard (BEFORE trigger) unchanged

### J2 — API route cascade (documents.ts)
- `PATCH /api/document-folders/:id` — now calls `db.transaction(cascade)` instead of returning 400
- Response includes `cascadedDocuments: N`
- Loosen does not downgrade: documents at a higher visibility than the new floor are untouched

### J3 — Admin portal document viewer (view-only iframe)
- `artifacts/hoa-portal/src/pages/portal/documents.tsx`
- Blob wrapped in print-suppressing iframe; no direct object URL exposed to resident
- `doc_view_only_warning` translation key (EN + AR) states honest limit

### J4 — Admin E2E coverage
- `artifacts/hoa-portal/e2e/documents-admin.spec.ts`
- 5 admin-session tests covering: controls visible, list renders, visibility badges, fileUrl exclusion, folder bilingual navigation

### J5 — Tenant layer coverage (decision 61)
- **Test file:** `artifacts/api-server/src/__tests__/documentsCrossUserPrivacy.test.ts`
- **Line 80:** Tenant receives only `all_portal_users` documents — owner-only folder documents are absent from the tenant response
- **Line 92:** Tenant guessing an owner-only document ID by ID gets a 403/404 — enumeration is blocked
- These two assertions constitute full API-level J5 coverage. Decision 61 (consolidated UAT deferred) applies; E2E gap is cosmetic.

---

## Test suite baseline (all suites — r4 run)

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| API server | 76 | 1,274 | ✅ all passed |
| HOA portal | 60 | 1,377 | ✅ all passed |
| HOA mobile | 16 | 405 | ✅ all passed |
| Portal typecheck | — | — | ✅ clean |
| Mobile typecheck | — | — | ✅ clean |
| Translation guard | 60 | 1,377 | ✅ all passed |

---

## E2E: Named list of all 10 previously-skipped tests

The baseline E2E run (before r4 seeding) reported 72 passed, 10 skipped, 0 failed.
Tests are skipped conditionally when fixture data is absent; they do **not** indicate
broken code — they skip gracefully rather than asserting against an empty state.

| # | Spec file | Test name | Reason skipped (baseline) |
|---|-----------|-----------|--------------------------|
| 1 | `documents.spec.ts:30` | "download link present when documents exist" — resident project | No documents in dev DB |
| 2 | `documents-admin.spec.ts:38` | "admin sees visibility restriction badges when documents exist" — admin project | No documents in dev DB |
| 3 | `facilities.spec.ts:45` | "clicking a facility shows the booking panel" — resident project | No facility cards rendered (no facilities seeded) |
| 4 | `facilities.spec.ts:74` | "My Bookings tab shows existing bookings or empty state" — resident project | Same (no facilities) |
| 5 | `facilities.spec.ts:45` | "clicking a facility shows the booking panel" — admin project | Same |
| 6 | `facilities.spec.ts:74` | "My Bookings tab shows existing bookings or empty state" — admin project | Same |
| 7 | `facilities.spec.ts:109` | "admin can book a facility via the wizard and cancel from My Bookings" — admin project | No facilities to select in wizard |
| 8 | `guests.spec.ts:36` | "guest registration dialog opens when button is clicked (verified user)" — resident project | E2E resident account not yet verified |
| 9 | `vehicles.spec.ts:35` | "add vehicle dialog opens when button is clicked (verified user)" — resident project | Same |
| 10 | `waha-cred-action-column.spec.ts:28` | "Active badge and Revoke button are both visible in Arabic at narrow viewport" — admin project | No Waha Pass credentials in dev DB |

### Seeded fixture run — document tests unblocked

For r4, 7 documents (one per active non-triage folder) were inserted into the dev DB,
the E2E suite was run, and the documents were rolled back after the run.

**Result — documents-admin.spec.ts (admin project):**

| Test | Seeded run result |
|------|------------------|
| "admin sees the document management controls" | ✅ passed |
| "admin document list renders or shows empty state" | ✅ passed |
| **"admin sees visibility restriction badges when documents exist"** | ✅ **PASSED** (previously skipped) |
| "API document response does not expose fileUrl to admin" | ✅ passed |
| "folder navigation renders with both English and Arabic names" | ✅ passed |

The previously-skipped visibility-badges test (item 2 in the table above) ran and
passed for the first time with seeded fixture data. The other 8 skipped tests remain
deferred; their skip causes (missing facilities, unverified resident, no Waha credentials)
are explicitly tracked and are not regressions.

---

## Schema dump

`stage4b-r4-schema-only.sql` — genuine `pg_dump "$DATABASE_URL" --schema-only` output.
Produced by `pg_dump` version 16.10, database version 16.10.
Contains: 28 public ENUM types, 2 trigger functions (including `cascade_folder_visibility_floor`
and `enforce_document_visibility_floor`), 33 tables, all indexes and constraints.
The r3 hand-written schema snapshot (`stage4b-r3-schema-snapshot.sql`) is retained
in the r3 directory as a companion — this file supersedes it for completeness verification.

---

## Rollback

`stage4b-r4-rollback.sql` — identical to r3 rollback (no new migration in r4; r4 adds
evidence only). Reverts migration 0028 by restoring the BEFORE/refuse trigger and
dropping `cascade_folder_visibility_floor()`.

---

## H4 pagination work (concurrent with r4)

P0 mobile pagination was completed concurrently with Stage 4b r4:
- `announcements.tsx` — replaced `useQuery` with `useInfiniteQuery`; count derived from `total` field
- `communications.tsx` — replaced `useQuery` with `useInfiniteQuery`; "All (N)" tab uses API `total`
- `permits.tsx` — P2 boundary documented with comment near `?limit=200`
- `paginationContract.test.ts` — new contract test suite (16 assertions); included in mobile 405 baseline above
- All mobile translation keys added: `comms_more_available`, `comms_load_more`, `comms_load_error`
