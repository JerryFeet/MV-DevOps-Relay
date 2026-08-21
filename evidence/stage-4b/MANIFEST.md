# Stage 4b r4 — Evidence Manifest
Generated: 2026-08-21

| File | Description | Lines |
|------|-------------|-------|
| `stage4b-r4-status.md` | Full status report — r4 Δ summary, named skipped-test list, seeded E2E results, tenant J5 coverage statement, H4 pagination work | — |
| `stage4b-r4-schema-only.sql` | Genuine `pg_dump --schema-only` against the development database (PostgreSQL 16.10). 28 ENUMs, 2 trigger functions, 33 tables. | 3165 |
| `stage4b-r4-rollback.sql` | Rollback for migration 0028 (identical to r3 rollback — r4 is evidence-only). | 65 |
| `MANIFEST.md` | This file. | — |

## How to verify the schema dump

```bash
# Confirm the dump is a genuine pg_dump header (not hand-written):
head -6 stage4b-r4-schema-only.sql
# Expected: "-- Dumped from database version 16.10" and "-- Dumped by pg_dump version 16.10"

# Confirm the cascade trigger function is present:
grep "cascade_folder_visibility_floor" stage4b-r4-schema-only.sql
# Expected: CREATE FUNCTION and CREATE TRIGGER lines

# Confirm the visibility floor guard is also present:
grep "enforce_document_visibility_floor" stage4b-r4-schema-only.sql
```

## r3 companion files

The r3 directory (`stage4b-delivery-2026-08-21-r3/`) is retained unchanged.
`stage4b-r3-schema-snapshot.sql` (hand-written migration SQL) is a companion to
this genuine dump — both describe the same schema state; the pg_dump is authoritative.
