# H5 — Drizzle source reconciliation and corrected UAT rebuild

**Date:** 2026-08-25  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed

## Purpose

Close the source-schema drift that could corrupt development before Replit Publish:

- The Drizzle source declared the retired `unit_registry` table, even though it
  was removed by the historical L1 migration.
- The Drizzle source omitted the live Stage 3 audit tables
  `facility_booking_config_normalization_audit` and
  `facility_operating_hours_conflicts`, including their foreign keys.
- Post-merge setup automatically ran `drizzle-kit push --force`, creating an
  unreviewed development-schema mutation path.

## Source reconciliation

1. Removed the `unit_registry` Drizzle model and export.
2. Replaced the sole runtime registry lookup with a unit-backed ownership record
   endpoint. It now reads `units` and the verified owner directly.
3. Added both Stage 3 audit-table declarations to the Drizzle source, including:
   - audit `facility_id → facilities.id`;
   - conflict `facility_id → facilities.id`;
   - conflict `booking_id → bookings.id`;
   - unique conflict record per booking.
4. Removed `unit_registry` from the UAT reset list.
5. Removed the automatic `push-force` command from post-merge setup.
6. Added the development-to-production schema freeze rule to
   `MIGRATION_LEDGER.md`.

## Drizzle generation check

`drizzle-kit generate` was run against the corrected source with output isolated
under `/tmp`, so it did not modify the executable migration chain.

| Check | Result |
|---|---|
| Generated table declarations | 41 |
| `unit_registry` creation | absent |
| `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, or `DROP TYPE` statements | absent |
| Both Stage 3 audit tables | present |
| All three audit-table foreign keys | present |

## Baseline and empty-database proof

`0000_baseline.sql` did not change because the live PostgreSQL catalog did not
change; this work reconciles the source declaration with that catalog.

- Baseline SHA-256:
  `85d6897c3b262faefef0687a0680133e3f455e67b4ad10205dbbd58645aefbf6`
- A new isolated database was built from the baseline.
- Its normalized catalog exactly matched the pre-rebuild development/UAT
  catalog: **1,242 entries on each side; empty diff**.

## Corrected UAT rebuild

Before the reset, a new custom-format UAT backup was created and checked:

- File: `/tmp/hoa-h5-backups/uat-pre-drift-rebuild-2026-08-25T074527Z.dump`
- SHA-256:
  `beb5017a0271175e8bca479429354ea296c7483d72876eda96a8346632c797f1`
- Restore-list entries: `474`

The development/UAT `public` schema was then dropped and recreated from
`0000_baseline.sql`. Required non-production fixtures were seeded:

- Active bookable facility: `H5 Bookable Community Hall`
- Resident-visible document: `H5 Resident Welcome Guide`
- Owners-only document: `H5 Owners Committee Guide`
- Protected system unit: `HOA / COMMON` (`HOACOMMON`)

Post-rebuild catalog comparison against the isolated baseline proof was again
empty, with `1,242` normalized entries on each side.

| Object | Expected / observed |
|---|---:|
| Tables | 41 |
| Columns | 563 |
| Constraints | 107 |
| Indexes | 137 |
| User triggers | 3 |

The H4 PostgreSQL-only catalog assertion passed after the rebuild.

## Guardrail for Publish

Development/UAT is now the authoritative schema input to Replit Publish.
Between this rebuild and Publish, do not run `drizzle-kit push`, `db:push`,
`push-force`, or `drizzle-kit migrate` against development. If a schema change
is needed, it must be a reviewed numbered forward migration after the baseline,
followed by baseline regeneration and a new empty-database semantic-diff proof.

No production reset, publish, or production schema verification was performed.