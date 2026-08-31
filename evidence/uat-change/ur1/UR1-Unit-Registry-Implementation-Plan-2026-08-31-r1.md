# UR1 — Unit Registry Exhaustive Research View Implementation Plan (r1)

Date: 2026-08-31
Status: Planning only — implementation blocked on product-owner confirmation of Decision 132
Sources: Unit Registry UR1; UAT Change Requirements decisions 130–133; current workspace source

## Objective

Upgrade the administrator-only Unit Registry into the exhaustive per-unit research view required by Decision 130: every person and contact detail, vehicle, Waha Pass, permit, guest record, Guest Day Pass, payment and booking associated with the selected unit, without weakening the existing National ID protections confirmed by Decision 131.

## Current behaviour and Decision 132 gate

Current behaviour is intentionally asymmetric:

- `users.nationalId` is not selected in the owner/tenant projection for `GET /api/admin/units/full`.
- A second response-boundary redaction removes `nationalId` again before owner/tenant objects are returned. The defense-in-depth comment and both protections must remain unchanged unless the product owner explicitly chooses a different registry-only rule under Decision 132.
- National ID lookup is exact and rate-limited. It can identify a matching unit, but the searched identifier is not echoed in the response.
- `residents.idNumber` is currently selected, returned by the API and rendered in the resident section.

Before implementation, the product owner must confirm one Decision 132 option:

1. Both visible to admin in this registry only.
2. Both redacted by default, with a separately designed logged reveal action.
3. Preserve current behaviour deliberately: resident identity numbers visible; owner/tenant identity numbers redacted.

Until that confirmation, implementation must preserve the current behaviour exactly. Any chosen change applies only to the Unit Registry contract; no other endpoint, gate surface or role receives identity numbers.

## Scope and implementation sequence

### 1. Define the expanded admin response contract

Extend `GET /api/admin/units/full` without changing its admin-only authorization, HOA COMMON exclusion, pagination, name search, National ID lookup, limiter or identifier non-echo behavior.

For each returned unit, add typed nested collections for:

- permits
- guest registrations and QR guest-pass records retained by the system
- Waha Guest Day Passes
- payment history
- facility bookings

and add `phone` and `email` to household resident records. Keep existing owner, tenant, Ejar reference, residents, vehicles, Waha credentials, ownership history and parking data.

Use page-wide batched queries keyed by the selected unit IDs, then group in memory. Do not add per-unit queries or create an N+1 path.

### 2. Add exhaustive unit-scoped data queries

- **Permits:** query every `permits` row for the unit across move-in, move-out, renovation and additional-vehicle types and all statuses. Return type, status, submission/decision timestamps, and renovation scope plus contractor name and mobile where applicable.
- **Guests:** include retained legacy guest registrations and their QR guest-pass visit/status records by resolving guest/resident relationships back to the unit. Include Waha Guest Day Passes through their direct unit relation. Preserve the existing purge behavior; do not recreate purged history.
- **Payments:** build an admin registry projection from `payment_attempts` for the unit, including attempts directly carrying `unitId` and attempts linked through unit bookings or Guest Day Passes. Return only date, purpose, amount and status; do not return provider payloads, tokens or unrelated user payment history.
- **Residents:** extend the existing active-resident projection with stored phone and email. Apply the confirmed Decision 132 rule to `idNumber` only after the product-owner gate is closed.
- **Bookings:** query the unit's retained booking records and return facility, service date/time and status. Include current and recent records without deleting or altering history; order current/future first and historical records newest first in the presentation.

No schema migration is expected: the required fields and unit/subject relationships already exist. The development schema freeze remains in force; do not run `db:push`, `push --force` or `drizzle-kit migrate`.

### 3. Rebuild the unit detail presentation by subject

Update the Unit Registry detail sheet to use explicit sections in this order:

1. Occupants and contact details
2. Vehicles
3. Waha Pass credentials
4. Permits
5. Guests and Guest Day Passes
6. Payments
7. Bookings
8. Existing Ejar and ownership history context

Each section remains visible. Sections with no records start collapsed and show a clear zero/empty label so an empty result cannot be mistaken for a failed load. Sections containing records start expanded or expose a clear record count.

