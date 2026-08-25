# Moyasar webhook setup, test, and recovery runbook (revision 2)

**Use this after the current portal revision is published.**  
**Scope:** one owner session; no database access, repository access, or manual entitlement grant is required.

## What this runbook protects

The portal settles payment only after its server verifies the charge with Moyasar. A browser return never settles payment. If a callback is missed after Moyasar has exhausted its delivery retries, an administrator can safely recheck the provider charge from **Payment History**.

### Important: the payload shape is not yet observed

The webhook field names in this release are **documentation-derived only**. `secret_token`, the top-level event `id` and `type`, and nested payment `data.id` have never been observed from the connected Moyasar account. A real test-mode payment is the first check that confirms the account sends this shape.

If that first callback is rejected, inspect the **raw request body** in the Moyasar webhook delivery attempt before assuming that the Secret Token or a signature is wrong. Compare the actual keys and nesting with the documented shape. Do not paste the raw body, secret token, or payment metadata into chat or an unsecured log.

## 1. Configure the portal secrets

In the published portal's Replit environment, set the following **without pasting values into chat or source code**:

| Setting | Value |
| --- | --- |
| `PAYMENT_PROVIDER` | `moyasar` |
| `MOYASAR_SECRET_KEY` | The correct Moyasar key for the environment being tested (test key for this runbook; live key only after acceptance). |
| `PAYMENT_WEBHOOK_SECRET` | A new, high-entropy shared secret token. This is separate from the Moyasar API key. |

For a test-mode run, use the test environment/key throughout. Do not point a test key at a live operational workflow.

## 2. Configure the Moyasar dashboard webhook

In the Moyasar dashboard, open **Settings → Webhooks** and add or edit the portal webhook:

| Dashboard field | Exact value |
| --- | --- |
| **Endpoint** | `https://community-hub-portal.replit.app/api/payments/webhook` |
| **HTTP Method** | `POST` |
| **Secret Token** | The exact value stored as the published portal's `PAYMENT_WEBHOOK_SECRET` |
| **Events** | `payment_paid` and `payment_failed` only |

Save the webhook. Do not include unrelated events; the portal rejects event types other than the two listed above.

### Standing URL warning

The callback endpoint is permanently tied to:

`https://community-hub-portal.replit.app/api/payments/webhook`

If the portal ever moves to a custom domain, update the Moyasar dashboard webhook at the same time. Otherwise payments can continue to appear successful at Moyasar while callbacks stop reaching the portal and settlement silently stops.

## 3. Perform the required test-mode proof

1. In the portal, use a test resident account to begin one payable flow such as a Waha Guest Day Pass.
2. Complete it using Moyasar's supported **test-mode** payment method.
3. In the Moyasar payment record, confirm the charge shows **paid** and copy its Charge ID for the checks below.
4. Inspect the webhook delivery:
   - In the Moyasar dashboard's webhook area, inspect the attempt for this payment if delivery attempts are displayed there.
   - If the dashboard does not expose individual attempts, use Moyasar's documented **List Webhook Attempts** endpoint with the test secret in your own secure terminal:

     ```bash
     curl -u "$MOYASAR_TEST_SECRET:" https://api.moyasar.com/v1/webhooks/attempts
     ```

   - Find the attempt matching the payment time and Charge ID. The expected successful delivery is `result: success` with `response_code: 200`.
5. In Replit's published deployment logs, look for a normal payment-confirmation outcome. A rejected callback is logged as `payment_webhook_rejected` without recording the secret token or the payment body.
6. In the resident portal, confirm the entitlement is issued (for example, the paid Waha pass / usable credential is visible) and confirm the resident notification is queued, then delivered through the configured email or push channel.

This first real test-mode callback is the acceptance check for the documented payload assumption. Do not enable live payments until it has passed.

### Test-mode acceptance criteria

All of the following must be true:

- Moyasar shows the payment as **paid**.
- The matching `payment_paid` webhook attempt shows **HTTP 200** / successful delivery.
- The portal has issued the entitlement once, not merely displayed a browser return page.
- The payment attempt is confirmed and the resident notification is queued; after the notification dispatcher runs, the configured email or push delivery is observable.

If Moyasar's actual test callback is rejected even with the dashboard Secret Token matching `PAYMENT_WEBHOOK_SECRET`, stop before live enablement. Inspect the raw request body first, then record the delivery time, HTTP status, and Moyasar attempt ID through the approved operational channel. Do not paste the secret token or full callback body into chat.

## 4. If the delivery fails or is delayed

Moyasar documents automatic webhook retries. Do **not** create a second charge, mark a payment paid manually, or issue a replacement entitlement while retries are still in progress.

| Observation | Safe action |
| --- | --- |
| `400` / rejected delivery | Inspect the raw request body first. Then compare the dashboard **Secret Token** with the published `PAYMENT_WEBHOOK_SECRET`; confirm the method is POST and the selected events are exactly `payment_paid` and `payment_failed`. |
| `502` / provider verification error | Check the published `MOYASAR_SECRET_KEY` is present and belongs to the same environment as the charge. Do not expose the key. |
| Still retrying | Wait for Moyasar's retry sequence to finish; inspect the latest webhook-attempt response. |
| Paid in Moyasar, retries exhausted, portal still pending | Use the recovery procedure below. |

## 5. Recover a missed callback safely

Only a portal **administrator** can use this control.

1. Open **Payment History** in the portal.
2. In **Recover a paid Moyasar charge**, paste the Charge ID copied from the Moyasar dashboard.
3. Select **Recheck and settle**.
4. Read the on-screen result:

| Result | Meaning and next action |
| --- | --- |
| Confirmed | The portal independently verified a matching paid charge and settled it exactly once. Confirm the entitlement and notification as in the test-mode proof. |
| Already confirmed | The charge was already settled. Do not retry or issue anything manually. |
| Still pending | Moyasar still reports the charge as pending; nothing was issued. Wait, then recheck the provider status. |
| Not payable / error | The provider did not prove a matching paid charge, or the Charge ID is not eligible. Nothing was issued. Review the Moyasar charge and webhook attempt; never override the portal manually. |
| Charge not found | The copied ID is not a portal-created payment attempt. Recopy it from the matching Moyasar payment record. |

This action does not trust the dashboard text alone: it reloads the existing portal attempt, verifies the provider charge directly, checks amount/currency/metadata, and then uses the same idempotent settlement path as a normal webhook.

## Source references and limitation

- Moyasar Webhooks documentation: <https://docs.moyasar.com/webhooks>
- Moyasar Webhook Attempts documentation: <https://docs.moyasar.com/api/webhooks/attempts>

These references informed the implementation. The connected account's actual payload must still be proven with the test-mode payment in section 3 before live payment enablement.