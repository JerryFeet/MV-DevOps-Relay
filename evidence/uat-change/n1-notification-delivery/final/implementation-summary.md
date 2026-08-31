# N1 Notification Delivery — Implementation Summary

Date: 2026-08-31

## Delivered

- Preserved the persisted notification-event architecture and 30-second dispatcher.
- Added a closed server-side hoa_settings allowlist and explicit smtp_pass secret classification.
- Added versioned AES-256-GCM application encryption for smtp_pass in the existing text column; no schema migration was required.
- Encryption key material remains outside the database, using SETTINGS_CREDENTIAL_ENCRYPTION_KEY when set and SESSION_SECRET as the approved existing fallback.
- Legacy plaintext or corrupt stored SMTP credentials fail closed and never fall back silently.
- sendEmail now returns typed outcomes for delivered, unconfigured SMTP, unreadable configuration, missing recipient, and provider send failure.
- Dispatcher marks delivered only on true delivery, otherwise persists retrying/failed state under the existing retry policy.
- Failure logs contain event/channel/attempt and recipient domain only, not credentials or full recipient addresses.
- Normalized X3 events 1–16 to persisted email and push intents for required recipients; events 9 and 12 remain mandatory/non-suppressible.
- Added AD6 SMTP warning and retrying/failed delivery counts.
- Added admin-only per-recipient delivery-failure visibility through GET /api/users/:id.

## Freeze compliance

No deployment, production database change, db:push, push --force, drizzle-kit migrate, schema edit, or migration was performed.
