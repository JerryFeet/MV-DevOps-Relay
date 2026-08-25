# SG9 — Waha Guest Day Pass vehicle-plate flow

**Evidence date:** 2026-08-25  
**Scope:** Optional vehicle plate from resident purchase input through the verified Day Pass persistence and gate-only projection.

## Delivered behavior

- The portal Day Pass dialog and mobile Day Pass sheet accept an optional vehicle plate.
- The API trims a supplied plate, stores a blank plate as `null`, and rejects values longer than 32 characters before it creates a payment attempt.
- The verified payment callback remains the sole issuer of a paid Day Pass; a browser redirect cannot activate it.
- The public `/api/verify` response exposes only verdict, status/reason, message, and visit date. It never exposes the plate, guest count, sponsor, resident identifiers, or payment data.
- An authenticated guard/admin lookup can identify a Day Pass by its explicit `passType: "daypass"` marker and receives only validity, date, guest count, optional plate, and message.
- Because a Day Pass is count-based, the Security Gate presents its count and optional plate without individual guest entry/exit actions. Ordinary guest passes retain their movement actions.

## Source read-back

- `artifacts/api-server/src/routes/wahaGuestDayPasses.ts` validates `vehiclePlate` as an optional string of at most 32 trimmed characters, persists it, and keeps payment issuance callback-controlled.
- `artifacts/api-server/src/routes/verify.ts` keeps the public output minimal and provides the role-restricted Day Pass gate projection.
- `artifacts/hoa-portal/src/pages/portal/guests.tsx` submits the optional plate.
- `artifacts/hoa-mobile/app/(home)/(tabs)/guests.tsx` collects and trims the optional plate before submission.
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx` recognizes only explicit Day Pass projections and suppresses individual movement actions for them.
- `lib/api-spec/openapi.yaml`, the generated React client, and generated Zod schemas were regenerated after the contract update.

## Verification

| Check | Result |
| --- | --- |
| API targeted regression suite | Passed — 97 tests across Day Pass validation/persistence, public privacy, gate-role control, role-removal behavior, and retention. |
| Portal targeted gate suite | Passed — 12 tests, including count/plate display without movement controls and ordinary guest movement behavior. |
| Full portal suite | Passed — 65 files, 1,346 tests. |
| API, portal, and mobile TypeScript checks | Passed. |
| OpenAPI generation and library typecheck | Passed. |
| `git diff --check` | Passed. |

## Boundaries retained

- No live payment was configured or attempted; the API fails closed without a configured provider secret.
- No production data or deployment was changed.
