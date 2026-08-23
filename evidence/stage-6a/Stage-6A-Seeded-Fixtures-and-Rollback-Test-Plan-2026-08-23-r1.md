# Stage 6A — Seeded Fixtures and Induced-Failure Test Plan

**Status:** Draft for review — fixture rows and failure injection have not been created.  
**Purpose:** Prove that the planned FK migrations preserve valid records, the
release engine is serial and idempotent, and any mid-transaction failure restores
every touched database row.

## 1. Fixture isolation

Fixtures will be inserted in a dedicated development-only test transaction with
a `S6A-FIXTURE-` prefix in human-readable fields and a fixed ID map captured by
the test harness. They must never run against production data.

Every fixture test captures before/after counts for:

- residents;
- vehicles;
- Waha applications and credentials;
- future, past, and cancelled bookings;
- permits;
- communications;
- Guest Day Passes;
- payment attempts;
- release operation audits;
- external identity-deletion jobs; and
- Waha credential event audits.

The test harness records primary-key sets, not only counts, so an incorrect row
replacement cannot satisfy a count-only assertion.

## 2. Migration fixture set

| Fixture | Seed shape | Expected result after proposed batch |
|---|---|---|
| M1 — valid owner/tenant graph | One unit, one verified owner, one verified tenant, residents, vehicle, permit, booking, Waha application/credential, token, preference, verification, and rate-limit attempt. | All valid rows survive; new FKs validate. |
| M2 — deleted-user historic graph | No parent user; booking, permit, vehicle, verification, and Waha application retain the former numeric ID; token/preference rows use that ID. | Batch 1 deletes only token/preference rows. Batch 2 makes permitted user references `NULL`. Batch 3 nulls booking user ID while retaining a unit anchor when recoverable. |
| M3 — ownerless unit | A unit with no owner, a current tenant, tenant booking, permit, vehicle, and verification. | Unit and tenant records survive; nullable owner references remain `NULL`; no accidental `RESTRICT` failure. |
| M4 — tenantless unit | A unit with a verified owner and no tenant. | Nullable tenant references remain `NULL`; valid owner records survive. |
| M5 — unrecoverable historic booking | Booking’s user is already absent and no `unit_id` can be backfilled. | `bookings.unit_id` remains `NULL`; `bookings.user_id` becomes `NULL`; booking and facility snapshot survive. |
| M6 — bad protected reference | A deliberately orphaned `bookings.facility_id` or `residents.unit_id` in an isolated schema fixture. | The applicable RESTRICT batch aborts, no partial constraint is committed, and the captured count set is unchanged. |
| M7 — rate-limit primary-key blocker | Orphaned `unit_verification_owner_id_attempts.user_id`. | The proposed SQL must stop at its documented review gate; no attempt is made to null a primary-key column. |

M6 and M7 use an isolated disposable database/schema because current development
data must never be deliberately corrupted.

## 3. Release-engine fixture set

### F1 — Tenant terminal release

Seed one unit with a verified owner and verified tenant, two active tenant
residents, an active tenant Waha application with two active credentials, one
future booking, one past booking, one already-cancelled future booking, a permit,
a vehicle, a guest/pass chain registered by the tenant, a Day Pass, and the
canonical terminal trigger.

Expected committed changes:

- tenant linkage cleared and unit remains `owner_occupied`;
- two residents become `moved_out`;
- both credentials and their application are revoked;
- only the one active future booking is cancelled;
- past and already-cancelled bookings preserve their existing state;
- PII scrub fields are null/replaced exactly once;
- one release operation and one external identity-deletion job are created;
- no owner row, owner booking, owner vehicle, or owner credential changes.

### F2 — Owner terminal release with tenant preservation

Seed one unit with verified owner and tenant, an owner self-stub resident, tenant
and owner bookings, separate owner/tenant Waha tracks, owner vehicle/permit, and
tenant household/vehicle data.

Expected committed changes:

- owner linkage cleared while unit remains `tenant_occupied`;
- Path A has no pre-approved claim; Path B retains the reviewed event ID;
- only the owner self-stub becomes `moved_out`;
- only the owner Waha application/credentials and owner future bookings change;
- tenant residents, credentials, vehicle, verification, parking, and bookings
  are byte-for-byte unchanged;
- owner PII scrub/deletion effects and audit/job occur exactly once.

### F3 — Already-ended idempotency

Run F1 or F2 successfully, then issue the same canonical idempotency key again.

Expected:

- response is `already_ended`;
- no new Waha events, operation audit, deletion job, or cancellation is added;
- all primary-key sets and mutation timestamps remain unchanged.

### F4 — Concurrent terminal operations

Start two independent connections against the same fixture unit:

1. send the same terminal request from both connections; then
2. race owner and tenant terminal requests on the same unit.

Expected:

- the unit advisory lock serializes both operations;
- exactly one matching release operation exists per canonical key;
- repeated matching call is `already_ended`;
- cross-occupancy request re-resolves after the first transaction and does not
  apply a stale graph;
- neither connection returns a generic 500/deadlock response.

## 4. Dry-run parity test

For F1 and F2:

1. call `releaseSubject(..., dryRun: true)`;
2. snapshot all fixture table primary keys and values;
3. prove the snapshot is unchanged;
4. call the real operation on an identical fixture;
5. compare resolved IDs, planned action names, counts, terminal marker, and
   assertion IDs between dry run and real run.

Any difference is a test failure. A dry run must not create audit rows, jobs,
notifications, Clerk calls, or mutation timestamps.

## 5. Induced mid-transaction failure test

The engine has a test-only fault seam after booking cancellation and before:

- user PII scrub/deletion;
- terminal trigger marker;
- release operation audit; and
- external identity-deletion job insertion.

The test injects `STAGE6A_TEST_FAIL_AFTER_BOOKING_CANCELLATION` at that exact
point. It then asserts:

| Record category | Required state after injected failure |
|---|---|
| Unit linkage/occupant type | Identical to before snapshot |
| Waha applications/credentials/events | Identical to before snapshot; no new revocation event |
| Residents | Identical to before snapshot |
| Bookings | Future booking restored to original status; past/cancelled rows unchanged |
| Permits, vehicles, guests, guest passes | No PII scrub has persisted |
| User row | Still exists |
| Trigger row | No terminal marker/status transition |
| Release operation audit | No row |
| External identity-deletion job | No row |
| Clerk client | Not called |

The test passes only if every category matches the before snapshot exactly. It is
not enough that the API returns an error.

## 6. Evidence to publish after implementation

After approval and implementation, Stage 6A will publish individual files:

1. fixture before/after primary-key and count report;
2. FK batch execution and rollback report;
3. dry-run parity report;
4. induced-failure rollback report;
5. concurrency/idempotency report;
6. API unit-test and typecheck reports; and
7. a SHA-256 manifest covering each file.

No evidence in this draft claims that migrations, fixtures, or release behavior
has been executed.
