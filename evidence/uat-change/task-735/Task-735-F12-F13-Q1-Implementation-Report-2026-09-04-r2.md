# Task 735 — F12, F13, and Q-1 Implementation Report

**Date:** 2026-09-04  
**Environment changed:** Development only  
**Production:** Not accessed, changed, migrated, or deployed  
**Acceptance authorization:** Not claimed

## Delivered scope

### F12 — one active booking per facility per unit

- Added a PostgreSQL trigger that serializes admissions per unit/facility pair with a transaction advisory lock and uses database time.
- Added the matching application-layer conflict check so normal callers receive a clear HTTP 409 response before the database backstop is needed.
- Active reservation semantics are shared across booking admission, facility availability, and household-day checks:
  - future `pending` and `confirmed` bookings count;
  - `pending_payment` counts only while its payment hold is live;
  - cancelled, completed, expired-hold, and past-ended bookings do not count.
- The seeded HOA COMMON system unit remains exempt.
- A partial index using `now()` was deliberately rejected because PostgreSQL index predicates must be immutable and indexed rows would not age out automatically.

### F13 — one automatic monthly free booking per unit

- Added an immutable allowance ledger keyed by unit and Asia/Riyadh calendar month.
- The first eligible positive-price resident booking claims the ledger atomically.
- A successful claim confirms the booking immediately with:
  - `paymentStatus = not_required`;
  - `paymentExemptionReason = monthly_free_allowance`;
  - no payment hold;
  - no payment attempt or checkout redirect.
- Cancellation does not delete or restore the ledger claim.
- Administrator/system bookings do not consume the allowance.
- Zero-price facilities retain the separate `zero_price_facility` exemption.
- The portal displays available/used state, automatic application, renewal timing, a monthly-free booking badge, zeroed total, and a specific non-restoration warning before cancellation.
- Browser UAT found and resolved a Riyadh period read-model defect: the allowance-status endpoint now derives its date key with the same Riyadh calendar-date expression used by the ledger insert. A cancelled free booking therefore remains shown as used.

### Q-1 — narrow administrator corrections with audit

- Administrator unit-reference changes are limited to `building` and `unitNumber`.
- Unrelated unit, ownership, verification, resident-link, contact, floor, type, size, and title fields are rejected for administrator correction requests.
- Resident self-service contact behavior remains separate.
- Parking entitlement reductions are rejected when the resulting underground or surface capacity would be below the count of non-inactive registered vehicles of that type.
- Unit reference, parking update, parking creation, and parking deletion operations use the same per-unit advisory lock as vehicle registration.
- Audit before-values are read after lock acquisition.
- Parking deletion uses `DELETE ... RETURNING` and verifies deletion before appending audit history.
- Added administrator history retrieval and English/Arabic portal history displays.

## Changed implementation areas

- Database migration and Drizzle schemas for the booking allowance ledger and append-only unit master-data audit.
- Booking, facility availability, unit correction, vehicle-lock, and initial-user-sync API paths.
- Portal facility booking, unit registry, translations, and Task 735 UI tests.
- In-memory API test database support for the new stores, predicates, and delete-returning behavior.
- Booking E2E cancellation flow updated to assert and confirm the new dialog.

## Security and concurrency posture

- F12 correctness does not depend on one API process; the database trigger is the final authority.
- F13 is claimed with a unique ledger key inside the booking transaction.
- Q-1 mutations lock the unit before reading before-values or validating capacity.
- Audit rows are append-only and capture actor, operation, target, and before/after values.
- No resident photos, credentials, storage keys, production records, or production identifiers are included in this evidence.

## Review outcome

The final architecture re-review returned **PASS**, with no blocker or high-severity findings after the concurrency, lock-order, deletion, and audit fixes were applied.
