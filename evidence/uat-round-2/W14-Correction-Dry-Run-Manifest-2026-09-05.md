# W14 correction — approved and applied manifest

**Date:** 2026-09-05  
**Mode:** public-safe approved-remediation record.
**Status:** **ACCEPTED AND APPLIED IN DEVELOPMENT**
**Production:** not accessed or changed.

This document supplements
[Baseline-0049-0050-Continuity-Evidence-2026-09-05.md](Baseline-0049-0050-Continuity-Evidence-2026-09-05.md).
It deliberately contains opaque record IDs and state transitions only: no
names, email addresses, or full national IDs.

## Execution contract

This was a **dedicated tenant-preserving controlled remediation**, not an owner
release and not a use of the existing owner-release path. It acquired the
canonical occupancy advisory lock and locked unit row, then re-read the exact
prestate before applying the approved effects.

## Exact locked prestate and applied transitions

| Record | Locked prestate | Applied poststate |
| --- | --- | --- |
| Unit **10** | `verifiedOwnerId=2108`; `verifiedTenantId=2131`; `occupantType=tenant_occupied` | All three fields unchanged |
| User **2108** | owner; `verified_owner` | user retained; `status=suspended`; `unitId=null`; `unitNumber=null`; no deletion and no Clerk deletion job |
| User **2131** | active verified tenant; `unitId=10` | unchanged |
| Resident **3** | active owner | `moved_out`; `hasPortalAccess=false`; `linkedUserId=null` |
| Resident **6** | active family | `moved_out`; `hasPortalAccess=false`; `linkedUserId=null` |
| Resident **12** | active family | `moved_out`; `hasPortalAccess=false`; `linkedUserId=null` |
| Resident **4** | text-only W14 record; `unitId=null`; pending invitation **1** | `moved_out`; `hasPortalAccess=false`; `linkedUserId=null` |
| Invitation **1** | pending; associated with resident 4 | revoked |
| Resident **5** | inactive tenant; `isPrimary=false`; `linkedUserId=2131` | active tenant; `isPrimary=true`; `linkedUserId=2131` |
| Verification **3** | approved | unchanged |
| Verification **4** | approved | unchanged |
| Tenancy lifecycle **1** | active | unchanged |
| Waha application **8** | active | revoked |
| Waha credentials **70**, **71** | active | revoked with execution timestamp and correction reason; one revocation event appended for each credential |
| Vehicle **6** | active | inactive; `parkingLotId=null`; `userId=null`; retained for history |
| Bookings **25**, **26**, **53** | cancelled | unchanged: user, unit, and status retained |
| `release_operations` | no remediation operation | no row created |
| `resident_removal_operations` | no remediation operation | no row created |

Execution created correction operation **1**, resolved migration-correction
queue row **6**, and recorded supplement **1**. It has four resident archival
effects (3, 4, 6, 12), one tenant reactivation/primary designation (5), one
invitation revocation, one Waha application revocation, two credential
revocations with two events, and one retained-vehicle deactivation. It did not
alter either unit claim, either approved verification, the active tenancy
lifecycle, or the listed cancelled bookings.

## Applied schema/service addition

The approved forward migration and dedicated service create
append-only `occupancy_correction_operations`. The operation must have a
unique idempotency/correction key and record the actor, reason, full
before/after state, affected IDs, and postconditions. In the same locked
transaction, it must insert this audit row and resolve the corresponding
`data_migration_corrections` row.

Operation 1 supplied the generated execution values. This public record omits
the actor's personal identifiers, timestamp values, idempotency value, and
full audit snapshot.

## Verified postconditions

After the one-time Development transaction:

- unit 10 still has `verifiedOwnerId=2108`,
  `verifiedTenantId=2131`, and `occupantType=tenant_occupied`;
- no active owner household remains;
- resident 5 is the exactly one active tenant primary;
- no active owner Waha application/credential, vehicle, or invitation remains;
- all listed archival, revocation, and retention effects match the table above;
- the immutable correction operation and resolved migration-correction record
  are present.

## Execution identity boundary

The administrator identity was matched by normalized email to user **2105**.
It was absent from all correction-subject and entitlement references and
remained unitless and otherwise unchanged. The normalized address itself is
not published.

## Applied-in-Development boundary

This approval covered the forward migration, dedicated service, and this
one-time Development correction only. It did not authorize or perform
Production access or change.