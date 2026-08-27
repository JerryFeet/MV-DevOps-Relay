# Task 731 — P2 Tenancy Renewal Notifications Evidence

**Date:** 2026-08-27  
**Decision:** PASS — implementation and regression evidence complete  
**Scope:** Deliver the complete mandatory bilingual tenancy-renewal notification lifecycle.

## Accepted contract

- Tenant pre-expiry reminders at 30, 14, 7, and 1 days.
- Landlord awareness reminders at the same thresholds while no renewal is submitted.
- Landlord approval reminders immediately on renewal submission and every two days while pending.
- All three notification families use mandatory email and push delivery.
- Content is role-specific, bilingual, idempotent, and stops on terminal lifecycle outcomes.
- Approval reminders continue during post-expiry suspension, stop after 30 elapsed days, and leave the stale case available for T11 cancellation.
- Renewal submission opens 30 days before expiry and closes on the expiry date; the final valid submission day is the day before expiry.
- Recipient locale uses Clerk `unsafeMetadata.hoaNotificationLocale`; invalid, missing, or unavailable metadata safely falls back to Arabic.
- Existing event-12 deletion warnings are unchanged.

## Implementation evidence

- Notification wiring provides stable event-family identities and idempotency keys.
- Notification catalog provides distinct tenant, landlord-awareness, and landlord-approval English/Arabic content.
- Notification service enforces mandatory email and push behavior and renders the recipient locale.
- Tenancy lifecycle scheduling implements the 30/14/7/1 thresholds, immediate and two-day approval cadence, suspension continuation, 30-day cap, terminal stopping, cycle-aware rescheduling, and Arabic fallback.
- Renewal submission remains persisted even if notification enqueueing fails.
- Admin tenancy-release responses expose stale pending renewals, and the portal displays the stale-renewal attention badge for T11 handling.

## Automated evidence

- API notification-service bilingual and mandatory-delivery tests: passed.
- API Stage 6B tenancy lifecycle timing, terminal, suspension, cap, rejection, cancellation, and carry-forward tests: passed.
- API persisted-renewal notification-failure regression test: passed.
- Portal stale-renewal attention and T11 cancellation contract tests: passed.
- API full suite: **98 files passed; 1,412 tests passed; 21 skipped**.
- Portal full suite: **70 files passed; 1,365 tests passed**.
- Mobile full suite: **18 files passed; 403 tests passed**.
- Final full browser E2E run: **91 passed; 7 skipped; 0 failed** across 98 tests.
- API, portal, and mobile typechecks: passed.
- Independent architecture review: **PASS**, with no blocking correctness or security findings.

## Security and data boundaries

- No schema change or migration was introduced; notification locale is stored only in the approved Clerk metadata field.
- No production notification was sent.
- No production deployment was performed.
- No credentials, notification endpoints, resident personal data, or provider secrets are included in this evidence.

## Deviations

None from the authoritative revised P2 requirements.
