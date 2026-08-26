# Pre-UAT open state

**Date:** 2026-08-26  
**Launch product:** browser portal  
**Native mobile:** deferred

## Confirmed implementation defect

1. **Admin identity mismatch (E1):** the admin dashboard showed the E2E admin
   identity and `unverified` state instead of the required Administrator
   Account presentation.

No other browser-portal implementation failure is recorded in the latest
workbook walkthrough.

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
- Task 729 guard restriction.
- Mobile root loading/timeout/retry hardening and timeout diagnosis.