# Waha Runtime 03 — Tenancy Scheduler Parity

Date: 2026-09-07  
Classification: **DISPROVED**

## Question

Does terminal tenancy-expiry scheduling produce the same complete Waha revocation graph as a direct terminal release?

## Runtime method

An executable deterministic-clock regression invoked the real `runTenancyLifecycleScheduler()` implementation with the project database adapter replaced by the established transactional in-memory persistence harness.

Fixture:

- An affected unit had an old, terminally eligible tenancy lifecycle.
- The tenant had an active Waha application and active credential.
- The tenant had a paid current day pass, one future confirmed booking, and one past confirmed booking.
- A second unit had equivalent active Waha/day-pass/booking rows and no eligible lifecycle.
- Runtime time was pinned to `2026-09-07T08:00:00.000Z`.

## Observed affected-unit result

- Tenancy lifecycle: `released`
- Waha application: `revoked`
- Waha credential: **remained `suspended`**, with holder link cleared
- Release operation affected credential IDs: empty
- Paid current day pass: revoked with tenancy reason
- Future booking: cancelled; user link cleared
- Past booking: remained confirmed; user link cleared
- Release operation: recorded as `released`

## Observed unaffected-unit result

- Waha application: remained `active`
- Waha credential: remained `active`
- Day pass: remained unrevoked
- Future booking: remained confirmed and linked

## Runtime explanation

The scheduler first performs expiry suspension, changing the affected credential from `active` to `suspended`. Terminal release then resolves only credentials whose status is `active`. The suspended credential is therefore omitted from the release graph even though its parent application is revoked.

## Conclusion

Scheduler parity is disproved for credential final state and revocation-event inclusion. The remaining tested release consequences—application, day pass, future booking, past booking status, and unrelated-unit isolation—completed as expected.

No product behavior was changed.

## Executable evidence

Test:

```text
artifacts/api-server/src/__tests__/tenancyLifecycleStage6b.test.ts
terminal tenancy expiry leaves the affected credential suspended while releasing the rest of the graph
```

Validation:

```text
Test Files  1 passed (1)
Tests       25 passed (25)
```
