# Stage 4 — Requirements Traceability Matrix

**Revision:** r3  
**Status:** implementation complete; final evidence delivered; user acceptance pending  
**Scope:** K1–K5, I3–I4, B1–B6, J1, J3

| ID | Required behavior | Automated/delivered proof | Carried visual evidence |
|---|---|---|---|
| K1 | Contact HOA displays the bilingual scope note before any form. | Portal translation coverage and seeded verified-owner Playwright proof of note-before-form ordering. | Not carried. |
| K2 | Admin list identifies sender by full name, unit, email, and mobile/phone. | Portal enrichment regression coverage and mobile admin detail coverage. | Admin sender-context layout. |
| K3 | Rejection stores the standard bilingual reply and sets `rejected`. | API action tests assert persisted status/reply; portal and mobile expose the action. | Rejected thread/reply presentation. |
| K4 | Deferral stores the bilingual maintenance reply, sets `deferred_to_maintenance`, and creates no ticket. | API action tests assert status/reply and no downstream ticket; portal and mobile expose the action. | Deferred thread/no-ticket presentation. |
| K5 | Only verified owners may submit or view Contact HOA; ineligible callers receive `403`. | Dedicated direct-request role matrix and unverified-owner browser check. | Not carried. |
| I3 | Waha wording says facility-access in English and the facilities equivalent in Arabic. | Portal/mobile wording guards and translation coverage. | English and Arabic screen appearance. |
| I4 | Verified tenants receive in-scope Waha Pass, resident, and Guest Day Pass capabilities; two owner-only exceptions remain. | Tenant parity/API matrix covers active-pass Guest Day creation/listing plus both `403` exceptions. | Tenant parity and owner-only exception screens. |
| B1 | Parking type is “Underground Parking” and the Arabic equivalent. | Translation updates and portal suite coverage. | Form terminology appearance. |
| B2 | Title deed is mandatory in portal, mobile, and API owner verification. | API missing/invalid-key tests and portal/mobile client blocking. | Portal/mobile required-field states. |
| B3 | Mobile is mandatory in portal, mobile, and API owner verification. | API missing/invalid-phone tests plus shared mobile normalization, including Arabic-Indic digits. | Portal/mobile required-field states. |
| B4 | Existing title-deed audit/deletion lifecycle stays intact; no rebuild. | Existing lifecycle tests remain green. | Not a new visual proof item. |
| B5 | Admin registry visibly compares registry-owner and verified-owner names. | Admin endpoint tests and rendered comparison-panel coverage. | Registry comparison panel. |
| B6 | Client does not call `/api/unit-registry/validate`; local format validation remains. | **Automated acceptance gate:** source test recursively scans production portal source and fails on that route string. | **Not carried.** |
| J1 | Only admins can upload, replace, or delete library documents. | Direct unauthorized mutation coverage and role guards. | Admin/non-admin management-control visibility. |
| J3 | No unauthenticated private-document access; current writes do not use public search paths. | **Automated acceptance gate:** private document routes return `401` without authentication. Supporting tests cover direct public-object `404`, private writes, and lifecycle behavior. | **Not carried.** Signed-out visual review is supplemental only. |

## Verification summary

- API: **1,374 passing tests across 85 files** and type check passed.
- Portal: **1,368 passing tests across 63 files** and type check passed.
- Mobile: **414 passing tests across 16 files** and type check passed.
- Focused admin facility-booking Playwright test passed with browser-derived future-date selection, exact booking-date assertion, and created-card-only cancellation.
- Independent Clerk browser UAT passed the same corrected booking path for **2026-08-26**, including cancellation of only the created Cinema booking.
- Broad Playwright record: **71 passed, 3 failed, 5 flaky, 9 skipped**; exit status 1. The failed cases are unrelated Key Contacts settings-to-drawer round trips. The repaired booking path passed in that full run.

## Evidence boundary

Exactly ten items remain for visual review: K2, K3, K4, I3, I4, B1, B2, B3, B5, and J1. B6 and J3 are automated acceptance gates and are intentionally excluded from carried manual proof. Current document paths are proven private, but no historical storage inventory was available; this evidence does not claim that no legacy public object has ever existed. This matrix does not claim Stage 4 acceptance or production-deployment readiness.