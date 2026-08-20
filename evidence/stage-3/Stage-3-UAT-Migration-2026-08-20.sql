-- Madain Village HOA Portal — Stage 3 migration source (revision 3)
-- Bundle date: 2026-08-20

-- ==================================================================
-- SOURCE: lib/db/migrations/0018_stage3_facility_operating_hours.sql
-- ==================================================================
-- Stage 3 / F6: the HOA's authoritative booking-day hours.
-- Sunday–Wednesday: 10:00–23:00. Thursday–Saturday: 10:00–01:00 next day.
-- The extended close-hour notation is storage-only; 25 represents 01:00 next day.
ALTER TABLE facilities
  ALTER COLUMN weekday_open_hour SET DEFAULT 10,
  ALTER COLUMN weekday_close_hour SET DEFAULT 23,
  ALTER COLUMN weekend_open_hour SET DEFAULT 10,
  ALTER COLUMN weekend_close_hour SET DEFAULT 25;

UPDATE facilities
SET
  weekday_open_hour = 10,
  weekday_close_hour = 23,
  weekend_open_hour = 10,
  weekend_close_hour = 25,
  updated_at = NOW()
WHERE
  weekday_open_hour <> 10
  OR weekday_close_hour <> 23
  OR weekend_open_hour <> 10
  OR weekend_close_hour <> 25;

-- ==================================================================
-- SOURCE: lib/db/migrations/0019_stage3_facility_cleaning_buffer.sql
-- ==================================================================
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS cleaning_buffer_minutes INTEGER NOT NULL DEFAULT 15;

-- ==================================================================
-- SOURCE: lib/db/migrations/0020_stage3_active_booking_start_uniqueness.sql
-- ==================================================================
-- Stage 3 / F2b + F3: every bookable facility is exclusive use. This index
-- prevents a second active booking at the same facility and service start
-- instant; cancelled bookings remain excluded so a released slot can be booked
-- again. max_capacity describes attendees within one booking, never concurrent
-- bookings. If a capacity-based facility is introduced later, revisit BOTH this
-- index and the buffered-overlap admission rule in the booking route.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_facility_start_unique
  ON bookings (facility_id, start_time)
  WHERE status <> 'cancelled';

