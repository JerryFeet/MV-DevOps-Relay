# Development baseline continuity — migration 0054 occupancy insert protection

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed.

Migration `0054_occupancy_unit_insert_constraint_trigger.sql` was already
applied in clean Development. This proof did not mutate Development data.

## Baseline capture

```text
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public
```

Only the dump's `CREATE SCHEMA public` bootstrap statement and associated
comment framing were removed. The checked-in baseline was byte-identical to
that sanitized capture. It records
`trg_units_occupancy_track_consistency` as a deferrable constraint trigger
firing `AFTER INSERT OR UPDATE`.

| Artifact | SHA-256 |
| --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `6a93eae5c8ef604011ecef0d5212ed2292e2eb6dfa0a6877340d5a4c5da3c149` |
| Development semantic catalog | `6f542fad37d90e19045552f5791a767bdefbd9d6e979ad105c94e4efe369d656` |
| Replay semantic catalog | `6f542fad37d90e19045552f5791a767bdefbd9d6e979ad105c94e4efe369d656` |
| `scripts/verify-production-schema.sh` | `9bb021b1d500956ab096a8aed2c2389daea6a9c5f5f795c241b8bb2d3dbb2e44` |

## Declared-contract replay

A fresh disposable `template0` database was loaded from the baseline.
Numbered migration files greater than `INCLUDED_THROUGH=0054` were then
enumerated for application. The exact enumeration result was:

```text
forward-migrations-after-0054=<none>
```

```text
createdb -T template0 baseline_0054_replay_20260905
psql -X -v ON_ERROR_STOP=1 -d baseline_0054_replay_20260905 \
  -f lib/db/migrations/0000_baseline.sql
find lib/db/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' \
  -printf '%f\n' | awk -F_ '$1 + 0 > 54' | sort
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > development-catalog.tsv
psql "$FRESH_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > replay-catalog.tsv
diff -u development-catalog.tsv replay-catalog.tsv
dropdb baseline_0054_replay_20260905
```

The semantic catalog diff was empty. Both Development and replay passed the
schema verifier and H4 raw-protection assertions, including the exact units
trigger event and deferred properties.

| Catalog object | Development | Fresh replay |
| --- | ---: | ---: |
| Public tables | 52 | 52 |
| Public columns | 685 | 685 |
| Public constraints | 167 | 167 |
| Public indexes | 170 | 170 |
| Non-internal triggers | 13 | 13 |
| Public functions | 10 | 10 |
| Public sequences | 51 | 51 |

`BASELINE_MANIFEST.env` was updated only after replay, empty semantic diff, and
both verifier/H4 runs succeeded. No Production connection or data/schema
mutation was used.