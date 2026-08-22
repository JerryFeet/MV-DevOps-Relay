# Stage 4 — Requirements Traceability Matrix

**Revision:** r2  
**Status:** implementation complete; awaiting user acceptance  
**Scope:** K1–K5, I3–I4, B1–B6, J1, J3

| ID | Required behavior | Delivered proof | Visible/UAT evidence |
|---|---|---|---|
| K1 | Contact HOA displays the bilingual scope note before any form. | Portal implementation and translation suite pass; seeded verified-owner Playwright check asserts note precedes the form. | Verified-owner browser check passed without submitting a record. |
| K2 | Admin list identifies sender by full name, unit, email, and mobile/phone. | Portal enrichment regression coverage; mobile admin detail includes sender phone. | Admin row rendering remains included in final manual review. |
| K3 | Rejection stores the standard bilingual reply and sets `rejected`. | API action tests assert persisted status/reply; portal and mobile admin actions expose rejection. | Thread review remains included in final manual review. |
| K4 | Deferral stores the bilingual maintenance reply, sets `deferred_to_maintenance`, and creates no ticket. | API action tests assert status/reply and no downstream ticket; portal and mobile admin actions expose deferral. | Thread review remains included in final manual review. |
| K5 | Only verified owners may submit or view Contact HOA; tenants, household members, unverified owners, and staff including guards receive `403`. | Dedicated direct-request role matrix; verified owner is the positive control. | Browser UAT passed for an unverified owner: scope and explanation visible, no form present. |
| I3 | Waha credential wording says facility-access in English and the facilities equivalent in Arabic. | Portal and mobile translation updates; wording guard tests pass. | Waha screen visual review remains included in final manual review. |
| I4 | Verified tenants receive in-scope Waha Pass, resident, and Guest Day Pass capabilities. Ownership-change initiation and T10 approval stay owner-only. | Tenant parity/API regression matrix covers active-pass guest-day creation/listing and both `403` exceptions. | Tenant-account parity and both exception screens remain included in final manual review. |
| B1 | Parking type is “Underground Parking” and the Arabic equivalent. | Translation updates and portal suite pass. | Form visual review remains included in final manual review. |
| B2 | Title deed is mandatory in portal, mobile, and API owner verification. | API missing/invalid-key tests plus portal/mobile client blocking. | Mobile and portal required-field state remain included in final manual review. |
| B3 | Mobile is mandatory in portal, mobile, and API owner verification. | API missing/invalid-phone tests plus mobile shared phone normalization/validation, including Arabic-Indic digits. | Mobile and portal required-field state remain included in final manual review. |
| B4 | Existing title-deed audit/deletion lifecycle stays intact; no rebuild. | Existing lifecycle tests still pass. | No new B4 migration or replacement flow was introduced. |
| B5 | Admin registry visibly compares the registry owner name and verified owner name. | Admin endpoint tests plus rendered comparison panel. | Dedicated admin registry screen check remains included in final manual review. |
| B6 | Client does not call `/api/unit-registry/validate`; local format validation remains. | Source/flow regression tests pass. | Network inspection remains included in final manual review. |
| J1 | Only admins can upload, replace, or delete library documents. | Direct unauthorized mutation coverage and existing role guards. | Admin/non-admin control visibility remains included in final manual review. |
| J3 | No unauthenticated document access, including direct public-object-path access; current document writes do not use public search paths. | Direct `/api/storage/public-objects/documents/...` requests return `404`; unauthenticated document routes return `401`; upload/register tests prove the current private `/objects/documents/` namespace. | Signed-out direct route review remains included in final manual review. |

## Verification summary

- API: **1,374 passing tests across 85 files** and type check passed.
- Portal: **1,367 passing tests across 62 files** and type check passed.
- Mobile: **414 passing tests across 16 files** and type check passed.
- Focused Clerk browser UAT for K5 passed with no page-level console or API errors.
- Focused seeded verified-owner Playwright UAT passed: the scope note is visibly above the form and the Send action enables once the required text fields are filled.
- The interrupted broad Playwright run is recorded as incomplete, not as a pass.

## Evidence boundary

Earlier r1 files remain unchanged. This r2 matrix includes the staff block, direct-storage/public-path audit, and mobile B2/B3 coverage additions. The application path is proven private; a historical storage inventory was not available, so the record does not claim that no legacy public object has ever existed. It does not claim Stage 4 acceptance or production-deployment readiness.