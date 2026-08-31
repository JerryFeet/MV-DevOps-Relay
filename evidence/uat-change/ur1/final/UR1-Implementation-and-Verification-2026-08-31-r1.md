# UR1 Unit Registry — Implementation and Verification

Date: 2026-08-31  
Scope: Admin Unit Registry exhaustive per-unit research view

## Delivered

- Admin-only exhaustive unit response covering owner, tenant, household residents, contact details, vehicles, Waha passes, all permit types, retained legacy guests and QR passes, Guest Day Passes, payments, facility bookings, parking, and ownership context.
- Decision 132 option (a): `residents.idNumber` and `users.nationalId` are visible only in the admin Unit Registry.
- Non-admin callers remain blocked, and the gate projection excludes National IDs, verification tokens, pass UUIDs, and internal identifiers.
- Exact National ID search with the existing fixed-window rate limiter.
- Dashboard-to-registry and registry-to-dashboard navigation.
- English and Arabic grouped, collapsible sections suitable for mobile use.
- HOA COMMON excluded from registry rows, totals, and building filters.

## Source verification

- API type check: pass.
- Portal type check: pass.
- Focused Unit Registry and PII suite: 36/36 pass.
- Fixed-window owner-ID security regression: pass.
- Full portal suite: 72 files, 1,403 tests pass.
- `git diff --check`: pass.

## Runtime verification

- Exact National ID requests: `200, 200, 200, 200, 200, 429`.
- Recovery after expiring only the test limiter row: `200`.
- Existing partial unique index used; the temporary test index was removed.
- No schema migration, `db:push`, production database change, or deployment occurred.

## Security boundary

The live gate response exposed only:

`guestName`, `hostName`, `message`, `status`, `unitNumber`, `valid`, `vehiclePlate`, `visitDate`.

Forbidden identity and credential fields were absent.