# Stage 6A corrective acceptance evidence

**Scope:** Stage 6A release substrate and its accepted corrective work only. No deployment was performed. Stage 6B and Stage 6C were not started.

## Delivered correction

1. `releaseSubject` now resolves every booking owned by the departing subject and records its IDs in the shared dry-run/real execution graph.
2. New release postcondition **A8** aborts and rolls back the release if any booking in that subject graph would finish with both `user_id` and `unit_id` absent.
3. New bookings require a durable unit anchor at both layers:
   - `POST /api/bookings` returns `422 BOOKING_UNIT_REQUIRED` for any unlinked caller, including an admin.
   - `bookings.unit_id` is now PostgreSQL `NOT NULL`.
4. `release_operations.outcome` is documented as completed-operations-only; failed releases roll back and therefore do not produce an alternate outcome row.

## Why the two historical bookings were deleted rather than backfilled

The development rows were unpaid admin-created test data. Their owner (`users.id = 6`) had `users.unit_id IS NULL`, so no truthful household anchor existed. The approved remediation deleted exactly IDs `34` and `41`, under a transaction guard requiring:

| Check | Before | After |
| --- | ---: | ---: |
| Approved matching unpaid/unanchored test rows | 2 | 0 |
| All bookings with `unit_id IS NULL` | 2 | 0 |

The remediation source is published separately:

- `evidence/stage-6a/Stage-6A-Development-Unanchored-Booking-Remediation-2026-08-23-r1.sql`

## Published-before-apply corrective migration

The exact final migration was published and byte-verified on GitHub before application:

- `lib/db/migrations/0034_stage6a_booking_unit_anchor_enforcement.sql`
- Git blob: `c132f7f82a468175a19f8e138e88072ec42a8289`

It first refuses any remaining `bookings.unit_id IS NULL`, then applies `ALTER TABLE bookings ALTER COLUMN unit_id SET NOT NULL` and the completed-operations comment. It applied successfully after the guarded remediation.

Post-apply database proof:

| Proof | Result |
| --- | --- |
| `information_schema.bookings.unit_id.is_nullable` | `NO` |
| Count of persisted unanchored bookings | `0` |
| Direct attempted insert with `unit_id = NULL` | rejected with PostgreSQL `NOT NULL`, inside a rolled-back probe |
| `release_operations.outcome` comment | `Completed operations only: failed releases roll back and are represented by no row.` |

## Rolled-back qualifying migration fixture

The fixture is published separately and uses only temporary tables. It ends in `ROLLBACK`.

- `evidence/stage-6a/Stage-6A-Migration-Qualifying-Fixture-2026-08-23-r1.sql`
- Git blob: `b2c81ecfb7f641a88945b5ccd9b02b457031d268`

Recorded execution transcript:

| Fixture branch | Before | After | Result |
| --- | ---: | ---: | --- |
| `payment_attempts.user_id` orphan `SET NULL` | 1 | 0 | cleared only the orphaned reference |
| `bookings.unit_id` RESTRICT pre-check | 1 | 1 | blocked with exact `Stage 6A Batch 3` exception |
| `waha_pass_applications.unit_id` RESTRICT pre-check | 1 | 1 | blocked with exact `Stage 6A Batch 2` exception |

The two RESTRICT branches are caught only by the fixture to record both outcomes in one rollback-only run. In the published migration, the same exceptions are unhandled and abort the migration transaction before constraint changes can proceed.

## Focused Stage 6A test evidence

The original seven release/identity-worker assertions are all named below; the new A8 rollback assertion makes eight focused Stage 6A tests total.

| Test | What it proves |
| --- | --- |
| `uses the exact real-release graph for dry runs while mutating nothing` | A dry run leaves stores untouched, then a real run has the same kind, unit, subject, trigger, affected IDs, and paid Day Pass totals. |
| `serializes concurrent terminal requests and returns already_ended without repeated effects` | Two concurrent terminal calls produce exactly one `released` and one explicit `already_ended`, with one operation and one Clerk-deletion job. |
| `keeps tenant records outside an owner release graph` | Owner release isolation preserves tenant/family residents, credentials, bookings, and vehicles. |
| `rolls back every mutation when a postcondition is induced to fail` | A postcondition error leaves release mutations, the completed operation, and the deletion job absent. |
| `rolls back when a released booking would lose its final unit attribution` | A8 rejects an unanchored retained booking and rolls back the user release. |
| `completes a claimed Clerk deletion` | The durable outbox worker completes normal external deletion. |
| `treats an already-absent Clerk identity as idempotent completion` | Clerk `404` is an idempotent success, not a retry failure. |
| `moves a repeatedly failing job into the admin-visible failed state` | Repeated worker errors become a visible terminal failure. |

Supporting booking-boundary coverage:

| Test | What it proves |
| --- | --- |
| `ADV-3a: an unlinked admin cannot create an unattributable booking` | The API returns `422 BOOKING_UNIT_REQUIRED` before a booking is inserted. |
| `linked admin can book a facility via the wizard and cancel from My Bookings` | Portal E2E uses an admin test account with a truthful E2E unit anchor; it creates a confirmed, waived booking and cancels it through the UI. |

## Validation results

| Validation | Result |
| --- | --- |
| Focused API suites: release engine, Clerk deletion worker, booking advance guard | 3 files, 15 passed |
| Full API regression suite | 91 files, 1,448 passed |
| API type check | passed |
| Database TypeScript check | passed |
| API production build | passed |
| Corrected facility E2E slice | 8 passed, 1 skipped |
| Full portal E2E | 76 passed, 6 skipped |
| API health after restart | `{"status":"ok"}` |
| API schedulers after restart | move-out, ownership-change, notification dispatch, and external identity deletion scheduler started cleanly |

The unrelated missing Moyasar secret warning remains fail-closed and was not changed.