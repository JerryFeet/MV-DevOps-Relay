# UR1 Legacy Guest and QR Pass — Finding

Date: 2026-08-31

## What happened

The original UAT fixture's supposed UR1 legacy guest and QR pass were not attached to the UR1 owner. Their `resident_id` pointed to an unrelated fixture administrator whose current `users.unit_id` was null. They therefore did not appear under UR1.

This was a test-data mis-association, not evidence that a valid legacy record had been returned under the wrong unit.

## Cause

Legacy `guests.resident_id` and `guest_passes.resident_id` store the host portal `users.id`, despite the historical column name suggesting a household `residents.id`.

The first automated fixture used the wrong identity domain. A later browser fixture used a valid user ID, but initially selected an unrelated admin rather than the UR1 host.

## Corrections

- The regression fixture now uses the actual host `users.id`.
- The browser fixture was corrected to the current UR1 owner.
- Registry assembly resolves current unit-linked users and approved historical unit-verification links, so a legitimately associated retained guest remains attributable after a host moves out or is replaced.
- The admin response includes the guest/pass relationship without exposing QR secrets outside the approved admin registry boundary.

## Scope assessment

Other record categories are directly unit-scoped and were not affected: permits, Guest Day Passes, payments, bookings, vehicles, Waha applications, and parking.

The ambiguity applies specifically to legacy guest and QR-pass rows because their association is host-user based rather than directly unit based.

## Verification

After correcting the UAT fixture to the actual UR1 owner:

- UR1 returned one retained legacy guest.
- The nested QR pass appeared with that guest.
- The separate gate response continued to omit `nationalId`, `verificationToken`, `passUuid`, and internal IDs.