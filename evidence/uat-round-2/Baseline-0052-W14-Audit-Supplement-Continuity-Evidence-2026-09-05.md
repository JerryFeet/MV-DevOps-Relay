# Development baseline continuity — migration 0052 W14 audit supplement

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed.

The final applied data-remediation record is
[W14-Correction-Applied-Evidence-2026-09-05.md](W14-Correction-Applied-Evidence-2026-09-05.md).
This document is a historical schema-continuity proof for baseline 0052, not
an instruction to replay or reapply the W14 correction.

## Development capture

Migration `0052_occupancy_correction_operation_supplements.sql` was already
applied in Development. No W14 data was changed during this continuity proof.
The Development `public` schema was captured with:

```text
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public
```

Only the dump's `CREATE SCHEMA public` bootstrap statement and associated
comment framing were removed. No application-object DDL was edited.

| Artifact | SHA-256 |
| --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `070b67863b639b9d49f7b4463ebfad3600bc51ce3a5ff4d17476dfa994c65d1b` |
| Development semantic catalog | `d2d5f93506667b7492724d458c88d102ced427094f9f76d9a399d4c34f2907d1` |
| Replay semantic catalog | `d2d5f93506667b7492724d458c88d102ced427094f9f76d9a399d4c34f2907d1` |
| `scripts/verify-production-schema.sh` | `94a478daaeb2ecbf321357f4b128d151d56e8572f85f84f66d84aa07e936b4ec` |

## Declared-contract template0 replay

The declared contract was followed exactly: create a fresh disposable
`template0` database, apply `0000_baseline.sql`, enumerate and apply only
numbered migration files greater than `INCLUDED_THROUGH=0052`, then compare
semantic catalogs. Enumeration returned no migration files.

```text
find lib/db/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' \
  -printf '%f\n' | awk -F_ '$1 + 0 > 52' | sort
# output: <none>
createdb -T template0 baseline_0052_replay_20260905
psql -X -v ON_ERROR_STOP=1 -d baseline_0052_replay_20260905 \
  -f lib/db/migrations/0000_baseline.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > development-catalog.tsv
psql -X -v ON_ERROR_STOP=1 -At -d baseline_0052_replay_20260905 \
  -f scripts/schema-catalog-signature.sql > replay-catalog.tsv
diff -u development-catalog.tsv replay-catalog.tsv
dropdb baseline_0052_replay_20260905
```

The semantic diff was empty.

| Catalog object | Development | Fresh replay |
| --- | ---: | ---: |
| Public tables | 52 | 52 |
| Public columns | 685 | 685 |
| Public constraints | 165 | 165 |
| Public indexes | 170 | 170 |
| Non-internal triggers | 11 | 11 |
| Enum types | 31 | 31 |
| Enum labels | 132 | 132 |
| Public functions | 7 | 7 |
| Public sequences | 51 | 51 |

## Verification

Both Development and the fresh replay passed:

```text
DATABASE_URL="$DATABASE_URL" bash scripts/verify-production-schema.sh
DATABASE_URL="$FRESH_DATABASE_URL" bash scripts/verify-production-schema.sh
DATABASE_URL="$DATABASE_URL" bash scripts/assert-h4-schema-protections.sh
DATABASE_URL="$FRESH_DATABASE_URL" bash scripts/assert-h4-schema-protections.sh
```

The verifier passed accepted `52/685/165/170/11` catalog counts. The
occupancy-correction supplement table, nine expected columns, six expected
constraints, unique operation index, and immutable trigger all passed in both
catalogs. H4 raw-SQL protection assertions passed in both catalogs.

`BASELINE_MANIFEST.env` was updated only after successful replay, empty
semantic diff, and both verifier runs. `git diff --check` completed with no
output. No Production connection, publish, schema/data modification, `db:push`,
or Drizzle migration command was used.