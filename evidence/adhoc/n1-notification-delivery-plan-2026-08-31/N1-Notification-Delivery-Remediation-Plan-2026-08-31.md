# N1 Notification Delivery Remediation Plan

**Date:** 2026-08-31  
**Status:** Plan only — not implemented  
**Inputs:** Notification Delivery N1; updated UAT requirements; Decisions 134–136

## 1. Objective

Correct notification delivery so an email is recorded as delivered only after the SMTP transport reports success; every failure is classified, logged safely, persisted, retried, and surfaced to administrators without allowing an email failure to break the underlying API response.

The existing architecture remains in place:

- persisted notification events;
- the 30-second dispatcher;
- existing idempotency keys and retry schedule;
- SMTP settings with environment fallback;
- post-commit/non-blocking business operations;
- the synchronous, throwing Send test email diagnostic.

This is a repair and completion of the current architecture, not a rebuild.

## 2. Decisions and constraints

1. **Decision 134:** silent email failure is the defect. A send that did not leave the system must never become delivered.
2. **Decision 135:** no email has been proven to reach a real inbox. N1d remains a product-owner acceptance step and cannot be closed by automated or mocked testing.
3. **Decision 136:** the database-backed SMTP password must be encrypted at rest with a key held outside the database.
4. Business APIs remain non-blocking with respect to SMTP. A notification failure is recorded and retried; it does not roll back or fail an approval, booking, tenancy, Portal Help, or other domain operation.
5. National IDs and other searchable resident data are out of scope for encryption. Their existing search and access-control requirements remain unchanged.
6. No schema tooling is run merely to implement application-level encryption. If implementation proves a schema change is unavoidable, the freeze is released for exactly one numbered migration, baseline regeneration, and empty-database proof. No db:push, push --force, or ad-hoc drizzle-kit migrate is permitted.

## 3. Confirmed current-state findings

### 3.1 False delivery success

- getSmtpConfig returns null when host, username, or password is missing.
- sendEmail returns without a signal when SMTP is unconfigured.
- sendEmail catches transport errors and returns void.
- The dispatcher awaits sendEmail, sees no rejection, and marks the notification event delivered.
- sendTestEmail already throws for missing configuration and provider failure; this behavior is correct and remains the administrator's direct diagnostic.

### 3.2 Credential storage audit

The only credential currently found in hoa_settings is smtp_pass.

The following credentials are already environment-only and must stay there:

- MOYASAR_SECRET_KEY;
- PAYMENT_WEBHOOK_SECRET;
- OPENAI_API_KEY;
- Clerk secret configuration;
- GATE_IDENTIFIER_HMAC_SECRET / SESSION_SECRET;
- SMTP_PASS when the environment fallback is used.

No payment-provider key, API token, webhook secret, Stripe key, or PayPal key was found stored in hoa_settings. The generic settings PUT route currently accepts arbitrary keys, so the implementation must add a server-side allowlist and explicit secret-setting classification to prevent future credentials being stored as ordinary plaintext settings.

### 3.3 X3 channel audit

X3 requires all sixteen events to create an email notification and, where a valid device token exists, a push notification. Events 9 and 12 are email-first, mandatory, and non-suppressible.

| X3 | Event | Current production path | Required plan outcome |
|---:|---|---|---|
| 1 | Unit verification approved/rejected | Email and push exist, but email is direct/legacy and push is queued | One persisted email row and one persisted push row |
| 2 | Permit approved/rejected | Push only | Add persisted email row; retain push row |
| 3 | Booking confirmed/cancelled | Push only | Add persisted email row; retain push row |
| 4 | Vehicle approved/rejected | Push only | Add persisted email row; retain push row |
| 5 | Waha Pass approved/rejected/revoked | Push only | Add persisted email row; retain push row |
| 6 | Guest Day Pass issued | Both through shared recipient helper | Preserve and contract-test |
| 7 | Contact HOA reply | Push row plus separate conditional/direct email | Replace split path with persisted email and push rows |
| 8 | Announcement published | Push row; direct email only for a material-change branch | Create per-recipient persisted email and push rows for every publication |
| 9 | Tenancy verification request submitted | Both, but email direct and push queued | One mandatory persisted email row and one push row to the verified owner |
| 10 | Tenancy approved/rejected | Both, but split direct/queued | One persisted email row and one persisted push row |
| 11 | Tenancy released by admin | Both, but split direct/queued | Persist both channels for every required recipient |
| 12 | Expiry reminders at 30/14/7/1 days | Both through shared recipient helper | Preserve mandatory/non-suppressible behavior and contract-test all four reminders and both recipients |
| 13 | Renewal submitted | Both through shared recipient helper | Preserve and contract-test |
| 14 | Renewal approved/rejected | Both through shared recipient helper | Preserve and contract-test |
| 15 | Access deactivated at expiry | Both through shared recipient helper | Preserve and contract-test tenant and owner recipients |
| 16 | Renewal awaiting owner decision past expiry | Both through shared recipient helper | Preserve owner recurrence; verify required admin alert is also produced and visible |

