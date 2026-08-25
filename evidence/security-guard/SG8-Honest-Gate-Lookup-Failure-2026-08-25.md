# SG8 — Honest Gate Lookup Failure Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG8: no offline/cached verification, and a connectivity/system failure must clearly state that the check could not be performed.

## Delivered behavior

- Scanner, resident lookup, and permit lookup now show the same prominent bilingual failure card when their API call rejects or returns a malformed response.
- The card states `Cannot reach the system` and `The check could not be performed. Move to a location with signal and try again.` Arabic equivalents are present.
- Failure clears prior results and does not render an invalid credential, resident `No matching resident found`, or a permit `not approved` verdict.
- Retry remains available through the original scanner/search controls. There is no offline mode, local credential cache, stale-result preservation, or local verification path.
- Raw network/API error text is not shown to the guard, avoiding disclosure of raw credential values, searched National ID/Iqama values, database details, or internal API error payloads.

## Source read-back

- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx`: `LookupUnavailableCard` and separate unavailable state for scanner, residents, and permits. Each lookup clears its normal result first, validates expected success shape, and catches failures into the explicit card.
- `artifacts/hoa-portal/src/lib/translations.ts`: matching English and Arabic failure title/detail strings.
- Existing resident no-match behavior remains exclusively for a valid `[]` response; server privacy behavior for malformed/unknown/nonmatching National ID/Iqama remains unchanged.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Scanner failure regression | PASS | rejected unified scan displays the unavailable state, not invalid credential or movement actions |
| Resident lookup failure regression | PASS | rejected resident lookup displays unavailable state, not no-match |
| Permit lookup failure regression | PASS | rejected permit lookup displays unavailable state, not not-approved |
| Portal focused and translation checks | PASS | 23 tests across gate scanner, resident/permit UI, translation completeness, and fallback |
| Portal typecheck | PASS | `pnpm --filter @workspace/hoa-portal run typecheck` |
| Portal service restart | PASS | Vite restarted cleanly |

## Real-browser positive control

A Playwright testing agent signed in programmatically as the existing `E2E Admin` development user and loaded `/portal/security-gate` without submitting a credential or lookup. Scanner, Residents, and Permits controls were visible; no application API request failed and no browser console error occurred. No business data was created or changed.

## Boundaries

- This slice adds no offline behavior, caching, pass data, resident data, or permit data persistence.
- No production write, deployment, payment setup, schema/migration change, or personal-data compliance work occurred.
- Existing SG6 privacy-safe identical empty response semantics for valid National ID/Iqama non-matches are preserved.