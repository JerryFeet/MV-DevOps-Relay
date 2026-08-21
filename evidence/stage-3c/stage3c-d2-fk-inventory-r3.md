# Stage 3c — D2: FK Relationship Inventory (r3)

**Scope:** Every table that O3 (ownership change / release) and T13 (tenancy release /
move-out) touch, covering: deletion policy, transaction locks, cascade assertions
and postcondition queries, the F8 future-booking cascade introduced in Stage 3c,
and an FK hardening proposal with orphan policy (Decisions 75 and 76).

**Changes from r2**

- §6.1 gains a nullability column; NOT NULL columns flagged throughout.
- §6.2 orphan policy corrected: bookings has no `unit_id`; the "audit continuity"
  argument that relied on it was wrong. Decision: denormalise `unit_id` onto `bookings`
  at creation time before the SET NULL constraint is applied (details in §6.3 Batch 3).
- §6.3 reorganised: Batch 1 contains only constraints requiring no column-type change;
  Batch 2 sequences explicit DROP NOT NULL steps before every SET NULL on a NOT NULL
  column; Batch 3 gates on the `bookings.unit_id` pre-requisite; `unit_verifications`
  placed in Batch 2 (both columns); `push_tokens` and `notification_preferences` moved
  from Batch 3 to Batch 1 (CASCADE — no nullability issue).
- §6.4 added: read paths that must be updated when `bookings.user_id` becomes nullable.

---

## 1. Tables touched by O3 (Ownership Change / Release)

### 1.1 `units`

| Column | Role | O3 action |
|---|---|---|
| `verified_owner_id` | FK → `users.id` (convention) | Set to `NULL`. |
| `verified_tenant_id` | FK → `users.id` (convention) | Unchanged by O3. |
| `occupant_type` | ENUM | Updated to `tenant_occupied` or `vacant`. |
| `pre_approved_claim_id` | FK → ownership event (convention) | Set to event id (Path B) or `NULL` (Path A). |

**Deletion policy:** Row never deleted.  
**Lock:** Advisory lock is a Stage 6 hardening item for O3.  
**Postcondition:**
```sql
SELECT verified_owner_id, occupant_type FROM units WHERE id = :unit_id;
-- Assert: verified_owner_id IS NULL, occupant_type IN ('tenant_occupied', 'vacant').
```

### 1.2 `users` (outgoing owner)

**Decision 75 — 2026-08-21:** Outgoing owner is hard-deleted with PII anonymisation,
identical to the tenant departure path (T13 §2.4). `deleteUserAccount(event.outgoingOwnerId)`
is called before `units.verified_owner_id` is cleared.

**Deletion policy:** Row hard-deleted.  
**Postcondition:**
```sql
SELECT id FROM users WHERE id = :departing_owner_id;              -- Assert: absent.
SELECT verified_owner_id FROM units WHERE id = :unit_id;          -- Assert: NULL.
SELECT outgoing_owner_id FROM ownership_change_events WHERE id = :event_id; -- Assert: NULL.
```

### 1.3 `residents` (outgoing owner's self-stub)

`status` set to `archived`; `linked_user_id` retained (already nullable — becomes
dangling after user deletion per Decision 76).

**Deletion policy:** Row never deleted.

### 1.4 `waha_pass_applications` + `waha_pass_credentials`

`status` → `revoked`; `waha_pass_credentials.revoked_at` → `now()`.

**Deletion policy:** Rows never deleted.

### 1.5 `bookings` — F8 cascade (Stage 3c)

`cancelFutureBookings` wiring to O3 is a Stage 6 item. Helper is implemented and tested.

---

## 2. Tables touched by T13 (Tenancy Release / Move-Out)

### 2.1 `units`

`verified_tenant_id` → `NULL`; `occupant_type` → `owner_occupied` or `vacant`.  
**Lock:** Drizzle `db.transaction()`; advisory lock is a Stage 6 item.

### 2.2 `waha_pass_applications` + `waha_pass_credentials`

Same revocation as §1.4 scoped to the tenant's pass, inside the T13 transaction.

### 2.3 `residents`

All active residents on the unit archived.

### 2.4 `users` (departing tenant)

`deleteUserAccount()` called after T13 transaction commits. Row hard-deleted.

**Postcondition:**
```sql
SELECT id FROM users WHERE id = :tenant_user_id;  -- Assert: absent.
```

