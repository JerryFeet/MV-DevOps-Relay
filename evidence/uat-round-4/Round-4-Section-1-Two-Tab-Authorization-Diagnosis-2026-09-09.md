# Round 4 Section 1 — Two-Tab Authorization Runtime Diagnosis

**Date:** 2026-09-09  
**Environment:** Development  
**Method:** One fresh browser context, two tabs/pages, existing identities only

## Classification

**Contained browser session-selection/presentation issue. No server authorization bypass was observed.**

Clerk selected one browser-context-wide active session. Signing a second identity in tab 2 and refreshing tab 1 caused tab 1 to adopt tab 2's Clerk user, session, token subject, and application identity. This occurred for admin → owner and owner → tenant role changes.

Under owner and tenant sessions, /api/users/me returned the correct non-admin identity and both admin APIs returned 403. No non-admin session obtained admin data.

## Exact journey

1. Opened tab 1 and programmatically signed in the existing admin identity.
2. Navigated tab 1 to /portal/admin.
3. Captured Clerk userId/sessionId, decoded token sub/sid, /api/users/me, /api/admin/summary, and /api/admin/pending-items.
4. Kept tab 1 open; opened tab 2 in the same browser context.
5. Programmatically signed tab 2 into the existing owner identity and opened the resident portal.
6. Captured the same Clerk and API diagnostics in tab 2.
7. Refreshed tab 1 and captured diagnostics again.
8. Navigated the owner tab directly to /portal/admin.
9. Repeated the second-role sequence with the existing tenant identity.

## Observations

| State | /api/users/me | /api/admin/summary | /api/admin/pending-items | Visible result |
|---|---|---:|---:|---|
| Initial admin tab | DB user 1411, role admin | 200 | 200 | Populated admin dashboard |
| Owner tab | DB user 1414, role owner | 403 | 403 | Owner dashboard, Unit W14 |
| Original tab after owner refresh | DB user 1414, role owner | 403 | 403 | Redirected to owner portal |
| Owner direct /portal/admin | DB user 1414, role owner | 403 | 403 | No admin UI; redirected |
| Tenant tab | DB user 1421, role tenant | 403 | 403 | Tenant dashboard, Unit W14 |
| Original tab after tenant refresh | DB user 1421, role tenant | 403 | 403 | Same tenant session and portal |

## Safe Clerk correlation

- Admin: user_3FrTxlvWxqjoQday5yV7eOVmOvI; session sess_3J3vTTlNUZO89L9NY6NLUw92li7
- Owner: user_3J0UGrNGjWgHEqGN76vaEqMHcg2; session sess_3J3vVs4gVkdJIhgPBWtt6pQYmQv
- Tenant: user_3J0YCjEF5Ymgf5hq3eIiejh7uJQ; session sess_3J3vcRt1GYDlKeInI88Om9kVYrf

For every identity, decoded token sub equalled Clerk userId and decoded sid equalled Clerk sessionId. Full tokens were neither recorded nor published.

## Final assertion

A non-admin session cannot obtain admin data: owner and tenant sessions both received 403 from the two tested admin endpoints, and direct owner navigation to /portal/admin showed no admin dashboard.

## What this does not cover

- Production Clerk behavior.
- Separate browser profiles/contexts, which are expected to isolate cookies.
- Clerk's visible sign-in/sign-out UI journey; identities were selected programmatically.
- OAuth/social sign-in.
- Admin endpoints other than /api/admin/summary and /api/admin/pending-items.
- Timing between second-tab session selection and an unrefreshed first tab beyond the observed visible stale page state.
- Mutation authorization.

## Development data before and after

No fixture or domain-data mutation was performed. The application's automatic /api/users/me/sync updated only the tested user rows' updated_at values; IDs, Clerk IDs, roles, statuses, units, and verification states were unchanged.

| User | Before updated_at | After updated_at |
|---|---|---|
| Admin 1411 | 2026-09-08T18:59:38.466Z | 2026-09-08T21:22:58.855Z |
| Owner 1414 | 2026-09-07T18:12:20.925Z | 2026-09-08T21:23:45.340Z |
| Tenant 1421 | 2026-09-07T19:26:40.445Z | 2026-09-08T21:24:17.451Z |

## Screenshot evidence

- 78xxr9 — populated admin dashboard before second identity selection
- 0jrsp0 — owner dashboard in tab 2
- ba4iir — owner direct navigation to admin route returned to resident dashboard
- 47ri56 — tenant dashboard before tab 1 refresh
- 041mq3 — tenant dashboard after shared-session convergence
