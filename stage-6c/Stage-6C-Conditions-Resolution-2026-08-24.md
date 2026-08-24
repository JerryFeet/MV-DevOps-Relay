# Stage 6C — Resolution of the Three Acceptance Conditions

**Date:** 2026-08-24  
**Scope:** Evidence-only resolution of the three Stage 6C acceptance conditions.  
**Environment:** Development only. No deployment, production data access, or live payment credentials were used.

## Condition 1 — The 21 skipped tests are named and classified

All 21 skips are in `artifacts/api-server/src/__tests__/ownershipChangeFlow.test.ts`. They are **permanent retired-behaviour skips**, not environmental skips. They preserve the historical assertions for the deliberately retired Path B claimant-slot, `pre_approved`, finalize, and cancel-pre-approval flow. No active test continues to authorize that mechanism.

| # | Archived assertion | Reason for permanent skip |
| --- | --- | --- |
| 1 | Wrong NID does not return `pre_approved` | The name/NID fast-track and `pre_approved` outcome were retired. |
| 2 | Wrong name does not return `pre_approved` | The name/NID fast-track and `pre_approved` outcome were retired. |
| 3 | Non-admin receives 403 from `finalize` | The claimant-promotion endpoint itself is retired. |
| 4 | Admin can finalize a pre-approved claimant | Administrator promotion of a claimant is retired. |
| 5 | Finalize marks the event `completed` | This asserted the retired claimant-promotion sequence. |
| 6 | Finalize marks the claimant `verified_owner` | This asserted the retired claimant-promotion sequence. |
| 7 | Finalize makes the claimant the unit’s verified owner | This asserted the retired claimant-promotion sequence. |
| 8 | Finalize clears `preApprovedClaimId` | The claimant slot is retired. |
| 9 | Finalize rejects an already-completed event | The finalize operation is retired. |
| 10 | Finalize rejects a pending event | The finalize operation is retired. |
| 11 | Finalize rejects an event with no claimant | The finalize operation is retired. |
| 12 | Finalize rejects a claimant not in `pre_approved` | The `pre_approved` state and finalize operation are retired. |
| 13 | Non-admin receives 403 from cancel-pre-approval | The claimant-slot cancellation endpoint is retired. |
| 14 | Cancel-pre-approval rejects an event with no claimant | The claimant slot and its cancellation operation are retired. |
| 15 | Cancel-pre-approval clears `preApprovedClaimId` | The claimant slot is retired. |
| 16 | Cancel-pre-approval rejects a non-approved event | The claimant-slot cancellation operation is retired. |
| 17 | Cancel-pre-approval rejects an event with a claimant | The claimant-slot cancellation operation is retired. |
| 18 | Cancel with claimant reverts verification to `unverified` | This asserted the retired `pre_approved` claimant lifecycle. |
| 19 | Cancel with claimant clears `unitId` | This asserted the retired claimant lifecycle. |
| 20 | Cancel with claimant clears `preApprovedClaimId` | The claimant slot is retired. |
| 21 | Cancel with claimant clears `newOwnerUserId` | This asserted the retired claimant lifecycle and its PII-clearing branch. |

The active replacements prove the new contract: Path B approval releases the outgoing owner without creating a claimant slot, ordinary B7 incoming-owner verification is used, and both retired endpoints return `404`.

## Condition 2 — Full API-suite count, with per-file delta

The Stage 6B report of **1,468 passed across 93 files** is correct for the Stage 6B implementation revision (`1139355`). It was rerun for this resolution and produced exactly that result.

A later evidence-only revision (`f982a3a`) added four passing relay-publication-format assertions. Its full API suite is therefore **1,472 passed across 94 files** before the Stage 6C ownership refactor.

The current development revision (`213f2a2`) was rerun and produced **95 files, 1,434 passed, 21 permanent retired-behaviour skips** — 1,455 declared assertions in total.

| File | Change from the 1,472 pre-retirement baseline | Reason |
| --- | ---: | --- |
| `evidencePublicationFormat.test.ts` | +4 before Stage 6C | Relay evidence validation was added after the original Stage 6B count. |
| `adminUnitRegistry.test.ts` | +1 | O7 ownerless-unit elapsed-time coverage, excluding HOA COMMON. |
| `ownershipChangeExpiry.test.ts` | −11 | Removed Path B claimant-expiry and stale-badge assertions; the claimant slot no longer exists. |
| `ownershipChangeFlow.test.ts` | −24 passed, +21 permanent skips | Replaced the active claimant-slot/promotion flow with ordinary B7 and retired-endpoint coverage; retained 21 historical assertions as documented skips. |
| `ownershipChangeScheduler.test.ts` | −7 | Removed the retired Path B claimant-slot expiry scheduler assertions. |
| `releaseSubject.test.ts` | +1 | O3/O4 release-engine proof that verified tenants remain intact and no claimant slot is created. |
| `firstSignInConcurrency.integration.test.ts` | +1 | Real PostgreSQL clean-schema proof: 50 simultaneous provisions yield one row. |
| `residentsPortalInvite.test.ts` | +1 | Suspension-between-provisioning-and-invitation-linkage regression proof. |

The arithmetic is:

```text
Stage 6B reported baseline                       1,468
Later evidence-publication-format coverage          +4
Stage 6C ownerless registry coverage                +1
Retired claimant expiry/stale coverage             -11
Retired Path B flow active assertions              -24
Retired claimant-expiry scheduler assertions        -7
Stage 6C release-engine tenant-preservation proof   +1
First-sign-in 50-way concurrency proof              +1
Suspended-invitation race proof                     +1
                                                --------
Current passing assertions                       1,434
```

The reported 1,468 → 1,434 change is therefore **−34 passed assertions**. The 21 skips are separately named permanent historical assertions, and the current total assertion count is **1,455** rather than 1,434.

## Condition 3 — Task #711 is a go-live prerequisite

**Task #711, superseded in implementation by Task #712, is recorded as a go-live prerequisite rather than a backlog item.**

The underlying risk was a concurrent first sign-in causing separate `POST /api/users/me/sync` calls to collide on the unique Clerk ID and leave a signed-in resident on a blank portal route. Every resident uses this path at first access, so this is a production-readiness condition even though it was not an ownership-change defect.

The prerequisite is now satisfied in development by:

1. Atomic Clerk-ID provisioning with conflict-safe profile resolution.
2. Suspension-safe conflict handling and invitation linkage under a recipient lock.
3. A clean temporary PostgreSQL schema verified at zero rows before **50 simultaneous provisions**, with every caller resolving to one user row.
4. Browser validation of a genuinely fresh Clerk identity showing populated `/portal` and `/portal/unit-verification` screens without a blank route or sync failure.

The 50-way clean-schema test was rerun for this record on 2026-08-24: **1 test passed**. The current full API suite was rerun for this record: **1,434 passed, 21 named permanent skips**.

## Result

All three Stage 6C evidence conditions are resolved:

- Every skip is named and permanently classified.
- The Stage 6B-to-current API count is reconciled per file.
- The first-sign-in concurrency work is explicitly treated as, and proven against, a go-live prerequisite.