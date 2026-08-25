# Task 1 H1–H3 / Moyasar webhook evidence manifest (revision 3)

**Relay repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Publication date:** 2026-08-25  
**Classification:** implementation and development-environment verification only. This is **not** production approval and does not prove a live Moyasar callback.

## Published evidence

| File | Exact bytes | GitHub blob SHA | Evidence-content commit SHA |
| --- | ---: | --- | --- |
| `Task-1-H1-H3-Implementation-Evidence-2026-08-25-r2.md` | 5,283 | `98889084a1b4f739d9fc3bb5890c2b03b7249617` | `58bd319386d8d8e71b649f44f4252ef1c4fa6726` |
| `Moyasar-Webhooks-Operator-Runbook-2026-08-25-r2.md` | 7,709 | `f6294b5b987b11222f94f000ad776d68a3d6adb7` | `a63d90f5b494b6940a80c96807a854a2c3ec886c` |

## Read-back verification

- Revision 2 of the runbook was created as a new GitHub contents commit; the earlier unversioned runbook and earlier manifest revisions remain unchanged.
- The relay API re-read the runbook content object and its commit after upload.
- All cited blob and commit IDs are 40-character lowercase hexadecimal Git object IDs resolved in `JerryFeet/MV-DevOps-Relay`.

## New operational warnings in runbook revision 2

- The documented `secret_token`, top-level event `id` / `type`, and nested `data.id` shape has never been observed from the connected Moyasar account. The first real test-mode payment is the confirmation check; if rejected, inspect the raw request body before assuming a Secret Token/signature problem.
- The callback URL is `https://community-hub-portal.replit.app/api/payments/webhook`. A future custom-domain move must update Moyasar's dashboard webhook at the same time or settlement can silently stop.

## Release boundary and remaining acceptance criterion

The development API suite passed with **1,383 passed, 21 skipped, 0 failed (1,404 total)**. API and portal type checks passed. A browser test verified the admin recovery UI safely rejects an unknown Charge ID without creating a payment or entitlement.

The remaining owner-only acceptance criterion is a real Moyasar **test-mode** payment after the current revision is published. The runbook defines the required evidence: a paid charge, successful `payment_paid` webhook delivery with HTTP 200, exactly-once portal entitlement issuance, and queued/dispatched resident notification.