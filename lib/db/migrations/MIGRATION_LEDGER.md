# Schema migration ledger

## Fresh database rule

A fresh HOA Portal database is built by applying:

1. `0000_baseline.sql`
2. Only numbered migration files whose number is greater than
   `INCLUDED_THROUGH` in `BASELINE_MANIFEST.env`.

The baseline is a schema-only PostgreSQL catalog capture. It includes every
numbered migration through `INCLUDED_THROUGH`, including PostgreSQL-only
functions, triggers, predicate indexes, checks, foreign keys, enum values, and
other database objects that must exist before application data is seeded.

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

## Forward migration history

`0049_occupancy_core.sql` — explicit primary residents, fifth-resident HOA
requests, and append-only secondary-removal operations.

`0050_move_out_canonical_unit.sql` — canonical unit identity for move-out forms
and release-operation support for the shared household move-out path.

`0051_w14_occupancy_correction_operations.sql` — immutable, idempotent evidence
for approved controlled occupancy corrections. The W14 data correction is
executed separately in its dedicated locked transaction after preflight.

`0052_occupancy_correction_operation_supplements.sql` — immutable final-state
supplements for historical occupancy corrections whose original operation row
must remain untouched. Applied in Development and included through baseline
0052; the baseline-only template0 replay and semantic catalog comparison passed
on 2026-09-05.

`0053_occupancy_track_constraint_triggers.sql` — deferrable database backstop
requiring active owner/tenant resident tracks to agree with canonical unit
occupancy. Applied in Development and included through baseline 0053; the
baseline-only template0 replay and semantic catalog comparison passed on
2026-09-05.

`0054_occupancy_unit_insert_constraint_trigger.sql` — forward-only extension
of the 0053 unit constraint trigger to occupied unit INSERTs as well as UPDATEs;
it preserves the stable trigger and enforcement-function identities. Applied
in Development and included through baseline 0054; the baseline-only template0
replay and semantic catalog comparison passed on 2026-09-05.

The canonical baseline includes the PH1 Portal Help schema, tenant
identity fields, guardian-identifier marker/index, monthly booking allowance
ledger, append-only unit correction evidence, and active unit/facility booking
protections.

Any future schema change must add a new forward-only migration, record it in
this section, and be tested as:

```text
empty database → 0000_baseline.sql → migrations numbered greater than INCLUDED_THROUGH → semantic catalog diff
```

Do not generate a replacement baseline from an already-migrated database
without repeating the full H5 empty-database and semantic-diff proof.
After a baseline regeneration, migrations included through its updated
`INCLUDED_THROUGH` value (including 0051 through 0054 when applicable) are not
replayed as active migrations.