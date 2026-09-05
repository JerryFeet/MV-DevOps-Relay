# Occupancy foundation — test and UAT evidence

**Date:** 2026-09-05  
**Environment:** Development/UAT only. **Production:** not accessed or changed.  
**Architect review:** **PASS**.
**Continuity:** Baseline replay/catalog evidence is in
[Baseline-0049-0050-Continuity-Evidence-2026-09-05.md](Baseline-0049-0050-Continuity-Evidence-2026-09-05.md).

## Exact suite results

| Suite | Result |
| --- | --- |
| Full API | **103 files / 1468 passed / 21 skipped** |
| Focused atomic/occupancy API | **8 files / 224 passed** |
| Portal | **77 files / 1419 passed** |

Exact recorded forms: **103 files/1468 passed/21 skipped**, **8 files/224
passed**, and **77 files/1419 passed**.

Focused API coverage includes the unit lock/invariant, primary establishment,
four-direct/fifth-review branch, final approve/refuse semantics, secondary
removal and `MOVE_OUT_REQUIRED`, canonical move-out form identity, Riyadh
scheduling, whole-household release, and owner-claim preservation. Relevant
implementation/test sources include `src/lib/occupancy.ts`,
`src/lib/releaseSubject.ts`, `src/lib/moveOutScheduler.ts`, and
`src/__tests__/releaseSubject.test.ts`.

## Browser UAT observations

The authenticated Development browser walkthrough verified:

1. four direct residents;
2. the fifth proposal becomes pending HOA review;
3. administrator approval and refusal paths;
4. secondary-resident removal; and
5. primary removal is rejected with HTTP **409** / `MOVE_OUT_REQUIRED`.

**Screenshot IDs:** `OCC-UAT-01` (four direct residents),
`OCC-UAT-02` (fifth pending request), `OCC-UAT-03` (administrator approval),
`OCC-UAT-04` (administrator refusal), `OCC-UAT-05` (secondary removal), and
`OCC-UAT-06` (primary 409).

The first authenticated portal load had an initial hydration delay; it was
retried after hydration before recording the observations. This is a browser
limitation, not an API assertion. Dependency-rich fixtures (linked portal
account/invitation, Waha credential, future booking, and vehicle) were **not
seeded** for this browser pass. Consequently, the browser evidence proves the
resident workflow only; dependency resolution is supported by API/unit tests,
not by a browser claim.

The browser pass also exposed cache and Arabic-copy defects. Both were fixed
as straightforward follow-up corrections, but this evidence does **not** claim
a browser re-run after those fixes.

No browser move-out check was performed or is claimed.

## Move-out integration evidence

API/unit integration covers the common release engine invoked by due
`move_out_form`, approved move-out permit, tenancy-expiry, and
ownership-change triggers. The source confirms: canonical occupancy advisory
and unit locks (`occupancyLock.ts:4-18`), release trigger validation
(`releaseSubject.ts:160-272`), whole active-household selection for move-out
(`:359-374`), deterministic graph planning (`:498-547`), and transactional
credential/resident/vehicle/future-booking/unit/operation effects
(`:594-814`). The scheduler groups only canonical `unitId` forms and computes
the next Riyadh midnight (`moveOutScheduler.ts:8-120`).

## Cleanup

The browser/UAT fixture cleanup was exact:

| Cleanup target | Count |
| --- | ---: |
| Disposable database units | 1 |
| Disposable resident rows | 5 |
| Extra-resident requests | 2 |
| Extra-resident request events | 4 |
| Resident-removal operations | 1 |
| Disposable database users | 2 |
| Disposable Clerk identities deleted | 4 |
| Residual disposable rows/identities | 0 |

Both immutable occupancy triggers were restored. W14 was not used as a
disposable fixture; its protected fingerprint is identical before and after
UAT cleanup.

## Boundary statement

These results do not establish that a real browser executed household move-out,
nor do they establish UI effects for unseeded dependency graphs. They do
establish the stated API and portal suite results and the browser-resident
paths above.