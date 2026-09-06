# Round 3 Section 3 — Waha second credential delivery

## Delivered behavior

1. **Current-unit self read**
   - `GET /api/waha-pass/mine` now scopes applicant records to the
     authenticated user's canonical active occupancy and current unit.
   - Selection is deterministic: active first, pending review second, then
     terminal records by latest update/create/id.
   - Credential 2 self-read now requires an active credential joined to an
     active application on the caller's current unit, with deterministic
     ordering.

2. **Credential 2 assignment parity**
   - `assign-second` now shares the apply route's DOB-present, adult, and portal
     access validator.
   - It rejects an application/current-unit mismatch with
     `409 APPLICATION_UNIT_MISMATCH`.
   - Lock order is canonical and consistent with approval:
     unit occupancy → application → Credential 2.
   - The active, unassigned Credential 2 and the application's
     `secondResidentId` are updated atomically.

3. **Authoritative portal selector**
   - The portal no longer fills the assignment dialog from all active
     residents.
   - It uses only `eligibleSecondResidents` from the Waha eligibility endpoint.
   - The permanent browser regression proves a marked eligible adult remains
     visible while the marked under-18 resident is absent.

## Exhaustive duplicate-route findings

The pre-fix route matrix enumerates every identified direct and indirect Waha
surface. The enforcement groups and their final Section 3 status are:

| Invariant group | Routes/surfaces | Section 3 status |
|---|---|---|
| Current-unit/current-lifecycle self read | applicant `/mine`; Credential 2 `/mine`; booking and gate authorization | `/mine` asymmetries fixed and browser-verified |
| Credential 2 unit/active/DOB/adult/portal eligibility | `/eligibility`; `/apply`; `/assign-second`; active portal selector | duplicate enforcement consolidated/fixed and API/browser-verified |
| Canonical occupancy locking | apply; approve; assign-second | assign-second brought into the shared unit-lock boundary |
| Credential cardinality and uniqueness | approve; assign-second; replacement issuance | code-audit-only gap remains: application code creates two credentials, but exactly-two/index uniqueness is not database-enforced |
| Application transition atomicity | approve; reject; revoke; report-lost; replacement review/pay | code-audit-only asymmetry remains outside this section |
| Credential-holder removal | household removal; tenant release; subject release | code-audit-only asymmetry remains for a removed user who only holds Credential 2 |
| Replacement/lost-card concurrency | report-lost; replacement review/pay; payment callback core | code-audit-only concurrency/idempotency gap remains; no behavior changed |
| Day-pass read/create/gate consistency | guest day-pass `/mine`; create/payment; dedicated/unified gate verify | code-audit-only read-model asymmetry remains; no behavior changed |
| Downstream entitlement checks | booking creation; dedicated Waha gate scan; unified gate scan | retained active credential + active current-unit application checks |
| Scheduler lifecycle effects | expiry/cleanup schedulers | enumerated only; deterministic clock proof remains outside this section |

The remaining findings are disclosure, not implied product requirements. No
lost-card, replacement, day-pass, removal, scheduler, or schema/cardinality
behavior was changed in this delivery.

## Permanent regression method

- Pre-fix failure screenshots, raw Playwright output, focused API output, and
  permanent source were published before remediation.
- The real browser tests use normal portal navigation and UI-triggered
  requests; they do not inject API calls or mocks.
- The dedicated fixture uses one stable reserved non-system unit and refuses
  unmarked residents, foreign active applications, or a preassigned
  Credential 2. Historical Waha rows are not deleted.

## Validation

| Gate | Result |
|---|---|
| Portal type check | passed |
| Focused Waha API | 12 passed |
| Named Round 3 Playwright | 9 passed |
| Full API | 104 files passed, 1 skipped; 1,478 tests passed, 26 skipped |
| Complete Playwright | 92 passed, 9 deliberately skipped, 0 failed across 101 tests |

During broad validation, two unrelated test-harness defects were corrected:

- Stage 6B evidence-path resolution now anchors to the workspace location
  instead of treating any package-local `evidence` directory as the root.
- The Section 1 crafted elapsed booking now derives both timestamps directly
  from browser-now; subtracting seven days from a dynamically discovered
  future slot was not guaranteed to produce a past time.