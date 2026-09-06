# Round 3 Section 2 — Pre-fix failure and fixture audit

Date: 2026-09-06  
Environment: Development  
Command: `pnpm run round3:regression:e2e`

## Browser result

The permanent verified-resident test:

1. Confirmed the allowance initially reported `available: true`, `eligibleForBooking: true`, and `claim: null`.
2. Selected an active facility whose effective production price is zero.
3. Created the booking through the real facility wizard for a future Riyadh date.
4. Confirmed HTTP 201, `status: confirmed`, `paymentStatus: not_required`, `paymentExemptionReason: zero_price_facility`, total zero, and no checkout request.
5. Captured the portal's own post-booking allowance refetch.

The test failed on both attempts at the intended assertion:

- Expected: `available: false` and `claim.bookingId` equal to the created booking.
- Received: `available: true` and `claim: null`.

Suite total: **1 failed, 5 passed**. All Section 1 browser regressions remained green.

## Existing fixture audit

No existing mock was found that literally combines a zero-price facility with a consumed allowance response. The contradictions are:

- `facilityDialogArabic.test.tsx` uses per-hour pricing together with a zero flat-fee field, which is not the field production uses for per-hour pricing.
- Several API fixtures describe flat zero-price facilities, but none assert that such a booking consumes the monthly allowance.
- Several flat-fee fixtures have `pricePerHour: "0"` while their effective flat fee is non-zero; reading only the hourly field would wrongly classify them as free.
- `task735-portal.test.tsx` mocks an available allowance while omitting the production `eligibleForBooking` field, and its free-booking case represents a paid facility discounted by the allowance rather than a naturally zero-price facility.

This is why the new browser test discovers pricing through the live facilities response and applies the same effective-price rule as production.

## Boundaries

- No application behavior had been changed when this evidence was captured.
- No facility, booking, or allowance row was seeded.
- Cleanup deleted only the captured booking ID and any allowance claim tied to that booking ID.
- Retry trace ZIPs are intentionally not published.
