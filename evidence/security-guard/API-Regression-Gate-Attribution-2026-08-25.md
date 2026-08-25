# API Regression Gate — Failure Attribution and Repair

**Date:** 2026-08-25  
**Scope:** development API test suite only  
**Decision:** no failure was accepted as pre-existing without a historical execution.

## Historical control

The exact eleven files were run in a detached writable worktree at:

```text
cbfe0f1c6fe52ef10fc883c828622fe15005ec06
Add UAT change requirements documentation
```

This is the actual parent of the Stage 6A implementation commit. Result:

```text
Test Files  11 passed (11)
```

Therefore none of the failures predates the Stage 6 work.

## Per-file attribution

| Failing file | Failed tests before repair | First failing boundary | Attribution | Repair |
| --- | ---: | --- | --- | --- |
| `adminAlertOnApprovalRequired.test.ts` | 4 | `e339309` | SG9–SG12 tenant-verification request contract | Added valid gender/required fields to requests so alert assertions reach their intended paths. |
| `aiChat.test.ts` | 3 | `b1dfe0f` | H9 durable rate-limit replacement | Replaced obsolete in-memory counter assumptions with durable-limiter contract assertions. |
| `aiKbPdfKeywordSearch.integration.test.ts` | 1 | `b1dfe0f` | H9/Dalil knowledge-only audience contract | Supplied the appropriate session claims/mocks for the document audience contract. |
| `bookingAdvanceWindowF9.test.ts` | 1 | `e339309` | SG9–SG12 tenant-verification request contract | Added the newly required valid request field before testing the reserved-unit rejection. |
| `ownershipChangeFlow.test.ts` | 1 | `e339309` | SG9–SG12 tenant-verification request contract | Added the newly required valid request field before testing ordinary manual review. |
| `phoneCanonical.test.ts` | 9 | `e339309` | SG9–SG12 resident/verification request contract | Added valid gender to baseline resident and verification payloads so canonicalization remains the tested concern. |
| `pushNotifications.test.ts` | 3 | `b1dfe0f` | H9-era announcement test mock drift | Restored the real announcement visibility contract in the mocked database module and used current visibility fixtures. |
| `residentStageTwo.test.ts` | 2 | `e339309` | SG9–SG12 resident/verification request contract | Added valid required request fields before approval assertions. |
| `roles-vehicles-announcements.test.ts` | 1 | `b1dfe0f` | H9-era announcement test mock drift | Restored the real announcement visibility contract in the mocked database module and used a current draft fixture. |
| `stage2ParkingAndCorrections.test.ts` | 14 | `e339309` | SG9–SG12 owner/tenant verification request contract | Added valid gender and approval-basis defaults while retaining parking validation cases. |
| `unitVerificationSecurity.test.ts` | 11 | `e339309` | SG9–SG12 owner/tenant verification request contract | Added valid gender and approval-basis defaults so each security assertion reaches its intended guard. |

## Boundary runs

| Commit | Result for these 11 files |
| --- | --- |
| `cbfe0f1` — pre-Stage 6A parent | 11 files passed |
| `81f53b1` — Stage 6A | 11 files passed |
| `1139355` — Stage 6B | 11 files passed |
| `4fcb4e3` — Stage 6C | 11 files passed, 21 skipped |
| `b1dfe0f` — H9 durable rate limits | 4 files failed, 8 tests failed |
| `e339309` — SG9–SG12 tenant verification | 11 files failed, 50 tests failed |

## Final regression gate

After the targeted test-contract repairs and the SG6 HMAC change:

```text
Test Files  97 passed (97)
Tests       1,379 passed | 21 skipped (1,400)
```

The API typecheck and whitespace/diff validation also passed. No production route was loosened to make the suite pass.