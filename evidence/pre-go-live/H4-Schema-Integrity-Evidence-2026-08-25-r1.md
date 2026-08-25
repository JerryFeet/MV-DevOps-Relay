# H4 — Schema integrity reconciliation evidence

**Date:** 2026-08-25  
**Scope:** Task 2 / H4 only  
**Environment:** development database only  
**Production, deployment, H5 empty-database replay, and payment testing:** not performed

## Result

H4 is complete. Drizzle now declares the Stage 6A release-engine foreign keys
and their database delete policies, while PostgreSQL-only protections remain
forward-migration-owned and are verified directly from the database catalog.

## Declarative reconciliation

Added Drizzle foreign-key declarations for the 23 protections introduced by
the Stage 6A release work:

- `CASCADE`: `push_tokens.user_id`, `notification_preferences.user_id`.
- `SET NULL`: unit verified occupants; resident user links; Waha credential
  holder; permits, vehicles, unit verifications, owner-ID attempts, Waha
  applicant, payment attempt, and guest-day-pass user links; booking user.
- `RESTRICT`: resident, vehicle, permit, unit-verification, Waha-application,
  and booking unit links; booking facility; external identity-deletion job
  release-operation link.

The database catalog assertion inserted and checked all **23** expected
foreign keys, including their `ON DELETE` behavior, and passed.

## Raw-SQL-only protection register

The following remain deliberately outside Drizzle because they rely on
PostgreSQL predicate/expression DDL or PL/pgSQL trigger behavior:

1. `users_staff_unitless_check`
2. `units_system_unit_identity_check`
3. `units_one_system_unit` partial unique index
4. `protect_hoa_common_system_unit()` function
5. `protect_hoa_common_system_unit_trigger`

Their owners, reasons, and verification command are documented in
`lib/db/RAW_SQL_PROTECTIONS.md`. The repeatable
`scripts/assert-h4-schema-protections.sh` assertion checks their presence in
addition to the 23 foreign keys. It passed against the development database.

## Drizzle generation inspection

`drizzle-kit generate --config drizzle.config.ts --name
h4-declare-release-protections` completed successfully.

- Generated SQL path:
  `lib/db/drizzle/0000_h4-declare-release-protections.sql`
- Generated statements: 175
- Generated `ALTER TABLE ... ADD CONSTRAINT` foreign keys: 24
  (23 H4 declarations plus the already-declared document-folder FK)
- `DROP`, `DROP CONSTRAINT`, and `DROP INDEX` statements: **0**

Important: because the repository does not contain prior Drizzle snapshot
history or a migration ledger, this generation is a complete baseline schema
file rather than an incremental migration. It was inspected and retained as
evidence only; it was **not applied**. H5 must establish the required
empty-database replay and semantic schema-diff process before any migration
ledger decision.

## Validation executed

```text
bash scripts/assert-h4-schema-protections.sh
  INSERT 0 23
  H4 schema protection catalog assertions passed

pnpm --filter @workspace/db exec tsc -p tsconfig.json --noEmit
  passed

pnpm --filter @workspace/api-server run typecheck
  passed

git diff --check
  passed
```

## Boundary confirmation

No database migration was applied. No destructive schema change was generated.
No H5 replay, H6 enum cleanup, H7–H9 hardening, deployment, production
access, or live payment transaction was started.