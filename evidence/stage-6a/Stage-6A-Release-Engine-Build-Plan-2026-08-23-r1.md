# Stage 6A — Release Engine and Data-Integrity Build Plan

**Status:** Draft for review — **not approved for implementation or execution**  
**Scope:** Stage 6A only. This plan deliberately excludes the T13 resident/admin flow and scheduler (6B), T14 lifecycle policy/UI (6B), and O1–O7 ownership-change UI/workflow (6C).  
**Deployment:** Prohibited. No migration in this package has been applied.

## 1. Purpose and review gates

Stage 6A supplies one transaction-safe, dry-run-capable release substrate. Later
stages may invoke it, but they may not independently archive, revoke, cancel,
anonymise, or delete the same subject graph.

The implementation may begin only after approval of all three artifacts in this
directory:

1. this release-engine contract;
2. the proposed FK and `bookings.unit_id` migration SQL; and
3. the seeded-fixture and induced-failure test plan.

### Mandatory decisions for review

| ID | Decision needed before implementation | Why it is a gate |
|---|---|---|
| R1 | Approve the operation audit/outbox model proposed in §6. | PostgreSQL work can be atomic; Clerk identity deletion cannot. A durable post-commit job is required so the engine never reports a fully rolled-back release after deleting an external identity. |
| R2 | Approve the Day Pass/payment reference policy in §8. | Current account deletion leaves `waha_guest_day_passes.purchased_by_user_id` and `payment_attempts.user_id` as dangling references. D2 does not include them, but the engine contract cannot silently leave them ungoverned. |
| R3 | Approve the existing resident-state mapping in §4. | The database has `active`, `inactive`, and `moved_out`; it has no `archived` enum value. In this contract, “archive a resident” means `status = 'moved_out'`. |
| R4 | Approve the migration order in §9. | `bookings.unit_id` write support and nullable read guards must ship before `bookings.user_id` can be changed to `ON DELETE SET NULL`. |
| R5 | Approve the rate-limit table key migration in §9. | `unit_verification_owner_id_attempts.user_id` is part of its composite primary key, so it cannot be made nullable until a surrogate primary key and a partial `(user_id, unit_key)` uniqueness rule replace the present key. |

If any gate is rejected, implementation stops and this document is revised before
source, schema, or fixture data is changed.

---

## 2. Public release-engine contract

The engine will be a server-only API with no HTTP route of its own:

```ts
releaseSubject({
  kind: "tenant" | "owner",
  unitId: number,
  subjectUserId: number,
  trigger: {
    type: "move_out_form" | "tenancy_expiry" | "ownership_change",
    id: number,
    idempotencyKey: string,
  },
  actorUserId: number,
  dryRun: boolean,
}): Promise<ReleaseResult>
```

`idempotencyKey` is mandatory and canonical:

| Caller | Future owning stage | Key |
|---|---|---|
| T13 approved move-out | 6B | `t13:move-out-form:<move_form_id>` |
| T14 delayed deletion | 6B | `t14:tenancy-expiry:<tenancy-lifecycle-record-id>` |
| O3 approved ownership release | 6C | `o3:ownership-change:<ownership_change_event_id>` |

The engine validates that the trigger, unit, and subject agree before it creates
or changes anything. A trigger that does not resolve to the requested subject is
an invalid request, not a no-op.

### Result types

| Result | Meaning |
|---|---|
| `planned` | Dry run only. Resolution and postcondition simulation passed; no application row, audit row, or external job was written. |
| `released` | The release transaction committed, with an immutable operation audit and a pending external identity-deletion job if a Clerk ID existed. |
| `already_ended` | A committed release audit exists for the same canonical idempotency key, or the locked trigger already records the matching terminal marker. No cascade is repeated. |
| `invalid_subject` | The locked unit/trigger no longer identifies the requested owner or tenant. No cascade is attempted. |
| `precondition_failed` | A required row, lifecycle state, or migration invariant is absent. No cascade is attempted. |

The engine must never return success merely because a target user row no longer
exists. It returns `already_ended` only after verifying the committed operation
audit and postconditions; otherwise it returns `precondition_failed`.

---

## 3. Exact resolution and mutation contract