The plan treats events 2–5 as missing-email defects; events 7–8 as partial/conditional defects; and events 1 and 9–11 as split-path defects that bypass the persisted delivery contract.

## 4. Implementation sequence

### Phase A — Lock the delivery contract with failing tests

Before production edits, add characterization tests proving the current defect and defining the replacement contract:

1. SMTP unconfigured returns a typed failed outcome and never reports delivery.
2. Provider/auth/transport rejection returns a distinct typed failed outcome.
3. A successful send returns delivered only after Nodemailer resolves successfully.
4. Configuration read/decryption failure is distinct from SMTP unconfigured and provider failure.
5. Logs contain the recipient domain, event type, event ID/attempt, and a bounded diagnostic; they contain no SMTP credential, message body, full HTML, National ID, or unnecessary full recipient address.
6. sendTestEmail continues to throw actionable errors and the test-email route continues to surface them.
7. Every business API completes according to its domain result even when email dispatch later fails.

### Phase B — Make email delivery outcomes explicit

Introduce one typed transport result shared by the outbox dispatcher and diagnostic helpers. The result must distinguish at minimum:

- delivered;
- smtp_unconfigured;
- smtp_credential_unreadable or configuration_read_failed;
- recipient_missing;
- smtp_send_failed, with retryability and a sanitized reason.

sendEmail will return this result and will never silently convert a failed send into success. It need not throw into route handlers. The dispatcher will interpret the result and own persistence/retry behavior.

Keep sendTestEmail as the deliberate exception: it remains synchronous and throwing because its purpose is to give the administrator an immediate diagnostic.

### Phase C — Record the true outbox state and preserve retries

Update the dispatcher without changing its 30-second schedule, persistence model, idempotency contract, or retry intervals:

1. Mark delivered only for the delivered transport outcome.
2. For retryable failures, increment attempts, store a sanitized failure code/reason, and retain retrying status with the existing next-attempt schedule.
3. After the existing maximum attempt count, mark the row failed and retain lastError/failure classification for administration.
4. Treat SMTP unconfigured and unreadable encrypted credentials as explicit operational failures, never as successful no-ops.
5. Keep suppressed notifications separate from delivery failures.
6. Emit structured logs with event ID, event type, channel, attempt, recipient domain, failure code, and retry/terminal state.
7. Do not log credentials, decrypted values, payload bodies, full HTML, or identity data.

The AD6 failure count will include email rows in retrying or failed state, with terminal failures separately identifiable. This exposes current delivery risk rather than waiting until all retries are exhausted.

### Phase D — Move business email paths behind the persisted service

Preserve the current service and consolidate producers onto it:

1. Replace direct/legacy business sends for X3 events 1, 7, and 9–11 with enqueueNotificationForRecipient or an equivalent shared persisted helper.
2. Add missing email rows for X3 events 2–5.
3. Make event 8 create per-user email and push rows for ordinary and material announcements, subject to its independent announcement preference policy.
4. Preserve both-channel behavior for events 6 and 12–16.
5. Confirm event 16's recurring owner warning and required admin alert are both represented.
6. Move Portal Help replies, approval notifications, and other user-facing business sends away from direct Nodemailer calls so they acquire the same persistence, failure recording, and retry behavior.
7. Retain sendTestEmail as the only intentionally synchronous SMTP path.
8. Queue after the domain transaction commits. Enqueue failures are logged explicitly but do not alter the already-completed domain response.

Add one table-driven contract test covering all sixteen X3 events, required recipients, locale, mandatory/preference policy, email row, and push row. This test becomes the regression guard against push-only drift.

### Phase E — Surface failures to administrators

Use existing administration surfaces rather than creating a parallel operations system.

#### AD6 attention panel

Extend the admin summary read model with:

- effective SMTP state: configured, unconfigured, or credential/configuration error;
- count of retrying email deliveries;
- count of terminal failed email deliveries;
- oldest outstanding delivery failure timestamp.

Render an unmissable persistent warning at the top of AD6 when SMTP is unconfigured or its encrypted credential cannot be read. Add a notification-delivery attention item with failure count, oldest age, and urgency text/color following existing AD6 rules. It must be visible in English and Arabic and must not be hidden in the settings form.

#### Recipient record

Add an admin-only recipient failure summary to the existing user-detail path, not to gate/resident APIs:

- outstanding retrying count;
- terminal failed count;
- latest failure code and sanitized reason;
- latest attempt timestamp;
- event type and attempt count.

Expose the summary from the administrator's user record/detail interaction so repeated failures to one recipient are visible during an investigation. Keep full notification payloads and credentials out of this response. Add an AD6 drill-down to the affected recipient record or an admin-only paginated failure list grouped by recipient.

### Phase F — Encrypt credential settings at rest

Use application-level authenticated encryption for secret settings while leaving searchable resident data untouched.

Preferred design, requiring no schema change:

