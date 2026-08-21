# Stage 3c — D2: FK Relationship Inventory (r2)

**Scope:** Every table that O3 (ownership change / release) and T13 (tenancy release /
move-out) touch, covering: deletion policy, transaction locks, cascade assertions
and postcondition queries, the F8 future-booking cascade introduced in Stage 3c,
and an FK hardening proposal with orphan policy (Decisions 75 and 76).

**Changes from r1**

- Section 1.2 corrected: outgoing owner is hard-deleted with PII anonymisation,
  not suspended (Decision 75).
- Section 3 corrected: `waha_pass_applications.unit_id` does **not** have a
  database FK constraint — relationship is convention only.
- Section 6 added: FK hardening — enforced vs conventional relationships, orphan
  policy (Decision 76), incremental constraint plan.

---

## 1. Tables touched by O3 (Ownership Change / Release)

O3 fires when the current owner of a unit is replaced by a new owner or the unit
is returned to vacant. The flow is driven by the ownership-change approval path in
`ownershipChanges.ts`.

### 1.1 `units`

| Column | Role | O3 action |
|---|---|---|
| `verified_owner_id` | FK → `users.id` (convention) | Set to `NULL`. |
| `verified_tenant_id` | FK → `users.id` (convention) | Unchanged by O3 (tenancy survives ownership change). |
| `occupant_type` | ENUM | Updated to `tenant_occupied` (if tenant present) or `vacant`. |
| `pre_approved_claim_id` | FK → ownership event (convention) | Set to event id (Path B) or `NULL` (Path A). |

**Deletion policy:** Row is never deleted; only mutated.  
**Lock:** `pg_advisory_xact_lock` on `unit_id` is not yet applied to the O3 approval
path (advisory lock is a Stage 6 hardening item for O3). The update is a single
statement and is effectively atomic against concurrent reads.  
**Postcondition query:**
```sql
SELECT verified_owner_id, occupant_type
FROM units
WHERE id = :unit_id;
-- Assert: verified_owner_id IS NULL, occupant_type IN ('tenant_occupied', 'vacant').
```

### 1.2 `users` (outgoing owner)

**Decision 75 — confirmed 2026-08-21:** The outgoing owner is hard-deleted with PII
anonymisation on all linked records, identical to the tenant departure path (T13 §2.4).
Owners and tenants are treated identically on departure.

The approval route at `PATCH /ownership-changes/:id/approve` calls
`deleteUserAccount(event.outgoingOwnerId)` before clearing the `units` row.
`deleteUserAccount` then: anonymises PII on bookings, permits, vehicles, guests, and
guest passes; deletes the `users` row; and deletes the Clerk identity.

**Implementation status:** `deleteUserAccount` is called and working. The function
docstring previously stated "only call this for TENANT accounts"; corrected in Stage 3c r2.

**Deletion policy:** Row is hard-deleted. PII on linked records is nullified in the
same DB transaction.  
**Lock:** `deleteUserAccount` runs outside the advisory lock (O3 does not yet acquire
one). It is called before `units.verified_owner_id` is cleared, so the sequence is:
delete user → clear unit → null outgoing_owner_id in the event row.  
**Postcondition:**
```sql
SELECT id FROM users WHERE id = :departing_owner_id;
-- Assert: row absent.

SELECT verified_owner_id FROM units WHERE id = :unit_id;
-- Assert: NULL.

SELECT outgoing_owner_id FROM ownership_change_events WHERE id = :event_id;
-- Assert: NULL (GDPR nullification applied after deletion).
```

### 1.3 `residents` (outgoing owner's self-stub)

| Column | Role | O3 action |
|---|---|---|
| `status` | ENUM | Set to `archived` for all active residents linked to the departing owner. |
| `linked_user_id` | FK → `users.id` (convention) | Retained; becomes a dangling reference after user deletion (see §6 orphan policy). |

**Deletion policy:** Row is never deleted.  
**Note:** Resident archival is handled by a separate step in the ownership-change approval
flow, not inside `deleteUserAccount`.  
**Postcondition:**
```sql
SELECT id, status FROM residents
WHERE unit_id = :unit_id AND linked_user_id = :departing_owner_id;
-- Assert: all rows have status = 'archived'.
```

### 1.4 `waha_pass_applications` + `waha_pass_credentials` (outgoing owner's pass)

| Table | Column | O3 action |
|---|---|---|
| `waha_pass_applications` | `status` | Set to `revoked` for active/pending passes on the unit. |
| `waha_pass_credentials` | `status` | Set to `revoked`. |
| `waha_pass_credentials` | `revoked_at` | Set to `now()`. |

