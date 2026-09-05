-- Canonical identity for household move-out forms.  Historical text remains a
-- display snapshot and is deliberately never used to select a unit.
ALTER TABLE move_forms ADD COLUMN IF NOT EXISTS unit_id integer
  REFERENCES units(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_move_forms_unit_id ON move_forms (unit_id);

ALTER TABLE release_operations
  DROP CONSTRAINT IF EXISTS release_operations_trigger_type_check;
ALTER TABLE release_operations
  ADD CONSTRAINT release_operations_trigger_type_check
  CHECK (trigger_type IN ('move_out_form', 'move_out_permit', 'tenancy_expiry', 'ownership_change'));

-- Only backfill a form where its stored reference identifies exactly one unit.
-- Ambiguous bare apartment numbers are intentionally left NULL for operations
-- review; this migration never changes occupancy or resident records.
WITH unambiguous_matches AS (
  SELECT mf.id AS move_form_id, min(u.id) AS unit_id
  FROM move_forms mf
  JOIN units u
    ON mf.unit_number = u.building || ' ' || u.unit_number
    OR mf.unit_number = u.unit_number
  WHERE mf.unit_id IS NULL
  GROUP BY mf.id
  HAVING count(*) = 1
)
UPDATE move_forms mf
SET unit_id = matches.unit_id
FROM unambiguous_matches matches
WHERE mf.id = matches.move_form_id;