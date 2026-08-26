# SG14 — Guard-only scope evidence

**Revision:** r1  
**Date:** 2026-08-26  
**Environment:** development/UAT only  
**Release decision:** evidence publication only; no deployment or production access

## Requirement

The Security Gate dashboard is the guard's only application surface. Guards
must not inherit resident, owner, or administrator module access. Any gate need
must use a purpose-built endpoint with a minimum projection.

## Source read-back

The active checked-out source was read back after implementation.

### API module boundary

- Production authorization code contains no `STAFF_ROLES` group.
- `GATE_ROLES` contains only `admin` and `guard`.
- A shared `denyGuardModuleAccess` middleware rejects guards before generic
  module handlers run.
- The middleware is mounted on announcements, bookings, guests, residents, and
  vehicles.
- Gate-specific operations remain behind explicit `GATE_ROLES` checks in the
  users, verifier, and guest-pass gate routes.

This removes the two reviewed inherited-access defects:

1. Guards no longer receive administrator announcement visibility.
2. Guards no longer receive generic vehicle-listing access.

### Portal route and navigation boundary

- Every resident module route in the central route registry explicitly allows
  only `admin`, `owner`, and `tenant`.
- `/portal/security-gate` explicitly allows only `admin` and `guard`.
- A denied guard is redirected to Security Gate before restricted page content
  can mount.
- Guard navigation contains only Security Gate.

### Native mobile boundary

- Resident mobile roles are explicitly `admin`, `owner`, and `tenant`.
- The signed-in home layout checks the application role before mounting the
  resident stack, so direct routes and deep links do not bypass the restriction.
- A guard receives bilingual guidance to use the browser-based Security Gate
  dashboard and can sign out.
- No native gate surface was added.
- Announcements and Vehicles are registered through the same resident-only tab
  registry in both native and classic tab layouts.

## Automated verification

| Check | Result |
| --- | --- |
| Focused SG14/SG15 API run | 4 files passed; 163 tests passed |
| Full portal suite after URL revert | 67 files passed; 1,359 tests passed |
| Post-prefix route contract | 1 file passed; 2 tests passed |
| Portal TypeScript | Passed |
| Full mobile suite | 17 files passed; 399 tests passed |
| Focused mobile role boundary | 6 tests passed |
| Mobile TypeScript | Passed |

The API focus included guard refusals for announcements, vehicles, guests,
residents, administrator user APIs, and ownership boundaries.

## Real Clerk browser verification

A real development Clerk guard session was used under the restored public
prefix. Authentication was not mocked.

- Security Gate loaded at `/hoa-portal/portal/security-gate`.
- The active session identified the E2E guard fixture.
- Direct navigation to `/hoa-portal/portal/vehicles` was refused and returned
  the guard to Security Gate without rendering vehicle content.
- Direct navigation to `/hoa-portal/portal/announcements` was refused and
  returned the guard to Security Gate without rendering announcement content.
- At 390 px, the Arabic Security Gate view had no horizontal overflow; measured
  viewport and document widths were all 390 px.

Replit browser evidence IDs:

- `fkybvj` — real Clerk guard session on Security Gate
- `1mssm3` — direct Announcements route refused
- `a5hzzq` — Arabic 390 px gate view with no horizontal overflow

## Boundary

No production access, deployment, schema migration, live payment credential,
payment, or destructive release action was used.