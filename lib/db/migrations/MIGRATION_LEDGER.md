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
  `0048_booking_allowance_and_unit_master_audit.sql`
- `2026-08-18-household-invitations.sql`

These files remain retained as auditable history. They must not be edited or
replayed after `0000_baseline.sql`.

## Development-to-production freeze rule

After a UAT rebuild, the development database is the authoritative schema input
for Replit Publish. Do not run `drizzle-kit push`, `db:push`, `push-force`, or
`drizzle-kit migrate` against it between that rebuild and Publish.

If a schema change is required during that window, create a reviewed,
forward-only numbered migration after `0000_baseline.sql`, apply and validate it
through the approved development process, regenerate the baseline, and repeat
the complete empty-database and semantic-diff proof before Publish. Do not add
database mutation commands to deployment build, pre-deploy, startup, or
post-merge hooks.

## Active forward migrations

None. The canonical baseline includes the PH1 Portal Help schema, tenant
identity fields, guardian-identifier marker/index, monthly booking allowance
ledger, append-only unit correction evidence, and active unit/facility booking
protections.

Any future schema change must add a new forward-only migration, record it in
this section, and be tested as:

```text
empty database → 0000_baseline.sql → active forward migrations → semantic catalog diff
```

Do not generate a replacement baseline from an already-migrated database
without repeating the full H5 empty-database and semantic-diff proof.