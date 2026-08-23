# Stage 6 Split Proposal

Date: 2026-08-22  
Status: Proposal for review before Stage 5 Phase 5 completion

## Purpose

Stage 6 currently combines the shared release machinery, tenancy expiry and renewal, tenancy release, ownership change, booking-cascade hardening, `bookings.unit_id` denormalisation, null guards, and X3 events 13, 14, and 16. These operations include irreversible account deletion, PII anonymisation, credential revocation, household archival, and cancellation of paid non-refundable bookings.

Split the stage into three dependency-ordered acceptance units. The split keeps one shared release implementation while making each irreversible lifecycle area independently testable and reviewable.

## Recommended order

1. **Stage 6A — Release substrate and data-integrity hardening**
2. **Stage 6B — Tenancy lifecycle: T13/T14 and renewal notifications**
3. **Stage 6C — Ownership change: O1–O7**

6B and 6C may be developed in parallel after 6A, but should be accepted separately and should use the same 6A release service. If implementation proceeds sequentially, accept 6B before 6C because 6C reuses the already-proven terminal release path.

---

## Stage 6A — Release substrate and data-integrity hardening

### Scope

- One transaction-safe release engine used by T13, T14 deletion, and O3.
- Advisory/row locking and idempotent terminal-state handling.
- F8 future-booking cancellation as a transaction participant.
- Three FK hardening batches from the existing inventory.
- `bookings.unit_id` denormalisation task #699.
- §6.4 null guards and explicit handling for ownerless, tenantless, archived, and deleted subjects.
- Audit and rollback boundaries for all shared cascade operations.

### Does not include

- The user-facing T13 request/execution flow.
- T14 renewal or expiry scheduling.
- O1–O7 ownership-change initiation, review, or execution.

### Acceptance

- A single shared release transaction can run for an arbitrary subject type without duplicated cascade logic.
- Concurrent terminal operations serialize cleanly; a repeated operation returns an explicit already-ended result and does not archive, revoke, cancel, or delete twice.
- Future bookings are cancelled inside the triggering transaction, with the approved non-refundable bilingual reason.
- FK hardening and `bookings.unit_id` migration preserve existing records and support ownerless/tenantless rows.
- Mid-transaction failure leaves every affected record unchanged.
- The shared engine has focused tests for lock ordering, rollback, idempotency, null guards, FK behavior, booking cancellation, and audit persistence.

### Exit evidence

- Migration/schema inventory and rollback evidence.
- Transaction and concurrency test report.
- Before/after fixture counts for residents, vehicles, Waha credentials, bookings, permits, communications, Guest Day Passes, and audit records.

---

## Stage 6B — Tenancy lifecycle and renewal

### Scope

- T13 owner release request and admin-only execution.
- Move-out approval using the same 6A release transaction.
- T14 expiry deactivation, delayed deletion, renewal submission, approval/rejection, and settings-controlled deletion delay.
- Reminder and post-expiry scheduler idempotency.
- X3 events 13, 14, and 16, which are currently deferred from Stage 5 Phase 1.
- T13/T14 F8 wiring and X3 event 11/15 delivery where those lifecycle triggers apply.

### Acceptance

- A tenant can request release but cannot execute it; only an admin can execute.
- Simultaneous move-out and admin release produce one clean ending with no duplicate archival or 500 response.
- Owner claim, parking entitlements, and unrelated owner data remain unchanged after tenant release.
- Expiry suspends access on day 0; deletion waits for the configured delay and never occurs on expiry day.
- Pending renewal prevents deletion indefinitely until the owner acts.
- Renewal approval restores access with the new end date; rejection follows the approved delayed-deletion path.
- Events 13, 14, and 16 each fire exactly once to the correct recipients, in both languages, through the durable email/push outbox with retry and idempotency.
- Event 12 reminders fire at 30, 14, 7, and 1 days before expiry and do not duplicate on same-day reruns.
- Stage 6B cannot be accepted while X3 remains below 16/16.

### Exit evidence

- T13/T14 API and scheduler test report.
- Race, rollback, deletion-delay, renewal-pending, and same-day idempotency evidence.
- Notification recipient, language, channel, preference, retry, and deduplication evidence for events 12–16.
- Manual UAT evidence for owner approval, suspended access, delayed deletion, and restoration.

---

## Stage 6C — Ownership change and ownerless-unit registry

### Scope

- O1–O7 initiation, impact review, admin confirmation, release, audit, and ownerless-unit surfaces.
- O3 ownership release through the 6A shared release transaction.
- Preservation of active tenant state during owner release.
- Incoming-owner standard B7 claim after release.
- Ownership-history audit and anonymisation.
- O3 F8 wiring and X3 event 11 notifications for affected tenancy.

### Acceptance

- A verified owner can initiate only for their own unit; admins can initiate for any unit; tenants and unverified users are refused.
- Initiation changes no protected data. Impact review counts match the database before confirmation.
- Admin confirmation requires the exact unit number and executes all cascades atomically.
- A tenant’s household, vehicles, Waha credentials, bookings, and verification remain intact after owner release.
- Owner credentials, future-validity Guest Day Passes, vehicles, permits, communications, and bookings reach their specified terminal states.
- Revoked credentials fail gate verification immediately.
- Outgoing account deletion and retained-record anonymisation are auditable; the ownership history survives deletion.
- Released and never-registered units appear in the correct registry filters with elapsed time; standard B7 claim removes the released state.
- O3 cancellation and notification events are idempotent and included in the same transaction boundary.

### Exit evidence

- O1–O7 API/UI and role-guard test report.
- All-or-nothing rollback and concurrent-execution evidence.
- Tenant-preservation, parking-preservation, credential-revocation, audit, registry, and standard-B7 evidence.
- Manual UAT evidence for impact review, typed confirmation, release, and incoming-owner claim.

---

## Cross-unit acceptance rules

- No unit may introduce a second release/cascade implementation.
- Each unit must publish individual evidence files and a manifest with SHA-256 hashes and commit IDs.
- Every irreversible operation must have a rollback or idempotency test before manual UAT.
- Stage 6 acceptance requires 6A, 6B, and 6C acceptance; X3 must be 16/16.
- The broad portal E2E suite must be run again at Stage 6. The hydration investigation may close only after the additional result is compared with the clean Phase 1 run.
- Deployment remains prohibited under Decision 42 until all stages and consolidated manual UAT are complete.