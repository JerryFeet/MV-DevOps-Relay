# N1 Browser Evidence

Fresh authenticated browser context, 2026-08-31.

- English AD6 SMTP warning visible above Needs Your Attention: screenshot id eqnwr2.
- Arabic AD6 SMTP warning at 390px with no horizontal overflow: screenshot id etm6nr.
- Arabic per-recipient delivery dialog safe zero state: screenshot id wfuosu.
- GET /api/admin/summary returned HTTP 200 with smtpStatus=unconfigured, retryingEmailNotifications=0, failedEmailNotifications=0, oldestEmailFailureAt=null.
- GET /api/users/2 returned HTTP 200 with notificationFailureSummary.
- No application console errors in authenticated flows; Clerk emitted unrelated deprecation warnings.

The live fixture contains no retrying/failed notification rows, so the nonzero state is proven by automated tests rather than database mutation.
