# SG9 — Unified Gate Credential Scanner Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG9: one authenticated scanner, one clear answer for Waha Passes, guest passes, and Guest Day Pass barcodes.

## Delivered behavior

- The gate dashboard has one `Scanner` tab, not separate Guest/Waha credential-selection screens.
- The scanner accepts a camera decode or pasted value and calls exactly one authenticated endpoint: `GET /security/gate/scan?code=`.
- The server classifies Waha Pass verification tokens or pass numbers, guest verification tokens or `pass_uuid` values, and numeric Code 128 Guest Day Pass IDs.
- Unknown input returns the explicit `NOT_VALID_MADAIN_VILLAGE_CREDENTIAL` result; the browser renders `NOT A VALID MADAIN VILLAGE CREDENTIAL` instead of an empty or silent state.
- Validity is at-a-glance: a large green `VALID — ENTRY PERMITTED` or large red translated invalid reason. Expired, revoked/lost/stolen/damaged, unpaid, and not-yet-valid states are distinguishable.
- Guest scans display guest, host, unit, visit date, and optional vehicle plate. Waha scans display holder and unit. Day Pass scans display date, count, host, unit, paid state, and optional vehicle plate.
- Movement buttons remain available only after a valid individual guest-pass classification. Day Pass and Waha scans never expose guest movement controls.

## Privacy and read-only boundaries

The unified endpoint returns deliberately minimal projections. It does not return raw credentials, pass/internal IDs, National ID/Iqama, payment attempts, photographs, application metadata, or unrelated personal data. The result UI has no National ID/Iqama field. The scanner is verification-only: no approval, issuance, payment, or credential-status control was added.

Guest entry/exit logging remains the existing guest-only action and is reached only from a valid guest result. This slice did not create a movement record during browser verification.

## Source read-back

- `artifacts/api-server/src/lib/gateCredentialScan.ts`: QR query-token normalization, numeric Day Pass barcode recognition, and explicit dated credential status reasons.
- `artifacts/api-server/src/routes/verify.ts`: admin/guard authorization and server-side classification into `guest`, `waha`, `daypass`, or `unknown`; each branch returns its minimal SG9 projection.
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx`: one camera/input callback, typed unified result, large verdict card, and guest-only movement guard.
- `artifacts/hoa-portal/src/lib/translations.ts`: matching English and Arabic scanner, verdict, reason, and detail labels.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Unified credential helper tests | PASS | QR token extraction, numeric Day Pass barcode recognition, expired/not-yet-valid/unpaid/revoked reasons |
| Combined API gate checks | PASS | 25 tests across unified scanner helpers, permit projection, and resident lookup |
| API typecheck | PASS | `pnpm --filter @workspace/api-server run typecheck` |
| Unified portal scanner tests | PASS | 61 tests across scanner/movement, scanner visibility, and Waha result compatibility checks |
| Portal translation guards | PASS | 12 tests across completeness, fallback, and Waha terminology guards |
| Portal typecheck | PASS | `pnpm --filter @workspace/hoa-portal run typecheck` |
| Service startup | PASS | API rebuilt and listened on port 8080; portal Vite server restarted cleanly |

The broad portal test command was also started after the final wording change, but the shell's five-minute limit interrupted it before any test completed. It produced no failing assertion and no lingering Vitest process. It is therefore not claimed as a passing full-suite result in this evidence.

## Real-browser verification

A Playwright testing agent used Clerk programmatic sign-in as the existing `E2E Admin` development user; no account or business data was created or changed. On `/portal/security-gate` it verified:

- the protected page loaded with one Scanner entry point and no Waha Pass type-selection tab;
- entering the harmless value `sg9-unrecognised-credential` displayed the explicit invalid Madain Village credential verdict;
- the route remained open and no guest movement/admit/deny controls appeared;
- no browser console errors or failed application API requests occurred. Only Vite development, React DevTools, and Clerk development-key informational output appeared.

## Boundaries

- No migration, schema change, production write, deployment, payment setup, or deferred personal-data compliance work occurred.
- Existing optional vehicle-plate support for Guest Day Passes was used; no new schema decision was made.
- The Stage 6 development-schema freeze remains intact.