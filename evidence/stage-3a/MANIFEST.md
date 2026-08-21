# Stage 3a Evidence Manifest — 2026-08-21

## Files in this package

| File | Purpose |
|---|---|
| `stage3a-status.md` | Primary evidence: acceptance matrix, API test counts per spec ID (D1/A2/E1–E5/F1–F6), E2E results (75 passed / 7 skipped / 0 failed), Decision 61 skip table |
| `MANIFEST.md` | This file |

## Evidence carried from prior delivery (Stage 3 r4, 2026-08-20)

The following artefacts from Stage 3 r4 remain governing for Stage 3a and are not re-published:

| Carried artefact | Location | Purpose |
|---|---|---|
| `Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20-r4.txt` | `exports/stage3-delivery-2026-08-20-r4/` | F5 migration transcript (2 normalizations, 2 conflicts, no buffer rounding, zero residual) |
| `Stage-3-UAT-Schema-Only-2026-08-20-r4.sql` | same | Schema snapshot at r4 — unchanged in Stage 3a (no new migration) |
| `Stage-3-UAT-Migration-2026-08-20-r4.sql` | same | Stage 3 migration source — unchanged |
| `Stage-3-UAT-Database-Integrity-Evidence-2026-08-20-r4.txt` | same | F5 prerequisite tables confirmed present |

## Test-suite baselines at Stage 3a close

| Suite | Result |
|---|---|
| API server | 76 files / 1,274 tests PASS |
| HOA portal (unit + integration) | 60 files / 1,377 tests PASS |
| HOA mobile | 16 files / 405 tests PASS |
| Portal typecheck | PASS |
| E2E | 75 passed / 7 skipped / 0 failed |

## Evidence-content commit

| File | GitHub blob SHA | SHA-256 | Commit SHA |
|---|---|---|---|
| `stage3a-status.md` | `4b1e68d767ea69b87831bdab1ba21cc1c8a65a9a` | `2da2e6427dfcee3780ced8d2f2cff0c11fd92919de39b0e99d533d5bdd4da3bb` | `0182bee3dffb6eb97f0e404fe4e39e989e1b4e69` |
| `MANIFEST.md` | `0d9cf822b96b5e0aedb20e8e49a8570a040eb029` | `85b639e2daf1f147781329aa3e171dcb6159c447793e9edaa220463f51e3e03d` | `b910c4afce0b4aff8a7f3d1ff771a4977067d3c3` |

## Verification

Clone `JerryFeet/MV-DevOps-Relay` and inspect `evidence/stage-3a/` for the two files in this package.

```
# Verify stage3a-status.md blob
git cat-file -p 4b1e68d767ea69b87831bdab1ba21cc1c8a65a9a
```

All prior Stage 3 and Stage 4b evidence files remain in their original paths and are unmodified.