**Deletion policy:** Rows are never deleted; revocation is the terminal state.  
**Lock:** Inside the approval transaction (best-effort; Waha revocation is not currently
wrapped in the same advisory lock as the unit update).  
**Postcondition:**
```sql
SELECT wpa.status, wpc.status AS cred_status
FROM waha_pass_applications wpa
JOIN waha_pass_credentials wpc ON wpc.application_id = wpa.id
WHERE wpa.unit_id = :unit_id;
-- Assert: all rows have status = 'revoked'.
```

### 1.5 `bookings` — F8 cascade (Stage 3c)

| Column | Role | O3 action |
|---|---|---|
| `status` | ENUM | Set to `cancelled` for all future confirmed/pending bookings of the departing owner. |

**Implementation status:** `cancelFutureBookings` is implemented and tested; wiring into
the O3 approval transaction is a Stage 6 item (O3 currently uses a simpler path without
the advisory-locked transaction that F8 requires).  
**Lock:** Will be inside the advisory-locked O3 transaction in Stage 6.  
**Postcondition:**
```sql
SELECT id, status FROM bookings
WHERE user_id = :departing_owner_id AND start_time > now();
-- Assert: all rows have status = 'cancelled'.
```

---

## 2. Tables touched by T13 (Tenancy Release / Move-Out)

T13 fires when a tenancy-due move-out form is processed by `runMoveOutRevocations()`
in `moveOutScheduler.ts`.

### 2.1 `units`

| Column | Role | T13 action |
|---|---|---|
| `verified_tenant_id` | FK → `users.id` (convention) | Set to `NULL`. |
| `occupant_type` | ENUM | Set to `owner_occupied` (if owner present) or `vacant`. |

**Deletion policy:** Row never deleted.  
**Lock:** Drizzle `db.transaction()` wrapping all T13 steps; no advisory lock at this
time (advisory lock is a Stage 6 hardening item for T13).  
**Postcondition:**
```sql
SELECT verified_tenant_id, occupant_type FROM units WHERE id = :unit_id;
-- Assert: verified_tenant_id IS NULL.
```

### 2.2 `waha_pass_applications` + `waha_pass_credentials`

Same revocation as O3 §1.4 but scoped to the tenant's pass.
Revocation runs in step 1 of the T13 transaction in `runMoveOutRevocations()`.

**Postcondition:**
```sql
SELECT wpa.status FROM waha_pass_applications wpa
WHERE wpa.unit_id = :unit_id AND wpa.applicant_user_id = :tenant_user_id;
-- Assert: status = 'revoked'.
```

### 2.3 `residents`

| Column | Role | T13 action |
|---|---|---|
| `status` | ENUM | Set to `archived` for all active residents on the unit. |

**Deletion policy:** Row never deleted.  
**Lock:** Inside T13 transaction.  
**Postcondition:**
```sql
SELECT id, status FROM residents WHERE unit_id = :unit_id AND status = 'active';
-- Assert: result set is empty (all archived).
```

### 2.4 `users` (departing tenant)

`deleteUserAccount()` is called after the T13 transaction commits. It issues a Clerk
user deletion, deletes the `users` row inside its own transaction, and nullifies
orphaned PII fields (see `deleteUserAccount.ts`).

**Deletion policy:** Row hard-deleted.  
**Lock:** `deleteUserAccount` runs outside the T13 transaction (non-atomic with the
unit/Waha/resident steps; failure is logged and retried on next scheduler run).  
**Postcondition (inside T13 tx):**
```sql
SELECT id, unit_id, status FROM users WHERE id = :tenant_user_id;
-- Assert: unit_id IS NULL.
```
**Postcondition (after deleteUserAccount):**
```sql
SELECT id FROM users WHERE id = :tenant_user_id;
-- Assert: row absent.
```

### 2.5 `bookings` — F8 cascade (Stage 3c)

| Column | Role | T13 action |
|---|---|---|
| `status` | ENUM | Set to `cancelled` for all future confirmed/pending bookings of the departing tenant. |

**Trigger:** `cancelFutureBookings(tx, unit.verifiedTenantId, "tenant_move_out_unit_<N>")`
called **inside the T13 transaction** before Waha revocation, before resident archival,
and before clearing `units.verified_tenant_id`. This ordering guarantees the booking
cancellation is atomic with the rest of the revocation.  
**T14d carve-out:** Renewal-pending suspension must NOT call this function. The
scheduler checks the suspension reason before invoking T13; the carve-out is documented
at the call site in `moveOutScheduler.ts`.  
**Lock:** Inside the same Drizzle transaction as all other T13 steps.  
**Postcondition:**
```sql
SELECT id, status FROM bookings
WHERE user_id = :tenant_user_id AND start_time > now();
-- Assert: all rows have status = 'cancelled'.
```

### 2.6 `move_out_forms`

| Column | Role | T13 action |
|---|---|---|
| `processed_at` | TIMESTAMP | Set to `now()` after the transaction commits. |
| `status` | ENUM | Set to `processed`. |