Resolution produces a `ReleasePlan` before any mutation. It contains ordered
primary-key lists, the action for each list, the intended terminal marker, and
the expected postconditions. Both dry-run and real execution use this exact
function; the executor must accept only its output.

### 3.1 Common rows, in exact order

| Order | Table and selected rows | Action for tenant release (T13/T14 deletion) | Action for owner release (O3) |
|---:|---|---|---|
| 1 | `units`: exactly `units.id = input.unitId` | Retain; set `verified_tenant_id = NULL`; set `occupant_type = 'owner_occupied'` when a verified owner remains, otherwise `'vacant'`. | Retain; set `verified_owner_id = NULL`; set `occupant_type = 'tenant_occupied'` when a verified tenant remains, otherwise `'vacant'`; set `pre_approved_claim_id` to the approved Path B event only, otherwise `NULL`. |
| 2 | Terminal trigger: one `move_forms` row, one future tenancy-lifecycle row, or one `ownership_change_events` row | Retain; stamp the future 6B terminal marker only after all release effects pass. Existing T13 marker is `move_forms.revocation_processed_at`; status becomes `completed`. | Retain; record the O3 terminal state only after all release effects pass. Existing O3 event continues to retain its evidence fields; `outgoing_owner_id` becomes `NULL` after deletion. |
| 3 | `users`: exactly the locked departing user | PII is anonymised in dependent records; then the PostgreSQL user row is deleted. | Same. |
| 4 | `waha_pass_applications`: active rows for the release unit and released occupancy track | Retain; change `status` from `active` to `revoked`. | Retain; change `status` from `active` to `revoked` for the outgoing owner’s track only; a tenant track is not touched. |
| 5 | `waha_pass_credentials`: active credentials belonging to resolved applications | Retain; set `status = 'revoked'`, `revocation_reason` to the stable terminal reason, and `revoked_at` to the transaction timestamp. | Same. |
| 6 | `waha_pass_events`: one new row per revoked credential | Append an immutable `revoked` event with actor, trigger, and stable reason. Never delete existing events. | Same. |
| 7 | `residents`: active residents for the unit | Retain; set all active unit residents to `status = 'moved_out'` (the actual archived state). | Retain only the departing owner’s active self-stub, identified by `linked_user_id = subjectUserId`; set it to `moved_out`. Tenant and family resident rows remain unchanged. |
| 8 | `bookings`: rows for the departing user with `start_time > transaction_now` and non-cancelled status | Retain; set `status = 'cancelled'`. Past, in-progress, completed, and already-cancelled bookings are unchanged. | Same, but only the outgoing owner’s bookings. Tenant bookings remain unchanged. |
| 9 | `permits`: all rows with `user_id = subjectUserId` | Retain; anonymise the current contract’s contact/description fields. The FK migration subsequently nulls `user_id`. | Same. |
| 10 | `vehicles`: all rows with `user_id = subjectUserId` | Retain; anonymise `istimara_number`. The FK migration subsequently nulls `user_id`. | Same. |
| 11 | `residents → guests → guest_passes`: residents registered by the departing user, their guests, and their guest passes | Retain; anonymise guest and pass PII using the existing deletion policy. Never delete historical visit, entry, or verification logs. | Same. |
| 12 | FK-managed children of the user: `push_tokens`, `notification_preferences`, `unit_verifications`, `unit_verification_owner_id_attempts`, `waha_pass_applications`, `waha_pass_credentials`, `bookings`, `permits`, `vehicles`, and nullable unit/resident references | After the approved batches have run, apply the stated FK policy in §9: CASCADE for tokens/preferences; SET NULL for the listed user references; RESTRICT for protected unit/facility relationships. | Same. |
| 13 | `release_operations` (new, proposed) | Append one immutable completed operation, including trigger key, exact resolved ID lists, action counts, actor, and postcondition summary. Its unique idempotency key is the database idempotency gate. | Same. |
| 14 | `external_identity_deletion_jobs` (new, proposed) | Append one pending job for the departing Clerk identity after the database deletion is part of the committed transaction. | Same. |

### 3.2 Required action details

