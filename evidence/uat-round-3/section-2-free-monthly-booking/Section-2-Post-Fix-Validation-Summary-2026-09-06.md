# Round 3 Section 2 — Post-fix validation

Date: 2026-09-06  
Environment: Development  
Named browser command: `pnpm run round3:regression:e2e`

## Delivered behavior

- The first non-admin facility booking in a Riyadh month claims that unit's monthly allowance even when the facility's effective price is already zero.
- The naturally zero-price booking remains directly confirmed with:
  - `paymentStatus: not_required`
  - `paymentExemptionReason: zero_price_facility`
- No payment checkout request is made.
- The portal's post-booking allowance refetch returns `available: false` with `claim.bookingId` equal to the created booking, and renders the used-allowance message.
- Paid facilities continue to use `monthly_free_allowance` when the allowance makes them free.

## Validation

| Check | Result |
|---|---|
| Complete named Round 3 browser suite | **6/6 passed**, no retries |
| Focused API booking guards | **12/12 passed** |
| API type check | **Passed** |
| Portal type check | **Passed** |
| API restart | **Healthy** |

All four accepted Section 1 journeys remained green.

## Immutable evidence-safe E2E design

Monthly allowance claims are immutable and have no release/correction operation. The browser suite therefore does not delete or rewrite bookings or claims and does not disable database triggers.

Each Round 3 browser test attempt—including retries—rotates the verified E2E identity onto a fresh, uniquely named, non-system E2E unit with canonical owner occupancy and active Waha eligibility. Bookings and allowance claims remain as evidence on their original E2E units. Real resident and product units are not reused or modified.

Booking 25 and its claim on the original `E2E / VERIFIED-RESIDENT` unit were retained after the database correctly rejected cleanup attempts.

## Existing fixture audit

No existing fixture literally asserted that a zero-price facility consumed the allowance. The permanent browser and focused API tests now cover the production distinction directly. Ambiguous legacy facility fixtures were not changed because they are outside this behavior correction.
