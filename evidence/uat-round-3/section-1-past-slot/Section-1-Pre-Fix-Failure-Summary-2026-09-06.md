# Round 3 Section 1 — Pre-fix browser regression evidence

Date: 2026-09-06  
Environment: Development  
Browser project: `round3-regression` / Desktop Chromium  
Command: `pnpm run round3:regression:e2e`

## Result

The named suite reached all four Section 1 booking journeys on the unchanged application:

| Test | Pre-fix result | Evidence |
|---|---|---|
| 1a — today's UI availability never renders an elapsed slot | **FAIL as expected.** At browser time `2026-09-06T20:55:19.470Z`, the UI offered 13 enabled starts from `07:00Z` through `19:00Z`. | Raw Playwright output and 1a PNG |
| 1b — POST booking with an elapsed start is rejected | **FAIL as expected.** The real authenticated booking request was modified to a grid-aligned past start; the server accepted it instead of returning `400 BOOKING_START_TIME_PASSED`. The unexpected booking was removed by test cleanup. | Raw Playwright output and 1b PNG |
| 1c — an elapsed booking cannot be cancelled silently | **FAIL as expected.** The resident created an elapsed booking through the real wizard. Cancellation returned the existing server `409`, but the dialog closed and did not show the server reason. The booking was removed by test cleanup. | Raw Playwright output and 1c PNG |
| F12 — active unit/facility rule for a second future booking | **PASS.** The first future booking was created through the UI; the second future booking for the same unit/facility was refused and the UI exposed `ACTIVE_UNIT_FACILITY_BOOKING_EXISTS`. | Raw Playwright output |

Suite total: **3 failed, 2 passed** (the fifth passing test is the verified-resident setup dependency).

## Boundaries

- No application behavior had been changed when this run was captured.
- Booking scenarios were created through the verified-resident portal and real facility wizard.
- No facility or booking rows were seeded.
- The dedicated verified-resident unit and active Waha Pass are stable prerequisite identity fixtures.
- Cleanup targeted only booking IDs created unexpectedly or deliberately by these tests.
- Playwright retry traces are intentionally not published because evidence is delivered as individual readable files, not ZIP archives.
