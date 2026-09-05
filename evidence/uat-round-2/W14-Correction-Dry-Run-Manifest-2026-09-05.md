# W14 correction — dry-run manifest

**Date:** 2026-09-05  
**Mode:** read-only data assessment; no mutation.  
**Status:** **APPROVAL REQUIRED / NOT APPLIED**
**Architect review:** **PASS** for the completed foundation; this separate
data correction remains approval-gated.  
**Production:** not accessed or changed.
**Citation basis:** read-only Development assessment, current migration/source,
and `git diff` reviewed 2026-09-05.

This manifest supplements, rather than duplicates, the protected baseline
evidence in
[Baseline-0049-0050-Continuity-Evidence-2026-09-05.md](Baseline-0049-0050-Continuity-Evidence-2026-09-05.md).

## Exact current state observed

W14 is the sole flagged inconsistent unit in the read-only review:

| Item | Current count/state |
| --- | --- |
| Unit | row **10** / `W14`; `occupant_type = tenant_occupied` |
| Verified ownership link | user row **2108** |
| Verified tenancy link | user row **2131** |
| Resident rows | 4 total |
| Active owner residents | 1: resident row **3** |
| Active family residents registered with the owner household | 2: resident rows **6**, **12** |
| Active tenant residents | 0 |
| Inactive tenant resident linked to verified tenant | 1: resident row **5** |
| Conflicting units found | 1 (W14) |

Source: `Round-2-Foundation-Lifecycle-Current-Behaviour-Report-2026-09-05.md`,
sections 3.1–3.2. Migration 0049 classifies W14 but expressly excludes it from
primary backfill and makes no occupancy/resident correction
(`0049_occupancy_core.sql:65-132`).

## Proposed tenant-preserving correction (before → after)

| Object/effect | Before | Proposed after |
| --- | --- | --- |
| Unit row 10 ownership link | `verified_owner_id=2108` | unchanged |
| Unit row 10 tenancy link | `verified_tenant_id=2131` | unchanged |
| Unit row 10 occupancy | `tenant_occupied`, contradicted by active owner household | `tenant_occupied`, represented by tenant household |
| Tenant resident row 5 | `status=inactive`, `is_primary=false`, `linked_user_id=2131` | `status=active`, `is_primary=true`, `linked_user_id=2131` |
| Owner resident row 3 | `status=active`, `is_primary=false`, `linked_user_id=2108` | `status=moved_out`, `is_primary=false`, `linked_user_id=null` |
| Family resident row 6 | `status=active`, `is_primary=false`, `linked_user_id=null` | `status=moved_out`, `is_primary=false`, `linked_user_id=null` |
| Family resident row 12 | `status=active`, `is_primary=false`, `linked_user_id=null` | `status=moved_out`, `is_primary=false`, `linked_user_id=null` |
| Active household composition | owner household only | tenant household only |
| Primary count | no valid active tenant primary | exactly one active tenant primary |

Planned row effects are therefore **1 tenant resident activation/primary
designation**, **3 owner-household resident archival effects**, and **1 unit
state reconciliation**. The verified owner and verified tenant links are
preserved: this is occupancy correction, not ownership transfer or tenancy
termination.

This public manifest deliberately identifies only opaque row IDs and field
transitions. It contains no resident names, email addresses, or full national
IDs.

## Dependency/read-only limits and risks

The read-only snapshot establishes the resident and unit counts above. It does
not seed or execute dependency fixtures, so it does not claim an executed count
for invitations, portal identities, Waha credentials, vehicles, bookings,
permits, guests, passes, identity-deletion jobs, or notification rows. Before
execution, a locked production-like dry-run must enumerate their exact IDs and
effects. A revoked Waha credential must not be resurrected; tenant eligibility
must follow normal issuance/validation.

Principal risks are stale reads, choosing the wrong household, accidentally
clearing the owner claim or tenant link, partial dependency cleanup, and a
concurrent occupancy transition. Required controls are the canonical unit
advisory/row lock, deterministic dependency plan, postconditions, append-only
correction audit, and before/after protected snapshot.

## Alternative owner-preserving path

If the product owner instead elects owner occupancy, the alternative is to
retain the verified owner claim, archive/end the tenant resident and tenant
occupancy relationship through the approved tenancy-release path, make the
owner resident the one active primary, retain/archive owner-family rows as the
selected household policy requires, and set `occupant_type = owner_occupied`.
That is a materially different tenancy-ending decision; it is **not** implied
by the current data and is not proposed by this manifest.

## APPROVAL REQUIRED / NOT APPLIED

No W14 row, dependency, identity, credential, unit link, migration, or audit
record was changed for this manifest. Execution requires product-owner approval
of this exact tenant-preserving plan, a fresh locked dry-run with exact
dependent-object counts/IDs, confirmation that W14 remains the sole conflict,
and postcondition verification after one transaction.