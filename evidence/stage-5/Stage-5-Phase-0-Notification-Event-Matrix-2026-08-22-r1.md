# Stage 5 — Phase 0 Notification Event Matrix

**Revision:** r1  
**Status:** Review draft — blocks X3 implementation  
**Source:** UAT Change Requirements, revision 4, X3  
**Delivery rule:** Every event is rendered in the recipient’s selected portal language, defaulting to Arabic when unset. All delivery is requested after the originating transaction commits. Email is sent through configured SMTP; push is sent when the recipient has an active device token.

## Channel and preference policy

- Events **1–7** are decision/service notifications. Disabling announcement notifications must never suppress them.
- Event **8** is the independently opt-out-able announcement event.
- Events **9 and 12** are **email-first, non-optional**. They cannot be suppressed by notification preferences; push is added where a device token exists.
- All event delivery records carry an event ID, recipient, business-subject identity, language, idempotency key, delivery status, and retry history.
- SMTP or push failure must not roll back the business decision. Delivery is recorded and retried without duplicating the underlying event.

| # | Event and trigger | Recipient | Required content | Channels and preference rule |
|---:|---|---|---|---|
| 1 | Unit verification approved or rejected | Submitting user | Unit number, outcome, recorded rejection reason where rejected | Email + push; decision notification |
| 2 | Permit approved or rejected | Submitting user | Permit type, outcome, recorded rejection reason where rejected | Email + push; decision notification |
| 3 | Facility booking confirmed or cancelled | Booking owner | Facility, date, time, outcome; cancellation reason where applicable | Email + push; decision notification |
| 4 | Vehicle registration approved or rejected | Submitting user | Plate number, outcome, selected rejection reason where rejected | Email + push; decision notification |
| 5 | Waha Pass approved, rejected, or revoked | Applicant | Outcome and reason where applicable | Email + push; decision notification |
| 6 | Guest Day Pass issued | Requesting user | Valid date, guest count, amount paid | Email + push; emitted only by confirmed `guest_day_pass` handler |
| 7 | HOA replies to a Contact HOA request | Original sender | Subject reference and reply body | Email + push; decision notification |
| 8 | New announcement published | All portal users | Announcement title and portal link | Email + push; independently controlled by announcement preferences only |
| 9 | Tenancy verification request submitted | Verified owner of the unit at registered account email | Unit number, tenant name, tenant mobile, and approval required | **Email-first, mandatory, non-suppressible**; push when token exists |
| 10 | Tenancy approved or rejected by owner | Submitting tenant | Unit number, outcome, recorded rejection reason where rejected | Email + push; decision notification |
| 11 | Tenancy released by admin | Outgoing tenant and unit owner | Unit number, effective date, reason | Email + push; decision notification |
| 12 | Tenancy expiry reminder at 30, 14, 7, and 1 days | Tenant and owner | Expiry date, renew-or-move-out instruction, access cut-off, deletion warning, and gate fine warning | **Email-first, mandatory, non-suppressible**; push when token exists; one delivery per recipient per scheduled reminder |
| 13 | Renewal submitted | Unit owner | Tenant name, new end date, approval required | Email + push; decision notification |
| 14 | Renewal approved or rejected | Tenant | Outcome and new end date when approved | Email + push; decision notification |
| 15 | Access deactivated at expiry | Tenant and owner | Date and next steps | Email + push; decision notification |
| 16 | Renewal is awaiting owner decision past expiry | Owner on recurring schedule, plus admin alert | Tenant name, days suspended, and that only owner action can lift suspension | Email + push; recurring delivery is idempotent; admin alert uses the same event contract with an administrator recipient |

## Event-service implementation contract

The X3 service must expose a typed event registration or dispatch API. Route handlers and schedulers supply typed business payloads; they do not compose route-local email or push text.

For every row above, implementation must provide:

1. a trigger integration test that captures the requested event;
2. recipient and authorization assertions;
3. English and Arabic rendering assertions;
4. required-subject-content assertions;
5. email and push assertions, with absent-token behavior covered;
6. preference-policy assertions;
7. retry and deduplication assertions;
8. proof that an email/SMTP failure does not roll back the originating transaction.

## Acceptance-specific checks

- Announcement opt-out suppresses event 8 only; events 1–7 continue to deliver.
- Event 9 reaches the verified unit owner’s registered account email even if preferences are disabled.
- Event 12 reaches both tenant and owner on each required day even if preferences are disabled.
- Event 12 scheduler re-runs do not duplicate the same recipient/day reminder.
- Event 16 recurring owner reminders and the administrator alert do not duplicate on scheduler re-run.
- Event 6 is absent for unpaid, failed, cancelled, expired, or duplicate-confirmation Guest Day Pass attempts.