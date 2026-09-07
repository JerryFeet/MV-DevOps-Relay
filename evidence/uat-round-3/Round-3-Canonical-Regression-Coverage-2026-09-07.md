# Round 3 Canonical Regression Coverage

Date: 2026-09-07  
Canonical command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium) pnpm run round3:regression:e2e`

## Gate result

| Phase | Selected files/tests | Result |
|---|---:|---:|
| API regressions | 9 files / 144 tests | 144 passed |
| Focused portal contracts | 2 files / 8 tests | 8 passed |
| Real-browser regressions | 18 files / 32 tests, including setup dependencies | 32 passed |
| **Canonical total** | **184 tests** | **184 passed** |

## Permanent rule

Every future Round 3 defect must add its permanent regression to
`pnpm run round3:regression:e2e`. A regression that exists outside this root
command does **not** count as protection.

## Defect-to-test map

All paths are workspace-relative. “Root” means the canonical command above
selects the named regression.

| Section | Accepted defect / requirement | Classification | Permanent regression selected by the root command | Root |
|---|---|---|---|:---:|
| 1 | Elapsed Riyadh-today slots were offerable | Browser | `artifacts/hoa-portal/e2e/round3-section1-booking.spec.ts` — `1a — today's UI availability never renders an elapsed slot` | Yes |
| 1 | API accepted an elapsed booking start | API + browser | `artifacts/api-server/src/__tests__/bookingGuards.test.ts` — `marks elapsed Riyadh-today availability slots unavailable while retaining future slots`; `returns the stable elapsed-start error before grid validation`; browser `1b — POST booking with an elapsed start is rejected` | Yes |
| 1 | Rejected cancellation closed or hid the booking | Browser | `round3-section1-booking.spec.ts` — `1c — a rejected cancellation remains visible instead of closing silently` | Yes |
| 1 | Same-unit/same-facility active-booking rule was not visible end-to-end | Browser | `round3-section1-booking.spec.ts` — `F12 — the UI exposes the active unit/facility rule on a second future booking` | Yes |
| 2 | Naturally zero-priced booking skipped the monthly allowance contract | API + browser | `bookingGuards.test.ts` — `confirms a zero-price facility booking and records the resident's monthly allowance claim`; `round3-section2-monthly-allowance.spec.ts` — `a zero-priced facility booking consumes the monthly allowance` | Yes |
| 3 | `/waha-pass/mine` leaked stale-unit applications | Browser | `round3-section3-waha-second-credential.spec.ts` — `3a — browser /mine is scoped to the current rotated unit` | Yes |
| 3 | Credential 2 accepted missing DOB, under-18, no-portal-access, or moved-unit assignment | API + browser | `artifacts/api-server/src/__tests__/wahaPassCompositionI5.test.ts` — DOB-1, DOB-2, DOB-3, CTRL, assignment-parity, moved-unit, and ELG-1–ELG-4 tests; browser `3b — Assign Credential 2 omits the marked under-18 portal resident` | Yes |
| 3 | Stale-unit paid day pass verified after purchaser moved | API | `artifacts/api-server/src/__tests__/stage4I3I4Guards.test.ts` — `denies a moved purchaser's old-unit day pass in every verification path` (self-read, public, dedicated guard, unified token and numeric scans) | Yes |
| 3 | Moved applicant could report an old-unit credential lost | API | `stage4I3I4Guards.test.ts` — `blocks a moved applicant from reporting an old-unit credential lost without mutations` plus applicant/non-applicant controls | Yes |
| 3 | Expiry scheduler left an expiry-suspended credential suspended | API | `artifacts/api-server/src/__tests__/tenancyLifecycleStage6b.test.ts` — `terminal tenancy expiry revokes the affected suspended credential while releasing only its graph`; `artifacts/api-server/src/__tests__/releaseSubject.test.ts` release-graph and idempotency tests | Yes |
| 4 | Legacy owner parking was not materialized as a normalized selectable lot | Browser | `round3-section4-vehicles.spec.ts` — `4a — owner-workflow legacy parking is selectable with lot number and type` | Yes |
| 4 | Resident vehicle flow still exposed Istimara | Browser | `round3-section4-vehicles.spec.ts` — `4b — vehicle registration has no Istimara field` | Yes |
| 4 | Outside click/Escape discarded the vehicle form | Browser | `round3-section4-vehicles.spec.ts` — `4c — clicking outside preserves the vehicle dialog and entered values` | Yes |
| 4 | Vehicle count incorrectly limited shared-lot registration/history display | Browser | `round3-section4-vehicles.spec.ts` — `4d — two vehicles may share one owner-registered lot and display its type` | Yes |
| 4 | Owner could skip the explicit parking/no-parking choice | Browser | `round3-section4-vehicles.spec.ts` — `4e — owner registration requires an explicit parking decision` | Yes |
| 4 | Tenant was incorrectly asked to redeclare parking | Browser | `round3-section4-vehicles.spec.ts` — `4f — tenant registration does not ask the tenant to declare parking` | Yes |
| 5 | Resident PDF used a native plugin instead of portal rendering | Browser | `round3-section5-documents.spec.ts` — `5a — resident view-only PDF uses portal-owned rendering, not a native browser plugin` | Yes |
| 5 | Word preview was not sandboxed/rendered | Browser | `round3-section5-documents.spec.ts` — `5b — resident view-only Word document renders inside its sandboxed preview` | Yes |
| 5 | Image preview did not render in the portal | Browser | `round3-section5-documents.spec.ts` — `5c — resident view-only image renders inside the portal preview` | Yes |
| 5 | Folder add/edit exposed the removed download default | Browser | `round3-section5-documents-admin.spec.ts` — `5d — folder add and edit contain no download/view-only default control` | Yes |
| 5 | Download-allowed to view-only edit did not persist | Browser | `round3-section5-documents-admin.spec.ts` — `5e — a download-allowed document can become view-only and remains so after reload` | Yes |
| 5 | Custom folder selection reset view-only mode | Browser | `round3-section5-documents-admin.spec.ts` — `5f — choosing view-only before a custom folder preserves view-only` | Yes |
| 5 | Signed-out Dalil called the authenticated chat endpoint | Browser | `round3-section5-dalil-signed-out.spec.ts` — `5g — signed-out Dalil shows sign-in guidance and never calls the authenticated chat endpoint` | Yes |
| 6 | Guardian ID did not immediately derive from the active primary occupant | Browser | `round3-section6-residents.spec.ts` — `6a — guardian checkbox fills the registered primary occupant identifier` | Yes |
| 6 | Fifth resident disappeared or exposed delete while pending | Browser | `round3-section6-residents.spec.ts` — `6b — fifth resident remains visible as pending verification and has no delete control` | Yes |
| 7 C-1 | Additional-resident review wording was missing | Browser | `round3-section6-residents.spec.ts` — `6b — fifth resident remains visible as pending verification and has no delete control` asserts the approved review sentence | Yes |
| 7 C-2 | Standard refusal explanation could drift | Portal contract | `artifacts/hoa-portal/src/__tests__/round3WordingContracts.test.ts` — `keeps the approved English standard explanation exact`; `keeps a complete, distinct Arabic explanation` | Yes |
| 7 C-3 | Move-out method and moving-company details were optional/under-validated | API + browser | `adminAlertOnApprovalRequired.test.ts` — C-3 tests `requires self_move or moving_company`, `requires a company name`, `requires a company contact`; `round3-section7-wording-workflow.spec.ts` — `C-3 — move-out requires self-move or moving-company workflow` | Yes |
| 7 C-4 | Approval-queue producers could use a configurable/wrong destination | API | `emailSecurity.test.ts` — `C4 routes approval-queue email to the fixed approver inbox without destination settings`; `C4 keeps every admin-approval producer on the fixed-destination queue contract`; `adminAlertOnApprovalRequired.test.ts` route-level producer tests | Yes |
| 7 C-5 | `requiresApproval` did not govern resident state, checkout, and admin progression | API + browser | `bookingGuards.test.ts` — `keeps approval-on free and priced resident requests pending, blocks checkout, and preserves approval-off progression`; `round3-c5-requires-approval.spec.ts` — `approval toggle keeps resident requests pending without Pay Now, then admin advances free and priced bookings` | Yes |
| 7 C-6 | Unit Registry used legacy parking, duplicate editors, wrong title label, unbounded bookings, or stale selected-unit data | Portal contract + browser | `unitRegistryRound3C6Presentation.test.ts` — six C-6 contract tests; `round3-c6-unit-registry.spec.ts` — `admin sees canonical parking and can independently scroll all booking rows` | Yes |
| 8 | New tenancy submission still collected Ejar file metadata | API + browser | `unitVerificationSecurity.test.ts` — `accepts an Ejar contract number and lease dates without collecting a document`; `rejects legacy Ejar document fields on a new submission without storing them`; `round3-section8-tenancy.spec.ts` — document-free submission journey | Yes |
| 8 | Existing verification documents could lose decision-time cleanup/retry behavior | API | `unitVerificationTitleDeedLifecycle.test.ts` — approve/reject deletion, no-key, tenant-request, retry/failure, and resident-ID-photo protections | Yes |

## Untested-defect declaration

**Untested accepted Round 3 defects: none.**

Audit-only Waha observations that were never runtime-proven as defects are not
reclassified here as product defects. The three observations that were
runtime-proven and fixed—day-pass occupancy, stale `report-lost`, and scheduler
release reconciliation—are all selected by the canonical root command.

## Evidence

- Full canonical transcript:
  `evidence/uat-round-3/Round-3-Canonical-Regression-Gate-PASS-2026-09-07.txt`
- Local SHA-256:
  `fea7823e69f588afe6831df84bb982a8b3eeb6bfb75be814d5cdb5e0d00579e4`