### 2.5 `bookings` — F8 cascade (Stage 3c, atomic)

`cancelFutureBookings(tx, tenantUserId, "tenant_move_out_unit_<N>")` inside the T13
transaction. T14d carve-out documented at the call site in `moveOutScheduler.ts`.

### 2.6 `move_out_forms`

`processed_at` → `now()`, `status` → `processed` after the main transaction commits.

---

## 3. Cross-cutting operational relationships

**All convention only** — no `FOREIGN KEY` constraint exists for any of these.
See §6 for the enforcement gap and the hardening plan.

| Relationship | Nullable? | Delete policy (current code) |
|---|---|---|
| `users.unit_id` → `units.id` | YES | SET NULL on departure (O3/T13). |
| `units.verified_owner_id` → `users.id` | YES | SET NULL before owner deletion. |
| `units.verified_tenant_id` → `users.id` | YES | SET NULL before tenant deletion. |
| `residents.linked_user_id` → `users.id` | YES | Retained; dangling after deletion (Decision 76). |
| `residents.registered_by_id` → `users.id` | YES | Not cleared; dangling after deletion (Decision 76). |
| `residents.unit_id` → `units.id` | YES | Units never deleted. |
| `bookings.user_id` → `users.id` | **NO** | `notes` nullified; `user_id` retained — dangling (Decision 76). |
| `bookings.facility_id` → `facilities.id` | **NO** | Facilities rarely deleted; no policy defined. |
| `permits.user_id` → `users.id` | **NO** | Contact fields nullified; `user_id` retained (Decision 76). |
| `permits.unit_id` → `units.id` | YES | Units never deleted. |
| `vehicles.user_id` → `users.id` | **NO** | `istimaraNumber` nullified; `user_id` retained (Decision 76). |
| `vehicles.unit_id` → `units.id` | YES | Units never deleted. |
| `waha_pass_applications.unit_id` → `units.id` | **NO** | Applications retained (status = revoked). |
| `waha_pass_applications.applicant_user_id` → `users.id` | **NO** | Retained; dangling after deletion (Decision 76). |
| `waha_pass_credentials.held_by_user_id` → `users.id` | YES | Retained; dangling after deletion (Decision 76). |
| `communications.user_id` → `users.id` | **NO** | Not cleared; dangling after deletion (Decision 76). |
| `move_forms.user_id` → `users.id` | **NO** | Not cleared; dangling after deletion (Decision 76). |
| `push_tokens.user_id` → `users.id` | **NO** | Tokens are user-bound; row meaningless after deletion. |
| `notification_preferences.user_id` → `users.id` | **NO** | Preferences are user-bound; row meaningless after deletion. |
| `unit_verifications.unit_id` → `units.id` | **NO** | Units never deleted. |
| `unit_verifications.user_id` → `users.id` | **NO** | Not cleared; dangling after deletion (Decision 76). |
| `unit_verification_owner_id_attempts.user_id` → `users.id` | **NO** | Audit record retained; dangling after deletion (Decision 76). |

---

## 4. F8 booking cascade — wiring status (Stage 3c)

| Terminal event | Wiring | Atomic? |
|---|---|---|
| Waha credential revoked (admin) | `cancelFutureBookings` called in revoke route | Best-effort outside tx |
| Tenancy released / move-out (T13) | `cancelFutureBookings` inside Drizzle transaction | **Atomic** |
| Ownership change release (O3) | Not yet wired — Stage 6 item | — |
| Tenancy deleted after expiry (T14c) | Not yet wired — Stage 6 item | — |
| Renewal rejected then deleted (T14d) | Not yet wired — T14d carve-out documented at call site | — |

---

## 5. I5 one-per-unit constraint — migration delivered in Stage 3c

```sql
CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
  ON waha_pass_applications(unit_id)
  WHERE status IN ('pending_review', 'active');
```

Partial unique index, not an FK constraint. Confirmed in dev DB.

---

## 6. FK hardening — enforced vs conventional, orphan policy, and incremental plan

### 6.1 Enforced constraints (current production schema)

Four `FOREIGN KEY` constraints exist. All four are on audit/config tables added in Stage 3.

