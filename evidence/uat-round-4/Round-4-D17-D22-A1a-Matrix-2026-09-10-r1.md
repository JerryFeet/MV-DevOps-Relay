# Round 4 — D-17 through D-22 A1a Matrix

**Evidence date:** 2026-09-10  
**Canonical command:** `pnpm run round3:regression:e2e`  
**Schema operations:** none

| Requirement | Classification | Exact journey | Final assertion | Does not cover |
|---|---|---|---|---|
| D-17 Admin Residents lists each resident’s unit | **Neither** | Admin opens Residents; the test locates its dedicated resident through the paginated API and navigates to the matching UI page. | The exact resident card shows its canonical selectable unit and never “—”. | Editing, moving, deleting, or approving that resident. |
| D-18 Admin must not add residents | **Family B** | Admin opens Residents and direct POST requests target both `/api/residents` and `/api/residents/self`, including stale verified-owner metadata. | Both creation controls are absent; both APIs return 403 before insert. Owner self-registration positive controls remain green. | Resident creation by a valid owner through every locale/device. |
| D-19 Admin must not add permits | **Family B** | Admin opens Permits and directly POSTs a valid renovation permit. | New Permit is absent; API returns 403 before permit creation or approval-alert enqueue. | Resident permit completion, rejection, cancellation, or expiry. |
| D-20 Admin must not add vehicles | **Family B** | Admin opens Vehicles and directly POSTs a valid vehicle registration. | Register Vehicle is absent; API returns 403 before insert. | Owner/tenant vehicle approval and removal lifecycle. |
| D-21 Admin must not see or purchase Waha Guest Day Pass | **Family B** | Admin opens Guests and directly POSTs a valid day-pass purchase request. | Both purchase entry points are absent; API returns 403 before rate limiting, payment initiation, or insert. | Valid resident purchase, provider settlement, expiry, or gate scan. |
| D-22 Admin Waha lists applications and passes | **Neither** | Admin opens Waha Pass; the test locates its isolated application’s API page and traverses visible pagination. | The registry shows the isolated application, credential, pass number, canonical applicant unit, stable ordering, and API-backed total. | Admin approval/rejection actions, export, or large-dataset performance. |

## Pagination and fixture controls

- Admin Waha ordering is stable: `createdAt DESC`, then `id DESC`.
- The registry’s global total comes from the paginated API, not current-page length.
- D-17 uses a permanent non-primary E2E resident on a production-selectable unit. It is reused rather than deleted, so resident lifecycle protections and historical evidence are not bypassed.
- Pending resident projections and stored resident cards use canonical unit references derived from `unitId`.

## Permanent gate wiring

- API: `round4D18D22AdminDirectPostA1a.test.ts`
- Portal: `round4D17D22PortalContracts.test.ts`
- Browser: Playwright project `round4-d17-d22-admin`

All three are selected by the sole canonical `pnpm run round3:regression:e2e` command.