1. **No broad unit deletion.** Units are never deleted in Stage 6A.
2. **No cross-occupancy cascade.** Owner release never archives tenant/family
   residents, tenant credentials, tenant bookings, or tenant vehicles. Tenant
   release never affects owner records.
3. **Future bookings only.** F8 uses `start_time > transaction_now` strictly.
   The cancellation reason must be retained in the new `release_operations`
   effect JSON and rendered bilingually by the later notification layer:
   “Cancelled because the associated residency/ownership ended. This booking is
   non-refundable.” / Arabic approved equivalent. The present `bookings` table
   has no cancellation-reason column, so the reason must not be lost in a log.
4. **Waha audit is append-only.** Revocation writes one audit event per
   credential in the same transaction.
5. **Account deletion is two-boundary.** Database PII scrub and user-row
   deletion occur inside the release transaction. Clerk deletion is never called
   inside that transaction; a worker consumes the committed job afterward.
6. **Legacy audit references are retained intentionally.** Until a separately
   approved audit-retention migration, `waha_pass_events.actor_user_id`,
   `communications.user_id`, and `move_forms.user_id` preserve their historical
   integer values. They are excluded from the Stage 6A FK batches rather than
   silently altered.

---

## 4. Per-trigger inclusion matrix

| Resource | T13 move-out | T14 delayed deletion | O3 owner release |
|---|---:|---:|---:|
| Unit tenant/owner linkage | Clear tenant | Clear tenant | Clear owner |
| Unit occupancy recalculation | Yes | Yes | Yes |
| Trigger terminal marker | Move form completed | Future 6B lifecycle marker | Ownership event terminal marker |
| Waha tenant/owner track | Tenant only | Tenant only | Owner only |
| Unit residents | All active → `moved_out` | All active → `moved_out` | Owner self-stub only → `moved_out` |
| Future bookings | Departing tenant only | Departing tenant only, except renewal-pending suspension | Outgoing owner only |
| Permits, vehicles, guests/pass PII | Departing tenant only | Departing tenant only | Outgoing owner only |
| User row + Clerk deletion job | Yes | Yes | Yes |
| Existing tenant/family data | Preserved where not selected | Preserved where not selected | Always preserved |

T14 renewal-pending suspension is not a terminal deletion and must never call
the engine. That later 6B path may deactivate access but must leave future
bookings intact until a final rejection/deletion event invokes this contract.

---

## 5. Transaction and locking strategy

### 5.1 Transaction boundary

The engine uses a single PostgreSQL transaction at `SERIALIZABLE` isolation.
Every database effect in §3, the release operation audit, the trigger marker,
and the external identity-deletion job commit or roll back together.

The only post-commit activity is Clerk identity deletion. It is retried from the
durable job table and is not permitted to change the committed release result.
The deleted database user cannot authenticate successfully in the portal while
that external cleanup is pending.

### 5.2 Locks in required order

All calls use the same order. A caller may not take an ad-hoc lock before it
calls the engine.

1. Acquire transaction-scoped advisory lock `(4204, unitId)`. Namespace `4204`
   is reserved for Stage 6 release operations and must be registered centrally.
2. `SELECT ... FROM units WHERE id = :unitId FOR UPDATE`.
3. Lock exactly one trigger row `FOR UPDATE`. If a future operation ever carries
   more than one trigger row, sort by `(trigger_table_rank, primary_key)` before
   locking.
4. `SELECT ... FROM users WHERE id = :subjectUserId FOR UPDATE`.
5. Lock dependent rows in this fixed table rank, ordering each table by primary
   key: `waha_pass_applications`, `waha_pass_credentials`, `residents`,
   `bookings`, `permits`, `vehicles`, `guests`, `guest_passes`,
   `notification_preferences`, `push_tokens`, `unit_verifications`,
   `unit_verification_owner_id_attempts`, `waha_guest_day_passes`,
   `payment_attempts`.
6. Lock or create the `release_operations` idempotency row last, using
   `INSERT ... ON CONFLICT` only after the advisory lock is held.

The unit-level advisory lock serializes owner and tenant terminal operations for
the same unit even when they target different users or trigger tables. Row locks
protect correctness if an administrative mutation arrives outside the engine.
Different units may proceed concurrently.

### 5.3 Concurrent outcomes

