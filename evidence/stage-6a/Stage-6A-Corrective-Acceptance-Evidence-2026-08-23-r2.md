# Stage 6A corrective acceptance evidence — revision 2

**Scope:** Stage 6A release substrate and the F11/X8 corrective work only. Development migration and verification only; no production access or deployment was performed. Stage 6B and Stage 6C were not started.

## Corrective outcome

The former “unlinked admin booking” rejection was replaced with a durable, explicitly reserved anchor:

- `bookings.unit_id` remains PostgreSQL `NOT NULL`.
- The idempotent migration `0035_stage6a_common_unit.sql` adds `units.is_system`, creates exactly one `HOA / COMMON` unit (`normalized_unit_number = HOACOMMON`), and marks it `is_system = true`.
- The system unit is solely the anchor for administrator community bookings. It is not a resident, claim, registry, count, or general-unit surface.
- Historical records that cannot be truthfully attributed are not moved to HOA COMMON; they belong in `data_migration_corrections`.
- Administrators may bypass resident booking eligibility, payment, and resident-unit linkage. They still cannot receive owner-only authority.

## F11 common-unit boundary evidence

| Boundary | Evidence |
| --- | --- |
| Exactly one common unit | Migration is idempotent and development invariant query reported one system unit and one `HOA / COMMON` row. |
| Staff stay unitless | Migration clears historical admin/guard linkage and a database check rejects an admin or guard `unit_id`; the invariant query reported zero linked staff accounts. |
| Admin booking is anchored | An unlinked E2E admin created and cancelled a booking through the portal. The API log records `POST /api/bookings` as `201` and the booking route resolves the common unit only after normal request validation. |
| Common unit is hidden | API tests prove that the public/general unit listing, full Unit Registry, registry counts, owner verification, tenant verification, Path B claim, and release-subject resolver refuse or exclude the system unit. |
| No unanchored bookings | Development invariant query reported zero persisted bookings without a unit anchor. |

The unit lookup occurs only after facility and schedule validation. This preserves the intended 4xx response for malformed booking requests rather than converting those failures into a system-unit lookup failure.

## X8 authority-boundary evidence

| Requirement | Evidence |
| --- | --- |
| Admin cannot approve/reject tenant verification | Existing tenant-verification guard tests confirm both actions are denied before any review mutation. |
| Admin cannot approve/reject a deferred T14d tenancy renewal | New API test calls the as-yet unimplemented approval and rejection paths as an authenticated admin and receives `404` for both. This proves no Stage 6B authority surface was introduced. |
| Admin may cancel a stale/pre-approved ownership request | Ownership-change flow coverage confirms the existing admin cancellation path remains permitted. |
| Staff remain residentless/unitless | User mutation, invitation, sync, and role-change guards prevent staff linkage; a linked resident cannot become a guard. |
| Admin community booking remains auditable | API coverage asserts `userId`, `facilityId`, and `startTime` are returned with `paymentStatus = waived` and `paymentExemptionReason = admin_booking`. |
| Session identity cannot be spoofed | The server continues to resolve authorization from the authenticated session; the client admin link remains defense in depth. |

## Focused and regression validation

| Validation | Result |
| --- | --- |
| Stage 6A focused API suites | 4 files, 79 passed |
| Full API regression suite | 91 files, 1,457 passed |
| API type check | passed |
| Portal type check | passed |
| Portal translation guard | 63 files, 1,368 passed |
| Full portal E2E | 76 passed, 6 skipped (82 executions), 4.7 minutes |
| API health after final restart | `GET /api/healthz` returned `200` |
| Scheduler initialization after final restart | move-out, ownership-change, notification-dispatch, and external-identity-deletion schedulers all started cleanly |

The API server remains running after the final validation. Its existing missing-Moyasar-secret warning remains fail-closed and was not changed.

## E2E count reconciliation

The historical **88** browser-test executions are now **82**:

| Item | Historical executions | Current executions | Explanation |
| --- | ---: | ---: | --- |
| `facilities.spec.ts` duplication | 6 | 0 | Six duplicate executions were removed from the overlapping resident/admin project configuration. They were duplicate runs, not six deleted source tests. |
| All remaining specs, including setup | 82 | 82 | The three authentication/seed setup tests are counted by Playwright as part of the 82 total. |
| **Total** | **88** | **82** | **88 − 6 duplicate executions = 82 current executions.** |

The current full run reports 76 passing and 6 intentionally skipped executions, which reconciles exactly to 82.

## Limits respected

- No deployment was performed.
- No production environment or production database was accessed.
- No Stage 6B tenancy-renewal workflow, endpoint, UI, scheduler, or lifecycle behavior was implemented.
- No Stage 6C workflow was started.

## Related individual files

- `lib/db/migrations/0035_stage6a_common_unit.sql`
- `evidence/stage-6a/Stage-6A-Corrective-Acceptance-Evidence-2026-08-23-r1.md`
- `evidence/stage-6a/Stage-6A-Corrective-Acceptance-Evidence-2026-08-23-r2.md`
- `evidence/stage-6a/Stage-6A-Corrective-Evidence-Manifest-2026-08-23-r2.sha256`