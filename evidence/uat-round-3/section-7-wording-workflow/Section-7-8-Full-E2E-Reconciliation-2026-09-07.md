# Round 3 Section 7/8 — full E2E reconciliation

**Date:** 2026-09-07

## Full named gate

The restarted `e2e` workflow ran all 124 registered cases serially with both
Portal and API healthy.

Result:

- **115 passed**
- **8 deliberately skipped**
- **1 failed**

Every changed C-3, C-5, C-6, and Section 8 browser journey passed inside that
full run.

## The one failure

The existing positive guard walkthrough expected its paid day pass to verify.
The new purchaser-occupancy boundary correctly returned `valid: false` because
the fixture created:

- an active verified owner;
- a paid day pass linked to the owner and unit;
- but no active `residents` occupancy linked to that owner in the unit.

This was a fixture-contract failure, not a product failure.

The fixture was corrected under the real database invariants:

- the unit is `owner_occupied`;
- the purchaser remains the active linked user for that unit;
- an active primary owner resident links the same user and unit.

No production guard or occupancy protection was weakened.

## Focused reconciliation

The exact failed project was rerun after the fixture correction:

- guard authentication/setup: passed;
- real five-positive-decision guard browser journey: passed;
- paid day pass: valid;
- result: **2 passed**.

The 115 already-passing full-suite cases were not rerun because the only
subsequent change was the isolated positive-control fixture.

Evidence:

- `Waha-Fixes-Guard-Positive-Control-PASS-2026-09-07.txt`
