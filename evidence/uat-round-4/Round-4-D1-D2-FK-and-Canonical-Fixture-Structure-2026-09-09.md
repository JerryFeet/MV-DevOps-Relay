# Round 4 — D-1/D-2 Foreign-Key Feasibility and Canonical Fixture Structure

Date: 2026-09-09  
Scope: report only  
Schema operations performed: none

## 1. Structural canonical-fixture finding

The canonical gate cannot fully delete its fixtures from the shared Development database while retaining the accepted integrity assertions.

Two cleanup attempts were made before the D work:

1. The first transaction rolled back on the monthly-allowance-to-booking `ON DELETE RESTRICT` relationship.
2. The second transaction included the required allowance ordering but rolled back on `IMMUTABLE_UNIT_REGISTRY_EVIDENCE`.

Both transactions were atomic. No partial deletion occurred, and no trigger or immutable protection was bypassed.

The durable rows are intentional:

- monthly booking allowance claims remain linked to the booking that consumed them;
- unit-master audit evidence is deletion-protected;
- occupancy lifecycle evidence is append-only;
- the real-interface gate creates those rows while proving accepted lifecycle behavior.

### Mitigation applied in this delivery

- B5 uses a run-unique unit and the exact canonical zero-price, approval-off facility.
- C-5 uses a run-unique unit.
- C-5 preserves the free booking and its allowance claim, while cleaning only disposable priced-booking data.

This prevents prior immutable claims from making later gate runs fail, but it does not make the shared Development database self-cleaning. The gate therefore still grows durable fixture evidence.

### Long-term options

1. Use a bounded permanent fixture set where assertions can safely reuse immutable anchors.
2. Split disposable tests from tests that intentionally create permanent integrity evidence.
3. Preferred: execute the canonical gate against a disposable database restored from a clean baseline.

Replit provides Development and Production databases for this project, not a third first-class test database. True database separation therefore requires a separate Replit project/database. A dedicated schema and separate API process are possible but remain easier to misconfigure and are not equivalent to a separate database.

No Development reset was performed.

## 2. D-1/D-2 foreign-key feasibility

Read-only orphan checks against Development returned zero for:

- household invitation unit, resident, and creator references;
- Waha application second-resident references;
- credential application and replacement references;
- event application and credential references.

Zero current orphans make validation feasible, but deletion semantics still determine whether a foreign key is safe.

### Safe after a separately approved migration and preflight

| Relationship | Recommended behavior | Reason |
|---|---|---|
| `household_invitations.unit_id -> units.id` | `ON DELETE RESTRICT` | The unit is the canonical invitation slot; invitation history must not cascade away. |
| `household_invitations.resident_id -> residents.id` | `ON DELETE SET NULL` | Revoked/accepted invitation evidence can survive resident archival. |
| `waha_pass_applications.second_resident_id -> residents.id` | `ON DELETE SET NULL` | D-2 explicitly frees the second-holder slot while preserving application history. |
| `waha_pass_applications.reviewed_by_id -> users.id` | `ON DELETE SET NULL` | Reviewer attribution can follow the existing nullable reviewer convention. |
| `waha_pass_credentials.replaced_by_credential_id -> waha_pass_credentials.id` | `ON DELETE RESTRICT` | Replacement chains are retained lifecycle evidence. |

### Requires a product retention/deletion decision

| Relationship | Constraint |
|---|---|
| `household_invitations.created_by_user_id -> users.id` | The column is non-null. `CASCADE` would destroy evidence; `SET NULL` requires a nullability decision; `RESTRICT` can block hard user deletion. |
| `waha_pass_credentials.application_id -> waha_pass_applications.id` | `RESTRICT` is appropriate only if applications are never physically deleted. |
| Waha event application, credential, and actor references | Events are the full audit log. `CASCADE` is unsafe; actor nullability/retention must be decided before enforcement. |
| `waha_replacement_requests.payment_attempt_id -> payment_attempts.id` | Payment provenance and the polymorphic payment subject model require an explicit retention decision. |

No foreign key, migration, schema push, migration runner, or `push --force` operation was performed.

## 3. D-1/D-2 keying outcome

- D-1 pending-invitation fallback is keyed by canonical unit plus the removed resident's invited email; exact resident-linked invitations remain covered.
- D-2 applicant cleanup is keyed by `applicantUserId`.
- D-2 second-holder cleanup is keyed by `secondResidentId`, not `heldByUserId`.
- Every non-revoked credential in the affected holder chain is revoked, including lost, stolen, damaged, suspended, and replacement rows.
- Removing the second holder clears only the second slot and preserves the applicant/application/primary chain.
- Removing a linked legacy applicant revokes the application and both credential chains.
- In-flight replacement fulfillment locks the application and fails closed after application revocation, request invalidation, or second-slot removal.