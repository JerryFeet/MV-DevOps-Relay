# Stage 4 — Detailed UAT Plan

**Revision:** r2  
**Status:** implementation complete; awaiting user acceptance  
**Stage:** 4 — Access, residency, and communications  
**Precondition:** Stage 3a, 3b, 3c, and 3d are accepted; Stage 4b remains accepted separately.

## Objective

Deliver the access, tenancy-parity, wording, verification-form, and immediate document-access corrections that remain after Stage 3 and Stage 4b. API authorization is the security boundary; navigation is only a usability aid. Production deployment remains prohibited until every stage and the consolidated manual UAT round are complete.

## r2 additions

This revision incorporates the three additions made after r1:

1. **K5:** Staff, including guards, are in the Contact HOA blocked set and receive `403` from the API.
2. **J3:** The proof includes direct public-object-path access without authentication and an audit of document write paths. Library documents write only to the private `/objects/documents/` namespace; no document write is routed through `PUBLIC_OBJECT_SEARCH_PATHS`.
3. **B2/B3:** The mobile verification form now contains both the required mobile input and title-deed upload, submits the same owner-verification contract, and has mobile/client coverage rather than relying only on API tests.

## Delivered scope

### K1–K5 — Contact HOA communications

- Submission and history access require both `role=owner` and `verificationStatus=verified_owner`.
- Tenants, household members, unverified owners, supervisors, guards, and admins are blocked by direct API calls.
- The portal shows the scope note before the verified-owner form and explains why blocked roles cannot submit.
- The portal and mobile admin lists include sender full name, unit, email, and phone context.
- Portal and mobile admin actions can reject or defer a communication; the API stores the standard bilingual reply with the final thread status. Deferral does not create a maintenance ticket.

### I3–I4 — Waha Pass wording and parity

- Waha user-facing credential wording now uses “facility-access” and the Arabic facilities equivalent.
- Verified tenants retain the in-scope Waha Pass and resident-management capability already supported by the service.
- Verified tenants can create and list Guest Day Passes for a unit with an active Waha Pass.
- **Exception 1:** ownership-change initiation remains verified-owner-only.
- **Exception 2:** T10 tenancy approval/rejection remains the verified unit owner’s action; a verified tenant receives `403`.

### B1–B6 — Verification-form corrections

- “Underground Parking” is used in English and Arabic.
- An owner must provide a valid private title-deed object key and a mobile number before the API accepts a verification request.
- Portal and mobile forms both enforce the required title-deed and mobile fields before submission. Mobile uses the shared phone normalizer, including Arabic-Indic digits, before it validates or sends the value.
- B4 was not rebuilt; existing lifecycle behavior remains the source of truth.
- The admin unit registry includes a visible registry-owner versus verified-owner comparison panel.
- No client verification flow calls `/api/unit-registry/validate`; local format validation remains.

### J1 and J3 — Immediate document access restrictions

- Only admins can upload, replace, or delete library documents.
- Unauthenticated document list, metadata, download, mutation, and folder-mutation routes are blocked.
- Library documents are returned only through the authenticated document download path.
- Direct unauthenticated public-object requests for document paths return `404`; the current document upload/save path uses private object storage only.
- A historical bucket inventory was not available to this evidence run. The record therefore proves that the application does not currently write document-library files to public paths; it does not claim to prove that no pre-existing manual or legacy object has ever existed under a public path.

## Verification completed

- API type check and full suite: **85 files, 1,374 tests passing**.
- Portal type check and suite: **61 files, 1,365 tests passing**.
- Mobile type check and suite: **16 files, 414 tests passing**.
- Focused Clerk browser UAT passed for the unverified-owner Contact HOA state: the scope note and verification explanation render, and no submission fields are available.
- Focused seeded verified-owner Playwright UAT passed: the scope note is above the “New Message” tab and form fields, and the “Send to HOA” button enables after a subject and details are entered without submitting a record.
- The broad Playwright suite reached its unrelated booking flow before the shell timeout; it is not claimed as a complete pass. The focused browser check is the Stage 4 visible verification for the changed communications surface.

## Exclusions and boundaries

- Stage 4b document-library work J2 and J4–J8 remains out of scope.
- B4 was not rebuilt.
- Production deployment, production database operations, and production-only migrations remain out of scope.
- H5 portal pagination/filter integrity remains a separate requirement.

## Delivery boundary

This r2 document records implemented scope and verification. It does **not** claim Stage 4 acceptance or authorize deployment. Final acceptance remains subject to user review and the required consolidated manual UAT.