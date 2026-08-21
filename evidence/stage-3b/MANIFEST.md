# Stage 3b — Evidence MANIFEST
Generated: 2026-08-21

| File | Description | Blob SHA | Commit SHA |
|---|---|---|---|
| stage3b-status.md | Full status report: X6, G1-G6, test results | a0690f40f7494e960fb776256c913f9bdfae4b89 | 4cc9d37df2c11386ff14a32bea3a2c55224bc368 |

## Summary

- **X6 (supervisor removal):** DB migration 0020 applied, enum updated, all API routes, portal routes, translations, and tests cleaned.
- **G1 (additional vehicle archived):** Pre-existing. Stale translation keys removed.
- **G2 (renovation scope multi-select):** Pre-existing — 5 approved categories, bilingual. Stale scope keys removed.
- **G3 (contractor licence removed):** Pre-existing. Stale translation key removed.
- **G4 (contractor mobile PhoneInput):** Pre-existing — E.164 validation in place.
- **G5 (all renovation fields mandatory):** Pre-existing — client + server validation.
- **G6 (permit payment removed):** API returns 410 for permit payment branches. Active flows (Waha Pass replacement, Guest Day Pass) confirmed live (401, not 404/410). Stale payment translation keys removed.
- **Translation guard:** 60 files / 1358 tests — all passing (2026-08-21 13:57 UTC+3).
- **Type check:** Clean — 0 errors (portal + API server).
