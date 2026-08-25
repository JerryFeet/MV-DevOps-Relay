# E2E count delta — facility-panel flake explanation

Evidence revision: r1
Relay: JerryFeet/MV-DevOps-Relay, branch main
Classification: test-run explanation; no product acceptance claim

## Count

Previous full E2E result: 79 passed / 4 skipped.
Current full E2E result: 78 passed / 1 flaky (retried successfully) / 4 skipped.
There was no final hard failure and the four skips did not change.

## Exact flaky test

Test: Facility Booking › at least one facility card or empty state is shown

The test used a broad structural facility-card locator and combined it with the empty-state locator using facilityCard.or(emptyMsg). On the flaky attempt, the locator could resolve both an incidental rounded/bordered layout element and the legitimate empty-state text, producing a Playwright strict-mode ambiguity. The retry passed.

## Shared-cause review

The three facility incidents share exposure to authenticated React and React Query hydration, but fail at different layers:
1. Stage 3a: isVisible({ timeout }) was used as though it waited; it does not.
2. Stage 4: page.goto() itself timed out before panel selectors were reached, indicating route/session readiness trouble.
3. Current incident: navigation completed and the broad test selector was ambiguous.

The evidence supports selector tightening and readiness instrumentation as separate improvements; it does not support collapsing the three into one root cause.
No feature assertion was deleted or weakened.
