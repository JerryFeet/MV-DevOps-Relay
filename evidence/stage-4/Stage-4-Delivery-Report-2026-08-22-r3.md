# Stage 4 — Delivery and Acceptance Report

**Revision:** r3  
**Status:** delivered for user acceptance; deployment remains prohibited  
**Date:** 2026-08-22

## Delivered outcome

Stage 4 implementation and its final evidence revision are complete. The revision resolves the two requested evidence changes:

1. **B6 is automated, not manual.** A deterministic production-source guard fails if `/api/unit-registry/validate` appears in portal source.
2. **J3 is automated, not manual.** The unauthenticated private document-route `401` assertion is the acceptance gate. Any visual signed-out review is supplemental only.

The final manual visual carry-forward contains exactly ten items: **K2, K3, K4, I3, I4, B1, B2, B3, B5, J1**.

## Booking fixture correction

The Stage 3a booking E2E fixture was corrected after the reported `409` cancellation result was traced to a past-date selection and a page-wide Cancel assertion.

- The test chooses its target date in the browser and uses the calendar’s own `data-day` value.
- It verifies the created booking’s returned `startTime` begins with the selected ISO date.
- It captures the new booking ID and scopes card, Cancel control, cancelled badge, and post-cancel assertion to `booking-card-{id}`.
- The focused admin Playwright test passed.
- Independent browser UAT passed with a Cinema booking on **2026-08-26**; the created booking was cancelled while an unrelated Majlis booking was left unchanged.

## Automated results

| Gate | Result |
|---|---|
| API suite and type check | Pass — 85 files, 1,374 tests |
| Portal suite and type check | Pass — 63 files, 1,368 tests |
| Mobile suite and type check | Pass — 16 files, 414 tests |
| B6 source acceptance gate | Pass |
| J3 unauthenticated private-route `401` acceptance gate | Pass |
| Focused corrected booking E2E | Pass |
| Independent Clerk browser booking UAT | Pass |
| Broad configured Playwright suite | **Incomplete / failed:** 71 passed, 3 failed, 5 flaky, 9 skipped; exit status 1 |

## Broad E2E exception

The 37.4-minute broad Playwright run confirmed the corrected booking flow but is not claimed as green. Its three unrecovered failures are unrelated Key Contacts admin-settings-to-drawer round trips. Five additional cases recovered on retry, including unrelated admin redirect, document-list, facility-panel navigation, and Key Contacts checks. This report preserves the result rather than masking it as a pass.

## Acceptance and deployment boundary

This delivery is ready for **Stage 4 user review**, not production deployment. Stage 4 acceptance still requires the user’s review of this evidence and the ten carried visual items. Deployment remains prohibited until all remaining stages and the consolidated manual UAT are complete. A historical public-object storage inventory remains a separate go-live prerequisite.