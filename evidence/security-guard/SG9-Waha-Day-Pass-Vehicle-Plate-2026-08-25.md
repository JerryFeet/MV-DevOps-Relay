# SG9 — Waha Guest Day Pass vehicle-plate flow

**Evidence date:** 2026-08-25  
**Requirement series:** Security Guard (SG)

## Delivered behavior

- The portal Day Pass dialog and mobile Day Pass sheet accept an optional vehicle plate.
- The API trims a supplied plate, stores a blank plate as `null`, and rejects values longer than 32 characters before it creates a payment attempt.
- The verified payment callback remains the sole issuer of a paid Day Pass; a browser redirect cannot activate it.
- Public `/api/verify` exposes only verdict, status/reason, message, and visit date. It never exposes the plate, guest count, sponsor, resident identifiers, or payment data.
- An authenticated guard/admin lookup identifies a Day Pass through explicit `passType: "daypass"` and returns only validity, date, guest count, optional plate, and message.
- Day Passes are count-based: the Security Gate shows count and optional plate but never individual guest entry/exit actions. Ordinary guest passes retain their movement actions.

## Source read-back

- `artifacts/api-server/src/routes/wahaGuestDayPasses.ts` validates, trims, and persists `vehiclePlate` while keeping payment issuance callback-controlled.
- `artifacts/api-server/src/routes/verify.ts` keeps public verification minimal and implements the role-restricted Day Pass projection.
- `artifacts/hoa-portal/src/pages/portal/guests.tsx` submits the portal plate field.
- `artifacts/hoa-mobile/app/(home)/(tabs)/guests.tsx` collects and trims the mobile plate field.
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx` shows only the authorized Day Pass operational projection and suppresses per-guest movement controls.
- `lib/api-spec/openapi.yaml`, generated React client, and generated Zod schemas were regenerated after the contract update.

## Verification

| Check | Result |
| --- | --- |
| API targeted regression suite | Passed — 97 tests across Day Pass validation/persistence, public privacy, gate-role control, role-removal behavior, and retention. |
| Portal targeted gate suite | Passed — 12 tests, including Day Pass count/plate display without movement controls and ordinary guest movement behavior. |
| Full portal suite | Passed — 65 files, 1,348 tests. |
| API, portal, and mobile TypeScript checks | Passed. |
| OpenAPI generation and library typecheck | Passed. |
| `git diff --check` | Passed. |

## Boundaries retained

- No live payment was configured or attempted; the API fails closed without a configured provider secret.
- No production data or deployment was changed.
