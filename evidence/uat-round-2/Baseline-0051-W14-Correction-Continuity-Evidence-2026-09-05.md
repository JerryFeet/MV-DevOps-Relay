# Development baseline continuity — migration 0051 W14 correction operations

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed.

The final applied data-remediation record is
[W14-Correction-Applied-Evidence-2026-09-05.md](W14-Correction-Applied-Evidence-2026-09-05.md).
This document is a historical schema-continuity proof for baseline 0051, not
an instruction to replay or reapply the W14 correction.

## Development capture

Migration `0051_w14_occupancy_correction_operations.sql` was already applied in
Development, and the separate W14 correction had already executed. No W14 data
was changed during this continuity proof. The Development `public` schema was
captured with:

```text
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public
```

Only the dump's `CREATE SCHEMA public` bootstrap statement and its associated
comment framing were removed. No application-object DDL was edited.

| Artifact | SHA-256 |
| --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `fff8399619aedcfd18165525e33fd909b4aed369c747f52da7f3367a03829d60` |
| Development semantic catalog | `0418b09204c2f19674ffc03e4530c77b47ca54b6ce1802f966ba7ddbea12df78` |
| Replay semantic catalog | `0418b09204c2f19674ffc03e4530c77b47ca54b6ce1802f966ba7ddbea12df78` |
| `scripts/verify-production-schema.sh` | `82899be3d0e00a57e45b11ce5a500d420b8c360100597942ab9ee4a8847e73e9` |

## Disposable template0 replay

A fresh disposable `template0` database named
`baseline_0051_replay_20260905` was created, loaded from the regenerated
baseline only, verified, and dropped:

```text
createdb -T template0 baseline_0051_replay_20260905
psql -X -v ON_ERROR_STOP=1 -d baseline_0051_replay_20260905 \
  -f lib/db/migrations/0000_baseline.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > development-catalog.tsv
psql -X -v ON_ERROR_STOP=1 -At -d baseline_0051_replay_20260905 \
  -f scripts/schema-catalog-signature.sql > replay-catalog.tsv
diff -u development-catalog.tsv replay-catalog.tsv
dropdb baseline_0051_replay_20260905
```

The semantic diff was empty. It compares relations, columns with types,
defaults, and nullability, constraints, indexes, non-internal triggers,
functions, enum labels, and sequences.

| Catalog object | Development | Fresh replay |
| --- | ---: | ---: |
| Public tables | 51 | 51 |
| Public columns | 676 | 676 |
| Public constraints | 159 | 159 |
| Public indexes | 168 | 168 |
| Non-internal triggers | 10 | 10 |
| Enum types | 31 | 31 |
| Enum labels | 132 | 132 |
| Public functions | 7 | 7 |
| Public sequences | 50 | 50 |

## Verification

Both Development and the fresh replay passed:

```text
DATABASE_URL="$DATABASE_URL" bash scripts/verify-production-schema.sh
DATABASE_URL="$FRESH_DATABASE_URL" bash scripts/verify-production-schema.sh
DATABASE_URL="$DATABASE_URL" bash scripts/assert-h4-schema-protections.sh
DATABASE_URL="$FRESH_DATABASE_URL" bash scripts/assert-h4-schema-protections.sh
```

The verifier passed the accepted `51/676/159/168/10` catalog counts; the new
occupancy-correction table, 11 expected columns, four expected constraints,
three migration indexes, append-only trigger function, and append-only trigger
all passed in both catalogs. The H4 raw-SQL protection assertion also passed in
both catalogs. `git diff --check` completed with no output.

`BASELINE_MANIFEST.env` was updated only after these successful results with
`INCLUDED_THROUGH=0051` and the hashes and counts above. No Production
connection, publish, schema/data modification, `db:push`, or Drizzle migration
command was used.