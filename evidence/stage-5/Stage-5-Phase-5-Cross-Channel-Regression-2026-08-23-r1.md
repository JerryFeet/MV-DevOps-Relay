# Stage 5 Phase 5 — Cross-channel regression and evidence

Date: 2026-08-23  
Status: verified; no deployment performed

## Repeatable runner

`pnpm run stage5:regression` now records API, portal, mobile, and Playwright checks into timestamped Stage 5 JSON plus local per-suite logs. The single combined command can exceed the hosted shell's fixed five-minute ceiling because the browser suite alone takes about five minutes; the individual commands below are the authoritative completed runs.

## Completed regression results

| Channel | Command | Result |
|---|---|---:|
| API typecheck | `pnpm --filter @workspace/api-server run typecheck` | passed |
| Portal typecheck | `pnpm --filter @workspace/hoa-portal run typecheck` | passed |
| Mobile typecheck | `pnpm --filter @workspace/hoa-mobile run typecheck` | passed |
| API Vitest | `pnpm --filter @workspace/api-server run test` | 89 files, 1,439 passed |
| Portal Vitest | `pnpm --filter @workspace/hoa-portal run test` | 63 files, 1,368 passed |
| Mobile Vitest | `pnpm --filter @workspace/hoa-mobile run test` | 17 files, 415 passed |
| Portal Playwright | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium) pnpm --filter @workspace/hoa-portal run e2e` | 82 passed, 6 conditional skips, 0 failed |

The Playwright run completed after pre-flight confirmed portal and API reachability. The six skips are fixture-dependent conditional scenarios, not failures.

## Phase 3 real-browser supplement

The deterministic-provider browser UAT proved both direct Day Pass and Waha replacement success/cancel/retry flows using server-recorded attempts and browser screenshots. It confirmed distinct retry attempts/charges and no entitlement issuance before confirmed settlement.

## Review and remediation

An independent implementation review identified retry concurrency, settlement outbox, date-validation, and pending-result concerns. The implementation was corrected and rechecked:

- per-subject retry transaction lock and eligibility gate;
- transactional Day Pass email/push outbox intent;
- strict non-past Day Pass date validation;
- pending result polling;
- Waha replacement lost/stolen/damaged retry allowlist;
- process-unique deterministic charge IDs.

Final API/portal suites and all type checks passed after those corrections.
