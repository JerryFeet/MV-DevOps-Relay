# Development baseline continuity — migrations 0049 and 0050

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed.

## Baseline capture

The current Development `public` schema (with `0049_occupancy_core.sql` and
corrected `0050_move_out_canonical_unit.sql` already applied) was captured with:

```text
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public
```

Only the dump's bootstrap `CREATE SCHEMA public` statement and its comment
framing were removed, using the established H5 procedure; application-object
DDL was not edited.

| Artifact | SHA-256 |
| --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `3caac2b29dd0e06386e43197ab5a90f708c08d60682621534c6124d1ea956e09` |
| Development semantic catalog signature | `75fa1b67f45161b90eb2ec942cc027907e45bca046f9207e9ee787478fafe306` |
| `scripts/verify-production-schema.sh` | `a73f493ca5908596f8a224b9d6c6fe581080d28b00656393d01d7b37cde47a76` |

## Disposable fresh replay and semantic comparison

A newly created disposable `template0` database was loaded from the regenerated
baseline only, then removed. The comparison command was:

```text
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > development-catalog.tsv
psql "$FRESH_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > replay-catalog.tsv
diff -u development-catalog.tsv replay-catalog.tsv
```

The normalized semantic diff was **empty** (zero added, removed, or changed
entries). It covers relations, columns/types/defaults/nullability,
constraints, indexes, non-internal triggers, functions, enum labels, and
sequences.

| Catalog object | Development | Fresh replay |
| --- | ---: | ---: |
| Public tables | 50 | 50 |
| Public columns | 665 | 665 |
| Public constraints | 155 | 155 |
| Public indexes | 164 | 164 |
| Non-internal triggers | 9 | 9 |
| Enum types | 31 | 31 |
| Enum labels | 132 | 132 |
| Public functions | 7 | 7 |
| Public sequences | 49 | 49 |

## Contract and verifier

`BASELINE_MANIFEST.env` now records `INCLUDED_THROUGH=0050`, retains
`MIGRATION_START=0045`, and records the hashes and verified catalog counts
above. `MIGRATION_LEDGER.md` lists both active migrations `0049` and `0050`.

`DATABASE_URL="$DATABASE_URL" bash scripts/verify-production-schema.sh` passed
against both Development and the fresh replay database with the accepted
`50/665/155/164/9` catalog counts and all thirteen protection checks. `git diff
--check` passed for the touched files. No Production connection, publish, schema
or data modification, `db:push`, or Drizzle migration command was used.