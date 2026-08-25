# Go-Live Workbook walkthrough — Section E (Admin console)

**Environment:** development only; real Clerk-authenticated admin session.  
**Source:** `artifacts/hoa-portal/e2e/workbook-admin-walkthrough.spec.ts`  
**Run:** 4 passed, 3 explicitly skipped. No booking, upload, approval, decision, notification, or release execution occurred.

| Workbook ID | Result | What the screen actually displayed | Screenshot |
|---|---|---|---|
| E1 | **FAIL — observed UI mismatch** | The admin dashboard opened, but its identity block displayed `E2E Admin` and `unverified`; it did not display the workbook’s required `Administrator Account`. | `screenshots/section-e-g/workbook-admin-walkthrough-88615--is-recorded-for-the-report-workbook-admin/E01-01-admin-identity-observed.png` |
| E2 | PASS | “Needs your attention” displayed seven labeled queues with numeric counts: Owner verifications, Permits, Waha applications, Waha replacements, Ownership changes, Tenancy releases, and Communications. | `screenshots/section-e-g/workbook-admin-walkthrough-50fe9-s-a-numeric-count-and-label-workbook-admin/E02-01-attention-queues.png` |
| E4 | PASS — deliberate refusal | The attention panel contained no tenancy-approval queue. | `screenshots/section-e-g/workbook-admin-walkthrough-e3895-s-no-tenancy-approval-queue-workbook-admin/E04-01-no-tenancy-approval-queue.png` |

## Returned to manual

- **E3, E5:** no seeded waiting item was available to prove the oldest-item summary and full decision detail.
- **E6–E7:** the current portal route registry has no browser-accessible Unit Registry screen. API assertions were intentionally not substituted.
- **E8–E10:** require a real seeded communication and an admin decision; not executed to avoid generating decision/notification side effects in this evidence run.
- **E11:** not walked in this screenshot-producing run.
- **E12:** needs an upload plus a distinct approved tenant session; not executed.
- **E13–E14:** no safely identifiable tenancy-release case was visible. The run did not preview an untrusted account and never exposed or clicked a destructive confirmation.
- **E15.1–E15.5:** requires a distinct Operations Manager identity and configured external email/push delivery; manual/integration check.
