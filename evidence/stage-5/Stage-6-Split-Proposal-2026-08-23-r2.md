# Stage 6 Split Proposal

Date: 2026-08-23  
Revision: r2  
Status: Proposal for review, delivered with Stage 5 Phase 2 evidence

## Context and prerequisite

Stage 6 is the only remaining stage that performs irreversible operations on real accounts: account deletion, PII anonymisation, credential revocation, household archival, and cancellation of paid non-refundable bookings.

This proposal is submitted alongside the Stage 5 Phase 2 evidence report. Phase 2 evidence strengthens payment callback binding and stale booking-hold rejection, but Stage 6 must remain independently reviewed and accepted. Deployment remains prohibited.

## Recommended acceptance order

1. **Stage 6A — Release substrate and data-integrity hardening**
2. **Stage 6B — Tenancy lifecycle and renewal**
3. **Stage 6C — Ownership change and ownerless-unit registry**

6B and 6C may be developed in parallel only after 6A is accepted. Each must use the single 6A release engine and must be accepted separately.

---

## Stage 6A — Release substrate and data-integrity hardening

### Scope

- Shared transaction-safe release engine for T13, T14 deletion, and O3.
- Advisory/row locking and idempotent terminal-state handling.
- F8 future-booking cancellation as a transaction participant.
- Three FK hardening batches.
- `bookings.unit_id` denormalisation (task #699).
- §6.4 null guards for ownerless, tenantless, archived, and deleted subjects.
- Audit and rollback boundaries for shared cascade operations.

### Acceptance

- One shared release transaction handles each subject type without duplicated cascade logic.
- Concurrent terminal operations serialize; repeated operations return an explicit already-ended result without repeating archive, revoke, cancel, or deletion effects.
- Future bookings cancel inside the trigger transaction with the approved non-refundable bilingual reason.
- FK hardening and the `bookings.unit_id` migration preserve records including ownerless and tenantless rows.
- A mid-transaction failure leaves affected records unchanged.
- Focused tests cover lock ordering, rollback, idempotency, null guards, FK behavior, booking cancellation, and audit persistence.

### Exit evidence

- Migration/schema inventory and rollback evidence.
- Transaction and concurrency test report.
- Before/after fixture counts for residents, vehicles, Waha credentials, bookings, permits, communications, Guest Day Passes, and audit records.

---

## Stage 6B — Tenancy lifecycle and renewal

### Scope

- T13 owner release request and admin-only execution.
- Move-out approval via the 6A release transaction.
- T14 expiry deactivation, delayed deletion, renewal submission, approval/rejection, and settings-controlled deletion delay.
- Reminder/post-expiry scheduler idempotency.
- X3 events 13, 14, and 16.
- T13/T14 F8 wiring plus X3 events 11 and 15 where lifecycle triggers apply.

### Acceptance

- A tenant can request release but only an admin can execute it.
- Simultaneous move-out and admin release yield one clean ending with no duplicate archival or 500 response.
- Owner claim, parking entitlements, and unrelated owner data remain unchanged after tenant release.
- Expiry suspends access on day 0; deletion waits for the configured delay and never runs on expiry day.
- Pending renewal blocks deletion until an owner decides it.
- Renewal approval restores access with the new end date; rejection follows the delayed-deletion path.
- Events 13, 14, and 16 fire once to the right recipients, in both languages, through the durable email/push outbox with retry and idempotency.
- Event 12 reminders fire at 30, 14, 7, and 1 days without same-day duplicates.
- 6B cannot be accepted while X3 remains below 16/16.

### Exit evidence

- T13/T14 API and scheduler report.
- Race, rollback, deletion-delay, renewal-pending, and same-day-idempotency evidence.
- Notification recipient, language, channel, preference, retry, and deduplication evidence for events 12–16.
- Manual UAT evidence for owner approval, suspended access, delayed deletion, and restoration.

---

## Stage 6C — Ownership change and ownerless-unit registry

### Scope

- O1–O7 initiation, impact review, admin confirmation, release, audit, and ownerless-unit surfaces.
- O3 release through the 6A release transaction.
- Active tenant preservation during owner release.
- Incoming-owner standard B7 claim after release.
- Ownership-history audit and anonymisation.
- O3 F8 wiring and X3 event 11 notifications for affected tenancy.

### Acceptance

- A verified owner initiates only for their own unit; admins may initiate for any unit; tenants and unverified users are refused.
- Initiation changes no protected data and impact counts match the database before confirmation.
- Admin confirmation requires the exact unit number and executes all cascades atomically.
- A tenant household, vehicles, Waha credentials, bookings, and verification remain intact after owner release.
- Owner credentials, future-validity Guest Day Passes, vehicles, permits, communications, and bookings reach specified terminal states.
- Revoked credentials fail gate verification immediately.
- Account deletion and retained-record anonymisation are auditable while ownership history survives.
- Released and never-registered units show correctly in registry filters; a standard B7 claim removes the released state.
- O3 cancellation and notifications are idempotent and in the same transaction boundary.

### Exit evidence

- O1–O7 API/UI and role-guard report.
- All-or-nothing rollback and concurrent-execution evidence.
- Tenant and parking preservation, credential revocation, audit, registry, and standard-B7 evidence.
- Manual UAT evidence for impact review, typed confirmation, release, and incoming-owner claim.

---

## Cross-unit rules

- No unit may introduce a second release/cascade implementation.
- Each unit must publish individual evidence files with SHA-256 hashes and commit IDs.
- Every irreversible operation needs a rollback or idempotency test before manual UAT.
- Stage 6 acceptance requires 6A, 6B, and 6C acceptance and X3 at 16/16.
- The broad portal E2E suite remains a standing gate. The Phase 2 result is evidence only; Stage 6 must run it again before hydration closure can be considered.
- Deployment remains prohibited until all stages and consolidated manual UAT are complete.