-- ==================================================================
-- SOURCE: lib/db/migrations/0021_stage3_booking_config_normalization_audit.sql
-- ==================================================================
-- Stage 3 / F5: normalize legacy slot configuration without deleting future
-- bookings. Every changed facility and every future booking outside corrected
-- operating hours is retained in an audit table for HOA review.
CREATE TABLE IF NOT EXISTS facility_booking_config_normalization_audit (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES facilities(id),
  previous_slot_interval_minutes INTEGER NOT NULL,
  previous_min_duration_minutes INTEGER NOT NULL,
  previous_max_duration_minutes INTEGER NOT NULL,
  normalized_slot_interval_minutes INTEGER NOT NULL,
  normalized_min_duration_minutes INTEGER NOT NULL,
  normalized_max_duration_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS facility_operating_hours_conflicts (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES facilities(id),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (booking_id)
);

WITH normalized AS (
  SELECT
    id,
    slot_interval_minutes,
    min_duration_minutes,
    max_duration_minutes,
    GREATEST(30, CEIL(slot_interval_minutes / 30.0)::INTEGER * 30) AS normalized_slot,
    GREATEST(
      GREATEST(30, CEIL(slot_interval_minutes / 30.0)::INTEGER * 30),
      CEIL(min_duration_minutes / 30.0)::INTEGER * 30
    ) AS normalized_min,
    GREATEST(
      GREATEST(
        GREATEST(30, CEIL(slot_interval_minutes / 30.0)::INTEGER * 30),
        CEIL(min_duration_minutes / 30.0)::INTEGER * 30
      ),
      CEIL(max_duration_minutes / 30.0)::INTEGER * 30
    ) AS normalized_max
  FROM facilities
),
audited AS (
  INSERT INTO facility_booking_config_normalization_audit (
    facility_id,
    previous_slot_interval_minutes,
    previous_min_duration_minutes,
    previous_max_duration_minutes,
    normalized_slot_interval_minutes,
    normalized_min_duration_minutes,
    normalized_max_duration_minutes
  )
  SELECT
    id,
    slot_interval_minutes,
    min_duration_minutes,
    max_duration_minutes,
    normalized_slot,
    normalized_min,
    normalized_max
  FROM normalized
  WHERE slot_interval_minutes <> normalized_slot
     OR min_duration_minutes <> normalized_min
     OR max_duration_minutes <> normalized_max
  RETURNING facility_id
)
UPDATE facilities AS facility
SET
  slot_interval_minutes = normalized.normalized_slot,
  min_duration_minutes = normalized.normalized_min,
  max_duration_minutes = normalized.normalized_max,
  updated_at = NOW()
FROM normalized
WHERE facility.id = normalized.id
  AND (
    facility.slot_interval_minutes <> normalized.normalized_slot
    OR facility.min_duration_minutes <> normalized.normalized_min
    OR facility.max_duration_minutes <> normalized.normalized_max
  );

WITH booking_service_days AS (
  SELECT
    booking.id,
    booking.facility_id,
    booking.start_time,
    booking.end_time,
    CASE
      WHEN (booking.start_time AT TIME ZONE 'Asia/Riyadh')::time < TIME '10:00'
        THEN (booking.start_time AT TIME ZONE 'Asia/Riyadh')::date - 1
      ELSE (booking.start_time AT TIME ZONE 'Asia/Riyadh')::date
    END AS service_date
  FROM bookings AS booking
  WHERE booking.status <> 'cancelled'
    AND booking.start_time > NOW()
),
corrected_windows AS (
  SELECT
    id,
    facility_id,
    start_time,
    end_time,
    (service_date + INTERVAL '10 hours') AT TIME ZONE 'Asia/Riyadh' AS corrected_open_at,
    (
      service_date
      + CASE
          WHEN EXTRACT(DOW FROM service_date) IN (4, 5, 6) THEN INTERVAL '25 hours'
          ELSE INTERVAL '23 hours'
        END
    ) AT TIME ZONE 'Asia/Riyadh' AS corrected_close_at
  FROM booking_service_days
)
INSERT INTO facility_operating_hours_conflicts (facility_id, booking_id, reason)
SELECT
  facility_id,
  id,
  'Future booking falls outside the corrected F6 operating-hours window.'
FROM corrected_windows
WHERE start_time < corrected_open_at
   OR end_time > corrected_close_at
ON CONFLICT (booking_id) DO NOTHING;

-- ==================================================================
-- SOURCE: lib/db/migrations/0022_stage3_booking_concurrency_note.sql
-- ==================================================================
-- Stage 3 / F2-F3: race-safe booking admission.
--
-- The buffered-overlap rule (a new reservation conflicts with any active
-- reservation whose interval, extended by the facility's cleaning buffer on
-- both sides, overlaps the candidate) spans DIFFERENT grid starts. The
-- exact-start unique index in migration 0020 therefore cannot make admission
-- race-safe on its own: two concurrent requests for e.g. 10:00-11:00 and
-- 10:30-11:30 have different start_time values, both pass a read-before-insert
-- check, and both persist.
--
-- The application layer closes this window by serializing all booking creations
-- for a facility with a transaction-scoped advisory lock
-- (pg_advisory_xact_lock(4201, facility_id) in artifacts/api-server/src/routes/
-- bookings.ts) and re-running the buffered-overlap check inside the same
-- transaction before inserting. The lock is released automatically on commit
-- or rollback. The exact-start unique index from migration 0020 remains as
-- defense-in-depth for any path that bypasses the booking route.
--
-- This migration is intentionally a no-op at the schema level: advisory locks
-- are runtime primitives, not persisted objects. It exists to document, in the
-- migration history, why the exact-start unique index alone is sufficient at
-- the schema level and where the atomic admission guarantee actually lives.
SELECT 1;


-- ==================================================================
-- SOURCE: lib/db/migrations/0023_stage3_facility_buffer_constraint.sql
-- ==================================================================
-- Stage 3 / F1 correction: cleaning buffers are whole, non-negative minutes.
-- They are deliberately exempt from the 30-minute interval/duration rule:
-- the 15-minute default is required by F2 availability examples.
ALTER TABLE facilities
  ADD CONSTRAINT facilities_cleaning_buffer_minutes_non_negative
  CHECK (cleaning_buffer_minutes >= 0);

-- ==================================================================
-- SOURCE: lib/db/migrations/0024_stage3_vehicle_e1_e5.sql
-- ==================================================================
-- Stage 3 E1-E5: vehicle-specific improvements
--
-- E3/E4: advisory lock namespace for per-unit parking-entitlement serialisation
--        (no DDL needed — namespace is a pure application constant)
--
-- E5: controlled rejection reason + reviewer tracking on vehicles
--     All ADD COLUMN statements use IF NOT EXISTS — idempotent.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS rejection_reason  text,
  ADD COLUMN IF NOT EXISTS reviewed_by_id    integer;

CREATE INDEX IF NOT EXISTS idx_vehicles_reviewed_by_id
  ON vehicles (reviewed_by_id);


-- ==================================================================
-- SOURCE: lib/db/migrations/0025_stage3_renovation_scope_multiselect.sql
-- ==================================================================
-- Stage 3 renovation permits store the selected scope categories as a
-- JSON-encoded text array. Preserve historic enum values as their text form so
-- existing scalar records remain readable while new multi-select submissions can
-- persist values such as '["major_interior_upgrades","flooring"]'.
ALTER TABLE permits
  ALTER COLUMN renovation_scope TYPE text
  USING renovation_scope::text;

