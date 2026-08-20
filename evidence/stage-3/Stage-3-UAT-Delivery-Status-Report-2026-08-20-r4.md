# Madain Village HOA Portal — Stage 3 Delivery Status Report (r4)

**Evidence date:** 2026-08-20  
**Classification:** **Status report — not a Stage 3 acceptance package**  
**Release decision:** **DO NOT DEPLOY**

## r4 purpose and public-evidence status

This revision responds to the repository review of r3. It publishes the previously cited F5 rollback transcript and mobile contract audit as readable companion evidence, adds a development-database integrity result, and adds the requested booking advisory-lock source-invariant test.

The public repository relay has been independently verified as working: a clean clone reconstructed the prior delivery from five commits and matched all four published hashes. r4 retains that protocol. The standard four artefacts remain the delivery bundle; the three r4 companions are separately hash-listed in `MANIFEST.md` because each supports a matrix row.

## Test-count accounting

| Suite | r3 baseline | r4 result | Delta |
|---|---:|---:|---:|
| API | 75 files / 1,274 tests | **76 files / 1,275 tests** | **+1 file / +1 test** |
| Portal | 59 files / 1,375 tests | 59 files / 1,375 tests | 0 / 0 — no portal source change in r4 |
| Mobile | 12 files / 375 tests | 12 files / 375 tests | 0 / 0 — no mobile source change in r4 |

The sole API addition is `bookingAdvisoryLockNamespace.test.ts`. It verifies that booking admission imports and uses `FACILITY_BOOKING_ADVISORY_LOCK_NAMESPACE`, whose allocation is the documented facility class ID `4201`, rather than introducing a route-local literal.

## Response to repository review

### 1. Companion evidence is now publishable

The following r4 companions are published beside the standard four artefacts and have hashes in `MANIFEST.md`:

1. `Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20-r4.txt`
2. `Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r4.md`
3. `Stage-3-UAT-Database-Integrity-Evidence-2026-08-20-r4.txt`

The F5 transcript reports two normalization rows, two operating-hours conflict rows, no cleaning-buffer rounding, a valid Thursday 00:30 control, and zero residual fixture rows after rollback.

### 2. Development audit-table absence — established facts and future detection

The initial F5 fixture failure established that the active development database did not have `facility_booking_config_normalization_audit` and `facility_operating_hours_conflicts`, despite migration source `0021` existing in the repository. The approved idempotent Stage 3 migration restored both before the successful fixture run.

The exact historical cause cannot be proven from the retained system state. The UAT reset script deletes domain **rows** only and neither drops nor references either audit table. The development database also has no migration-ledger table from which to reconstruct whether a reset/re-provision, a different database target, or an unrecorded DDL action created the divergence. There is no evidence supporting a claim that one specific event occurred, so r4 does not make one.

The corrective control is now executable and recorded: `stage3-schema-integrity-evidence.ts` queries the active development schema for both prerequisite tables before the F5 fixture and before every future Stage 3 evidence delivery. Its r4 result is **PASS**: both expected tables are present and the fixture is ready. A missing table makes the script fail explicitly rather than allowing fixture evidence to be treated as valid.

### 3. Booking advisory-lock regression test

**PASS.** The new focused test asserts all of the following:

- the centralized allocation retains facility booking class ID `4201` and the `facilities.id` key;
- the exported `FACILITY_BOOKING_ADVISORY_LOCK_NAMESPACE` derives from that allocation;
- `routes/bookings.ts` imports and interpolates the exported namespace in `pg_advisory_xact_lock`; and
- the booking route contains no `pg_advisory_xact_lock(4201, …)` literal.

### 4. Complete mobile contract audit and the two remaining mismatches

The r4 mobile audit is complete for every current mobile API-consuming resident screen and hook: dashboard, profile, announcements, bookings, permits, vehicles, guests, documents, communications, Waha Pass, unit verification, HOA assistant, and push-token registration.

| Mismatch | Resident-visible break | Introduced by | Severity / state |
|---|---|---|---|
| Private HOA document download | Tapping a private HOA document opens its stored `fileUrl` directly instead of the authenticated `GET /api/documents/:id/download` route. Private documents fail to open through the intended authorized flow. | Stage 2/2b private-object access change, while the mobile screen retained a public-URL assumption. | **P1 — planned, not fixed.** It blocks document access for affected residents but does not block all residents from all primary tasks or corrupt data; it is not the renovation P0. |
| Guest-list pagination | The screen requests only the first paginated `/api/guests` page. Residents with more entries than the API’s default page size cannot see older guests, with no indication that items are omitted. | Stage 1/2 API pagination contract, while the mobile list retained a single-fetch assumption. | **P1 — planned, not fixed.** It silently hides part of a resident’s list but does not prevent registering a new guest or invalidate an existing pass; it is not the renovation P0. |

