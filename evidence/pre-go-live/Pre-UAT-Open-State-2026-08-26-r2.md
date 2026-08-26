# Pre-UAT open state

**Revision:** r2  
**Date:** 2026-08-26  
**Launch product:** browser portal  
**Native mobile:** deferred

## Browser implementation status

No confirmed browser-portal implementation defect remains from the latest
workbook walkthrough.

The E1 admin identity issue recorded in r1 was stale evidence captured before
the role-first admin identity correction. Current source and the fresh
authenticated E2E run both confirm:

- the admin identity is presented as `Administrator Account`;
- resident verification status is not shown for an administrator; and
- the E1 workbook assertion passes.

## Clean full E2E result

The configured portal E2E workflow completed from fresh Clerk authentication
sessions with one worker:

- **91 passed**
- **7 documented skips**
- **0 failed**
- **0 retries**
- **Duration:** 21.3 minutes

The same run confirmed resident/admin authorization guards, guard-only routing,
admin identity E1, Key Contacts round trips, and the real-session Security Gate
walkthrough including idle sign-out.

Before the final run, stale or brittle E2E contracts were corrected to:

- send the Clerk Bearer token for authenticated browser API assertions;
- require guards entering `/portal` to reach `/portal/security-gate`;
- verify guard idle sign-out at the configured public-root destination;
- prove admin and guard setup readiness against their actual protected UI; and
- allow the documented portal hydration window in two slow Key Contacts checks.

Portal TypeScript validation also passed.

## Manual product-owner UAT still open

- Resident flows: B1–B2, B4, B7, B10–B11 and booking boundaries B12.1–B12.5.
- Tenant lifecycle: C1–C8 with fresh owner, tenant, and admin identities.
- Admin: E3, E5–E15.5, including queue/detail, Unit Registry, communications,
  uploads, release cases, and Operations Manager notifications.
- Release dry run: G1–G7 using safe marked fixtures and the approved procedure.
- Security Gate: physical scans, refusal reasons, unit privacy, Arabic,
  genuine idle timeout, and live suspension checks.
- Remaining notification, hydration, Dalil, and first-time resident checks in
  the consolidated UAT checklist.

## Environment/provider setup still open

- Prepare distinct fresh UAT identities and safe fixtures.
- Configure/verify the Operations Manager identity and external email/push.
- Complete a real Moyasar test-mode callback and exactly-once entitlement proof.
- Production configuration/deployment remains unperformed.

## Deferred, not closed

- Native sign-in on a physical device or simulator.
- All further native mobile UAT, including Section D.
- Native sign-in must be resolved before the mobile app is ever released to
  residents; Expo web evidence is not sufficient.

## Completed and published

- SG14/SG15 guard scope and exact plate lookup.
- Resident-entry URL revert.
- Guard restriction delivery.
- Mobile root loading/timeout/retry hardening and timeout diagnosis.