# SG defect privacy corrections — publication manifest

- **Relay repository:** JerryFeet/MV-DevOps-Relay
- **Branch:** main
- **Evidence-content final commit:** `47c9802a835088ea6aa23b6775237f4dd2a64c30`
- **Classification:** corrective privacy evidence only; no deployment, production query, production write, or live payment configuration.

## Individually verified evidence files

| File | Relay content commit | Remote blob | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `evidence/pre-go-live/SG-Defect-1-Gate-Pass-Projection-2026-08-25-r1.md` | `71129196b851b0f80aa7c12189dc25e0ce70171d` | `88173b2b4a502a236bb1541055ec4025d1f62ab9` | 1766 | `95e50b9ccc3d3b4622da99b03848b5f570aa4a043de40361ff2edef02bbac22c` |
| `evidence/pre-go-live/SG-Defect-2-Public-Verify-Minimum-Information-2026-08-25-r1.md` | `f1cf8b45341537531504762457016b0508112ff5` | `49ba3f933e9b351a9e870f98c08a1277d3630ae3` | 1981 | `de76524099ff00b661282f759c084cf6044563725568ab1f00fc1779b2c9194d` |
| `evidence/pre-go-live/SG-Defect-3-Waha-Allowance-Count-Removal-2026-08-25-r1.md` | `47c9802a835088ea6aa23b6775237f4dd2a64c30` | `2e1ec9857fc20e40fa1e14638f8c3862164a2af8` | 1675 | `eb7b8caf6e7defc93d7393a387913f2fbea6bfe90158d532d572539444242f87` |

## Test-count delta and E2E flake accounting

- Previous full E2E report: **79 passed / 4 skipped**.
- Current full E2E report: **78 passed / 1 flaky (retriable) / 4 skipped**; no final hard failure.
- The changed first-attempt result was `Facility Booking › at least one facility card or empty state is shown`.
- It hit Playwright strict-mode ambiguity: the broad `facilityCard.or(emptyMsg)` locator could match both an incidental rounded/bordered layout element and the legitimate empty-state text. The retry passed. No product assertion was removed and the four skips are unchanged.
- The defect evidence’s direct API suite is **69/69 passing**. The focused portal scanner/privacy suite is **59/59 passing**. The portal translation guard remains **1,374/1,374 passing**.

## Publication assertion

Each evidence path is inside `evidence/`; each content commit and blob is a 40-character lowercase Git object ID; the GitHub relay API read each object back from `JerryFeet/MV-DevOps-Relay`. This manifest is the required manifest-only follow-up commit and records the final evidence-content commit above.
