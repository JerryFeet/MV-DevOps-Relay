# Stage 3a r3 Evidence Manifest

**Package date:** 2026-08-21  
**Revision:** r3  
**Evidence path:** `evidence/stage-3a/` in `JerryFeet/MV-DevOps-Relay`

---

## Files

| File | Blob SHA-1 (GitHub) | Notes |
|---|---|---|
| `stage3a-status.md` | `f0f8ee45d8de06f22c82c2a38e06d467649c8012` | r3 delivery report; 82 E2E passed / 5 skipped / 0 failed |
| `MANIFEST.md` | _(this file; self-hash impossible — see commit SHA below)_ | Detached manifest |

## Content commit

The evidence content commit (status file push) that precedes this manifest commit:

```
80ccbbb51c0231397a14a4475152133d70f552d6
```

## r3 changes from r2

| Item | Change |
|---|---|
| Wizard test (×2) | Fixed: `waitFor({ state: "visible" })` replaces non-waiting `isVisible({ timeout })`; date window changed to +4 days; time-pattern slot locator added; tests 23 + 71 now pass |
| Waha Pass booking panel (×2) | New: `seedActiveWahaPassByEmail` added to verified-resident fixture; tests 22 + 70 now pass |
| E2E total | 87 tests: 82 passed / 5 skipped / 0 failed (up from 85 tests: 78 passed / 7 skipped / 0 failed in r2) |
| Decision 61 | Reduced from 7 to 5 named skips |
| Section 2b | Admin exempt from F9 advance-booking window; window applies to residents only |
| Section 9d | No advance-booking limit exists; dead `cutoffError` scaffolding noted; F9 is Stage 3b |

## Verification

```bash
# Verify stage3a-status.md blob matches the declared SHA
git cat-file -p f0f8ee45d8de06f22c82c2a38e06d467649c8012
```

---

## Classification

- Release decision: **DO NOT DEPLOY**
- No resident data, production credentials, private object keys, or INSERT/COPY rows are present in this package.
