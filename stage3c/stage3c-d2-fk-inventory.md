# Stage 3c — D2: FK Relationship Inventory

**Scope:** Every table that O3 (ownership change / release) and T13 (tenancy release /
move-out) touch, covering: deletion policy, transaction locks, cascade assertions
and postcondition queries, and the F8 future-booking cascade introduced in Stage 3c.

---

## 1. Tables touched by O3 (Ownership Change / Release)

O3 fires when the current owner of a unit is replaced by a new owner or the unit
is returned to vacant.  The flow is driven by the move-form approval path in
`moveFormService.ts` / the admin unit-management routes.

### 1.1 `units`

| Column | Role | O3 action |
|---|---|---|
| `verified_owner_id` | FK → `users.id` | Set to new owner's user-id, or `NULL` on release. |
| `verified_tenant_id` | FK → `users.id` | Unchanged by O3 (tenancy survives ownership change). |
| `occupant_type` | ENUM | Updated to `owner_occupied` / `vacant` / `tenant_occupied`. |

**Deletion policy:** Row is never deleted; only mutated.  
**Lock:** Advisory lock on `unit_id` acquired before the update in the move-form approval transaction.  
**Postcondition query:**
```sql
SELECT verified_owner_id, occupant_type
FROM units
WHERE id = :unit_id;
-- Assert: verified_owner_id = :new_owner_id OR NULL, occupant_type in expected set.
```

### 1.2 `users` (outgoing owner)

| Column | Role | O3 action |
|---|---|---|
| `unit_id` | FK → `units.id` | Cleared to `NULL` for the departing owner. |
| `unit_number` | Denorm | Cleared to `NULL`. |
| `status` | ENUM | Set to `suspended` (pending re-verification at new address). |
| `verification_status` | ENUM | Reverted to `unverified`. |

**Deletion policy:** Row is **not** deleted; the user account persists for audit.  
**Lock:** Same advisory lock as `units` — update is inside the same transaction.  
**Postcondition:**
```sql
SELECT unit_id, status, verification_status FROM users WHERE id = :departing_owner_id;
-- Assert: unit_id IS NULL, status = 'suspended', verification_status = 'unverified'.
```

### 1.3 `residents` (outgoing owner's self-stub)

| Column | Role | O3 action |
|---|---|---|
| `status` | ENUM | Set to `archived` for all active residents linked to the departing owner. |
| `linked_user_id` | FK → `users.id` | Retained (audit trail). |

**Deletion policy:** Row is never deleted.  
**Lock:** Inside the same transaction as the units update.  
**Postcondition:**
```sql
SELECT id, status FROM residents
WHERE unit_id = :unit_id AND linked_user_id = :departing_owner_id;
-- Assert: all rows have status = 'archived'.
```

### 1.4 `waha_pass_applications` + `waha_pass_credentials` (outgoing owner's pass)

| Table | Column | O3 action |
|---|---|---|
| `waha_pass_applications` | `status` | Set to `revoked` for active passes on the unit. |
| `waha_pass_credentials` | `status` | Set to `revoked` for credentials held by the departing owner. |
| `waha_pass_credentials` | `revoked_at` | Set to `now()`. |

**Deletion policy:** Rows are never deleted; revocation is the terminal state.  
**Lock:** Inside the advisory-locked transaction.  
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

**Trigger:** `cancelFutureBookings(tx, departing_owner_user_id, "ownership_change_release")` called inside the advisory-locked transaction **before** the user row is cleared.  
**Deletion policy:** Booking row is never deleted; `status = 'cancelled'` is terminal.  
**Lock:** Inside the same advisory-locked O3 transaction.  
**Postcondition:**
```sql
SELECT id, status FROM bookings
WHERE user_id = :departing_owner_id AND start_time > now();
-- Assert: all rows have status = 'cancelled'.
```

> **Note for Stage 6:** The O3 flow currently archives residents and revokes Waha passes but does not yet call `cancelFutureBookings` for the departing owner's bookings. That wiring is scoped to Stage 6 together with the full O3 transaction refactor. The F8 `cancelFutureBookings` helper is already implemented and tested (Stage 3c); the O3 call site must invoke it inside the advisory-locked transaction before clearing `users.unit_id`.

---

## 2. Tables touched by T13 (Tenancy Release / Move-Out)

T13 fires when a tenancy-due move-out form is processed by `runMoveOutRevocations()`
in `moveOutScheduler.ts`.

