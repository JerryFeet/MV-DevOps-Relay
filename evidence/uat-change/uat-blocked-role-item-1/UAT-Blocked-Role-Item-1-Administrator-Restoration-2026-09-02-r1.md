# UAT Blocker Item 1 — Administrator Role Restoration

Date: 2026-09-02
Environment: Development only
Scope: Item 1 from the first UAT-step findings; no Production mutation and no authorization bypass.

## Finding confirmed

The surviving Clerk identity had no surviving application-database role after the rebuild. On first sign-in, POST /api/users/me/sync recreated the application user with the normal default resident values: role tenant, status pending, verification unverified, and no unit.

## Repair applied

A parameterized Development-database update targeted the existing product-owner account by both its supplied administrator email and its existing Clerk identifier. The update changed only users.role from tenant to admin.

The following values were deliberately left unchanged:

- Clerk identifier
- email and profile names
- status: pending
- verification status: unverified
- unit linkage: none
- created and updated timestamps

No self-elevation endpoint, email allowlist, sign-in default, or resident-to-admin conversion path was added.

## Post-repair Development verification

| Identity class | Present | Role/state after verification |
|---|---:|---|
| Product-owner administrator identity | Yes | admin / pending / unverified / no unit |
| Standard E2E administrator | Yes | admin / pending / unverified |
| Standard E2E guard | Yes | guard / active / unverified |
| Standard E2E resident | Yes | tenant / pending / unverified |
| Standard E2E verified resident | Yes | owner / pending / verified_owner / unit linked |
| Operations Manager identity | No | No application users row exists in Development |

Additional synthetic identities remain in Development, including active admin, owner, tenant, guard, gate-walkthrough, payment-recovery, and Unit Registry fixtures. This confirms the rebuild did not leave the database globally empty; the product-owner administrator row was specifically recreated after sign-in and therefore inherited the default tenant role.

## Source behavior checked

- First-sign-in synchronization defaults new application users to tenant / pending / unverified.
- Existing users are resolved by unique Clerk identifier, so subsequent synchronization does not overwrite the restored admin role.
- Admin API and portal authorization are resolved from the server-side application-database role.
- The separate E2E admin setup uses a Development-only direct database helper to establish its test role; it is not a production bootstrap.

## UAT result

Item 1 is unblocked in Development. Reloading or signing in again causes the current-user query to return the restored admin role and permits the existing administrator identity to reach the admin route.

Items 2 and 3 are not claimed complete by this evidence.
