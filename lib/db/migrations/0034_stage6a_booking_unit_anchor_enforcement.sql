-- Stage 6A corrective enforcement. Run only after every existing booking has
-- a truthful unit anchor; this migration refuses to invent or silently retain
-- unattributable historical bookings.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bookings WHERE unit_id IS NULL) THEN
    RAISE EXCEPTION
      'Stage 6A booking-anchor enforcement blocked: resolve every bookings.unit_id NULL row before applying';
  END IF;
END $$;

ALTER TABLE bookings ALTER COLUMN unit_id SET NOT NULL;

-- release_operations is append-only evidence of completed releases. A failed
-- operation rolls back and therefore has no audit row or alternate outcome.
COMMENT ON COLUMN release_operations.outcome IS
  'Completed operations only: failed releases roll back and are represented by no row.';

COMMIT;