**Deletion policy:** Row never deleted.  
**Lock:** Updated after the main transaction (soft update; idempotent retry-safe).

---

## 3. Cross-cutting operational relationships

These are **all convention only** — no `FOREIGN KEY` constraint exists in the database
for any of them. See §6 for the enforcement gap and the hardening plan.

| Relationship | Tables | Delete policy (current code) |
|---|---|---|
| `users.unit_id` → `units.id` | `users`, `units` | SET NULL on departure (O3/T13). |
| `units.verified_owner_id` → `users.id` | `units`, `users` | SET NULL before owner deletion. |
| `units.verified_tenant_id` → `users.id` | `units`, `users` | SET NULL before tenant deletion. |
| `residents.linked_user_id` → `users.id` | `residents`, `users` | Retained after archival; dangling after user deletion (Decision 76). |
| `residents.registered_by_id` → `users.id` | `residents`, `users` | Not cleared by `deleteUserAccount`; dangling after deletion (Decision 76). |
| `residents.unit_id` → `units.id` | `residents`, `units` | Units never deleted; no risk in practice. |
| `bookings.user_id` → `users.id` | `bookings`, `users` | Retained; only `notes` nullified by `deleteUserAccount` (Decision 76). |
| `bookings.facility_id` → `facilities.id` | `bookings`, `facilities` | Facilities rarely deleted; no policy defined. |
| `permits.user_id` → `users.id` | `permits`, `users` | Contact fields nullified; `user_id` retained (Decision 76). |
| `permits.unit_id` → `units.id` | `permits`, `units` | Units never deleted. |
| `vehicles.user_id` → `users.id` | `vehicles`, `users` | `istimaraNumber` nullified; `user_id` retained (Decision 76). |
| `vehicles.unit_id` → `units.id` | `vehicles`, `units` | Units never deleted. |
| `waha_pass_applications.unit_id` → `units.id` | `waha_pass_applications`, `units` | Units never deleted; applications retained (status = revoked). |
| `waha_pass_applications.applicant_user_id` → `users.id` | `waha_pass_applications`, `users` | Retained; becomes dangling after user deletion (Decision 76). |
| `waha_pass_credentials.held_by_user_id` → `users.id` | `waha_pass_credentials`, `users` | Retained; becomes dangling after user deletion (Decision 76). |
| `communications.user_id` → `users.id` | `communications`, `users` | Not cleared by `deleteUserAccount`; dangling after deletion (Decision 76). |
| `move_forms.user_id` → `users.id` | `move_forms`, `users` | Not cleared; dangling after deletion (Decision 76). |
| `push_tokens.user_id` → `users.id` | `push_tokens`, `users` | Not cleared; dangling after deletion (Decision 76). |
| `notification_preferences.user_id` → `users.id` | `notification_preferences`, `users` | Not cleared; dangling after deletion (Decision 76). |
| `unit_verifications.unit_id` → `units.id` | `unit_verifications`, `units` | Units never deleted. |
| `unit_verifications.user_id` → `users.id` | `unit_verifications`, `users` | Not cleared; dangling after deletion (Decision 76). |

---

## 4. F8 booking cascade — wiring status (Stage 3c)

| Terminal event | Wiring | Atomic? |
|---|---|---|
| Waha credential revoked (admin) | `cancelFutureBookings` called in revoke route after `UPDATE waha_pass_credentials` | Best-effort outside tx (Stage 6 will wrap) |
| Tenancy released / move-out (T13) | `cancelFutureBookings` called inside Drizzle transaction | **Yes — atomic** |
| Ownership change release (O3) | **Not yet wired** — Stage 6 item | — |
| Tenancy deleted after expiry (T14c) | **Not yet wired** — Stage 6 item | — |
| Renewal rejected then deleted (T14d) | **Not yet wired** — Stage 6 item; T14d carve-out documented at call site | — |
| Resident archived on move-out | Covered by T13 path (resident archival happens inside same T13 tx) | **Yes — via T13** |

---

## 5. I5 one-per-unit constraint — migration delivered in Stage 3c

Migration `0030_i5_waha_pass_one_per_unit.sql` creates a **partial unique index**:

```sql
CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
  ON waha_pass_applications(unit_id)
  WHERE status IN ('pending_review', 'active');
```

This prevents a second application from reaching `pending_review` or `active` for the
same unit, closing the race-condition gap that the prior application-level check alone
could not close. The index is not an FK constraint — it enforces uniqueness, not
referential integrity.

---

## 6. FK hardening — enforced vs conventional, orphan policy, and incremental plan

### 6.1 Enforced constraints (database level)

The following four `FOREIGN KEY` constraints exist in the current production schema.
All four are on audit / config tables added during Stage 3:

