# W14 correction — applied evidence

**Date:** 2026-09-05  
**Environment:** Development and disposable clone only.  
**Architect review:** **PASS**.  
**Production:** not accessed or changed.

This public-safe evidence complements
[W14-Correction-Dry-Run-Manifest-2026-09-05.md](W14-Correction-Dry-Run-Manifest-2026-09-05.md).
It contains no name, email address, national ID, Clerk ID, or full database
audit snapshot.

## Controlled execution proof

- A disposable clone submitted the correction using a wrong normalized-email
  actor match. It was refused with **zero mutations**.
- A disposable clone then completed the correction and verified the same
  deterministic affected-object plan and postconditions.
- Development completed correction operation **1**, resolved
  `data_migration_corrections` queue row **6**, and wrote audit supplement
  **1**.
- Idempotency was verified: a repeat request did not duplicate effects,
  operation, queue resolution, or supplement.
- The immutable correction-operation audit trigger and immutable supplement
  trigger were verified.

## Protected state fingerprints

| Capture | SHA-256 |
| --- | --- |
| Before correction | `7d9184948a36125a2f65f73b04bc1b2430c517f060d360ab6160a3d6c90df889` |
| Original correction after-state | `18107af0949649cb3db54fd3d94cd1058b903484c83fce7bf9681d7f49ce8d4b` |
| Supplement 1 final state | `38a7e8dba4116fcece4d7de1e06f3f3d77e3a3039fea6cc4dd42c7b535459b57` |

## Exact affected IDs and end states

| Record(s) | Verified end state |
| --- | --- |
| Unit 10 | `verifiedOwnerId=2108`, `verifiedTenantId=2131`, and `occupantType=tenant_occupied` unchanged |
| User 2108 | retained, suspended, detached from unit (`unitId/unitNumber=null`); no Clerk job |
| User 2131 | active verified tenant, unit 10 |
| Residents 3, 4, 6, 12 | `moved_out`, portal access false, linked user null |
| Resident 5 | active tenant and the one primary; linked to user 2131 |
| Invitation 1 | revoked |
| Waha application 8 | revoked |
| Credentials 70, 71 | revoked; corresponding revocation events present |
| Vehicle 6 | inactive, no parking assignment, userless, retained |
| Bookings 25, 26, 53 | unchanged cancelled records |
| Verifications 3, 4; lifecycle 1 | unchanged approved verifications; unchanged active lifecycle |
| Release/removal operations | no `release_operations` or `resident_removal_operations` row created by this correction |

The verified postconditions are: no active owner household, exactly one active
tenant primary, no active owner Waha application/credential, vehicle, or
invitation, and unchanged unit claims.

## Boundary

The applied correction is a one-time Development data remediation. It is not a
general owner-release behavior and does not authorize a Production migration,
data change, or deployment.