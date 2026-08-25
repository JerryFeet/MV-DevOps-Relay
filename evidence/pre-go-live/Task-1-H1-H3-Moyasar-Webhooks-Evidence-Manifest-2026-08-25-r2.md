# Task 1 H1–H3 / Moyasar webhook evidence manifest (revision 2)

**Relay repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Publication date:** 2026-08-25  
**Classification:** implementation and development-environment verification only. This is **not** production approval and does not prove a live Moyasar callback.

## Published evidence

| File | Exact bytes | GitHub blob SHA | Evidence-content commit SHA |
| --- | ---: | --- | --- |
| `Task-1-H1-H3-Implementation-Evidence-2026-08-25-r2.md` | 5,283 | `98889084a1b4f739d9fc3bb5890c2b03b7249617` | `58bd319386d8d8e71b649f44f4252ef1c4fa6726` |
| `Moyasar-Webhooks-Operator-Runbook-2026-08-25.md` | 6,551 | `0cb31c49e03212fb6ee55eeccaeafb16ab41ab1e` | `8b6754df5fe5f0ab50e2dc0cc575dfd498f509ab` |

## Read-back verification

- Each file was created as its own GitHub contents commit; no earlier evidence revision was overwritten.
- The relay API re-read each content object and its commit after upload.
- All cited blob and commit IDs are 40-character lowercase hexadecimal Git object IDs resolved in `JerryFeet/MV-DevOps-Relay`.

## Release boundary and remaining acceptance criterion

The development API suite passed with **1,383 passed, 21 skipped, 0 failed (1,404 total)**. API and portal type checks passed. A browser test verified the admin recovery UI safely rejects an unknown Charge ID without creating a payment or entitlement.

The remaining owner-only acceptance criterion is a real Moyasar **test-mode** payment after the current revision is published. The runbook defines the required evidence: a paid charge, successful `payment_paid` webhook delivery with HTTP 200, exactly-once portal entitlement issuance, and queued/dispatched resident notification.