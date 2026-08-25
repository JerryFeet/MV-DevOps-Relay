# H5 — self-bootstrapping baseline empty-diff proof

**Date:** 2026-08-25  
**Scope:** H5 remediation, baseline creation, and empty-database proof  
**Production:** inspected read-only only; no production change or deployment  
**UAT data:** not changed by this proof

## Production schema state

The separate production database exists and is not an empty schema:

| Catalog object | Production | Current UAT |
| --- | ---: | ---: |
| Public tables | 28 | 41 |
| Columns | 359 | 563 |
| Constraints | 36 | 107 |
| Indexes | 83 | 137 |
| User triggers | 0 | 3 |

Production is an earlier/partial schema state, not a match for current UAT.
No production row data was read.

## Baseline artifact

`lib/db/migrations/0000_baseline.sql` is a schema-only catalog capture of the
current UAT `public` schema.

- SHA-256:
  `85d6897c3b262faefef0687a0680133e3f455e67b4ad10205dbbd58645aefbf6`
- 41 `CREATE TABLE` statements
- 29 enum types
- 3 functions
- 3 user triggers
- No table data

The capture retains the two Stage 3 audit tables that are present in UAT:

- `facility_booking_config_normalization_audit`
- `facility_operating_hours_conflicts`

It also retains every PostgreSQL-only H4 protection:

- `users_staff_unitless_check`
- `units_system_unit_identity_check`
- `units_one_system_unit`
- `protect_hoa_common_system_unit()`
- `protect_hoa_common_system_unit_trigger`

The one default `CREATE SCHEMA public` statement emitted by `pg_dump` was
removed because PostgreSQL creates `public` in a new database by default; this
prevents an otherwise empty replay from failing before object creation.

The baseline and ledger were published before this proof:

| Artifact | Relay commit | Relay blob |
| --- | --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `5aa9010cb1d9a747e227f944d61348b34fb70c1f` | `ce91a40c8d318dea654fccd164474fd0a7b81644` |
| `lib/db/migrations/MIGRATION_LEDGER.md` | `e8a9d3e77a1e8dfce826ddb6a8e01b552c28de63` | `58d606572e6d1ac79a21a25584e867b397c9facd` |

## Empty-database replay

The baseline was applied with `ON_ERROR_STOP` and one transaction to a newly
created disposable PostgreSQL database. The database was dropped after
verification.

The H4 PostgreSQL catalog assertion passed in that empty replay database.

## Semantic catalog comparison

The comparison normalizes and sorts:

- tables and relation kinds
- columns, types, nullability, defaults, identities, and generated values
- constraints and definitions
- indexes and definitions
- non-internal triggers and definitions
- public functions and definitions
- enum labels and ordering
- sequences and their parameters

| Result | UAT | Empty-baseline replay |
| --- | ---: | ---: |
| Normalized catalog entries | 1,019 | 1,019 |
| Public tables | 41 | 41 |
| Columns | 563 | 563 |
| Constraints | 107 | 107 |
| Indexes | 137 | 137 |
| User triggers | 3 | 3 |

The normalized semantic diff is empty. See
`H5-Baseline-Semantic-Diff-2026-08-25-r1.txt`.

## Migration ledger rule

`0000_baseline.sql` is the only fresh-database bootstrap. Existing migrations
through `0038_task1_announcement_visibility.sql`, plus
`2026-08-18-household-invitations.sql`, are retained as historical evidence
and must not be replayed after the baseline. New schema changes must be
recorded as explicit active forward migrations in `MIGRATION_LEDGER.md`.

## Ready state

The baseline is proven equivalent to UAT schema. The next action—dropping and
rebuilding UAT—destroys all UAT/test data and requires a separate immediate
product-owner confirmation.