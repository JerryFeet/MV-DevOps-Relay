# Waha Runtime 02 — Guest Day-Pass Route Parity

Date: 2026-09-07  
Classification: **DISPROVED / MIXED ROUTE BEHAVIOR**

## Question

After a purchaser moves from unit A to unit B, do self-read and every verification surface apply the same occupancy rule to an already paid unit A Guest Day Pass?

## Runtime method

An executable Supertest regression invoked the real Express handlers with the project database adapter replaced by the established in-memory persistence harness.

Fixture:

- A paid, issued, unrevoked day pass was stored for unit A and scheduled for the runtime date.
- Its purchaser's current user and active resident linkage were moved to unit B.
- A guard account invoked both authenticated gate-verification routes.

## Observed result

| Runtime surface | Observed behavior |
|---|---|
| `GET /api/waha-guest-day-passes/mine` as purchaser | `200`, empty list |
| `GET /api/verify?token=...` | `200`, `valid: true`, `APPROVED` |
| `GET /api/security/gate/day-pass?token=...` as guard | `200`, `valid: true`, `APPROVED` |
| `GET /api/security/gate/scan?code=<token>` as guard | `200`, `valid: true`, `APPROVED`, unit A |
| `GET /api/security/gate/scan?code=<numeric-id>` as guard | `200`, `valid: true`, `APPROVED`, unit A |

## Conclusion

Route parity is disproved.

- The self-read route follows the purchaser's current unit and hides the old unit A pass.
- The public verifier and both guard-verification paths continue to approve the same pass from its stored payment/date/revocation state.
- Both unified scanner forms continue to identify unit A.

The result is mixed across layers: invisible to the moved purchaser, but accepted at the gate.

No product behavior was changed.

## Executable evidence

Test:

```text
artifacts/api-server/src/__tests__/stage4I3I4Guards.test.ts
runtime observation: mine hides a moved purchaser's old-unit day pass while every scanner approves it
```

Validation:

```text
Test Files  1 passed (1)
Tests       26 passed (26)
```
