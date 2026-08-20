# Madain Village HOA Portal — Stage 3 Delivery Status Report (r3)

**Evidence date:** 2026-08-20  
**Classification:** **Status report — not a Stage 3 acceptance package**  
**Release decision:** **DO NOT DEPLOY**

## Test-count correction

The earlier r2 report did not explain a shrinking suite. The count change is intentional Stage 3 retirement/consolidation work, but it must be reported:

| Suite | Earlier Stage 3 snapshot | r2 | Current r3 | Delta from earlier snapshot |
|---|---:|---:|---:|---:|
| API | 77 files / 1,290 tests | 75 / 1,273 | **75 / 1,274** | **−2 files / −16 tests** |
| Portal | 61 files / 1,484 tests | 59 / 1,370 | **59 / 1,375** | **−2 files / −109 tests** |
| Mobile | not recorded in r2 | not recorded | **12 files / 375 tests** | new baseline |

The net four-file decrease does **not** mean only four files were deleted. Commit `c67318e` deleted seven retired payment/deposit suites and added three focused replacement suites.

| Removed file | Reason | Remaining coverage |
|---|---|---|
| `adminPaymentHistoryFilters.test.ts` | Permit-payment history was retired. | No one-for-one replacement is appropriate; the permit payment workflow was intentionally removed. |
| `adminPermitDepositResolution.test.ts` | Permit deposit resolution was retired. | API retirement/blocked-transition behavior is covered in `booking-permit-ownership.test.ts` and `stage3G1G6.test.ts`. |
| `paymentHistoryIsolation.test.ts` | Permit-payment history was retired. | The removed workflow is no longer an active API feature. |
| `permitPaymentCreate.test.ts` | Permit payment creation was retired. | `stage3G1G6.test.ts` verifies permit payment creation/verification is gone. |
| `permitPaymentNoteField.test.ts` | Permit payment notes were retired. | `stage3G1G6.test.ts` verifies retired payment fields are not accepted or persisted. |
| `adminPermitDepositResolutionUI.test.tsx` | Deposit-resolution UI was retired. | The remaining permit UI is covered by current permit status and localization suites; there is no equivalent deposit UI by design. |
| `permitPayNow.test.tsx` | Permit Pay Now UI was retired. | There is no permit-payment UI by design. |

The three additions were `d1a2RegressionGaps.test.ts`, `stage3G1G6.test.ts`, and `vehicleStage3E1E5.test.ts`. Future deliveries will report count deltas and explain every decrease.

## Response to r2 review items

1. **Test-count drop:** Corrected above. The previous report was incomplete; the deletion/replacement accounting is now explicit.
2. **Approved `TEXT[]` versus JSON-in-text:** The JSON-in-text implementation was a silent deviation from the approved `TEXT[]` decision. Its reason was implementation convenience when preserving historic scalar values, not a constraint that makes `TEXT[]` impossible. This is not sufficient justification to change the agreed design silently.
3. **Two persistent formats:** Confirmed. Historic rows are scalar text and newer rows are JSON arrays. Before Stage 4, a dedicated migration must inventory legacy values, convert approved values to single-element arrays, route unknown values to `data_migration_corrections`, and leave one canonical format only.
4. **Orphaned enum:** Confirmed. `public.renovation_scope` remains after the active column was converted away from the enum and contains stale values. The same remediation must drop the enum and its schema declaration after dependency verification.
5. **D1 and A2:** Both are now reported. Fresh focused regression evidence passed: D1 guards block gate/owner/tenant callers and allow appropriate staff; A2 returns active residents, full names, and phone values. They still need focused browser UAT before acceptance.
6. **Acceptance matrix:** Restored below and required in every subsequent status or acceptance package.
7. **Seeded F5 evidence:** Completed. `Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20.txt` records two normalization rows, two detected conflicts, no buffer rounding, a valid Thursday 00:30 control, and zero fixture rows after rollback. The missing development audit tables were restored by the existing idempotent Stage 3 migration before the run.
8. **Advisory lock 4201:** Its durable source of truth is `artifacts/api-server/src/lib/advisoryLockNamespaces.ts`, where the facility-booking admission namespace reserves class ID `4201` and documents its per-facility key. Migration `0022` records why this runtime primitive is not a database object. A future regression test should assert the booking route uses that exported namespace rather than a literal.

## Stage 3 acceptance matrix

**Legend:** **Implemented — UAT pending** means automated evidence exists but focused browser UAT/formal sign-off is still required. **Open** means a required correction remains. **Blocked** means Stage 3 cannot be accepted until the row is resolved.

