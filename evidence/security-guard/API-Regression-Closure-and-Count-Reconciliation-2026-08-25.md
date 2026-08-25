# API regression closure and test-count reconciliation

**Date:** 2026-08-25  
**Scope:** Confirmation of the Stage 6B baseline comparison, the 50-test repair method, the current API test-count delta, and the frozen development-catalog verifier.  
**Out of scope:** Deployment, production access, live payment credentials, and any database mutation.

## 1. The 50 failing tests were not repaired by changing application behavior

**Confirmation: no.** None of the 50 failures identified by the 11-file attribution run was repaired by changing application code.

- The SG9–SG12 failures were corrected by supplying the now-required deliberate contract fields in valid test payloads and fixtures.
- The H9 failures were corrected by updating stale mocks and expectations for the durable rate limiter and announcement-visibility contract.
- The only product-source change in the closure commit is the separate SG6 hardening of the National-ID rate-limit subject from a public hash to a keyed HMAC. It is not one of the 50 attribution repairs.

The earlier baseline comparison remains the causation evidence: the same 11 files passed before Stage 6A, remained green through Stage 6A/6B/6C, first failed at H9 and the SG9–SG12 tenant-verification boundary, and are now green again.

## 2. Runner-counted test delta from Stage 6B

The Stage 6B carry-forward checkout (`f622728`) was rerun with the API Vitest command:

```text
1,460 passed | 0 skipped
```

The current checkout was run in the same JSON-reporter format:

```text
1,379 passed | 21 skipped | 1,400 total | 0 failed
```

The runner-counted reconciliation is:

```text
1,460 baseline
− 129 named removed cases
+  69 named added cases
= 1,400 current total
```

### Removed or reduced test files

| File | Before | Current | Delta | Reason |
| --- | ---: | ---: | ---: | --- |
| `aiAllCancelledBookingsCount.test.ts` | 15 | 0 | −15 | Retired Dalil personal booking-data behavior. |
| `aiChat.test.ts` | 6 | 5 | −1 | Redundant personal-context assertion removed under knowledge-only Dalil. |
| `aiChatContextInjection.test.ts` | 30 | 0 | −30 | Retired Dalil account/context injection coverage. |
| `aiChatUnitVerificationGuard.test.ts` | 25 | 0 | −25 | Retired Dalil resident/unit-state behavior. |
| `aiPendingBookingExclusion.test.ts` | 19 | 0 | −19 | Retired Dalil booking-data behavior. |
| `aiRateLimiterConcurrency.test.ts` | 10 | 0 | −10 | Replaced the process-local limiter suite with durable-limiter coverage. |
| `aiRateLimiterRestart.test.ts` | 8 | 0 | −8 | Replaced the process-local restart suite with durable-limiter coverage. |
| `ownershipChangeExpiry.test.ts` | 19 | 8 | −11 | Retired Stage 6C claimant-slot expiry and stale-warning behavior. |
| `ownershipChangeFlow.test.ts` | 50 | 47 | −3 | Retired Path B pre-approved fast-track behavior. |
| `ownershipChangeScheduler.test.ts` | 14 | 7 | −7 | Retired claimant-slot expiry scheduler behavior. |

`ownershipChangeFlow.test.ts` additionally retains **21 explicit skips** for archived legacy Path B fast-track behavior. Those cases remain in the total and are not silently deleted.

### Added or expanded test files

| File | Delta |
| --- | ---: |
| `adminUnitRegistry.test.ts` | +1 |
| `aiKnowledgeOnlyPrivacy.test.ts` | +4 |
| `durableRateLimit.test.ts` | +5 |
| `evidencePublicationFormat.test.ts` | +4 |
| `firstSignInConcurrency.integration.test.ts` | +1 |
| `gateCredentialScan.test.ts` | +3 |
| `gatePermitProjection.test.ts` | +3 |
| `gateResidentSearch.test.ts` | +5 |
| `guestHistoryPurge.test.ts` | +2 |
| `notificationService.test.ts` | +1 |
| `ownership.test.ts` | +7 |
| `paymentProductionGuard.test.ts` | +1 |
| `paymentWebhookRoute.test.ts` | +2 |
| `paymentWebhookSignature.test.ts` | +2 |
| `releaseMutationBoundary.test.ts` | +4 |
| `releaseSubject.test.ts` | +1 |
| `residentsPortalInvite.test.ts` | +4 |
| `stage4B1B6Corrections.test.ts` | +1 |
| `stage4I3I4Guards.test.ts` | +2 |
| `suspendedAccountBlock.test.ts` | +3 |
| `tenancyLifecycleStage6b.test.ts` | +3 |
| `tenantVerificationAdminBlock.test.ts` | +7 |
| `unitVerificationTitleDeedLifecycle.test.ts` | +1 |
| `vehicleGuestValidation.test.ts` | +2 |
| **Total additions** | **+69** |

## 3. Frozen development catalog verifier

The source baseline (`0000_baseline.sql`) and a read-only development catalog query both describe the same post-0043 catalog:

```text
42 public tables
575 public columns
112 public constraints
139 public indexes
3 non-internal triggers
```

The verifier had retained the stale `43/582/113/142/3` values. It now expects the frozen-catalog values above and passes read-only, including all five raw system-unit protections.

No migration, ORM push, database reset, deployment, or production access was performed.