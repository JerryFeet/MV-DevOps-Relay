-- Stage 6A common booking anchor and staff/resident boundary.
-- This migration is idempotent so development rebuilds preserve one canonical
-- system unit rather than creating an orphan or migration bucket.
BEGIN;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Correct historical staff test data before enforcing the invariant. Bookings
-- retain their own unit_id, so clearing staff linkage does not erase history.
UPDATE users
SET unit_id = NULL,
    unit_number = NULL
WHERE role IN ('admin', 'guard')
  AND (unit_id IS NOT NULL OR unit_number IS NOT NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM units
    WHERE normalised_unit_number = 'HOACOMMON'
      AND (building <> 'HOA' OR unit_number <> 'COMMON')
  ) THEN
    RAISE EXCEPTION 'Cannot create HOA COMMON system unit: HOACOMMON is already used by another unit';
  END IF;

  INSERT INTO units (building, unit_number, occupant_type, is_system)
  VALUES ('HOA', 'COMMON', 'vacant', true)
  ON CONFLICT (normalised_unit_number) DO UPDATE
    SET is_system = true,
        occupant_type = 'vacant',
        verified_owner_id = NULL,
        verified_tenant_id = NULL,
        pre_approved_claim_id = NULL;

  IF (SELECT count(*) FROM units WHERE is_system = true) <> 1 THEN
    RAISE EXCEPTION 'Stage 6A requires exactly one system unit';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_staff_unitless_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_staff_unitless_check
      CHECK (role NOT IN ('admin', 'guard') OR unit_id IS NULL);
  END IF;
END $$;

COMMIT;