| ID | Status | Current evidence / limitation |
|---|---|---|
| D1 | **Implemented — UAT pending** | Fresh 23-test D1/A2 regression run confirms role guard and full registry roster behavior. |
| A2 (supplemental) | **Implemented — UAT pending** | Fresh regression verifies `/users` exposes first name, last name, and phone to admins; browser confirmation remains. |
| E1–E5 | **Implemented — UAT pending** | Stage 3 vehicle regression suite covers resident validation, entitlement enforcement, controlled rejection reasons, and protected Istimara access. |
| F1 | **Implemented — UAT pending** | Opening-anchored grid and 30/60/90/120 minute behavior are automated. |
| F2 | **Implemented — UAT pending** | Whole-minute, non-negative cleaning buffers and symmetric conflicts are automated. |
| F2b (supplemental) | **Implemented — UAT pending** | Exclusive-use index and buffered-overlap rule are documented for future capacity-facility review. |
| F3 | **Implemented — UAT pending** | Service-window, interval, duration, and conflict validation are automated. |
| F4 | **Implemented — UAT pending** | Closing-boundary and overnight Thursday flow are covered by API logic; resident browser confirmation remains. |
| F5 | **Implemented — UAT pending** | Fresh rollback-only seeded evidence: 2 normalizations, 2 conflicts, zero residual fixtures. |
| G1 | **Implemented — UAT pending** | Additional-vehicle permit submissions and active lists are retired. |
| G2 | **Implemented — UAT pending** | Portal/API coverage passes. Mobile P0 contract regression is remediated in this delivery and has new payload coverage. |
| G3 | **Implemented — UAT pending** | Contractor licence remains retired from new submissions and views. |
| G4 | **Implemented — UAT pending** | E.164 validation passes; mobile now defaults to Saudi input and normalizes to E.164 before submit. |
| G5 | **Implemented — UAT pending** | Mandatory renovation fields, including common-area conditional details, are covered in API and mobile tests. |
| G6 | **Open** | Fresh API evidence covers renovation and `move_in` no-fee submission plus permit payment endpoints returning gone. Required `move_out` and legacy `move_forms` no-payment evidence remains. |
| Waha Pass / Guest Day Pass payment regression | **Open** | Required payment regression evidence remains. |
| HOA Mobile contract audit | **Open** | The renovation P0 is fixed; private document downloads and guest pagination remain confirmed resident-impacting mismatches. |
| Focused browser UAT | **Open** | Required resident/admin scenarios remain to be recorded. |
| Repository evidence delivery test | **In progress — status-only exception** | At the reviewer’s request, the current four sanitized status artefacts are being tested as individual repository files before acceptance. The configured remotes are private Replit workspace remotes and do not establish browser-accessible direct URLs. |

## P0 regression status

Task #683 is reclassified as a **P0 Stage 3 regression**, not new scope. The mobile renovation sheet now:

- uses exactly `major_plumbing_electrical`, `structural_modifications`, `major_interior_upgrades`, `flooring`, and `exterior_affecting`;
- requires a Yes/No common-area choice;
- requires details only for Yes;
- sends a canonical Saudi E.164 contractor number; and
- has mobile payload coverage for both impact paths plus API coverage for both paths.

## Acceptance criteria

Stage 3 can be marked **accepted** only when every criterion below is satisfied and evidence is included in the final acceptance archive:

1. All matrix rows D1, A2, E1–E5, F1–F5, and G1–G6 have passing automated evidence and focused browser UAT evidence.
2. The renovation scope storage migration has one approved canonical `TEXT[]` format, unknown historic values are recorded for correction, and the orphaned `renovation_scope` enum is removed only after dependency verification.
3. The no-fee `move_in`, `move_out`, and legacy move-form paths, plus Waha Pass and Guest Day Pass payment regressions, have recorded evidence.
4. Mobile resident UAT covers the repaired renovation submission path and resolves the confirmed secure-document-download and guest-pagination findings.
5. The final evidence delivery has its exact evidence inventory, SHA-256 manifest, and any one-off repository-evidence test required at acceptance time.
6. An authorized reviewer explicitly approves Stage 3. Until then, a status package is not acceptance and deployment remains prohibited.

## r3 individual-file delivery inventory

For this one-off status-delivery test, the four sanitized artefacts are delivered individually at `evidence/stage-3/`, not as a ZIP status bundle:

1. `Stage-3-UAT-Delivery-Report-2026-08-20.md`
2. `Stage-3-UAT-Migration-2026-08-20.sql`
3. `Stage-3-UAT-Schema-Only-2026-08-20.sql`
4. `HOA-Stage-3-Schema-Source-2026-08-20.md`

`MANIFEST.md` accompanies the four files with their SHA-256 values and the evidence-content commit reference. The separate F5 fixture transcript and mobile contract audit remain companion status evidence and are referenced by this report; they do not change the four-file status-delivery convention.

> **Integrity constraint:** a file cannot contain its own final SHA-256 value without changing that value. Therefore the report’s own hash is recorded in the detached `MANIFEST.md`, which is the canonical integrity record for all four artefacts. The other three file hashes can be repeated in the report only if the acceptance protocol is revised to exempt the report’s self-hash.

### Repeated non-self SHA-256 values

| File | SHA-256 |
|---|---|
| `Stage-3-UAT-Migration-2026-08-20.sql` | `dbfc59caf2f8ad17f05fe34a3a9da88d9474da0e3ce073220d8d928049210d0a` |
| `Stage-3-UAT-Schema-Only-2026-08-20.sql` | `29bb42081c2a856f18ff8f01f72baa377f8538a50ba1e7700450793ded78e578` |
| `HOA-Stage-3-Schema-Source-2026-08-20.md` | `f50736875bbea7895279f9f25c980590df44ca625b7127f895c164350fd6cef1` |

## Boundaries

No production deployment, production-database access, or production schema migration was performed. This remains a status report and not an acceptance approval.