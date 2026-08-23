-- Stage 6A corrective upgrade: protect the existing HOA COMMON anchor and
-- close both legacy/display and relational staff-linkage paths.
BEGIN;

UPDATE users
SET unit_id = NULL,
    unit_number = NULL
WHERE role IN ('admin', 'guard')
  AND (unit_id IS NOT NULL OR unit_number IS NOT NULL);

DO $$
BEGIN
  IF (SELECT count(*) FROM units WHERE is_system) <> 1
    OR (
      SELECT count(*)
      FROM units
      WHERE is_system
        AND building = 'HOA'
        AND unit_number = 'COMMON'
        AND normalised_unit_number = 'HOACOMMON'
    ) <> 1
  THEN
    RAISE EXCEPTION
      'Stage 6A common-unit integrity upgrade requires exactly one canonical HOA COMMON system unit';
  END IF;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_staff_unitless_check;

ALTER TABLE users
  ADD CONSTRAINT users_staff_unitless_check
  CHECK (
    role NOT IN ('admin', 'guard')
    OR (unit_id IS NULL AND unit_number IS NULL)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_system_unit_identity_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_system_unit_identity_check
      CHECK (
        NOT is_system
        OR (
          building = 'HOA'
          AND unit_number = 'COMMON'
          AND normalised_unit_number = 'HOACOMMON'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS units_one_system_unit
  ON units ((is_system))
  WHERE is_system;

CREATE OR REPLACE FUNCTION protect_hoa_common_system_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'The HOA COMMON system unit cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_system AND (
    NEW.is_system IS DISTINCT FROM true
    OR NEW.building <> 'HOA'
    OR NEW.unit_number <> 'COMMON'
    OR NEW.normalised_unit_number <> 'HOACOMMON'
  ) THEN
    RAISE EXCEPTION 'The HOA COMMON system unit cannot be demoted or renamed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_hoa_common_system_unit_trigger ON units;
CREATE TRIGGER protect_hoa_common_system_unit_trigger
  BEFORE UPDATE OR DELETE ON units
  FOR EACH ROW
  EXECUTE FUNCTION protect_hoa_common_system_unit();

COMMIT;