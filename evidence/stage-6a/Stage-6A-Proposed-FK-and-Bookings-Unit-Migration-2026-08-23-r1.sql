-- Stage 6A — PROPOSED ONLY. REVIEW REQUIRED.
-- This SQL is evidence for review; it has not been executed in any environment.
-- Do not apply until:
--   1) the Stage 6A build plan is approved;
--   2) a development database backup and fixture counts have been captured;
--   3) Batch 3 booking write/read changes are merged and verified; and
--   4) the current live schema has been checked against this SQL.
--
-- Policy:
-- * SET NULL constraints follow: inspect -> null orphans -> DROP NOT NULL -> add FK.
-- * RESTRICT constraints fail on any orphan. They do not silently destroy linkage.
-- * CASCADE constraints delete only meaningless push-token/preference rows.
-- * The migration is intentionally split into independently reviewable batches.

-- ============================================================================
-- Batch 1 — current nullable columns, RESTRICT relationships, and CASCADE rows
-- ============================================================================
BEGIN;

-- CASCADE children have no useful identity without a user.
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

-- Nullable SET NULL references: inspect, repair only existing orphans, add FK.
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

-- RESTRICT relationships: fail if an existing orphan is found.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM residents AS child
    WHERE child.unit_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: residents.unit_id has orphans'; END IF;

  IF EXISTS (
    SELECT 1 FROM vehicles AS child
    WHERE child.unit_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: vehicles.unit_id has orphans'; END IF;

  IF EXISTS (
    SELECT 1 FROM permits AS child
    WHERE child.unit_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: permits.unit_id has orphans'; END IF;

  IF EXISTS (
    SELECT 1 FROM unit_verifications AS child
    WHERE NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: unit_verifications.unit_id has orphans'; END IF;

  IF EXISTS (
    SELECT 1 FROM bookings AS child
    WHERE NOT EXISTS (SELECT 1 FROM facilities AS parent WHERE parent.id = child.facility_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 1 blocked: bookings.facility_id has orphans'; END IF;
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
-- Batch 2 — SET NULL columns that are currently NOT NULL
-- Four-step template: inspect -> null orphans -> DROP NOT NULL -> add FK.
-- ============================================================================
BEGIN;

-- permits.user_id
SELECT child.id AS orphan_id
FROM permits AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE permits AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE permits ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE permits ADD CONSTRAINT permits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- vehicles.user_id
SELECT child.id AS orphan_id
FROM vehicles AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE vehicles AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE vehicles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- unit_verifications.user_id
SELECT child.id AS orphan_id
FROM unit_verifications AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE unit_verifications AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE unit_verifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE unit_verifications ADD CONSTRAINT unit_verifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- unit_verification_owner_id_attempts.user_id
-- Structural pre-step (review gate R5): user_id is currently part of the
-- composite primary key and is therefore inherently NOT NULL. Preserve the
-- existing “one counter per live user + unit” rule with a surrogate PK plus a
-- partial unique index before the normal SET NULL sequence.
ALTER TABLE unit_verification_owner_id_attempts ADD COLUMN id BIGSERIAL;
UPDATE unit_verification_owner_id_attempts SET id = DEFAULT WHERE id IS NULL;
ALTER TABLE unit_verification_owner_id_attempts ALTER COLUMN id SET NOT NULL;
ALTER TABLE unit_verification_owner_id_attempts
  DROP CONSTRAINT unit_verification_owner_id_attempts_pkey;
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
ALTER TABLE unit_verification_owner_id_attempts ADD CONSTRAINT
  unit_verification_owner_id_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- waha_pass_applications.unit_id is RESTRICT: inspect and fail, never null it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM waha_pass_applications AS child
    WHERE NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 2 blocked: waha_pass_applications.unit_id has orphans'; END IF;
END $$;
ALTER TABLE waha_pass_applications ADD CONSTRAINT waha_pass_applications_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;

-- waha_pass_applications.applicant_user_id
SELECT child.id AS orphan_id
FROM waha_pass_applications AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.applicant_user_id);
UPDATE waha_pass_applications AS child SET applicant_user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.applicant_user_id);
ALTER TABLE waha_pass_applications ALTER COLUMN applicant_user_id DROP NOT NULL;
ALTER TABLE waha_pass_applications ADD CONSTRAINT waha_pass_applications_applicant_user_id_fkey
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Batch 3 — bookings.unit_id durable household anchor, then bookings.user_id
-- Do not run until every booking write sets unit_id and D2 §6.4 paths are fixed.
-- ============================================================================
BEGIN;

ALTER TABLE bookings ADD COLUMN unit_id INTEGER;

-- Historic records whose user was already deleted remain NULL by design.
UPDATE bookings AS booking
SET unit_id = user_row.unit_id
FROM users AS user_row
WHERE booking.user_id = user_row.id
  AND booking.unit_id IS NULL
  AND user_row.unit_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings AS child
    WHERE child.unit_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM units AS parent WHERE parent.id = child.unit_id)
  ) THEN RAISE EXCEPTION 'Stage 6A Batch 3 blocked: bookings.unit_id has orphans'; END IF;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
CREATE INDEX idx_bookings_unit_id ON bookings(unit_id);

-- Four-step template for bookings.user_id.
SELECT child.id AS orphan_id
FROM bookings AS child
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
UPDATE bookings AS child SET user_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM users AS parent WHERE parent.id = child.user_id);
ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================================
-- Post-migration verification queries — run and preserve output as evidence.
-- ============================================================================
SELECT 'residents.unit_id' AS relationship, count(*) AS orphan_count
FROM residents child LEFT JOIN units parent ON parent.id = child.unit_id
WHERE child.unit_id IS NOT NULL AND parent.id IS NULL
UNION ALL
SELECT 'vehicles.unit_id', count(*) FROM vehicles child LEFT JOIN units parent ON parent.id = child.unit_id
WHERE child.unit_id IS NOT NULL AND parent.id IS NULL
UNION ALL
SELECT 'permits.unit_id', count(*) FROM permits child LEFT JOIN units parent ON parent.id = child.unit_id
WHERE child.unit_id IS NOT NULL AND parent.id IS NULL
UNION ALL
SELECT 'bookings.facility_id', count(*) FROM bookings child LEFT JOIN facilities parent ON parent.id = child.facility_id
WHERE parent.id IS NULL
UNION ALL
SELECT 'bookings.unit_id', count(*) FROM bookings child LEFT JOIN units parent ON parent.id = child.unit_id
WHERE child.unit_id IS NOT NULL AND parent.id IS NULL;

-- End of proposed SQL. Executing a migration before the build plan, the
-- rate-limit key change, and the Day Pass/payment policy are reviewed is forbidden.
