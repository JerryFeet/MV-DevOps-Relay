# SG13 — Gate privacy, session, and retention verification

**Evidence date:** 2026-08-25  
**Requirement series:** Security Guard (SG)

## Delivered behavior

- Public QR verification discloses only verdict, status/reason, message, and visit date.
- Guest passes retain guest-only verification and entry/exit movement logging. Resident movements are not logged by this gate flow.
- Guest records, guest passes, verification history, and guest entry/exit logs older than 90 days are purged.
- Waha Guest Day Passes and payment attempts are explicitly excluded from the guest-history purge.
- Shared-device inactivity is role-specific: **guards time out after 15 minutes**; **admins time out after 60 minutes**. Pointer, keyboard, and touch activity reset either timer, and cleanup removes listeners/timers on unmount.
- Gate role checks query the caller on every request, so a removed role is rejected on the next request rather than relying on a stale browser claim.

## Source read-back

- `artifacts/api-server/src/routes/verify.ts` applies public-output minimization, separates the authenticated Day Pass projection, and authorizes it through the gate-role set.
- `artifacts/api-server/src/lib/guestHistoryPurge.ts` defaults to 90 days and deletes only ordinary guest records/history; it explicitly excludes Day Passes and payment attempts.
- `artifacts/hoa-portal/src/lib/gateSession.ts` defines guard/admin timeouts, role selection, activity reset, and cleanup.
- `artifacts/hoa-portal/src/components/PortalLayout.tsx` applies the role-specific shared-device timer.
- `artifacts/api-server/src/__tests__/ownership.test.ts` covers public Day Pass privacy, gate-only access, supervisor denial, and role removal on the next request.
- `artifacts/api-server/src/__tests__/guestHistoryPurge.test.ts` covers old-versus-recent guest history and Day Pass/payment-attempt preservation.

## Verification

| Check | Result |
| --- | --- |
| API targeted regression suite | Passed — 97 tests, including privacy, role enforcement, ordinary gate movement state guards, and SG13 retention. |
| Portal idle-session suite | Passed — 4 tests: guard expiry, activity reset/cleanup, role duration selection, and one-hour admin expiry. |
| Full portal suite | Passed — 65 files, 1,348 tests. |
| Browser smoke check | Passed — the portal root renders the Clerk sign-in screen instead of a blank page; no application console errors. Only development-key and autocomplete warnings appeared. |
| API, portal, and mobile TypeScript checks | Passed. |
| `git diff --check` | Passed. |

## Boundaries retained

- The safe browser pass did not create an account, alter a role, create database rows, or make a payment attempt.
- No production data or deployment was changed.
