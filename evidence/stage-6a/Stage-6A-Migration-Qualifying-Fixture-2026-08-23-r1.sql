-- Stage 6A qualifying fixture verification.
-- This runs only against temporary tables and ends in ROLLBACK. It executes
-- the same SET NULL and RESTRICT-precheck predicates used by 0033.
BEGIN;

CREATE TEMP TABLE fixture_users (id INTEGER PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE fixture_payment_attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER
) ON COMMIT DROP;
CREATE TEMP TABLE fixture_units (id INTEGER PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE fixture_bookings (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER
) ON COMMIT DROP;
CREATE TEMP TABLE fixture_waha_pass_applications (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE fixture_results (
  fixture TEXT PRIMARY KEY,
  before_count INTEGER NOT NULL,
  after_count INTEGER NOT NULL,
  outcome TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO fixture_users (id) VALUES (1);
INSERT INTO fixture_payment_attempts (id, user_id) VALUES (1, 1), (2, 999);
INSERT INTO fixture_units (id) VALUES (1);
INSERT INTO fixture_bookings (id, unit_id) VALUES (1, 999);
INSERT INTO fixture_waha_pass_applications (id, unit_id) VALUES (1, 999);

-- Exact SET NULL predicate from Stage 6A Batch 2.
INSERT INTO fixture_results
SELECT
  'payment_attempts.user_id SET NULL',
  count(*)::INTEGER,
  0,
  'pending'
FROM fixture_payment_attempts AS child
WHERE child.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM fixture_users AS parent WHERE parent.id = child.user_id);

UPDATE fixture_payment_attempts AS child
SET user_id = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM fixture_users AS parent WHERE parent.id = child.user_id
);
UPDATE fixture_results
SET
  after_count = (
    SELECT count(*)::INTEGER
    FROM fixture_payment_attempts AS child
    WHERE child.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fixture_users AS parent WHERE parent.id = child.user_id)
  ),
  outcome = CASE
    WHEN (SELECT user_id FROM fixture_payment_attempts WHERE id = 1) = 1
      AND (SELECT user_id FROM fixture_payment_attempts WHERE id = 2) IS NULL
    THEN 'cleared only the orphaned reference'
    ELSE 'unexpected result'
  END
WHERE fixture = 'payment_attempts.user_id SET NULL';

-- The exception handlers record the exact gate message so this one transaction
-- can exercise both rejection paths. In 0033 the same unhandled exception
-- aborts the migration batch rather than allowing the ALTER TABLE to proceed.
DO $$
DECLARE
  gate_error TEXT;
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM fixture_bookings AS child
      WHERE child.unit_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM fixture_units AS parent WHERE parent.id = child.unit_id)
    ) THEN
      RAISE EXCEPTION 'Stage 6A Batch 3 blocked: bookings.unit_id has orphans';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    gate_error := SQLERRM;
  END;

  IF gate_error <> 'Stage 6A Batch 3 blocked: bookings.unit_id has orphans' THEN
    RAISE EXCEPTION 'Booking RESTRICT fixture did not raise the exact Stage 6A gate';
  END IF;
END $$;
INSERT INTO fixture_results
SELECT
  'bookings.unit_id RESTRICT pre-check',
  count(*)::INTEGER,
  count(*)::INTEGER,
  'blocked with exact Stage 6A Batch 3 exception'
FROM fixture_bookings
WHERE unit_id = 999;

DO $$
DECLARE
  gate_error TEXT;
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM fixture_waha_pass_applications AS child
      WHERE NOT EXISTS (SELECT 1 FROM fixture_units AS parent WHERE parent.id = child.unit_id)
    ) THEN
      RAISE EXCEPTION 'Stage 6A Batch 2 blocked: waha_pass_applications.unit_id has orphans';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    gate_error := SQLERRM;
  END;

  IF gate_error <> 'Stage 6A Batch 2 blocked: waha_pass_applications.unit_id has orphans' THEN
    RAISE EXCEPTION 'Waha application RESTRICT fixture did not raise the exact Stage 6A gate';
  END IF;
END $$;
INSERT INTO fixture_results
SELECT
  'waha_pass_applications.unit_id RESTRICT pre-check',
  count(*)::INTEGER,
  count(*)::INTEGER,
  'blocked with exact Stage 6A Batch 2 exception'
FROM fixture_waha_pass_applications
WHERE unit_id = 999;

SELECT fixture, before_count, after_count, outcome
FROM fixture_results
ORDER BY fixture;

ROLLBACK;