The audit is complete as a source/API-contract inventory. It is not a substitute for the remaining focused mobile browser/device UAT; those checks must validate real resident interactions after both P1 fixes land.

### 5. Repository-test matrix row

| Row | r4 status |
|---|---|
| Repository evidence test | **PASS — public evidence delivery is operating.** The public relay repository was clean-cloned and its five commits and four published hashes were independently verified. r4 is delivered under new `-r4` paths; prior evidence remains untouched. |

### 6. Acceptance criteria remain unchanged

The agreed acceptance criteria below remain mandatory; r4 does not narrow or waive them.

## Stage 3 acceptance matrix

**Legend:** **Implemented — UAT pending** means automated evidence exists but focused browser UAT and formal sign-off are still required. **Open** means a correction or required evidence remains. **Blocked** means Stage 3 cannot be accepted until resolved.

| ID | Status | Current evidence / limitation |
|---|---|---|
| D1 | **Implemented — UAT pending** | Focused role-guard and registry regression evidence passed; browser confirmation remains. |
| A2 (supplemental) | **Implemented — UAT pending** | Focused API evidence verifies names and phones; browser confirmation remains. |
| E1–E5 | **Implemented — UAT pending** | Vehicle eligibility, entitlement, controlled rejection, and Istimara authorization are automated. |
| F1 | **Implemented — UAT pending** | Opening-anchored grid and supported durations are automated. |
| F2 | **Implemented — UAT pending** | Whole-minute, non-negative buffers and symmetric conflicts are automated. |
| F2b (supplemental) | **Implemented — UAT pending** | Exclusive-use and buffered-overlap policy are documented and tested. |
| F3 | **Implemented — UAT pending** | Service-window, interval, duration, and conflict validation are automated. |
| F4 | **Implemented — UAT pending** | Closing-boundary and overnight Thursday logic are automated; resident browser confirmation remains. |
| F5 | **Implemented — UAT pending** | r4 schema prerequisite and rollback-only evidence pass: two normalizations, two conflicts, no rounding, zero residual fixtures. |
| G1 | **Implemented — UAT pending** | Additional-vehicle requests and active lists are retired. |
| G2 | **Implemented — UAT pending** | Portal/API coverage passes; mobile renovation P0 payload contract is remediated. |
| G3 | **Implemented — UAT pending** | Contractor licence is retired from submissions and views. |
| G4 | **Implemented — UAT pending** | Saudi E.164 validation and mobile normalization are covered. |
| G5 | **Implemented — UAT pending** | Required renovation fields and conditional common-area details are covered. |
| G6 | **Open** | `move_out` and legacy `move_forms` no-payment evidence remains. |
| Waha Pass / Guest Day Pass payment regression | **Open** | Required payment regression evidence remains. |
| Renovation scope canonical `TEXT[]` migration | **Blocked** | Current JSON-in-text / legacy scalar state and orphan enum remain an acceptance blocker. |
| HOA Mobile contract audit | **Open** | Audit is complete; secure HOA-document download and guest pagination are confirmed P1 fixes still required. |
| Focused browser UAT | **Open** | Resident and admin scenarios remain to be recorded with the product owner. |
| Repository evidence test | **PASS** | Public GitHub delivery and independent clean-clone/hash verification are established. |

## Acceptance criteria

Stage 3 can be marked **accepted** only when every criterion below is satisfied:

1. All D1, A2, E1–E5, F1–F5, and G1–G6 rows have passing automated evidence and focused browser UAT evidence.
2. Renovation scope storage reaches one canonical `TEXT[]` format; recognized legacy scalars become single-element arrays; unknown values are queued in `data_migration_corrections`; and the orphaned `renovation_scope` enum is dropped only after dependency verification.
3. The no-fee `move_in`, `move_out`, and legacy move-form paths, plus Waha Pass and Guest Day Pass payment regressions, have recorded evidence.
4. Mobile resident UAT covers renovation and the two currently open mobile corrections: authenticated HOA-document download and guest-list pagination.
5. Every cited matrix artefact is published, hash-verifiable, and included in the relevant manifest; the standard four-file bundle and ZIP fallback remain available.
6. An authorized reviewer explicitly approves Stage 3. Until then, this is a status package and deployment remains prohibited.

## Deviations and boundaries

- Migration `0025` still stores newer renovation scopes as JSON encoded in `text`. This was implementation convenience, not an approved design change, and remains insufficient against the agreed `TEXT[]` design.
- No production deployment, production database access, or production schema migration was performed.
- r4 includes no resident data, document contents, private object keys, credentials, secrets, or production output.
- The r4 schema-only export was checked before publication: it contains no `INSERT` and no `COPY ... FROM stdin` sections.