| Constraint | From | To |
|---|---|---|
| `documents_folder_id_fkey` | `documents.folder_id` | `document_folders.id` |
| `facility_booking_config_normalization_audit_facility_id_fkey` | `facility_booking_config_normalization_audit.facility_id` | `facilities.id` |
| `facility_operating_hours_conflicts_booking_id_fkey` | `facility_operating_hours_conflicts.booking_id` | `bookings.id` |
| `facility_operating_hours_conflicts_facility_id_fkey` | `facility_operating_hours_conflicts.facility_id` | `facilities.id` |

**Every other relationship listed in §3 is enforced by application code alone.** A
direct `INSERT` or `UPDATE` bypassing the API can create orphaned or invalid references
with no database-level rejection.

### 6.2 Orphan policy — Decision 76 (open, proposal below)

**Problem.** When `deleteUserAccount` hard-deletes a `users` row, all columns in other
tables carrying that `user_id` become dangling integer references. Currently only the
PII-carrying fields are nullified (`bookings.notes`, permits contact fields,
`vehicles.istimaraNumber`, guest names/IDs/plates). The `user_id` integer itself is
retained in every table.

**Proposal (Decision 76).** Adopt `ON DELETE SET NULL` as the standard FK definition
for all `user_id` columns when Stage 6 adds constraints. This means the database
automatically nullifies every `user_id` reference at deletion time, without requiring
`deleteUserAccount` to enumerate every downstream table. The PII fields are already
scrubbed before deletion, so the orphaned integer has no privacy significance in the
interim — it is not a name, email, or other identifiable value, and it no longer maps
to any row. Retaining it until the FK constraint is in place is an intentional audit
trade-off: grouped historical queries (e.g. "all bookings for this unit in 2025") still
function correctly because the booking row remains linked to a facility and a unit.

The tombstone-user approach (a deleted-sentinel row that remaining references point to)
is rejected because it requires reserving a user ID at schema creation time and adds
complexity to every query that filters by `user_id`.

**Interim gap.** The following columns are **not** currently handled by `deleteUserAccount`
and will contain dangling integers after deletion: `waha_pass_applications.applicant_user_id`,
`waha_pass_credentials.held_by_user_id`, `communications.user_id`, `move_forms.user_id`,
`push_tokens.user_id`, `notification_preferences.user_id`, `unit_verifications.user_id`,
`residents.linked_user_id`, `residents.registered_by_id`. None of these tables are
accessed in ways that expose the dangling reference through the portal. The Stage 6 FK
migration will clean them automatically via `ON DELETE SET NULL`.

### 6.3 Incremental constraint plan

Constraints are proposed in three groups, ordered by data cleanup cost and by when the
associated code refactors are already scheduled.

**Batch 1 — alongside O3/T13/T14 transaction refactor (Stage 6)**

These columns are always nullified in application code before the user is deleted; the
cleanup verification query can confirm no orphans exist before `ALTER TABLE` is run.

| Column | Proposed constraint |
|---|---|
| `units.verified_owner_id` | `FOREIGN KEY (verified_owner_id) REFERENCES users(id) ON DELETE SET NULL` |
| `units.verified_tenant_id` | `FOREIGN KEY (verified_tenant_id) REFERENCES users(id) ON DELETE SET NULL` |
| `bookings.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `bookings.facility_id` | `FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT` |
| `permits.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `permits.unit_id` | `FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT` |
| `vehicles.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `vehicles.unit_id` | `FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT` |

Data cleanup required before each: `SELECT id FROM <table> WHERE user_id NOT IN (SELECT id FROM users)` — nullify any orphans found before applying the constraint.

**Batch 2 — alongside Stage 6 Waha and resident cascade work**

| Column | Proposed constraint |
|---|---|
| `waha_pass_applications.unit_id` | `FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT` |
| `waha_pass_applications.applicant_user_id` | `FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `waha_pass_credentials.held_by_user_id` | `FOREIGN KEY (held_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `residents.unit_id` | `FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT` |
| `residents.linked_user_id` | `FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `residents.registered_by_id` | `FOREIGN KEY (registered_by_id) REFERENCES users(id) ON DELETE SET NULL` |

**Batch 3 — lower priority (post-Stage 6)**

| Column | Proposed constraint |
|---|---|
| `communications.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `move_forms.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `push_tokens.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `notification_preferences.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `unit_verifications.user_id` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL` |

`push_tokens` and `notification_preferences` use CASCADE rather than SET NULL because a
row with no user is meaningless (a push token for a deleted identity will always fail).

**Before any batch:** run the orphan-detection query for each table; nullify orphans in
a migration; then apply the `ALTER TABLE ADD CONSTRAINT` in a subsequent migration.
Adding a constraint over pre-existing orphans will fail with a FK violation error.

---

*Generated: Stage 3c r2 delivery — 2026-08-21*
