# HOA Stage 3 — Source and Evidence Map (r3)

**Evidence date:** 2026-08-20  
**Package purpose:** Current Stage 3 individual-file delivery-status evidence. **This is not a Stage 3 acceptance package.**

## Migration source included in the individual-file delivery

| Migration | Purpose |
|---|---|
| `0018_stage3_facility_operating_hours.sql` | Establishes authoritative weekday and overnight weekend facility hours. |
| `0019_stage3_facility_cleaning_buffer.sql` | Adds a per-facility cleaning-buffer default. |
| `0020_stage3_active_booking_start_uniqueness.sql` | Preserves exact active facility/start uniqueness. |
| `0021_stage3_booking_config_normalization_audit.sql` | Audits booking configuration normalization and future operating-hours conflicts. |
| `0022_stage3_booking_concurrency_note.sql` | Documents the runtime advisory-lock requirement for buffered-overlap admission. |
| `0023_stage3_facility_buffer_constraint.sql` | Enforces valid whole, non-negative facility cleaning buffers. |
| `0024_stage3_vehicle_e1_e5.sql` | Supports Stage 3 vehicle entitlement and registration-document behavior. |
| `0025_stage3_renovation_scope_multiselect.sql` | Converts active renovation scope storage to `text` for JSON-encoded arrays while historic scalar values remain readable. |

### Important storage-format boundary

Migration `0025` is included because it is the current source, not because its JSON-in-text design is accepted. The approved `TEXT[]` design was silently deviated from and remains an **open Stage 3 acceptance blocker**. The final migration must convert recognized historic values to one canonical `TEXT[]` format, queue unknown values in `data_migration_corrections`, and remove the orphaned historic enum after dependency verification.

## Runtime source map

| Area | Evidence source |
|---|---|
| Saudi service-day, overnight window, cleaning buffer, and booking admission | `artifacts/api-server/src/lib/facilityOperatingHours.ts` and `artifacts/api-server/src/routes/bookings.ts` |
| Advisory-lock namespace | `artifacts/api-server/src/lib/advisoryLockNamespaces.ts` and `lib/db/migrations/0022_stage3_booking_concurrency_note.sql` |
| Facility schema and booking configuration | `lib/db/src/schema/facilities.ts` |
| Current renovation validation, five scope values, contractor contact, and common-area rules | `artifacts/api-server/src/routes/permits.ts` |
| Mobile renovation repair | `artifacts/hoa-mobile/app/(home)/(tabs)/permits.tsx`, `artifacts/hoa-mobile/lib/phoneUtils.ts`, and `artifacts/hoa-mobile/hooks/useTranslations.ts` |
| Renovation test coverage | `artifacts/hoa-mobile/__tests__/RenoPermitSheet.test.tsx` and `artifacts/api-server/src/__tests__/stage3G1G6.test.ts` |
| Vehicle entitlement, controlled rejection, and protected Istimara access | `artifacts/api-server/src/routes/vehicles.ts` |
| D1/A2 role and resident roster regression coverage | `artifacts/api-server/src/__tests__/d1a2RegressionGaps.test.ts` |
| Portal Stage 3 surfaces | `artifacts/hoa-portal/src/pages/portal/facilities.tsx`, `artifacts/hoa-portal/src/pages/portal/permits.tsx`, `artifacts/hoa-portal/src/pages/portal/vehicles.tsx`, and `artifacts/hoa-portal/src/pages/portal/admin.tsx` |

## Fresh verification evidence

| Check | Result |
|---|---|
| Development F5 audit-table prerequisite | **PASS** — required audit tables were applied through the approved idempotent migration before the fixture run. |
| Rollback-only F5 normalization fixture | **PASS** — 2 normalization rows, 2 conflicts, no buffer rounding, valid Thursday 00:30 control, and 0 fixture rows after rollback. |
| API regression suite | **PASS** — 75 files, 1,274 tests. |
| Portal regression suite | **PASS** — 59 files, 1,375 tests. |
| Mobile regression suite | **PASS** — 12 files, 375 tests. |
| API, portal, and mobile type checks | **PASS** |
| Browser E2E suite | **PASS** — 68 passed, 9 intentional skips. |
| Live Expo preview | **PASS** — signed-out mobile login screen rendered after the managed Expo workflow restart. |

## Current acceptance boundary

- The P0 mobile renovation regression is repaired and independently covered at client-payload and API levels.
- The separate mobile audit confirms two resident-impacting items still open: authenticated HOA-document downloads and guest-list pagination.
- The canonical renovation storage-format migration, remaining payment-path evidence, focused browser UAT, and final acceptance evidence are still required.
- The schema export contains no application row data. This package contains no secrets, credentials, resident identities, private object keys, production data, or production-database output.