The guest section must state that guest registration/history is retained for 90 days under the configured retention rule and that older purged records will not appear. Do not imply that durable payment records are purged with guest history.

Add complete English and Arabic strings. Verify RTL order, long labels, cards/tables and sheet controls at 390px without horizontal page overflow.

### 4. Add navigation in both directions

- Add an explicit administrator dashboard link to `/portal/unit-registry`.
- Add an explicit Unit Registry link back to `/portal/admin`.
- Preserve the existing admin-only route configuration and sidebar entry.

No mobile screen is in scope because no mobile Unit Registry equivalent exists.

### 5. API and component regression coverage

Add deterministic API fixtures containing one unit with every supported record type and assert the complete nested contract. Coverage must include:

- all permit types, historical and open, including renovation contractor fields
- legacy guest registration, QR guest pass and Waha Guest Day Pass
- direct and subject-linked unit payment attempts
- resident mobile and email
- current and historical facility bookings with facility data
- existing owner/tenant/Ejar/vehicle/Waha/ownership data
- HOA COMMON excluded from data and counts
- admin allowed; supervisor, guard, owner, tenant and unauthenticated callers denied
- no `users.nationalId` in any response unless Decision 132 explicitly selects registry-only visibility
- `residents.idNumber` exactly matching the confirmed Decision 132 rule
- National ID lookup returns the unit without echoing the identifier
- limiter threshold and recovery behavior remain intact.

Add portal tests for bilingual labels, section ordering, empty-section defaults, retention copy, navigation links, RTL structure and responsive class guards.

### 6. Required browser UAT with API inspection

Create an idempotent development-only Playwright seed for one uniquely identified unit holding records of every required type. The seed must include owner, tenant, household resident contact details, vehicles, Waha credential, every permit type, guest registration, QR guest pass, Guest Day Pass, payment attempts, current/recent booking, Ejar reference and ownership history. Clean up only records created by the fixture.

Run the walkthrough as an admin in four presentation combinations:

- English desktop
- Arabic desktop RTL
- English 390px
- Arabic 390px RTL.

For each relevant load/search, capture the actual `/api/admin/units/full` browser response with Playwright and assert the response payload as well as the rendered page. The UAT must prove:

- every seeded record type appears in the correct section
- resident mobile and email appear
- `users.nationalId` is absent from the intercepted JSON and rendered page under the retained/current rule
- `residents.idNumber` follows the confirmed Decision 132 rule in both JSON and UI
- HOA COMMON is absent from payload, results and counts
- National ID search matches the unit without returning or rendering the searched value
- repeated searches trigger the shared rate limit and a controlled reset/expired window proves recovery to a successful lookup
- dashboard-to-registry and registry-to-dashboard navigation works
- no horizontal overflow or clipped controls at 390px.

Do not seed or mutate production. Do not use deployment for this UAT.

## Primary files expected to change during implementation

- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/hoa-portal/src/pages/portal/unitRegistry.tsx`
- `artifacts/hoa-portal/src/pages/portal/admin.tsx`
- `artifacts/hoa-portal/src/lib/translations.ts`
- `artifacts/api-server/src/__tests__/adminUnitRegistry.test.ts`
- `artifacts/api-server/src/__tests__/adminUnitRegistryTenantPath.test.ts`
- `artifacts/api-server/src/__tests__/adminUnitRegistryPiiGuard.test.ts`
- focused portal Unit Registry tests
- `artifacts/hoa-portal/e2e/helpers/db.ts`
- a focused Unit Registry Playwright specification.

Schema files and payment/guest/permit/booking routes are reference sources only unless implementation discovers a genuine contract defect. Any out-of-scope defect is reported rather than folded into UR1.

## Completion gate

UR1 is complete only when Decision 132 is recorded, focused and broad type/test checks pass, the seeded browser walkthrough passes in all four language/viewport combinations, intercepted API payloads prove the personal-data boundary, services restart cleanly, and implementation/evidence is published as individually verifiable relay files. Publication does not authorize deployment or production database changes.
