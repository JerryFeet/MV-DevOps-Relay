# Booking and Unit Rules

## What & Why
Implement confirmed decisions 142–145 and the now-unblocked F12, F13, D-6, D-7, and Q-1 requirements. The change must prevent a household from holding multiple active reservations for the same facility, apply one automatic free booking per unit per Riyadh calendar month, and give administrators a narrowly governed way to correct unit references and parking entitlement without bypassing lifecycle rules or creating silent vehicle over-allocation.

PostgreSQL cannot enforce F12 with a partial index whose predicate is `end_time > now()`: current-time expressions are not immutable, and index membership would not change as time passes. Use a database trigger with transactional locking and a matching application check instead; retain the existing facility-level exclusivity and cleaning-buffer protections.

Today administrators can add, edit, deactivate, reclassify, and delete normalized parking lots without comparing the proposed entitlement with registered vehicles and without recording an audit entry. This can silently leave a unit over-allocated. Reject entitlement reductions or reclassifications when the number of registered vehicles of either parking type would exceed the resulting active entitlement.

## Done looks like
- A unit can hold at most one active reservation for a facility, while it may simultaneously hold active reservations for different facilities
- Pending-payment bookings with a live hold count as active; cancelled bookings, expired holds, and bookings whose end time has passed do not
- Concurrent booking attempts by two credential holders cannot bypass the unit/facility rule
- HOA COMMON administrator bookings remain exempt from the per-unit restriction
- The first resident booking made by a unit in each Asia/Riyadh calendar month is automatically free
- The monthly free booking is confirmed immediately, creates no payment attempt or hold, and records a first-of-month allowance reason distinct from an administrator exemption
- Cancelling the free booking does not restore the allowance, and the cancellation confirmation clearly warns the resident
- The booking screen shows whether the current booking is free or the allowance has been used, including when it renews
- Administrators can correct a unit's building/unit reference and manage underground and surface parking entitlement in Unit Registry
- Administrators cannot directly edit ownership, verification status, resident links, lifecycle-controlled data, or unrelated unit master fields through the correction interface/API
- An entitlement reduction that would leave more registered vehicles than active spaces is rejected with a clear underground/surface explanation
- Every accepted unit-reference or parking-entitlement edit records actor, timestamp, field/action, previous value, and new value, and the history is visible in Unit Registry
- English and Arabic resident/admin copy is complete and responsive

## Out of scope
- Changing F2b global slot exclusivity, cleaning buffers, facility operating hours, or the existing last-minute booking rule
- Allowing residents to choose which booking receives the monthly allowance
- Restoring a free allowance after cancellation
- Refunds for paid booking cancellation
- Changing the two-credential Waha Pass model or allowing non-credential holders to book
- Direct administrator edits to ownership, verification status, resident links, tenancy/ownership lifecycle state, or release-engine inputs
- Production migration or publishing

## Steps
1. **Add forward-only booking and audit storage** -- Add a monthly free-booking consumption ledger keyed by unit and Riyadh calendar month, a durable reason/audit representation for free bookings, and append-only unit master-data audit storage. Include migration preconditions and preserve the applied migration history.
2. **Enforce F12 at both layers** -- Extend the existing transactionally locked booking-admission path with a unit/facility active-booking check, and add a database trigger using the same lock ordering so direct or future write paths cannot bypass it. Treat live pending-payment holds and future-ended confirmed/pending reservations as active, exempt the system HOA COMMON unit, and return a distinct conflict response from slot overlap.
3. **Apply the monthly allowance atomically** -- During resident booking creation, claim the unit/month allowance exactly once under concurrency, using Asia/Riyadh month boundaries. Confirm the winner directly with no payment hold or attempt, preserve the allowance ledger after cancellation, and leave administrator bookings and HOA COMMON outside the allowance.
4. **Align payment and cancellation flows** -- Ensure payment creation/callback logic only handles genuine pending-payment bookings, expired holds stop counting toward F12, and cancellation cannot restore or delete a monthly allowance claim. Include the required non-refundable and free-allowance warning before cancellation.
5. **Expose resident booking status** -- Show bilingual allowance availability, free-booking application, used state, renewal date, and cancellation consequences in the facility-booking flow without presenting the allowance as resident-selectable.
6. **Narrow and protect Q-1 edits** -- Restrict unit-master corrections to building/unit reference and normalized parking entitlement, deny system-unit changes, and keep governed ownership, verification, resident-link, lifecycle, and unrelated master fields outside this correction surface.
7. **Prevent parking over-allocation** -- Before deactivation, deletion, or underground/surface reclassification, compare the resulting active entitlement by type with all currently registered non-inactive vehicles anchored to the unit. Reject inconsistent reductions atomically and explain the exact type/count conflict to the administrator.
8. **Record and display correction history** -- Write an audit entry in the same transaction as every unit-reference and parking change, then add a bilingual Unit Registry history view showing actor, time, action/field, and before/after values.
9. **Prove the rules under concurrency and time boundaries** -- Add database/API tests for simultaneous household bookings, pending-payment expiry, end-time passage, HOA COMMON exemption, month rollover, simultaneous first bookings on different facilities, cancellation non-restoration, payment bypass, edit authorization, audit completeness, and parking-reduction refusal.
10. **Verify complete user journeys** -- Run focused API/portal tests, type and translation checks, schema-integrity validation, and one browser/E2E pass covering resident free-booking messaging/cancellation plus administrator correction/history behavior in English and Arabic.

## Relevant files
- `attached_assets/Booking-Rules-F12-F13_1788513295002.md`
- `attached_assets/UAT-Change-Requirements-2026-08-18-1_1788513294994.md`
- `lib/db/src/schema/bookings.ts`
- `lib/db/src/schema/parkingLots.ts`
- `lib/db/src/schema/facilityBookingAudit.ts`
- `lib/db/migrations/0020_stage3_active_booking_start_uniqueness.sql`
- `lib/db/migrations/0022_stage3_booking_concurrency_note.sql`
- `lib/db/migrations/0032_stage5_payment_and_notification_core.sql`
- `lib/db/migrations/0034_stage6a_booking_unit_anchor_enforcement.sql`
- `artifacts/api-server/src/routes/bookings.ts`
- `artifacts/api-server/src/routes/units.ts`
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/api-server/src/payments/PaymentCore.ts`
- `artifacts/api-server/src/lib/bookingPaymentHoldScheduler.ts`
- `artifacts/api-server/src/__tests__/booking-permit-ownership.test.ts`
- `artifacts/api-server/src/__tests__/bookingAdvanceWindowF9.test.ts`
- `artifacts/api-server/src/__tests__/paymentCallbackMatrix.test.ts`
- `artifacts/api-server/src/__tests__/vehicleStage3E1E5.test.ts`
- `artifacts/hoa-portal/src/pages/portal/facilities.tsx`
- `artifacts/hoa-portal/src/pages/portal/unitRegistry.tsx`
- `artifacts/hoa-portal/src/lib/translations.ts`
- `artifacts/hoa-portal/src/__tests__/unitRegistryAdminParking.test.ts`