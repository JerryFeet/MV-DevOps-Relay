# Development baseline continuity — migration 0053 occupancy invariant

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed.

Migration `0053_occupancy_track_constraint_triggers.sql` was already applied to
clean Development. No Development application data was mutated by this proof.

## Baseline capture

```text
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public
```

Only the dump's `CREATE SCHEMA public` bootstrap statement and associated
comment framing were removed. The resulting baseline was byte-identical to that
sanitized capture.

| Artifact | SHA-256 |
| --- | --- |
| `lib/db/migrations/0000_baseline.sql` | `90bc5f80007de8cb2fb8e0961be7d1934ef5135b367afc0ee4d92690906cf4b1` |
| Development semantic catalog | `37d6e6f967969c0403e3abee1517e1aeca62485ee58dff2fb8d1393d9ece228c` |
| Replay semantic catalog | `37d6e6f967969c0403e3abee1517e1aeca62485ee58dff2fb8d1393d9ece228c` |
| `scripts/verify-production-schema.sh` | `ce8be21d420b777f5521eab1b5c9e11b314e98019dae1895e5d8c946522e7360` |

## Declared-contract replay

A disposable database was created from `template0`, the baseline was applied,
then only numbered migrations greater than `INCLUDED_THROUGH=0053` were
enumerated for application. Enumeration returned exactly:

```text
forward-migrations-after-0053=<none>
```

The commands were:

```text
createdb -T template0 baseline_0053_replay_20260905
psql -X -v ON_ERROR_STOP=1 -d baseline_0053_replay_20260905 \
  -f lib/db/migrations/0000_baseline.sql
find lib/db/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' \
  -printf '%f\n' | awk -F_ '$1 + 0 > 53' | sort
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > development-catalog.tsv
psql "$FRESH_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/schema-catalog-signature.sql > replay-catalog.tsv
diff -u development-catalog.tsv replay-catalog.tsv
dropdb baseline_0053_replay_20260905
```

The semantic catalog diff was empty. Both Development and replay passed the
catalog verifier and H4 raw-protection assertions.

| Catalog object | Development | Fresh replay |
| --- | ---: | ---: |
| Public tables | 52 | 52 |
| Public columns | 685 | 685 |
| Public constraints | 167 | 167 |
| Public indexes | 170 | 170 |
| Non-internal triggers | 13 | 13 |
| Enum types | 31 | 31 |
| Enum labels | 132 | 132 |
| Public functions | 10 | 10 |
| Public sequences | 51 | 51 |

The verifier explicitly found all three occupancy-track functions and both
deferrable constraint triggers. `BASELINE_MANIFEST.env` was updated only after
the successful replay, empty diff, and verifier/H4 runs. No Production
connection or mutation was used.