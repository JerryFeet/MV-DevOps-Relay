# SG5 — Guard Session Timeout Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG5: shared gatehouse sessions use a short inactivity timeout, expiry returns through sign-out to the sign-in/root entry route, and the signed-in guard identity is prominent.

## Delivered behavior

- Guard sessions use a 15-minute inactivity window; admin sessions use a separate one-hour window.
- Activity on pointerdown, keydown, or touchstart re-arms the timer, and unmount cleanup cancels it.
- The shared portal layout owns the timeout for every portal child page, not only the security-gate page.
- On expiry the layout calls Clerk sign-out with redirectUrl set to the root route, allowing the signed-out app entry flow to return the user to sign-in rather than leaving a blank authenticated page.
- The shared sidebar visibly renders the signed-in guard’s name and verification/role status.

## Automated verification

The two focused portal test files pass five tests in total: four timer/role tests plus one mounted PortalLayout timeout test.

| Check | Result | Evidence |
| --- | --- | --- |
| Guard timer expires at 15 minutes | PASS | gateSession.test.ts |
| Activity re-arms timer and cleanup prevents later expiry | PASS | gateSession.test.ts |
| Role timeout mapping | PASS | guard 15 minutes, admin one hour, resident no gate timer |
| Mounted PortalLayout guard timeout | PASS | portalLayoutGuardTimeout.test.tsx; renders a guard on an announcements child page, asserts name visibility, and asserts Clerk sign-out receives { redirectUrl: "/" } at 15 minutes |
| Portal typecheck | PASS | pnpm --filter @workspace/hoa-portal run typecheck |
| Diff whitespace validation | PASS | git diff --check |

The mounted test is intentionally page-level: it exercises the real shared PortalLayout rather than testing only the timer helper. It confirms the timeout applies while the guard is on an arbitrary portal child page.

## Boundaries

- This evidence makes no production write, deployment, payment change, live business-data change, or automatic schema migration.
- This slice proves the mounted client wiring and redirect contract with deterministic fake timers. It does not claim that a guard-authenticated live-browser walkthrough has been completed; that remains a separate guard UAT path.
- The root redirect is the application’s signed-out entry route; the Clerk sign-out call is the session authority and the portal layout does not implement a second identity system.