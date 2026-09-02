# UAT Change Evidence — Administrator Bootstrap and Entry Security

Date: 2026-09-02  
Environment: Development only  
Production changes: None  
Schema migrations: None  
Deployment/Publish: Not performed

## Scope

This change covers the two administrator-entry issues identified after the
Development database rebuild:

1. A safe, operator-controlled first-administrator bootstrap.
2. Removal of the resident sign-up path from the administrator entry screen.

## Initial administrator bootstrap

The API now reads the comma-separated `PORTAL_INITIAL_ADMIN_EMAILS`
environment variable. Development is configured for the designated
administrator and Operations Manager addresses. Production remains
unconfigured pending explicit Publish approval.

On `/api/users/me/sync`, a configured address is eligible only when:

- Clerk Management API confirms the signed-in identity owns that address.
- Clerk marks the matching address as verified.
- The application user is still the pristine first-sign-in shape:
  `tenant`, no unit linkage, and `unverified`.

The server then performs one locked transaction that:

- writes a durable `data_migration_corrections` record with
  `entity_type=user_role` and `issue_code=initial_admin_bootstrap`;
- records user ID, prior role, resulting role, outcome, source, resolver, and
  timestamp;
- grants `admin` only for the pristine eligible account.

The existing unique ledger key is the permanent consumption marker for that
configured address. If the administrator role is later removed, subsequent
sign-ins find the consumed marker and cannot re-grant it.

Configured identities that are already unit-linked, verified residents, or
otherwise non-pristine are refused and permanently consumed. The portal's
ordinary role-update API remains unable to assign `admin`.

## Reset protection

The UAT reset script now fails before deleting data unless the preserved
administrator is:

- `role=admin`;
- not linked to a unit;
- `verification_status=unverified`;
- not represented by a resident record.

It also checks, before commit, that the sole preserved user still satisfies
the administrator invariant. A rebuild can no longer pass merely because the
email row exists.

## Administrator entry

The `/admin` Clerk `SignIn` component no longer supplies a sign-up route and
its sign-up footer action is hidden. A signed-in non-admin receives a generic
denial without their email address or any indication that an administrator
account exists, plus an explicit Resident Portal link. Server-resolved
application roles remain the authorization source for `/portal/admin`.

## Focused verification

### API

Command:

`pnpm --filter @workspace/api-server exec vitest run src/__tests__/initialAdminBootstrap.test.ts`

Result: 5 passed.

Coverage:

- configured addresses normalize and deduplicate;
- a pristine user with a Clerk-verified configured address receives admin;
- an unverified matching address is not trusted;
- a consumed address cannot re-grant after later demotion;
- an already-linked resident is refused and the attempt is consumed.

### Portal

Command:

`pnpm --filter @workspace/hoa-portal exec vitest run src/__tests__/adminEntrySecurity.test.tsx`

Result: 2 passed.

Coverage:

- administrator entry exposes no resident sign-up action;
- denial is generic and provides the resident-portal route.

### Type checks

- `pnpm --filter @workspace/api-server run typecheck` — passed.
- `pnpm --filter @workspace/hoa-portal run typecheck` — passed.

### Runtime

- API workflow restarted and listening on port 8080.
- Portal workflow restarted and Vite reported ready.
- `/api/healthz` returned HTTP 200 after startup.
- `/admin` rendered successfully in the proxied portal preview.
- Browser console contained no application errors on the administrator entry.

## Full browser-suite result

The configured E2E workflow first hit a startup race (HTTP 502 while the API
was restarting). It was rerun after both services were ready.

Final result: 97 passed, 7 skipped, 2 failed in 7.0 minutes.

The administrator authentication setup and role-redirect tests passed,
including:

- administrator setup and admin dashboard access;
- resident/owner redirect away from `/portal/admin`;
- no admin cards/actions for non-admins;
- direct admin API role guards.

The two persistent failures are outside this change:

1. Workbook E2 expected a visible attention-queue label exactly `Permits`.
2. PH1 expected visible Portal Help copy containing `oldest:`.

Neither failure traverses initial administrator bootstrap or `/admin`
sign-up/denial behavior. No attempt was made to alter those unrelated UAT
expectations in this change.

## Remaining live proof

The Operations Manager has not yet completed a real Development sign-in.
Their first Clerk-verified sign-in is expected to create the application user
row and consume their configured one-time administrator grant. That live
identity proof remains the final operator UAT step; no manual SQL is required.
