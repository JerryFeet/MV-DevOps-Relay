# SG3 — Gate Permit Projection Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG3a/SG3b: gate-safe move-in, move-out, and renovation permit checks by unit.

## Delivered behavior

- The Security Gate dashboard now has one read-only `Permits` area with `Move-In`, `Move-Out`, and `Renovation` lookup modes.
- `GET /api/gate/move-in-status?unitNumber=` and `GET /api/gate/renovation-status?unitNumber=` are implemented alongside the move-out lookup. All three authorize only `admin` and `guard`.
- Move-in and move-out responses contain only `allowed`, status, requested date range, and requested unit number.
- Renovation responses contain only that status/date/unit projection plus `contractorName` and `contractorMobile` when approved.
- Only `approved` and `approved_with_conditions` permits are recognized. Wrong-purpose and submitted permits return a not-approved response.
- Unit matching normalizes case, spaces, and hyphens.

## Field-level privacy read-back

The route selects only fields needed for the projection. It does not select or return permit IDs, requester IDs/names, descriptions, conditions, review notes, payment/deposit fields, vehicle details, renovation scope, contractor license, photos, or other permit contents. The pre-existing move-out response was tightened as part of this slice: it no longer returns the covered resident name.

## Source read-back

- `artifacts/api-server/src/routes/users.ts`: three admin/guard-only routes, minimal Drizzle selections, and projection-only responses.
- `artifacts/api-server/src/lib/gatePermitProjection.ts`: normalized unit matching, approved-status enforcement, and separate move versus renovation DTOs.
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx`: a Permit selector that calls only the matching gate route; it renders dates and, for renovation only, contractor name/mobile.
- `artifacts/hoa-portal/src/lib/translations.ts`: complete English and Arabic labels for the new read-only controls and results.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Gate permit projection tests | PASS | `pnpm --filter @workspace/api-server exec vitest run src/__tests__/gatePermitProjection.test.ts` — 3 tests passed |
| Combined API gate checks | PASS | permit projection plus resident lookup tests — 22 tests passed |
| API typecheck | PASS | `pnpm --filter @workspace/api-server run typecheck` |
| Portal gate UI/session checks | PASS | `pnpm --filter @workspace/hoa-portal exec vitest run src/__tests__/gateResidentsTabVisibility.test.tsx src/__tests__/gateSession.test.ts` — 15 tests passed |
| Portal typecheck | PASS | `pnpm --filter @workspace/hoa-portal run typecheck` |
| Full portal suite | PASS | 65 files, 1,350 tests passed after the SG3 application changes |
| Translation completeness | PASS | included in the successful full portal suite |
| Service startup | PASS | API rebuilt/listened on port 8080; portal Vite server restarted cleanly |

The projection tests prove move-in's exact minimal field set, renovation's exact contractor field set, space/hyphen-normalized unit lookup, no exposure of private fixture fields, and rejection of submitted/wrong-purpose permits. The UI test proves the Renovation mode calls `/gate/renovation-status` and renders contractor contact without a private license field.

## Real-browser verification

A Clerk-authenticated E2E admin browser session passed at `/portal/security-gate`:

- active session visibly identified `E2E Admin`;
- `Permits` displayed `Move-In`, `Move-Out`, and `Renovation`;
- each choice updated to its own approved-permit guidance;
- the empty unit lookup was disabled and no lookup data was changed;
- no application console errors or failed API calls occurred. Expected Vite hot-update and Clerk development-key warnings were observed only.

## Boundaries

- The Permit area is read-only. No approval, issue, or status-change control was added.
- No migration, schema change, production write, deployment, payment configuration, or personal-data compliance work occurred.
- The Stage 6 development-schema freeze remains intact.