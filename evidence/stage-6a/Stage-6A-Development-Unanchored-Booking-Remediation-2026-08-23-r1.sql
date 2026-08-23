-- Development-only, user-approved remediation for the two unpaid test bookings
-- that predate Stage 6A and have neither a truthful unit anchor nor a unit-linked
-- account. This script is exact-count guarded: it refuses to delete any changed
-- or additional record.
BEGIN;

CREATE TEMP TABLE remediation_counts (
  phase TEXT PRIMARY KEY,
  matching_rows INTEGER NOT NULL,
  all_unanchored_rows INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO remediation_counts
SELECT
  'before',
  count(*) FILTER (
    WHERE id IN (34, 41)
      AND user_id = 6
      AND unit_id IS NULL
      AND payment_status = 'unpaid'
  )::INTEGER,
  count(*) FILTER (WHERE unit_id IS NULL)::INTEGER
FROM bookings;

DO $$
BEGIN
  IF (SELECT matching_rows FROM remediation_counts WHERE phase = 'before') <> 2
     OR (SELECT all_unanchored_rows FROM remediation_counts WHERE phase = 'before') <> 2 THEN
    RAISE EXCEPTION
      'Stage 6A development remediation blocked: expected exactly the two approved unpaid unanchored test bookings';
  END IF;
END $$;

DELETE FROM bookings
WHERE id IN (34, 41)
  AND user_id = 6
  AND unit_id IS NULL
  AND payment_status = 'unpaid';

INSERT INTO remediation_counts
SELECT
  'after',
  0,
  count(*) FILTER (WHERE unit_id IS NULL)::INTEGER
FROM bookings;

SELECT phase, matching_rows, all_unanchored_rows
FROM remediation_counts
ORDER BY phase;

COMMIT;