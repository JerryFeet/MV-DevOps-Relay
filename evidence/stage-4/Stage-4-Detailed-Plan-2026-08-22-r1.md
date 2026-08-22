# Stage 4 — Detailed UAT Plan

**Revision:** r1  
**Status:** submitted for review before implementation  
**Stage:** 4 — Access, residency, and communications  
**Precondition:** Stage 3a, 3b, 3c, and 3d are accepted; Stage 4b is accepted separately.

## Objective

Deliver the access, wording, parity, verification-form, and immediate document-access corrections that remain after Stage 3 and Stage 4b. The implementation must correct both visible behavior and API authorization. A navigation state must never be treated as an authorization boundary.

Decision 42 remains in force: no production deployment occurs until every stage is complete and the consolidated manual UAT round has been performed.

## Scope

### K1–K5 — Contact HOA communications

1. Enforce Contact HOA submission for verified owners only.
2. Block tenants, household members, and unverified owners in the API and UI.
3. Show tenants a bilingual explanatory screen instead of the submission form.
4. Display the bilingual common-area scope note before the form fields.
5. Show the sender’s full name, unit number, email, and mobile in the admin list.
6. Store the bilingual standard rejection reply and set the thread status to `rejected`.
7. Store the bilingual maintenance-deferral reply and set the thread status to `deferred_to_maintenance`, without creating a downstream maintenance ticket.
8. Audit visible and navigation-hidden communications paths and make them contract-consistent. The API guard is authoritative.

### I3–I4 — Waha Pass wording and parity

1. Replace user-facing “gate-access credential” wording with “facility-access credential” and the approved Arabic equivalent across portal, mobile, emails, and credential artefacts.
2. A verified main tenant receives the same in-scope Waha Pass, resident, and Guest Day Pass capabilities as a verified owner.
3. **Exception 1:** ownership-change initiation remains owner-only.
4. **Exception 2:** approving a tenancy on the unit remains owner-only under T10. A verified main tenant cannot approve a tenancy request for the unit they rent.

The I4 audit must preserve both exceptions. It must not use a single generic “owner-only” exception that misses T10 approval.

### B1–B6 — Verification-form corrections

1. B1: use “Underground Parking” and its approved Arabic equivalent.
2. B2: require title deed submission; the API rejects a missing title deed.
3. B3: require a mobile number using the shared mobile component; the API rejects a missing mobile number.
4. B4: verify the already-delivered title-deed audit and deletion behavior. B4 was moved to Stage 2b and must not be rebuilt here.
5. B5: perform a dedicated visible-behavior check that the admin registry screen displays the owner’s name. D1’s automated acceptance is not sufficient evidence for closing B5.
6. B6: remove the client-side `/api/unit-registry/validate` request while retaining National ID format validation.

### J1 and J3 — Immediate document access restrictions

1. Only admins can upload, replace, or delete document-library content.
2. Remove upload controls from non-admin views and return `403` for crafted non-admin mutation requests.
3. Remove unauthenticated document listings, links, previews, API routes, and storage-path access.
4. Confirm the public homepage contains no document listing or document link.

## Execution order

1. **Communications contract and authorization**
   - Audit the communications navigation and all reachable or hidden routes.
   - Align portal, mobile, and API behavior around verified-owner eligibility.
   - Add the tenant explanation, scope note, sender context, and standard replies.
2. **Communications regression boundary**
   - Test every role boundary through direct API requests, not only through navigation.
   - Verify the admin list and both reply outcomes.
3. **Waha Pass language and parity**
   - Perform the terminology sweep.
   - Centralize the verified-primary-resident rule.
   - Audit both owner-only exceptions: ownership-change initiation and T10 tenancy approval.
4. **Verification-form corrections**
   - Apply B1, B2, B3, and B6 across portal and mobile surfaces.
   - Run the dedicated B5 admin-registry visible check.
   - Verify B4 using existing Stage 2b evidence; do not create a replacement migration.
5. **Immediate document restrictions**
   - Confirm J1’s current UI state, then enforce admin-only mutations at the API.
   - Confirm and close every J3 unauthenticated/public path.
6. **Bilingual and role-based UAT**
   - Run the traceability matrix checks in English and Arabic where applicable.
   - Record manual evidence for visible states, especially B5, the tenant explanation, and public-document removal.

## Exclusions

- Stage 4b document-library work: J2 and J4–J8, including visibility vocabulary, folders, folder floors, view/download settings, full mobile parity, and supersede-by-archive storage.
- Rebuilding B4, which was moved to Stage 2b.
- Reclassifying D1’s automated acceptance as visible B5 evidence.
- Stage 5 notification-service infrastructure and email delivery wiring. Stage 4 stores and returns the required communication replies; X3 wires delivery later.
- Stage 5 guest-management and Guest Day Pass product expansion.
- Stage 6 ownership and lifecycle work.
- Production deployment, production database operations, and production-only migrations.
- H5 portal pagination/filter integrity, which remains a separate approved requirement from Stage 3d.

## Done looks like

- Contact HOA is available to verified owners and unavailable to tenants, household members, and unverified owners through both UI and crafted API requests.
- Tenants see the required bilingual explanatory screen and no submission form.
- The bilingual scope note appears before the Contact HOA fields.
- Admins see sender full name, unit, email, and mobile.
- Rejection and maintenance-deferral replies are stored in both languages with the correct statuses and no unintended maintenance ticket.
- All user-facing Waha Pass credential wording uses “facility-access credential” and the approved Arabic equivalent.
- Verified main tenants have owner-equivalent in-scope access, while both owner-only exceptions remain enforced:
  - ownership-change initiation;
  - T10 tenancy approval for the rented unit.
- Verification forms require title deed and mobile, show “Underground Parking,” retain the B4 audit lifecycle, visibly show the owner name in the admin registry, and make no client-side registry-validation request.
- Non-admin document mutations return `403`.
- Unauthenticated document access returns `401`, and the public homepage exposes no document listing or link.
- The traceability matrix is complete, with automated results and manual UAT evidence identified for every Stage 4 ID.

## Delivery boundary

This document is a pre-implementation plan for review. It does not claim Stage 4 acceptance. After implementation, the delivery will include the test/UAT results, deviations and boundaries, exact source hashes, and a revisioned manifest linked to the evidence-content commit.