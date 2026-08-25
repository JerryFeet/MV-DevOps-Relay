# Schema migration ledger

## Fresh database rule

A fresh HOA Portal database is built by applying:

1. `0000_baseline.sql`
2. Only migrations explicitly recorded below as **active forward migrations**

The baseline is a schema-only PostgreSQL catalog capture. It includes the
complete UAT schema, including PostgreSQL-only functions, triggers, predicate
indexes, checks, foreign keys, enum values, and other database objects that
must exist before application data is seeded.

## Historical migrations

The following files are historical evolution of the pre-baseline development
database. They are **not** replay inputs for a fresh database, because the
baseline already contains their resulting schema:

- `0001_payment_provider_agnostic.sql` through
  `0038_task1_announcement_visibility.sql`
- `2026-08-18-household-invitations.sql`

These files remain retained as auditable history. They must not be edited or
replayed after `0000_baseline.sql`.

## Active forward migrations

None at baseline establishment.

Any future schema change must add a new forward-only migration, record it in
this section, and be tested as:

```text
empty database → 0000_baseline.sql → active forward migrations → semantic catalog diff
```

Do not generate a replacement baseline from an already-migrated database
without repeating the full H5 empty-database and semantic-diff proof.