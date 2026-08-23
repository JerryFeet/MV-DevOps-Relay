# Stage 5 Phase 3 — Guest Day Pass and Waha replacement UAT

Date: 2026-08-23  
Environment: development only, deterministic provider explicitly enabled outside production  
Status: verified; no deployment performed

## Safety boundary

- Moyasar remains the only live provider. The deterministic adapter is selected only when `PAYMENT_PROVIDER=moyasar`, `PAYMENT_TEST_PROVIDER=deterministic`, and `NODE_ENV` is not production.
- Browser redirects are display-only. Only the server's verified settlement path can confirm an attempt and issue a pass or replacement.
- The normal API workflow was restored to its fail-closed configuration after UAT. No live payment credential was added or used.

## Guest Day Pass browser UAT

The verified resident completed the direct portal purchase dialog on `/portal/guests`:

- The dialog exposed guest count, visit date, and a SAR 30-per-guest total.
- A two-guest purchase displayed SAR 60.00 and reached the non-production hosted checkout.
- Completing checkout produced attempt `1`, charge `det_test_1`, and a server-recorded `confirmed` Guest Day Pass attempt.
- A cancellation produced attempt `2`, status `cancelled`, and no issued entitlement.
- Retrying that terminal attempt opened a distinct charge/attempt (`3`, `det_test_3`) and only the confirmed retry issued the pass.

Screenshots retained by browser UAT:

- hosted checkout label and SAR 60.00: `qp0aia`
- cancelled result with retry: `m49004`
- confirmed retry result: `1lqot8`

## Waha replacement browser UAT

- The resident reported a seeded active credential as lost with the required acknowledgement.
- The original credential was lost and had no replacement before confirmation.
- Cancellation at the SAR 100.00 deterministic checkout left attempt `4` as `cancelled` and did not issue a replacement.
- Retrying opened distinct charge `det_test_5`; confirmation created the replacement only then.
- Database observation after confirmation: original credential referenced replacement credential `2`; the replacement was active and visible again in the portal.

Screenshots retained by browser UAT:

- report flow: `0xrpry`
- cancelled replacement result: `m53plf`
- retry checkout: `a4g5l7`
- confirmed Waha result: `1d4ldc`
- returned active replacement card: `q4i6cz`

## Hardening added after review

- Retry creation is serialized per payable subject with a transaction advisory lock.
- A retry rechecks the terminal source attempt, caller ownership, active-attempt absence, and current booking/day-pass/replacement eligibility.
- Replacement retries accept only the same lost/stolen/damaged states as the original replacement route.
- Day Pass dates are strictly parsed server-side and cannot be in the past.
- Payment results poll a pending server attempt rather than offering a retry before it reaches a terminal state.
- Deterministic charge IDs include a process nonce, avoiding development-database collisions after API restarts.