| Constraint | Column | Nullable | References |
|---|---|---|---|
| `documents_folder_id_fkey` | `documents.folder_id` | NO | `document_folders(id)` |
| `facility_booking_config_normalization_audit_facility_id_fkey` | `facility_id` | NO | `facilities(id)` |
| `facility_operating_hours_conflicts_booking_id_fkey` | `booking_id` | NO | `bookings(id)` |
| `facility_operating_hours_conflicts_facility_id_fkey` | `facility_id` | NO | `facilities(id)` |

**Every relationship in §3 is enforced by application code only.**

### 6.2 Orphan policy — Decision 76

**Problem.** When `deleteUserAccount` deletes a `users` row, all `user_id` columns in
other tables become dangling integer references. Currently only the PII-carrying fields
are scrubbed; the integer `user_id` is left in place.

**Proposed resolution.** Adopt `ON DELETE SET NULL` for all `user_id` columns, applied
as FK constraints in Stage 6 per §6.3. The PII is already gone before the row is
deleted, so the dangling integer carries no privacy significance in the interim. Once
the FK constraints are in place, PostgreSQL nullifies the references automatically.

**Bookings attribution — correction from r2.** The r2 document argued that
`bookings.user_id` could safely become null because "grouped historical queries still
function because the booking row remains linked to a facility and a unit." This was
wrong: `bookings` has no `unit_id` column. Nulling `user_id` would leave the booking
attributable only to a facility and a time-slot — not to a person or a household.

**Recommendation: denormalise `unit_id` onto `bookings` at creation time (Batch 3
pre-requisite).** The table already carries `facility_name` as a denormalised field, so
this is consistent with the existing pattern. At booking creation the user's `unit_id`
is known; recording it on the booking row gives every historical record a durable
household anchor that survives user deletion. This also gives F8 a unit-level view of
cancelled bookings without needing to join back to a now-deleted user.

After `bookings.unit_id` is populated, `bookings.user_id ON DELETE SET NULL` becomes
safe: the booking retains facility + unit attribution, and only the personal identity
link is lost — which is the intended outcome of account deletion.

**Columns with dangling references not yet handled by `deleteUserAccount`:** seventeen
columns listed in §3 with a NOT NULL constraint (marked **NO** in the Nullable column)
will carry dangling integers until the Stage 6 FK migrations apply. None of these
columns expose the dangling reference through any current portal API response in a way
that creates a privacy or correctness risk before the constraint is added.

### 6.3 Incremental constraint plan

**Step template for every SET NULL constraint on a NOT NULL column:**
1. `SELECT id FROM <table> WHERE <col> NOT IN (SELECT id FROM <ref_table>)` — find orphans.
2. `UPDATE <table> SET <col> = NULL WHERE <col> NOT IN (SELECT id FROM <ref_table>)` — nullify.
3. `ALTER TABLE <table> ALTER COLUMN <col> DROP NOT NULL` — remove the not-null constraint.
4. `ALTER TABLE <table> ADD CONSTRAINT <name> FOREIGN KEY (<col>) REFERENCES <ref_table>(id) ON DELETE SET NULL` — add the constraint.

For RESTRICT and CASCADE constraints no column-type change is required (steps 1–2 still needed for RESTRICT to verify no orphans; CASCADE deletes the row so nullability is irrelevant).

---

#### Batch 1 — No column-type changes (Stage 6, apply first)

These constraints require only an orphan check; no `NOT NULL` needs to be dropped.

| Table | Column | Nullable | Action | Reason |
|---|---|---|---|---|
| `push_tokens` | `user_id` | NO | CASCADE | Token has no meaning without its user. CASCADE is simpler than SET NULL and leaves no orphaned row. |
| `notification_preferences` | `user_id` | NO | CASCADE | Same reasoning as `push_tokens`. |
| `units` | `verified_owner_id` | YES | SET NULL | Nullable today; O3 already sets it to NULL before deletion. |
| `units` | `verified_tenant_id` | YES | SET NULL | Nullable today; T13 already sets it to NULL before deletion. |
| `residents` | `linked_user_id` | YES | SET NULL | Nullable today. |
| `residents` | `registered_by_id` | YES | SET NULL | Nullable today. |
| `residents` | `unit_id` | YES | RESTRICT | Units never deleted; constraint safe and never fires. |
| `waha_pass_credentials` | `held_by_user_id` | YES | SET NULL | Nullable today. |
| `vehicles` | `unit_id` | YES | RESTRICT | Units never deleted. |
| `permits` | `unit_id` | YES | RESTRICT | Units never deleted. |
| `unit_verifications` | `unit_id` | NO | RESTRICT | Units never deleted; RESTRICT is safe and never fires; `NOT NULL` on the column is fine for RESTRICT. |
| `bookings` | `facility_id` | NO | RESTRICT | Facilities rarely deleted; a hard block is preferable to silent orphaning. |

