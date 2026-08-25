# H5 — Empty-database migration replay finding

**Date:** 2026-08-25  
**Scope:** Task 2 / H5  
**Environment:** isolated development PostgreSQL database  
**Production, deployment, live payment testing, H6, and H7–H9:** not performed

## Result: blocked — numbered migration chain is not self-bootstrapping

The required replay used a newly created empty PostgreSQL database and applied
only numbered migrations `0001` through `0037`, in lexical order, with
`psql -v ON_ERROR_STOP=1`.

Replay stopped on the first file:

```text
lib/db/migrations/0001_payment_provider_agnostic.sql
ERROR: relation "bookings" does not exist
```

`0001` begins by altering and updating `bookings`; it does not create that
table. The first numbered file that contains a `CREATE TABLE` statement is
`0003`, and it only creates `notification_preferences`. The numbered chain
therefore depends on an unpublished/unversioned base schema that is not
established by `0001`–`0037`.

## Semantic schema-diff result

The replay cannot reach a final schema, so there is no valid “fresh UAT
schema” to compare with the current UAT schema. The semantic diff is
non-empty and is recorded in
`H5-Semantic-Schema-Diff-2026-08-25-r1.txt`.

At the replay stop point:

| Catalog object | Current UAT schema | Empty replay database |
| --- | ---: | ---: |
| Public tables | 41 | 0 |
| Columns | 563 | 0 |
| Constraints | 107 | 0 |
| Indexes | 137 | not reached |
| User triggers | 3 | not reached |

This is a release-blocking finding, not a successful proof that the
repository can construct the UAT schema from an empty database.

## Safety boundaries honored

- The isolated replay database was dropped after inspection.
- No development UAT tables or data were changed.
- The numbered migrations were not edited.
- The deleted Drizzle full-schema baseline was not recreated or used as a
  bootstrap.
- No attempt was made to create a replacement bootstrap from the current UAT
  schema, because that would hide the missing-history finding.

## Required resolution before H5 can pass

Create and review an authoritative, forward-only bootstrap/ledger strategy
that is itself committed to the repository. Then rerun a genuinely empty
database replay using the approved migration chain and compare normalized
PostgreSQL catalogs. Only an empty semantic diff against current UAT proves
the repository can build the target schema.

## Related H4 confirmation

The H4 PostgreSQL catalog assertion is now a configured CI validation named
`h4-schema-integrity`. It passed after registration.

The document-folder foreign key is explicitly declared as `ON DELETE NO
ACTION`: it intentionally blocks deletion of a folder that still has
documents, and the release engine never deletes document folders.