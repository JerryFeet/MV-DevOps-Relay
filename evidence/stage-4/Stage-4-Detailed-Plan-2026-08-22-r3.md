# Stage 4 — Detailed UAT Plan

**Revision:** r3  
**Status:** implementation complete; final evidence delivered; user acceptance pending  
**Stage:** 4 — Access, residency, and communications  
**Precondition:** Stage 3a, 3b, 3c, and 3d are accepted; Stage 4b remains accepted separately.

## Objective

Deliver the access, tenancy-parity, wording, verification-form, and immediate document-access corrections remaining after Stage 3 and Stage 4b. API authorization is the security boundary; navigation is a usability aid only. Production deployment remains prohibited until every stage and the consolidated manual UAT round are complete.

## Delivered scope

### K1–K5 — Contact HOA communications

- Submission and history access require both `role=owner` and `verificationStatus=verified_owner`.
- Tenants, household members, unverified owners, supervisors, guards, and admins are blocked by direct API calls.
- The portal shows a scope note before the verified-owner form and explains blocked roles.
- Portal and mobile admin views include sender name, unit, email, and phone context.
- Portal and mobile admins can reject or defer a communication; the API stores the standard bilingual reply and final thread status. Deferral creates no maintenance ticket.

### I3–I4 — Waha Pass wording and parity

- User-facing credential wording uses “facility-access” and the Arabic facilities equivalent.
- Verified tenants retain the in-scope Waha Pass, resident-management, and Guest Day Pass capabilities.
- Ownership-change initiation remains verified-owner-only, and T10 tenancy approval/rejection remains the verified unit owner’s action.

### B1–B6 — Verification-form corrections

- “Underground Parking” is used in English and Arabic.
- A title-deed private object key and mobile number are mandatory for an owner verification request in the API, portal, and mobile app.
- Mobile uses the shared phone normalizer before validation and submission, including Arabic-Indic digits.
- B4’s established lifecycle was retained rather than rebuilt.
- The admin registry presents the registry owner and verified owner side by side.
- Production portal source is deterministically guarded against `/api/unit-registry/validate`; client validation remains local.

### J1 and J3 — Immediate document access restrictions

- Only admins can upload, replace, or delete library documents.
- Unauthenticated document list, metadata, download, mutation, and folder-mutation routes are denied.
- Library documents are returned through the authenticated download path only.
- Direct unauthenticated public-object document paths return `404`; current library writes use private object storage.
- A historical bucket inventory was unavailable. This evidence proves current application paths, not the absence of every pre-existing manual or legacy public object.

## Automated verification completed

- API suite and type check: **85 files, 1,374 tests passing**.
- Portal suite and type check: **63 files, 1,368 tests passing**.
- Mobile suite and type check: **16 files, 414 tests passing**.
- B6 acceptance gate: the portal source guard recursively scans production source and fails if `/api/unit-registry/validate` is reintroduced.
- J3 acceptance gate: unauthenticated private document routes return `401`; current private-write and direct public-object denial coverage also pass.
- Focused admin Playwright booking flow passed: the test derives a future date in the browser, creates a booking for that precise date, scopes cancellation to `booking-card-{id}`, and verifies the same card becomes cancelled.
- Independent Clerk browser UAT passed: an admin selected **2026-08-26**, created a Cinema booking, confirmed the matching date in My Bookings, and cancelled that exact card. No relevant application console or API error was observed.

## Broad browser-suite record

The configured broad Playwright suite completed but is **not a green acceptance gate**: **71 passed, 3 failed, 5 flaky, 9 skipped** (37.4 minutes; exit status 1).

- The repaired facility create/cancel flow passed inside that full run.
- The three unresolved failures are unrelated Key Contacts admin-settings-to-drawer round trips.
- The five retry-recovered flakes are unrelated admin redirect, document list, facility-panel navigation, and Key Contacts cases.
- This record is retained honestly; it does not weaken the focused booking, B6, or J3 gates.

## Carried manual visual review — exactly ten items

1. **K2** — admin sender context layout.
2. **K3** — rejected thread state and bilingual reply presentation.
3. **K4** — deferred thread state and no-ticket presentation.
4. **I3** — Waha wording appearance in English and Arabic.
5. **I4** — tenant capability parity and the two owner-only exception screens.
6. **B1** — parking terminology presentation.
7. **B2** — portal and mobile title-deed required-field states.
8. **B3** — portal and mobile mobile-number required-field states.
9. **B5** — visible registry-owner versus verified-owner comparison panel.
10. **J1** — admin versus non-admin document-management control visibility.

**B6 and J3 are not carried manual proof items.** B6 is a deterministic source acceptance gate; J3’s unauthenticated `401` route assertion is its automated acceptance gate. Any visual signed-out J3 review is supplemental only.

## Delivery boundary

This r3 document records delivered scope and final evidence. It does **not** claim Stage 4 acceptance, authorize production deployment, or close the consolidated manual UAT requirement.