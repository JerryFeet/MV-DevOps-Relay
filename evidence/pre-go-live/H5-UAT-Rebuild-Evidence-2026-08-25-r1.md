# H5 — UAT rebuild and post-rebuild evidence

**Date:** 2026-08-25  
**Environment changed:** development/UAT only  
**Production:** read-only inspection only; no production schema, data, or deployment change

## Pre-rebuild backup

A full custom-format PostgreSQL backup was taken before the rebuild:

- Backup location: `/tmp/hoa-h5-backups/uat-pre-rebuild-2026-08-25.dump`
- SHA-256:
  `ff3de8c9123819c60e4227b852e42601cec5e5366c4a4972d28c310d03eeeaeb`
- Size: `185145` bytes
- `pg_restore --list` entries: `472`
- Backup verification: passed

The backup was retained locally and not published because it contains
development test records.

## Authorized rebuild

The product owner explicitly authorized deletion of UAT test data immediately
before this operation. The development `public` schema was dropped and
recreated, then `lib/db/migrations/0000_baseline.sql` was applied in one
transaction with `ON_ERROR_STOP`.

All prior UAT test records were intentionally destroyed. Production was not
targeted.

## Post-rebuild schema counts

| Catalog object | Before rebuild | After rebuild |
| --- | ---: | ---: |
| Public tables | 41 | 41 |
| Columns | 563 | 563 |
| Constraints | 107 | 107 |
| Indexes | 137 | 137 |
| User triggers | 3 | 3 |

The H4 catalog assertion passed after rebuild.

## Required UAT fixtures

| Fixture | Verified result |
| --- | --- |
| Bookable facility | `H5 Bookable Community Hall`, active, 08:00–23:00 weekday, 09:00–23:00 weekend, 60-minute slots, 60–180-minute duration |
| Resident-visible document | `H5 Resident Welcome Guide`, folder floor and document visibility `all_portal_users` |
| Owners-only document | `H5 Owners Committee Guide`, folder floor and document visibility `verified_owners` |
| HOA COMMON unit | `HOA / COMMON`, normalized value `HOACOMMON`, `is_system=true`, vacant |

## Protection verification

The following protections were present and behaviorally verified:

- `users_staff_unitless_check` blocked a staff user linked to a unit.
- `units_one_system_unit` blocked insertion of a second system unit.
- `protect_hoa_common_system_unit_trigger` blocked renaming the COMMON unit.
- `units_system_unit_identity_check` is present.
- `protect_hoa_common_system_unit()` and its trigger are present.

## Production procedure planning

Replit documentation confirms:

1. Agent can modify development database schemas, but cannot modify
   production database schemas.
2. Production DDL must not be sent through the production SQL path.
3. Replit's supported schema-application path is Publish: Replit compares
   development and production, presents rename decisions, and applies the
   reviewed schema diff.
4. A production database can be removed from the Database tool's
   production-database Settings tab. Removal has a seven-day soft-delete
   period and is irreversible after hard deletion. Point-in-time restore
   retention is plan-dependent.

Therefore, “drop production schema and rebuild from baseline” is possible only
as a product-owner-operated Replit procedure—not as an Agent-run `DROP
SCHEMA` or direct application of `0000_baseline.sql`:

1. Confirm production data is disposable and review its recovery/PITR state.
2. In Replit's Database tool, remove the production database if the UI offers
   the intended reset path; accept the seven-day deletion consequence.
3. Publish from the rebuilt UAT/development database.
4. Review the production diff and any rename/destructive warnings in the
   Publish UI. Do not select data overwrite unless intentionally requested.
5. Verify the resulting production catalog contains the baseline schema and
   all five raw protections before resident-facing go-live.

The current production inspection found 28 tables, 359 columns, 36
constraints, 83 indexes, and zero user triggers, so it is an earlier/partial
schema and cannot receive `0000_baseline.sql` as an in-place migration.

Source documentation consulted:

- https://docs.replit.com/features/data-and-storage/development-and-production
- https://docs.replit.com/features/data-and-storage/data-recovery