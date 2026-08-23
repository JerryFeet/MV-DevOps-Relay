# Stage 6C O3–O7 — Path B retirement and ownerless-registry evidence

**Evidence date:** 2026-08-23  
**Scope:** Stage 6C ownership-change and ownerless-unit work (O3, O4, O5, O7).  
**Stage 6B status:** Accepted.  
**Deployment status:** No deployment, production database access, production-data change, or live payment credential use occurred.

## Delivered behavior

### O3 — outgoing-owner release uses the shared terminal-release engine

- Approval of a Path B ownership-change event now runs through `releaseSubject`.
- The manual ownership-clearing fallback was removed. A review fails closed if its outgoing owner is no longer active instead of running a parallel destructive cascade.
- The engine always clears `units.pre_approved_claim_id` in the release plan; it no longer creates an incoming-owner claimant slot.
- HOA COMMON remains rejected before any release mutation.

### O4 — verified tenant continuity is preserved

- Owner releases remain limited to the outgoing owner's graph.
- Tenant credentials, verified tenant linkage, residents, and bookings are not released or reassigned as a side effect of the owner’s terminal release.
- Releases are idempotent: a second terminal request reports the already-ended state without repeating effects.

### O5 — incoming owners continue through ordinary B7

- The `POST /api/unit-verify/owner` pre-approved fast-track branch was removed.
- A claimant now creates the ordinary B7 manual-review request; no unit linkage, verified-owner access, or ownership-event claimant link is granted automatically.
- The administrator finalize and cancel-pre-approval routes are retired and return `404`.
- Path B claimant-slot expiry and the corresponding scheduler tick are retired. Path A expiry remains.
- The portal no longer recognizes `pre_approved` as a current-user state, displays fast-track success, or exposes finalize/cancel controls.

### O7 — ownerless registry visibility

- `GET /api/admin/units/full` now returns ownerless metadata for units without a verified owner.
- The elapsed-time anchor is the latest approved ownership-event review time; units with no ownership history use their creation time.
- HOA COMMON is excluded from ownerless results.
- The unit registry labels these records as **No registered owner** and displays elapsed days for administrators.

## Historical-record treatment

The audit established that the development database has no active pre-approved claimant slots, pre-approved users, linked claimants, or approved/completed ownership events. Historical schema fields and ownership-event audit records are retained; active promotion behavior is retired. This follows the archived-record principle used for G1 permit history: historical data is preserved without granting active workflow behavior.

See the pre-implementation audit: `evidence/stage-6c/Stage-6C-Step1-PathB-Audit-2026-08-23.md`.

## Validation

| Check | Result |
|---|---|
| Focused API contracts: ownership flow, release engine, ownerless registry, and remaining Path A expiry | **72 passed, 21 skipped** |
| API TypeScript check | **Passed** |
| Portal TypeScript check | **Passed** |
| Portal translation/unit suite | **1,368 passed** |
| Playwright end-to-end suite after API + portal restart | **77 passed, 6 skipped** in 4.3 minutes |
| Active-code scan for Path B claimant slot, fast-track status, finalize/cancel routes, and retired scheduler exports | **No active references** |
| API and portal workflow restart | **Both serving cleanly** |

The focused release test proves a real O3/O4 release leaves `preApprovedClaimId` empty and preserves tenant records, tenant credentials, residents, and bookings. The ordinary-B7 test proves O5 produces `pending_manual` without a unit link or `newOwnerUserId`. The registry test proves O7 includes never-registered and released ownerless units, gives elapsed metadata, and excludes HOA COMMON.

## Browser testing note

The seeded resident and administrator browser journeys passed in the full Playwright suite, including the administrator dashboard and ownership-change data load.

A separate smoke test using a brand-new Clerk identity found an existing first-sign-in provisioning race: concurrent `POST /api/users/me/sync` calls can collide on the unique Clerk ID after one request creates the row, causing other calls to return `500` and temporarily leaving portal routes blank. The failing insert is independent of the Stage 6C ownership logic; the successful competing request creates the default tenant record, and later `GET /api/users/me` succeeds. This reliability issue has been recorded separately for follow-up rather than folded into the Stage 6C result.

## Relevant implementation and test surfaces

- `artifacts/api-server/src/lib/releaseSubject.ts`
- `artifacts/api-server/src/lib/ownershipChangeScheduler.ts`
- `artifacts/api-server/src/routes/ownershipChanges.ts`
- `artifacts/api-server/src/routes/units.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/__tests__/ownershipChangeFlow.test.ts`
- `artifacts/api-server/src/__tests__/releaseSubject.test.ts`
- `artifacts/api-server/src/__tests__/adminUnitRegistry.test.ts`
- `artifacts/api-server/src/__tests__/ownershipChangeScheduler.test.ts`
- `artifacts/api-server/src/__tests__/ownershipChangeExpiry.test.ts`
- `artifacts/hoa-portal/src/components/PortalLayout.tsx`
- `artifacts/hoa-portal/src/hooks/useCurrentUser.ts`
- `artifacts/hoa-portal/src/pages/portal/admin.tsx`
- `artifacts/hoa-portal/src/pages/portal/unit-verification.tsx`
- `artifacts/hoa-portal/src/pages/portal/unitRegistry.tsx`

## Conclusion

Stage 6C O3/O4/O5/O7 is implemented and validated in development. Ownership release is single-engine and fail-closed, outgoing-owner deletion does not disturb verified tenants, incoming ownership no longer has a claimant-slot or administrator-promotion shortcut, and administrators can identify ownerless units with elapsed time while HOA COMMON remains excluded.