**`push_tokens` and `notification_preferences` confirmed as CASCADE.** A push token for
a deleted user will always fail delivery; retaining the row has no operational value.
Preferences without a user are unreachable. Both are moved out of Batch 3 to Batch 1
because they are the simplest and safest constraints in the plan.

---

#### Batch 2 — Require `DROP NOT NULL` (Stage 6, alongside O3/T13 refactor)

For each: run the step template (orphan check → nullify → drop NOT NULL → add constraint).

| Table | Column | Nullable | Action | Drop NOT NULL first? |
|---|---|---|---|---|
| `permits` | `user_id` | NO | SET NULL | **Yes** |
| `vehicles` | `user_id` | NO | SET NULL | **Yes** |
| `unit_verifications` | `user_id` | NO | SET NULL | **Yes** |
| `unit_verification_owner_id_attempts` | `user_id` | NO | SET NULL | **Yes** |
| `waha_pass_applications` | `unit_id` | NO | RESTRICT | No (RESTRICT; nullability irrelevant) |
| `waha_pass_applications` | `applicant_user_id` | NO | SET NULL | **Yes** |

**`unit_verifications` placement rationale.** Both columns are in Batch 2: `unit_id`
needs only an orphan check (RESTRICT, units never deleted); `user_id` requires DROP NOT
NULL (nullable after deletion — the record retains its unit, status, type, and dates,
so staff can still query verifications per unit after the submitting user is gone). This
table carries `uq_unit_verifications_claim_per_unit` and `uq_unit_verifications_approved_user`;
those unique constraints are on different columns and are unaffected by making `user_id`
nullable.

---

#### Batch 3 — Bookings (requires `bookings.unit_id` denormalisation first)

**Pre-requisite migration (Stage 6):** Add `unit_id INTEGER` column to `bookings`.
Populate from `users.unit_id` at `INSERT` time (application-level, not a trigger).
Back-fill existing rows where possible via a join to `users` (will be NULL for rows
whose users are already deleted — acceptable).

After the pre-requisite migration:

| Table | Column | Nullable | Action | Drop NOT NULL first? |
|---|---|---|---|---|
| `bookings` | `user_id` | NO | SET NULL | **Yes** |

---

#### Batch 4 — Lower priority (post-Stage 6)

| Table | Column | Nullable | Action | Drop NOT NULL first? |
|---|---|---|---|---|
| `communications` | `user_id` | NO | SET NULL | **Yes** |
| `move_forms` | `user_id` | NO | SET NULL | **Yes** |

---

### 6.4 Read paths affected when `bookings.user_id` becomes nullable

When Batch 3 is applied, the following call sites in the API server must be updated
before or alongside the migration:

| File | Line | Issue | Required fix |
|---|---|---|---|
| `routes/bookings.ts` | 26 | `bookings.map(b => b.userId)` passed directly to `inArray(usersTable.id, ...)`. A null in the array produces invalid SQL. | Filter: `.filter((id): id is number => id !== null)` |
| `routes/bookings.ts` | 334, 364, 395 | `sendPushToUsers([existing.userId], ...)` — passes `[null]` when userId is null, sending to a non-existent user. | Null guard: `if (existing.userId != null) sendPushToUsers([existing.userId], ...)` |
| `routes/payments.ts` | 177 | `bookings.map(b => b.userId)` — same `inArray` issue as bookings.ts:26. | Same filter. |
| `routes/bookings.ts` | 294, 305, 350 | `booking.userId !== caller.id` — null !== any id evaluates to true, so orphaned bookings are invisible to non-staff. | Acceptable behaviour — orphaned bookings are staff-only. Document in code with a comment. |
| `routes/payments.ts` | 40, 109 | Same `!== caller.id` pattern. | Same — acceptable; document. |

These are compile-time safe (TypeScript will flag `userId` as `number | null` once the
schema type is updated to reflect the nullable column). The migration must not be
applied until all five call sites above are updated.

---

*Generated: Stage 3c r3 delivery — 2026-08-21*
