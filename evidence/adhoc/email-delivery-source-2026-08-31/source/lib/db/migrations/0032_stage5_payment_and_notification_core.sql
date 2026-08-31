-- Stage 5: payment attempts, facility slot holds, and durable notification outbox.
-- Existing paid records remain auditable; new payable services use payment_attempts.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE booking_payment_status ADD VALUE IF NOT EXISTS 'not_required';
ALTER TYPE booking_payment_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE booking_payment_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_exemption_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_hold_expires_at TIMESTAMPTZ;

ALTER TABLE waha_guest_day_passes
  ADD COLUMN IF NOT EXISTS guest_count INTEGER,
  ADD COLUMN IF NOT EXISTS payment_attempt_id INTEGER,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revocation_reason TEXT;
UPDATE waha_guest_day_passes
  SET guest_count = extra_guest_count
  WHERE guest_count IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS waha_guest_day_passes_verification_token_unique
  ON waha_guest_day_passes (verification_token)
  WHERE verification_token IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE payment_attempt_status AS ENUM ('pending', 'confirmed', 'failed', 'cancelled', 'expired', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_attempts (
  id SERIAL PRIMARY KEY,
  purpose TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  unit_id INTEGER,
  provider TEXT NOT NULL,
  provider_charge_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  status payment_attempt_status NOT NULL DEFAULT 'pending',
  provider_callback_id TEXT,
  payment_method TEXT,
  confirmed_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_charge_unique
  ON payment_attempts (provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_callback_unique
  ON payment_attempts (provider_callback_id)
  WHERE provider_callback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_subject ON payment_attempts (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_pending ON payment_attempts (status, created_at);

CREATE TABLE IF NOT EXISTS notification_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  recipient_user_id INTEGER,
  recipient_email TEXT,
  channel TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ar',
  payload TEXT NOT NULL,
  preference_policy TEXT NOT NULL DEFAULT 'decision',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_delivery_unique
  ON notification_events (event_type, idempotency_key, recipient_user_id, channel);
CREATE INDEX IF NOT EXISTS idx_notification_events_due
  ON notification_events (status, next_attempt_at);

-- Stage 5 price registry defaults. Routes read these settings and never carry
-- their own numeric price fallback.
INSERT INTO hoa_settings (key, value)
VALUES
  ('guest_day_pass_price_sar', '30'),
  ('waha_replacement_price_sar', '100'),
  ('booking_payment_hold_minutes', '15')
ON CONFLICT (key) DO NOTHING;