# SG14/SG15 implementation delivery

**Date:** 2026-08-26  
**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`

## Delivered behavior

- Guards are restricted to the browser Security Gate dashboard.
- Generic announcements, bookings, guests, residents, and vehicles modules
  reject guards before their handlers run.
- Portal resident routes allow `admin`, `owner`, and `tenant`; Security Gate
  allows `admin` and `guard`.
- `GET /api/gate/plate-lookup` performs exact normalized active-vehicle lookup.
- Plate normalization covers casing, whitespace, dash variants, Arabic-Indic
  digits, and Persian digits.
- Results are either a minimum registered projection or neutral
  `not_registered`.
- Account and normalized-plate durable rate limits are applied.
- Plate rate-limit subjects use domain-separated HMAC-SHA-256 and do not expose
  the raw plate.

## Verification

- Focused API: 4 files, 163 tests passed.
- Portal: 67 files, 1,359 tests passed.
- Real Clerk guard browser checks passed for gate-only navigation, direct-route
  refusal, neutral plate result, Arabic rendering, and 390 px width.

## Detailed relay evidence

- `evidence/security-guard/SG14-Guard-Only-Scope-Evidence-2026-08-26-r1.md`
- `evidence/security-guard/SG15-Exact-Plate-Lookup-Evidence-2026-08-26-r1.md`
- `evidence/security-guard/SG14-SG15-Evidence-MANIFEST-2026-08-26-r1.md`

No production access, deployment, schema migration, or live payment occurred.