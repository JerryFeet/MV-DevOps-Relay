# Stage 6A — Planning Evidence Manifest

**Status:** Draft planning evidence only. No release-engine code, schema change,
fixture, migration, Clerk deletion, or deployment has been executed.

| File | SHA-256 | Purpose |
|---|---|---|
| `Stage-6A-Release-Engine-Build-Plan-2026-08-23-r1.md` | `69abe30c9d13c1b4cca3ca52c557dbb168bd8668ac8b35c86b0598a528f58d75` | Object-resolution contract, locking, dry run, postconditions, and approval gates. |
| `Stage-6A-Proposed-FK-and-Bookings-Unit-Migration-2026-08-23-r1.sql` | `4ceac91b502c0b68eb214f089391d901b4b153e403285c5a22103ca8c1996268` | Proposed, unexecuted FK and `bookings.unit_id` SQL. |
| `Stage-6A-Seeded-Fixtures-and-Rollback-Test-Plan-2026-08-23-r1.md` | `3576595c199030277ff3356b7e555321245b50c0ac54c053039ae10ec0247568` | Migration fixtures, dry-run parity, concurrency, and induced-rollback proof plan. |

## Review boundary

Approval is required before the release engine, fixture rows, migration files, or
any database operation are implemented. Stage 6B, Stage 6C, and deployment are
explicitly out of scope.
