# SG7 — Immediate Guard Suspension and Removal Enforcement Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG7: a guard suspension or removal must take effect on the next request, not the next sign-in.

## Delivered enforcement

- Every normal authenticated API request now resolves the current app-user row by Clerk ID before it reaches a route handler.
- A missing app-user row fails closed with `403 { error: ACCOUNT_UNAVAILABLE }`.
- A suspended app-user row fails closed with `403 { error: ACCOUNT_SUSPENDED }` and no user record or gate data.
- Existing route-level role checks remain in place. If an active session loses the `guard` role, its next gate request is denied by the gate role boundary.
- The only narrow exception is first-sign-in profile provisioning at `POST /users/me/sync`; it needs Clerk authentication without a pre-existing app row so it can atomically establish that row. Its existing suspended-row check remains fail-closed.

## Source read-back

- `artifacts/api-server/src/middlewares/requireApiAuth.ts`: Clerk-session check plus asynchronous current app-user lookup; missing and suspended identities return stable non-PII 403 responses before any protected handler executes.
- `artifacts/api-server/src/routes/users.ts`: profile-sync uses the deliberately narrow provisioning middleware; all other existing uses of `requireApiAuth` inherit the active-account check.
- `artifacts/api-server/src/__tests__/suspendedAccountBlock.test.ts`: same Clerk identity successfully reaches a gate endpoint, is then suspended or removed from the guard role, and the next request is refused. A surviving Clerk session with no app row is also refused.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| SG7 suspension/removal and profile-sync tests | PASS | Active guard → suspended → same-session gate refusal; active guard → role removal → same-session gate refusal; missing app record fails closed |
| Representative gate and ownership regression checks | PASS | 92 API tests across suspended-account, security-gate-guards, and ownership suites |
| API typecheck | PASS | `pnpm --filter @workspace/api-server run typecheck` |
| API service restart | PASS | rebuilt successfully and listened on port 8080 |

The suspension test asserts the exact body `{ error: ACCOUNT_SUSPENDED }` and confirms no `email` or `role` field is exposed. The missing-record test asserts `{ error: ACCOUNT_UNAVAILABLE }` with the same no-PII property. Historical gate logs are not deleted or modified by this enforcement.

## Real-browser positive control

A Playwright testing agent used the existing `E2E Admin` development account through Clerk programmatic sign-in, without creating business data or submitting a credential. It confirmed `/portal/security-gate` still loads for an active account, shows the active session and Scanner control, and produces no failed application API request or console error. Development-only Vite/React/Clerk messages were the only console output.

## Security boundaries

- Enforcement is server-side and happens on each protected request; cached UI, a valid Clerk cookie, and client route guards cannot bypass it.
- No production write, deployment, schema/migration change, payment change, or external identity deletion was performed.
- No offline or cached gate-verification capability was added.