1. Store smtp_pass in the existing text value column as a versioned AES-256-GCM envelope containing key version, IV/nonce, authentication tag, and ciphertext.
2. Hold the encryption key in a Replit environment secret such as SETTINGS_CREDENTIAL_ENCRYPTION_KEY; never write it to hoa_settings, source, logs, evidence, or responses.
3. Maintain an explicit server-side secret-setting registry beginning with smtp_pass. All future credential-like setting keys must use the same encrypt/decrypt boundary.
4. Encrypt on every database write and decrypt only at the SMTP configuration read boundary.
5. Preserve DB-over-environment precedence and the existing SMTP environment fallback.
6. Preserve password masking and blank-password means keep existing behavior in the admin API.
7. Add a one-time controlled conversion for any existing plaintext smtp_pass. After conversion, runtime reads must fail closed on plaintext rather than silently accepting it.
8. Support key version in the envelope so rotation can decrypt old versions during a controlled re-encryption, without storing keys in the database.
9. Add a strict settings-key allowlist so arbitrary unknown values cannot be persisted through the generic settings endpoint.

Required proof:

- database read-back contains no SMTP plaintext;
- correct key decrypts only at the sending boundary;
- missing/wrong key produces credential_unreadable, never silent fallback to success;
- environment SMTP fallback still works when no database credential exists;
- API responses never expose plaintext or ciphertext;
- logs and test failures never print the key, ciphertext, or decrypted password.

If authenticated encryption cannot be safely introduced within the existing value column, stop and use the one authorized schema migration only. That migration must be numbered, regenerate the baseline through the approved process, apply cleanly to an empty database, migrate existing SMTP plaintext transactionally, and prove no plaintext remains. Do not use db:push, push --force, or unapproved drizzle-kit migrate.

## 5. Verification plan

### Automated service tests

- success, unconfigured, configuration-read failure, credential-decryption failure, and SMTP provider rejection;
- exact retry schedule and terminal failure after the existing maximum attempts;
- deliveredAt remains null for retrying/failed sends;
- successful delivery sets delivered and deliveredAt only after transport success;
- non-blocking API behavior under every failure class;
- structured log redaction;
- sendTestEmail remains throwing and actionable.

### Encryption tests

- ciphertext-at-rest assertion;
- decrypt-on-send assertion;
- wrong/missing key fail-closed assertion;
- versioned-envelope/key-rotation compatibility;
- plaintext conversion and idempotence;
- blank password preserves existing encrypted value;
- non-admin settings access remains redacted/blocked;
- no non-secret settings are unnecessarily encrypted;
- server-side settings allowlist rejects unknown keys.

### X3 contract tests

For each event 1–16, assert:

- correct recipient or recipients;
- one email row;
- one push row;
- stable idempotency behavior;
- recipient locale and specific event content;
- required rejection reason/details;
- event 8's independent preference behavior;
- events 9 and 12 cannot be suppressed;
- event 12 covers 30/14/7/1-day reminders to tenant and owner;
- event 16 covers recurring owner notice and admin attention.

### Administration tests

- AD6 warning persists while SMTP is unconfigured;
- credential-unreadable is visibly distinct from unconfigured;
- retrying/failed counts and oldest age are accurate;
- zero state recedes without hiding SMTP configuration risk;
- recipient record groups repeated failures correctly;
- admin-only authorization and response redaction;
- English/Arabic labels, responsive layout, and no mobile overflow.

### Repository validation

Run focused API/portal tests first, then API and portal type checks, translation guard, complete relevant suites, and one browser pass covering AD6 warning/count, recipient failure detail, settings masking, and test-email error display. If a schema migration is used, additionally run the authorized schema-integrity, baseline-regeneration, and fresh-empty-database proof before any acceptance claim.

## 6. N1d product-owner acceptance gate

N1d remains open after implementation and automated verification. Only the product owner can close it:

1. Configure real SMTP through the admin dashboard.
2. Use Send test email and confirm the message arrives in a real inbox.
3. Trigger one real persisted notification end to end, preferably a Portal Help reply.
4. Confirm that second message arrives in the intended real inbox.
5. Record provider/inbox evidence without publishing credentials or private message contents.

A mocked send, a delivered database status, a successful API response, or a provider call without inbox arrival does not close N1d.

## 7. Deliverables for implementation review

1. Typed email outcome and sanitized logging tests.
2. Correct dispatcher persistence/retry behavior.
3. All business email producers routed through the persisted service except Send test email.
4. Sixteen-row X3 required-vs-actual channel report after implementation.
5. AD6 SMTP warning and notification failure attention counts.
6. Admin recipient failure summary/drill-down.
7. Encrypted smtp_pass with external key and settings allowlist.
8. Credential audit report confirming smtp_pass is the only DB-backed credential, or listing and encrypting any newly discovered credential.
9. Migration/baseline/empty-database evidence only if a schema change is used.
10. Product-owner N1d handoff explicitly left open pending real-inbox confirmation.
