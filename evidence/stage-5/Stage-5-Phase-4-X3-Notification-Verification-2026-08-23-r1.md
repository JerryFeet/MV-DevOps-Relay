# Stage 5 Phase 4 — X3 notification verification

Date: 2026-08-23  
Status: verified; no deployment performed

## Delivered contract

- Central bilingual Arabic-default catalogue for all 16 X3 events.
- Durable email and push outbox intents with per-channel idempotency.
- Policy rules: event 8 follows announcement opt-out; events 9 and 12 are mandatory and cannot be suppressed.
- Retry/backoff and delivery preference behavior remain covered by the notification service suite.
- Events 13, 14, and 16 are registered and renderable for the later Stage 6 lifecycle producers; no Stage 6 flow was started.

## Settlement wiring

Guest Day Pass event 6 is now written within the successful payment settlement transaction, not as a best-effort webhook side effect. This means the signed-provider route and the deterministic browser exercise use the same outcome path.

The final development UAT purchased a one-guest pass for 2026-08-28:

| Observation | Result |
|---|---|
| Payment attempt | `8`, `confirmed`, purpose `guest_day_pass` |
| Day Pass | `5`, payment status `paid`, attempt `8` |
| Stable business key | `guest-day-pass-5-issued` |
| Email intent | notification event `10`, event type `6`, delivered |
| Push intent | notification event `11`, event type `6`, delivered |

Exactly two durable rows existed for the business key: one email and one push row. The result page showed `Guest Day Pass Issued` and did not use booking wording.

Browser screenshots retained by UAT:

- checkout: `jgn2tj`
- purpose-specific confirmation: `19ryo6`

## Automated verification

- Notification service/catalogue suite: 52 tests passed.
- Payment callback/provider focused suite: 12 tests passed.
- API typecheck: passed.
