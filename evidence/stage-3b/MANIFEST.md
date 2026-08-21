# Stage 3b — Evidence MANIFEST
Generated: 2026-08-21 (r2 — addresses all r1 review blockers)

| File | Description | Blob SHA |
|---|---|---|
| stage3b-status.md | r1 status report (archived; see r2) | a0690f40f7 |
| stage3b-status-r2.md | r2 full status: suites, migration, pg_dump, G1–G6 test map, payment finding | 461846c258 |
| 0029_remove_supervisor_role.sql | Migration SQL: 6-step user_role enum rebuild (renamed from 0020) | afedc60461 |
| pg_dump_user_role.md | pg_dump --schema-only for user_role — confirms enum = {owner,tenant,admin,guard} | 754c9058bf |

## r2 Summary

All five r1 reviewer blockers addressed:

1. **Full suites run**: API 1272/1272 (76 files), portal 1358/1358 (60 files), mobile 405/405 (16 files), E2E 81 passed / 6 skipped / 0 failed.
2. **Migration collision resolved**: 0020_remove_supervisor_role renamed to 0029. Full ordered list 0001–0029 verified, no other collisions.
3. **Migration SQL + pg_dump published**: See `0029_remove_supervisor_role.sql` and `pg_dump_user_role.md`. Enum confirmed = {owner, tenant, admin, guard}.
4. **G6 payment regression**: No automated test coverage exists for `/waha-pass/:id/replacement-pay` or Guest Day Pass payment paths (PaymentService stubbed null in all tests). Finding documented; deferred to consolidated UAT round.
5. **G1–G6 per-test references**: Full table with file + line + assertion published in `stage3b-status-r2.md` §5.

## E2E note

The supervisor E2E spec was converted to `test.skip` (X6: supervisor no longer in `user_role` enum; `setUserRoleByEmail("supervisor")` would throw a DB enum-cast error). Coverage equivalent confirmed by owner/tenant/guard redirect specs.
