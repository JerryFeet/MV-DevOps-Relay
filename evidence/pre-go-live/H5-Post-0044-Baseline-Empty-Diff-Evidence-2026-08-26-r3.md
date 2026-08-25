# H5 — post-0044 baseline regeneration and empty-diff proof

**Date:** 2026-08-26  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed

## Ordering restoration

The exact `0044_ad_console_approval_routing.sql` applied to development was
published to the evidence relay before this baseline was regenerated:

| Artifact | Relay commit | Relay blob |
| --- | --- | --- |
| `evidence/pre-go-live/migrations/0044_ad_console_approval_routing.sql` | `ccadcc6a486194a38649cf1d3029042971a3f180` | `48aa00da912a5aa7e98e54c6cc21e5fc13700fd7` |

## Regenerated baseline

The baseline was freshly captured from the frozen development catalog with:

```text
pg_dump --schema-only --no-owner --no-privileges --schema=public
```

The bootstrap-only `CREATE SCHEMA public` statement was removed because
PostgreSQL creates `public` in a new database. No schema object DDL was edited.

| Fact | Result |
| --- | --- |
| Baseline artifact | `evidence/pre-go-live/migrations/0000_baseline-2026-08-26-r3.sql` |
| SHA-256 | `92d056b078af502f312faca19642026bd2c6b38aad425df0e9bf6ce4aca521eb` |
| Public tables | 43 |
| Public columns | 589 |
| Public constraints | 117 |
| Public indexes | 143 |
| Non-internal triggers | 3 |
| Enum types | 29 |
| Public functions | 3 |

## Raw PostgreSQL protections

All five protections survived the regenerated capture and passed the H4 catalog
assertion in both development and a fresh replay database:

1. `users_staff_unitless_check`
2. `units_system_unit_identity_check`
3. `units_one_system_unit`
4. `protect_hoa_common_system_unit()`
5. `protect_hoa_common_system_unit_trigger`

## Genuinely fresh replay and semantic comparison

A disposable database was created from `template0`, the regenerated baseline
was applied with `psql -X -v ON_ERROR_STOP=1`, and the H4 assertions passed.
The database was removed after verification.

The normalized catalog comparison covers tables, columns (including types,
nullability, defaults, identity, and generated markers), constraints, indexes,
non-internal triggers, public functions, enum labels, and sequences:

| Result | Frozen development | Fresh baseline replay |
| --- | ---: | ---: |
| Normalized catalog entries | 1,064 | 1,064 |
| Public tables | 43 | 43 |
| Public columns | 589 | 589 |
| Public constraints | 117 | 117 |
| Public indexes | 143 | 143 |
| Non-internal triggers | 3 | 3 |
| Semantic catalog diff | empty | empty |

The comparison deliberately excludes only the `public` schema comment supplied
by the `template0` bootstrap. It is not application schema DDL and was the sole
un-normalized dump difference; no table, column, constraint, index, trigger,
function, enum, or sequence differed.

The canonical `lib/db/migrations/0000_baseline.sql` was also replayed into a
separate fresh `template0` database. It passed the H4 assertions and produced
the same empty normalized catalog diff against frozen development.

## Production verifier revalidation

`scripts/verify-production-schema.sh` now asserts the measured frozen catalog
totals `43/589/117/143/3`. Running it with the development database URL passed
every total and every raw-protection check.

No production database access, schema mutation, deployment, automatic migration,
`db:push`, or `drizzle-kit migrate` command was used.