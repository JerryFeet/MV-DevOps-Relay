# Round 3 Section 3 — pre-fix failure summary

## Scope

This record freezes the observed Development behavior before any Waha product
logic was changed. The permanent regressions exercised the real portal and the
focused API route.

## Confirmed browser failures

1. **Current-unit Waha application scope**
   - First attempt: `GET /api/users/me` returned unit 57.
   - Retry: `GET /api/users/me` returned unit 58.
   - Both attempts: UI-triggered `GET /api/waha-pass/mine` returned historical
     application unit 47.
   - Permanent assertion: the returned application must belong to the caller's
     current unit.

2. **Credential 2 assignment selector**
   - The dedicated isolated fixture rendered active Credential 1 and active,
     unassigned Credential 2.
   - The visible assignment selector contained `Round3Underage Fixture`, a
     portal-enabled resident whose DOB is exactly 15 years before the fixture
     date.
   - Permanent assertion: an under-18 resident must not appear.

## Confirmed API failures

Focused `POST /api/waha-pass/:id/assign-second` regressions showed:

| Case | Required response | Pre-fix response |
|---|---:|---:|
| Missing DOB | 422 `SECOND_RESIDENT_DOB_ABSENT` | 200 |
| Under 18 | 422 `SECOND_RESIDENT_UNDER_18` | 200 |
| No portal access | 422 `SECOND_RESIDENT_NO_PORTAL_ACCESS` | 200 |
| Application/current-unit mismatch | 409 `APPLICATION_UNIT_MISMATCH` | 200 |

Eight apply/eligibility control tests passed in the same focused run.

## Evidence boundary

The browser regressions use UI navigation and UI-triggered API requests; no API
mock or page-injected fetch was used. The dedicated browser test did not submit
an assignment. Its fixture transaction refuses foreign residents,
foreign applications, or a preassigned Credential 2, and it does not delete
historical rows.