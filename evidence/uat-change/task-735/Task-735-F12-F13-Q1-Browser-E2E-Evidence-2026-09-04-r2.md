# Task 735 — Browser and E2E Evidence

**Date:** 2026-09-04  
**Portal:** Development preview only  
**Browser approach:** Fresh Clerk-authenticated contexts with programmatic claim overrides  
**Production:** Not accessed

## Resident monthly allowance — English and Arabic

### Available state

- English allowance panel rendered with automatic-application and renewal copy.
  - Screenshot ID: `s3khq8`
- Arabic allowance panel rendered RTL with translated allowance and renewal copy and no visible clipping or horizontal overflow.
  - Screenshot ID: `3j5sjg`
- Empty My Bookings state before UAT booking creation:
  - Screenshot ID: `ao66le`

### Positive-price automatic free booking

The resident selected a positive-price facility:

- Facility: Majli
- Displayed price: 20.00 SAR flat fee
- Confirmation showed the original price reduced to 0.00 SAR.
- Copy stated: `Monthly free allowance applied automatically.`
- Screenshot ID: `yjvss0`

Submission behavior:

- booking confirmed in-app;
- no payment redirect occurred;
- no payment attempt was required.
- Post-submit screenshot ID: `04r3o0`

My Bookings behavior:

- exact booking card displayed Confirmed;
- card displayed `Monthly Free Booking`;
- card showed 20.00 SAR reduced to 0.00 SAR.
- Screenshot ID: `zixixn`

### Cancellation and non-restoration

Before final cancellation, the dialog stated:

> This was your monthly free booking. Cancelling will NOT restore your free allowance for this month. This action cannot be undone.

- Warning screenshot ID: `8pdwhe`
- Cancelled booking screenshot ID: `h71yjf`

Browser UAT then exposed a Riyadh period-key read defect: the immutable ledger existed, but the status endpoint queried the wrong calendar date after a second time-zone conversion. The endpoint was corrected and the API restarted.

Post-fix cache-bypass verification:

- English used state: `You have already used your free booking for this month.`
- English renewal copy rendered.
- Screenshot ID: `v1bcly`
- Arabic used state: `لقد استخدمت حجزك المجاني لهذا الشهر.`
- Arabic renewal copy rendered RTL with no clipping or overflow.
- Screenshot ID: `dnk7jh`

Final F13 browser verdict: **PASS**

## Administrator correction and audit history

English non-system unit detail:

- correction form exposed only Building and Unit Number;
- Save was disabled while unchanged;
- no ownership, verification, resident-link, floor, type, size, title, or contact edit controls appeared;
- Audit History rendered a clear empty state.
- Initial detail screenshot ID: `iz100j`
- Focused correction/history screenshot ID: `olm3ah`

Arabic:

- registry and unit detail rendered RTL;
- correction form exposed only `المبنى` and `رقم الوحدة`;
- Audit History empty state was translated;
- no visible clipping or horizontal overflow.
- Registry screenshot ID: `c5hk9o`
- Focused detail screenshot ID: `z2ky5f`

Final Q-1 browser verdict: **PASS**

## Browser console and API observations

Final post-fix verification:

- API failures: **none**
- Application console errors: **none**
- Non-blocking warning: Clerk deprecation notice for `user.update({ unsafeMetadata })`

Two transient 502 resource errors occurred during the earlier positive-price facility selection, but the UI recovered and the booking completed. The final full E2E run is separately required to be clean before publication.

## Final full E2E

The accepted run started after the final API restart and Riyadh allowance-status correction.

- Preflight: **passed**
- Total: **93**
- Passed: **86**
- Intentional skips: **7**
- Failed: **0**
- Duration: **5.3 minutes**
- Updated booking wizard and confirmed cancellation journey: **passed**

Final E2E verdict: **PASS**