| Situation | Required response |
|---|---|
| Two matching terminal calls on one unit | One runs; the other waits for the advisory lock, sees the committed operation marker, and returns `already_ended`. |
| Owner release races tenant release | They serialize by unit. The second re-resolves after the first commits and either runs only its still-valid graph or returns `invalid_subject`/`already_ended`; it never applies stale pre-lock resolution. |
| Trigger is already terminal before lock acquisition | Return `already_ended` only when the matching immutable release operation exists; otherwise return `precondition_failed` and alert for reconciliation. |
| Serialization failure / deadlock | Roll back all work and retry the complete resolution-and-lock sequence a bounded number of times. Never retry a post-commit external Clerk action as part of the database transaction. |

---

## 6. Dry-run design: one resolver, two executors

Dry-run cannot reimplement selection logic. The engine is structured as:

1. `resolveReleaseGraph(tx, request)` — locks and returns the ordered graph,
   planned mutations, terminal marker, and assertion set.
2. `assertReleasePreconditions(graph)` — validates the graph is legal.
3. `executeReleaseGraph(tx, graph)` — writes mutations, audits, and the
   post-commit job.
4. `assertReleasePostconditions(tx, graph)` — runs §7 queries.

For `dryRun: true`, steps 1, 2, and the same postcondition logic run in a
transaction which is deliberately rolled back after a **simulation** executor
produces the expected state in memory. The resolver, lock order, stable
transaction timestamp, selected IDs, eligibility checks, and assertions are
identical to a real run. It returns the serialised graph and expected counts;
it writes no audit, no notification, no external job, and no database mutation.

To prove non-divergence, tests will run dry-run and real execution from identical
fixtures and compare:

- trigger, unit, and subject IDs;
- every resolved ordered primary-key list;
- action names and counts;
- expected terminal marker; and
- postcondition assertion identifiers.

A mismatch fails the test suite.

---

## 7. Postcondition assertions inside the transaction

All assertions use the engine’s transaction handle, the locked `transaction_now`,
and the pre-resolved ID lists. Any assertion returning an unexpected row causes
an exception, which rolls back the complete release transaction.

| Assertion ID | Query intent | Pass condition |
|---|---|---|
| A1 | `SELECT verified_owner_id, verified_tenant_id, occupant_type FROM units WHERE id = :unitId FOR UPDATE` | Matches the engine’s recalculated linkage and occupant type exactly. |
| A2 | `SELECT id FROM users WHERE id = :subjectUserId` | No row exists after the database delete. |
| A3 | `SELECT id FROM waha_pass_applications WHERE id = ANY(:applicationIds) AND status <> 'revoked'` | Zero rows. |
| A4 | `SELECT id FROM waha_pass_credentials WHERE id = ANY(:credentialIds) AND (status <> 'revoked' OR revoked_at IS NULL OR revocation_reason <> :reason)` | Zero rows. |
| A5 | `SELECT credential_id FROM waha_pass_events WHERE credential_id = ANY(:credentialIds) AND event_type = 'revoked' AND notes LIKE :operationKey` | Exactly one event for each newly revoked credential. |
| A6 | `SELECT id FROM residents WHERE id = ANY(:residentIds) AND status <> 'moved_out'` | Zero rows. |
| A7 | `SELECT id FROM bookings WHERE id = ANY(:futureBookingIds) AND status <> 'cancelled'` | Zero rows. |
| A8 | `SELECT id FROM bookings WHERE unit_id = :unitId AND start_time <= :transactionNow AND id = ANY(:allBookingIds) AND status = 'cancelled' AND id <> ALL(:preCancelledIds)` | Zero rows; past/in-progress bookings were not cancelled. |
| A9 | `SELECT count(*) FROM release_operations WHERE idempotency_key = :key AND outcome = 'released'` | Exactly one row. |
| A10 | `SELECT count(*) FROM external_identity_deletion_jobs WHERE operation_id = :operationId AND status = 'pending'` | One row when the deleted user had a Clerk ID; otherwise zero. |
| A11 | Trigger-specific marker query on `move_forms`, future tenancy lifecycle table, or `ownership_change_events` | Exactly one matching terminal marker, written in this transaction. |
| A12 | D2 null guards: queries for rows that still join to a missing parent across every newly added FK | Zero rows after each FK batch; RESTRICT relationships must have zero anomalies before the constraint is created. |

