#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\set ON_ERROR_STOP on

CREATE TEMP TABLE expected_h4_fk (
  table_name text NOT NULL,
  constraint_name text NOT NULL,
  constraint_definition text NOT NULL
);

INSERT INTO expected_h4_fk VALUES
  ('push_tokens', 'push_tokens_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('notification_preferences', 'notification_preferences_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('units', 'units_verified_owner_id_fkey', 'FOREIGN KEY (verified_owner_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('units', 'units_verified_tenant_id_fkey', 'FOREIGN KEY (verified_tenant_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('residents', 'residents_linked_user_id_fkey', 'FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('residents', 'residents_registered_by_id_fkey', 'FOREIGN KEY (registered_by_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('waha_pass_credentials', 'waha_pass_credentials_held_by_user_id_fkey', 'FOREIGN KEY (held_by_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('residents', 'residents_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('vehicles', 'vehicles_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('permits', 'permits_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('unit_verifications', 'unit_verifications_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('bookings', 'bookings_facility_id_fkey', 'FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT'),
  ('permits', 'permits_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('vehicles', 'vehicles_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('unit_verifications', 'unit_verifications_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('unit_verification_owner_id_attempts', 'unit_verification_owner_id_attempts_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('waha_pass_applications', 'waha_pass_applications_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('waha_pass_applications', 'waha_pass_applications_applicant_user_id_fkey', 'FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('payment_attempts', 'payment_attempts_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('waha_guest_day_passes', 'waha_guest_day_passes_purchased_by_user_id_fkey', 'FOREIGN KEY (purchased_by_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('bookings', 'bookings_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT'),
  ('bookings', 'bookings_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('external_identity_deletion_jobs', 'external_identity_deletion_jobs_operation_fkey', 'FOREIGN KEY (operation_id) REFERENCES release_operations(id) ON DELETE RESTRICT');

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM expected_h4_fk expected
  LEFT JOIN pg_constraint actual
    ON actual.conname = expected.constraint_name
   AND actual.conrelid = format('public.%I', expected.table_name)::regclass
  WHERE actual.oid IS NULL
     OR pg_get_constraintdef(actual.oid) <> expected.constraint_definition;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'H4 FK catalog assertion failed (% mismatch(es))', mismatch_count;
  END IF;
END $$;

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('users'::text, 'users_staff_unitless_check'::text),
    ('units'::text, 'units_system_unit_identity_check'::text)
  ) AS expected(table_name, constraint_name)
  LEFT JOIN pg_constraint actual
    ON actual.conname = expected.constraint_name
   AND actual.conrelid = format('public.%I', expected.table_name)::regclass
   AND actual.contype = 'c'
  WHERE actual.oid IS NULL;

  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'H4 raw CHECK catalog assertion failed (% missing)', missing_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'units'
      AND indexname = 'units_one_system_unit'
      AND indexdef LIKE '%UNIQUE INDEX units_one_system_unit%'
      AND indexdef LIKE '%WHERE is_system%'
  ) THEN
    RAISE EXCEPTION 'H4 raw partial unique-index assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'protect_hoa_common_system_unit'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'H4 raw trigger-function assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'protect_hoa_common_system_unit_trigger'
      AND tgrelid = 'public.units'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'H4 raw trigger assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'reject_occupancy_append_only_mutation'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'occupancy append-only trigger-function assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_occupancy_correction_operations_immutable'
      AND tgrelid = 'public.occupancy_correction_operations'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'occupancy correction append-only trigger assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_occupancy_correction_operation_supplements_immutable'
      AND tgrelid = 'public.occupancy_correction_operation_supplements'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'occupancy correction supplement append-only trigger assertion failed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc
    WHERE proname IN (
      'enforce_occupancy_track_consistency',
      'enforce_occupancy_track_from_resident',
      'enforce_occupancy_track_from_unit'
    )
      AND pg_function_is_visible(oid)
  ) <> 3 THEN
    RAISE EXCEPTION 'occupancy track constraint trigger-function assertion failed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgname IN (
      'trg_residents_occupancy_track_consistency',
      'trg_units_occupancy_track_consistency'
    )
      AND NOT tgisinternal
  ) <> 2 THEN
    RAISE EXCEPTION 'occupancy track constraint trigger assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_units_occupancy_track_consistency'
      AND tgrelid = 'public.units'::regclass
      AND pg_get_triggerdef(oid) LIKE '%AFTER INSERT OR UPDATE%'
      AND pg_get_triggerdef(oid) LIKE '%DEFERRABLE INITIALLY DEFERRED%'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'occupancy unit INSERT constraint trigger assertion failed';
  END IF;
END $$;

SELECT 'H4 schema protection catalog assertions passed' AS result;
SQL