### 2.1 `units`

| Column | Role | T13 action |
|---|---|---|
| `verified_tenant_id` | FK → `users.id` | Set to `NULL`. |
| `occupant_type` | ENUM | Set to `owner_occupied` (if owner present) or `vacant`. |

**Deletion policy:** Row never deleted.  
**Lock:** Drizzle `db.transaction()` wrapping all T13 steps; no separate advisory lock at this time (advisory lock is a Stage 6 hardening item for T13).  
**Postcondition:**
```sql
SELECT verified_tenant_id, occupant_type FROM units WHERE id = :unit_id;
-- Assert: verified_tenant_id IS NULL.
```

### 2.2 `waha_pass_applications` + `waha_pass_credentials`

Same as O3 §1.4 but scoped to the tenant's pass.  
The revocation runs in step 1 of the T13 transaction in `runMoveOutRevocations()`.

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

| Column | Role | T13 action |
|---|---|---|
| `unit_id` | FK → `units.id` | Cleared to `NULL`. |
| `unit_number` | Denorm | Cleared to `NULL`. |
| `status` | ENUM | Set to `suspended` then deleted via `deleteUserAccount()`. |

**Deletion policy:** `deleteUserAccount()` is called **after** the transaction commits. It issues a Clerk user deletion, deletes the user row, and nullifies orphaned FK references in `bookings.notes`. Post-Stage 3c the user row is hard-deleted.  
**Postcondition (inside tx):**
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

**Trigger:** `cancelFutureBookings(tx, unit.verifiedTenantId, "tenant_move_out_unit_<N>")` called **inside the T13 transaction** in step 1, before Waha revocation, before resident archival, and before clearing `units.verified_tenant_id`. This ordering guarantees the booking cancellation is atomic with the revocation.  
**T14d carve-out:** Renewal-pending suspension MUST NOT call this function. The scheduler checks the suspension reason before invoking T13 move-out; the carve-out is documented at the call site.  
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

## 3. Cross-cutting constraints

| Constraint | Tables | Policy |
|---|---|---|
| `units.verified_owner_id` → `users.id` | `units`, `users` | SET NULL on owner departure (user row kept for audit). |
| `units.verified_tenant_id` → `users.id` | `units`, `users` | SET NULL on T13; user row hard-deleted after. |
| `residents.linked_user_id` → `users.id` | `residents`, `users` | Retained after archival; nullable after user deletion. |
| `waha_pass_applications.unit_id` → `units.id` | `waha_pass_applications`, `units` | FK present in production schema; application rows retained (status = revoked). |
| `waha_pass_credentials.held_by_user_id` → `users.id` | `waha_pass_credentials`, `users` | FK retained; credential row kept for audit after user deletion. |
| `bookings.user_id` → `users.id` | `bookings`, `users` | Booking rows kept post-user deletion (`deleteUserAccount` nullifies `notes` only; F8 ensures future bookings are cancelled before user deletion). |

---

## 4. F8 booking cascade — wiring status (Stage 3c)

| Terminal event | Wiring | Atomic? |
|---|---|---|
| Waha credential revoked (admin) | `cancelFutureBookings` called in revoke route after `UPDATE waha_pass_credentials` | Best-effort outside tx (Stage 6 will wrap) |
| Tenancy released / move-out (T13) | `cancelFutureBookings` called inside Drizzle transaction | **Yes — atomic** |
| Ownership change release (O3) | **Not yet wired** — Stage 6 item | — |
| Tenancy deleted after expiry (T14c) | **Not yet wired** — Stage 6 item | — |
| Renewal rejected then deleted (T14d) | **Not yet wired** — Stage 6 item; T14d carve-out for renewal-pending suspension documented | — |
| Resident archived on move-out | Covered by T13 path (resident archival happens inside same T13 tx) | **Yes — via T13** |

> Items not yet wired are scoped to Stage 6, which must build the full O3/T13/T14 transaction refactor and the test-mode payment provider required for H2.

---

## 5. I5 one-per-unit constraint — migration delivered in Stage 3c

Migration `0030_i5_waha_pass_one_per_unit.sql` creates a **partial unique index**:

```sql
CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
  ON waha_pass_applications(unit_id)
  WHERE status IN ('pending_review', 'active');
```

This prevents a second application from reaching `pending_review` or `active` for the same unit, closing the race-condition gap that the prior application-level check alone could not close.

---

*Generated: Stage 3c delivery*
