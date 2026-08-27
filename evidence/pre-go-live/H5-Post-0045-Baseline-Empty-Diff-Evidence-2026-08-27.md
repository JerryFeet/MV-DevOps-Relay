# H5 — post-0045 baseline regeneration and empty-diff proof

**Date:** 2026-08-27  
**Environment:** Development/UAT only  
**Production:** Not accessed or changed

## Ordering

The exact `0045_portal_help.sql` migration was published to the evidence relay
and its SHA-256 was verified before it was applied to development:

`949266c835bc21aa37d807744abf487aefe38e44468445222b1260c969006219`

## Regenerated baseline

After applying the authorized migration, the canonical baseline was regenerated
from the development catalog with:

```text
pg_dump --schema-only --no-owner --no-privileges --schema=public
```

The PostgreSQL bootstrap-only `CREATE SCHEMA public` statement and its schema
comment were removed so the baseline can replay into a fresh database. No
application object DDL was edited.

| Fact | Result |
| --- | --- |
| Baseline artifact | `lib/db/migrations/0000_baseline.sql` |
| SHA-256 | `012552e9762a4e279a9e429d80985ee0fe2be452f1f57f298a198f702843360d` |
| Development tables | 45 |
| Development columns | 617 |
| Development constraints | 132 |
| Development indexes | 150 |
| Non-internal triggers | 3 |
| Enum types | 29 |
| Public functions | 3 |

## Fresh replay

A disposable PostgreSQL database created from `template0` was loaded only from
the regenerated `0000_baseline.sql`. The replay catalog was then compared with
development after removing dump comments, bootstrap schema metadata, and other
non-semantic dump framing.

| Result | Development | Fresh baseline replay |
| --- | ---: | ---: |
| Public tables | 45 | 45 |
| Public columns | 617 | 617 |
| Public constraints | 132 | 132 |
| Public indexes | 150 | 150 |
| Non-internal triggers | 3 | 3 |
| Enum types | 29 | 29 |
| Public functions | 3 | 3 |
| Normalized semantic diff | empty | empty |

The full semantic comparison covered table and column definitions, types,
nullability, defaults, identity/generated markers, constraints, indexes,
non-internal triggers, public functions, enum labels, and sequences. The
disposable replay database was removed after verification.

No production database access, deployment, automatic migration, `db:push`, or
`drizzle-kit migrate` command was used.