`A2` is intentionally after PII scrubbing but before transaction completion.
Assertions A1–A12 run before commit. A forced A7 failure is the standard
induced-failure test: it must leave the unit, passes, bookings, residents,
operation audit, trigger marker, and deletion job at their pre-run values.

---

## 8. Day Pass and payment-reference policy — approval required

The release resolver will select, lock, and report:

- future-validity `waha_guest_day_passes` for the unit purchased by the subject;
  and
- `payment_attempts` whose subject is one of those passes or whose `user_id`
  is the departing subject.

The exact mutation is intentionally **not** final until R2 is approved. Current
code has a Day Pass revocation reason but no actor/terminal-event audit, and
payment attempts have no user-deletion FK policy. The approved choice must be
one of the following; implementation must not improvise a third variant:

1. **Recommended:** revoke future-validity Day Passes in the release
   transaction with a stable reason; retain payment attempts as financial audit
   records, null their user reference under an explicit new FK; record actor,
   operation key, and reason in `release_operations`.
2. Retain Day Passes unchanged and document why paid future access survives a
   subject release. This is not recommended because it conflicts with the O3
   terminal-state requirement.

The proposed FK SQL therefore does **not** include Day Passes or payment attempts.
Doing so without a reviewed retention policy would be an irreversible scope
expansion beyond D2.

---

## 9. Migration execution order

The separate SQL artifact publishes three draft batches. It must not be run until
the following order is approved and verified:

1. Back up and capture before-counts for the fixture categories in the fixture
   plan.
2. Implement and test `bookings.unit_id` population on every creation path and
   the five D2 §6.4 nullable-user read guards. Do not apply Batch 3 before this.
3. Apply and validate Batch 1.
4. Apply and validate Batch 2.
5. Add and backfill `bookings.unit_id`; run the null-anchor/read-path gate.
6. Apply and validate Batch 3.
7. Only then enable the release engine’s user-row deletion path under the new FK
   constraints.

For every `SET NULL` on a formerly `NOT NULL` column, the published SQL uses the
reviewed four-step sequence:

1. enumerate/count orphans;
2. set only those orphans to `NULL`;
3. `DROP NOT NULL`; and
4. add the `ON DELETE SET NULL` foreign key.

`unit_verification_owner_id_attempts.user_id` is the documented exception to
the ordinary sequence: PostgreSQL primary-key columns are inherently non-null.
Its approved structural pre-step must first create a surrogate row ID, replace
the composite primary key with that ID, and preserve rate-limit uniqueness with
a partial unique index for non-null user IDs. Only then can the normal orphan
repair and foreign-key steps run.

For `RESTRICT` constraints, orphan rows are a hard stop and the migration raises
an exception; it must never “repair” a protected unit/facility reference by
nulling it.

---

## 10. Implementation phases after approval

| Phase | Deliverable | Must prove before next phase |
|---|---|---|
| A | Schema typing updates and non-destructive operation-audit/job migration | No runtime mutation enabled. |
| B | Shared resolver, lock coordinator, dry-run result, and postcondition library | Dry run and real run resolve identical graph IDs from fixture data. |
| C | Tenant/owner adapters only; no 6B/6C HTTP or scheduler behavior | Concurrent calls produce one `released` and one `already_ended`. |
| D | D2 FK batches and `bookings.unit_id` write/read changes | Migration fixtures preserve expected before/after rows and all D2 null guards pass. |
| E | Rollback, fault injection, and audit evidence | Induced failure rolls back every database effect; Clerk deletion job is absent on rollback. |
| F | Stage 6A evidence and manifest | All evidence files have SHA-256 hashes. No deployment. |

## 11. Explicit exclusions

- No T13 resident request UI, approval flow, or scheduler policy.
- No T14 expiry schedule, renewal flow, reminder dispatch, or events 13/14/16.
- No O1–O7 UI, impact review, typed confirmation, ownerless registry, or incoming
  owner claim.
- No production deployment.
- No direct migration execution, manual database repair, or external identity
  deletion during planning.
