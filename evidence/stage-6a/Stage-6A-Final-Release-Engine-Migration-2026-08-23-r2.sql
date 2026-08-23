-- Stage 6A — final reviewed migration.
-- Apply only after the matching final evidence copy is published and verified.
-- The batches are intentionally transactional and ordered. Stop on any failure.

-- ============================================================================
-- Release audit/outbox (non-destructive prerequisite)
-- ============================================================================
BEGIN;

CREATE TABLE release_operations (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tenant', 'owner')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('move_out_form', 'tenancy_expiry', 'ownership_change')),
  trigger_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  subject_user_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'released' CHECK (outcome = 'released'),
  affected_ids JSONB NOT NULL,
  effect_summary JSONB NOT NULL,
  postcondition_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX release_operations_idempotency_key_unique
  ON release_operations (idempotency_key);
CREATE INDEX idx_release_operations_unit_created
  ON release_operations (unit_id, created_at);

CREATE TABLE external_identity_deletion_jobs (
  id SERIAL PRIMARY KEY,
  operation_id INTEGER NOT NULL,
  clerk_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_identity_deletion_jobs_operation_fkey
    FOREIGN KEY (operation_id) REFERENCES release_operations(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX external_identity_deletion_jobs_operation_unique
  ON external_identity_deletion_jobs (operation_id);
CREATE INDEX idx_external_identity_deletion_jobs_due
  ON external_identity_deletion_jobs (status, next_attempt_at);

COMMIT;

-- ============================================================================
-- Batch 1 — current nullable columns, RESTRICT relationships, and CASCADE rows
-- ============================================================================
BEGIN;

DELETE FROM push_tokens AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
DELETE FROM notification_preferences AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);

ALTER TABLE push_tokens
  ADD CONSTRAINT push_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

UPDATE units AS child SET verified_owner_id = NULL
WHERE verified_owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.verified_owner_id);
ALTER TABLE units ADD CONSTRAINT units_verified_owner_id_fkey
  FOREIGN KEY (verified_owner_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE units AS child SET verified_tenant_id = NULL
WHERE verified_tenant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.verified_tenant_id);
ALTER TABLE units ADD CONSTRAINT units_verified_tenant_id_fkey
  FOREIGN KEY (verified_tenant_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE residents AS child SET linked_user_id = NULL
WHERE linked_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.linked_user_id);
ALTER TABLE residents ADD CONSTRAINT residents_linked_user_id_fkey
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE residents AS child SET registered_by_id = NULL
WHERE registered_by_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.registered_by_id);
ALTER TABLE residents ADD CONSTRAINT residents_registered_by_id_fkey
  FOREIGN KEY (registered_by_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE waha_pass_credentials AS child SET held_by_user_id = NULL
WHERE held_by_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.held_by_user_id);
ALTER TABLE waha_pass_credentials ADD CONSTRAINT waha_pass_credentials_held_by_user_id_fkey
  FOREIGN KEY (held_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM residents AS child WHERE child.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: residents.unit_id has orphans'; END IF;
  IF EXISTS (SELECT 1 FROM vehicles AS child WHERE child.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: vehicles.unit_id has orphans'; END IF;
  IF EXISTS (SELECT 1 FROM permits AS child WHERE child.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: permits.unit_id has orphans'; END IF;
  IF EXISTS (SELECT 1 FROM unit_verifications AS child WHERE NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: unit_verifications.unit_id has orphans'; END IF;
  IF EXISTS (SELECT 1 FROM bookings AS child WHERE NOT EXISTS (SELECT 1 FROM facilities AS parent WHERE parent.id = child.facility_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: bookings.facility_id has orphans'; END IF;
END $$;

ALTER TABLE residents ADD CONSTRAINT residents_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
ALTER TABLE permits ADD CONSTRAINT permits_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
ALTER TABLE unit_verifications ADD CONSTRAINT unit_verifications_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD CONSTRAINT bookings_facility_id_fkey
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT;

COMMIT;

-- ============================================================================
-- Batch 2 — nullable user references and approved surrogate-key pre-step
-- ============================================================================
BEGIN;

SELECT child.id AS orphan_id FROM permits AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE permits AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE permits ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE permits ADD CONSTRAINT permits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

SELECT child.id AS orphan_id FROM vehicles AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE vehicles AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE vehicles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

SELECT child.id AS orphan_id FROM unit_verifications AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE unit_verifications AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE unit_verifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE unit_verifications ADD CONSTRAINT unit_verifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE unit_verification_owner_id_attempts ADD COLUMN id BIGSERIAL;
UPDATE unit_verification_owner_id_attempts SET id = DEFAULT WHERE id IS NULL;
ALTER TABLE unit_verification_owner_id_attempts ALTER COLUMN id SET NOT NULL;
ALTER TABLE unit_verification_owner_id_attempts
  DROP CONSTRAINT unit_verification_owner_id_attempts_user_id_unit_key_pk;
ALTER TABLE unit_verification_owner_id_attempts
  ADD CONSTRAINT unit_verification_owner_id_attempts_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX unit_verification_owner_id_attempts_live_user_unit_unique
  ON unit_verification_owner_id_attempts(user_id, unit_key)
  WHERE user_id IS NOT NULL;
SELECT child.user_id AS orphan_user_id, child.unit_key
FROM unit_verification_owner_id_attempts AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE unit_verification_owner_id_attempts ALTER COLUMN user_id DROP NOT NULL;
UPDATE unit_verification_owner_id_attempts AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE unit_verification_owner_id_attempts ADD CONSTRAINT unit_verification_owner_id_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM waha_pass_applications AS child WHERE NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 2 blocked: waha_pass_applications.unit_id has orphans'; END IF;
END $$;
ALTER TABLE waha_pass_applications ADD CONSTRAINT waha_pass_applications_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;

SELECT child.id AS orphan_id FROM waha_pass_applications AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.applicant_user_id);
UPDATE waha_pass_applications AS child SET applicant_user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.applicant_user_id);
ALTER TABLE waha_pass_applications ALTER COLUMN applicant_user_id DROP NOT NULL;
ALTER TABLE waha_pass_applications ADD CONSTRAINT waha_pass_applications_applicant_user_id_fkey
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- R2: retain financial records and revoked Day Pass history; only remove identity links.
SELECT child.id AS orphan_id FROM payment_attempts AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE payment_attempts AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE payment_attempts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

SELECT child.id AS orphan_id FROM waha_guest_day_passes AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.purchased_by_user_id);
UPDATE waha_guest_day_passes AS child SET purchased_by_user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.purchased_by_user_id);
ALTER TABLE waha_guest_day_passes ALTER COLUMN purchased_by_user_id DROP NOT NULL;
ALTER TABLE waha_guest_day_passes ADD CONSTRAINT waha_guest_day_passes_purchased_by_user_id_fkey
  FOREIGN KEY (purchased_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Batch 3 — bookings.unit_id durable anchor, then nullable bookings.user_id
-- ============================================================================
BEGIN;

ALTER TABLE bookings ADD COLUMN unit_id INTEGER;
UPDATE bookings AS booking
SET unit_id = user_row.unit_id
FROM users AS user_row
WHERE booking.user_id = user_row.id
  AND booking.unit_id IS NULL
  AND user_row.unit_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bookings AS child WHERE child.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id))
    THEN RAISE EXCEPTION 'Stage 6A Batch 3 blocked: bookings.unit_id has orphans'; END IF;
END $$;
ALTER TABLE bookings ADD CONSTRAINT bookings_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
CREATE INDEX idx_bookings_unit_id ON bookings(unit_id);

SELECT child.id AS orphan_id FROM bookings AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE bookings AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;