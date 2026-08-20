# HOA Stage 3 — Source and Evidence Map (r4)

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
| `0024_stage3_vehicle_e1_e5.sql` | Supports vehicle entitlement and registration-document behavior. |
| `0025_stage3_renovation_scope_multiselect.sql` | Converts active renovation scope storage to `text` for JSON-encoded arrays while historic scalar values remain readable. |

### Important storage-format boundary

Migration `0025` is included because it is the current source, not because its JSON-in-text design is accepted. The final Stage 3 remediation must convert recognized historic values to canonical `TEXT[]`, queue unknown values in `data_migration_corrections`, and remove the orphaned historic enum only after dependency verification.

## Runtime source and evidence map

| Area | Evidence source |
|---|---|
| Saudi service-day, overnight window, cleaning buffer, and booking admission | `artifacts/api-server/src/lib/facilityOperatingHours.ts` and `artifacts/api-server/src/routes/bookings.ts` |
| Central booking advisory-lock allocation and route-use regression proof | `artifacts/api-server/src/lib/advisoryLockNamespaces.ts` and `artifacts/api-server/src/__tests__/bookingAdvisoryLockNamespace.test.ts` |
| Facility schema and booking configuration | `lib/db/src/schema/facilities.ts` |
| F5 prerequisite integrity check | `artifacts/api-server/scripts/stage3-schema-integrity-evidence.ts` and `Stage-3-UAT-Database-Integrity-Evidence-2026-08-20-r4.txt` |
| Rollback-only F5 proof | `artifacts/api-server/scripts/stage3-f5-normalization-fixture-evidence.ts` and `Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20-r4.txt` |
| Current renovation validation, five scope values, contractor contact, and common-area rules | `artifacts/api-server/src/routes/permits.ts` |
| Mobile renovation repair | `artifacts/hoa-mobile/app/(home)/(tabs)/permits.tsx`, `artifacts/hoa-mobile/lib/phoneUtils.ts`, and `artifacts/hoa-mobile/hooks/useTranslations.ts` |
| Mobile API-contract audit | `Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r4.md` |
| Vehicle entitlement, controlled rejection, and protected Istimara access | `artifacts/api-server/src/routes/vehicles.ts` |
| D1/A2 role and resident roster regression coverage | `artifacts/api-server/src/__tests__/d1a2RegressionGaps.test.ts` |

## Fresh r4 verification evidence

| Check | Result |
|---|---|
| Development F5 audit-table prerequisite | **PASS** — both required public-schema tables are present; published integrity result reports no missing tables. |
| Rollback-only F5 normalization fixture | **PASS** — 2 normalization rows, 2 conflicts, no buffer rounding, valid Thursday 00:30 control, and 0 fixture rows after rollback. |
| Booking advisory-lock namespace regression test | **PASS** — 1 file / 1 test; the route uses the centralized exported namespace rather than literal `4201`. |
| API regression suite | **PASS** — 76 files, 1,275 tests. |
| Portal and mobile suites | Carried forward from r3 — no portal or mobile source changed in r4. |
| Schema-only data boundary | **PASS** — no `INSERT` or `COPY ... FROM stdin` sections before publication. |

## Current acceptance boundary

- The mobile renovation P0 remains repaired and has client-payload/API coverage.
- The r4 audit is complete for every active mobile API consumer, but authenticated HOA-document download and guest-list pagination remain open P1 fixes.
- The canonical renovation storage migration, G6 and payment-path evidence, focused browser UAT, and formal acceptance remain required.
- The schema export contains no application row data. This package contains no secrets, credentials, resident identities, private object keys, production data, or production-database output.