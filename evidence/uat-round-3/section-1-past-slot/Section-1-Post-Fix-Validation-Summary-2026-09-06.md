# Round 3 Section 1 — Post-fix validation

Date: 2026-09-06  
Environment: Development  
Named browser command: `pnpm run round3:regression:e2e`

## Delivered behavior

- Availability keeps elapsed slots non-offerable by comparing each slot's real start instant with request-time `now`.
- `POST /api/bookings` rejects `startTime <= now` before grid, window, operating-hours, or conflict validation with exact HTTP 400 JSON:
  - `{"error":"BOOKING_START_TIME_PASSED"}`
- A rejected cancellation remains open and visibly displays the server reason.
- F12 was not changed. The future same-unit/same-facility browser journey continues to return and display `ACTIVE_UNIT_FACILITY_BOOKING_EXISTS`.
- Monthly allowance pricing behavior and all later Round 3 sections remain out of scope.

## Validation results

| Check | Result |
|---|---|
| Permanent Round 3 browser project | **5/5 passed**, no retries |
| Focused API booking guards | **11/11 passed** |
| Focused portal booking-card contracts | **5/5 passed** |
| API type check | **Passed** |
| Portal type check | **Passed** |
| Full portal unit suite | **1,443/1,443 passed** |
| API and portal workflow restart | **Healthy** |

## Permanent browser coverage

1. Riyadh-today UI availability renders no enabled elapsed slot.
2. An authenticated, grid-aligned crafted past start is refused server-side with the stable code.
3. A cancellation `409` remains visible in the open resident dialog.
4. A second future booking for the same unit/facility is refused with the F12 code.

The original pre-fix 1c run used a real elapsed booking and the real server cancellation `409`. After elapsed booking creation was blocked, the permanent UI rejection-display case was kept reachable by creating a future booking through the real wizard and deterministically returning the same `409` body on its cancellation request. The existing API test continues to prove the real past-cancellation rule.

## Validation boundary

The broad API suite was also invoked once and reported four resident self-registration test failures in `residentStageTwo.test.ts`. Those failures are outside Section 1 and are not caused by the booking changes. They are reported here without an inferred fix or a queued follow-up task.
