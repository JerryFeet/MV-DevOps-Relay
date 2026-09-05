-- Approved occupancy core.  This migration is deliberately forward-only and
-- does not remediate W14 or choose a primary for ambiguous legacy households.
ALTER TABLE residents ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_residents_one_active_primary_per_unit
  ON residents(unit_id) WHERE is_primary = true AND status = 'active';

CREATE TYPE extra_resident_request_status AS ENUM ('pending', 'approved', 'refused', 'cancelled');
CREATE TYPE extra_resident_request_event_type AS ENUM ('submitted', 'approved', 'refused', 'cancelled');
CREATE TABLE extra_resident_requests (
  id serial PRIMARY KEY,
  unit_id integer NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  requester_resident_id integer NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  proposed_identity_key text NOT NULL,
  proposed_resident jsonb NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  proof_warning_acknowledged boolean NOT NULL,
  status extra_resident_request_status NOT NULL DEFAULT 'pending',
  reviewed_by_id integer REFERENCES users(id) ON DELETE RESTRICT,
  decision_reason text,
  resulting_resident_id integer REFERENCES residents(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  cancelled_at timestamptz,
  CHECK ((status = 'pending' AND reviewed_by_id IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
      OR (status = 'approved' AND reviewed_by_id IS NOT NULL AND decided_at IS NOT NULL AND resulting_resident_id IS NOT NULL)
      OR (status = 'refused' AND reviewed_by_id IS NOT NULL AND decided_at IS NOT NULL AND btrim(coalesce(decision_reason, '')) <> '')
      OR (status = 'cancelled' AND cancelled_at IS NOT NULL))
);
CREATE INDEX idx_extra_resident_requests_unit_status ON extra_resident_requests(unit_id, status);
CREATE UNIQUE INDEX uq_extra_resident_pending_identity ON extra_resident_requests(unit_id, proposed_identity_key) WHERE status = 'pending';
CREATE TABLE extra_resident_request_events (
  id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES extra_resident_requests(id) ON DELETE RESTRICT,
  event_type extra_resident_request_event_type NOT NULL, actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  reason text, snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_extra_resident_request_events_request ON extra_resident_request_events(request_id);
CREATE TABLE resident_removal_operations (
  id serial PRIMARY KEY, idempotency_key text NOT NULL UNIQUE, unit_id integer NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  resident_id integer NOT NULL REFERENCES residents(id) ON DELETE RESTRICT, actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''), effect_summary jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION enforce_extra_resident_request_finality()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('approved', 'refused', 'cancelled')
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by_id IS DISTINCT FROM OLD.reviewed_by_id
       OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
       OR NEW.resulting_resident_id IS DISTINCT FROM OLD.resulting_resident_id
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'EXTRA_RESIDENT_REQUEST_FINAL';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_extra_resident_request_finality BEFORE UPDATE ON extra_resident_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_extra_resident_request_finality();
CREATE OR REPLACE FUNCTION reject_occupancy_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OCCUPANCY_AUDIT_APPEND_ONLY'; END $$;
CREATE TRIGGER trg_extra_resident_request_events_immutable BEFORE UPDATE OR DELETE ON extra_resident_request_events
  FOR EACH ROW EXECUTE FUNCTION reject_occupancy_append_only_mutation();
CREATE TRIGGER trg_resident_removal_operations_immutable BEFORE UPDATE OR DELETE ON resident_removal_operations
  FOR EACH ROW EXECUTE FUNCTION reject_occupancy_append_only_mutation();

-- Classify before backfill. A unit is unambiguous only when exactly one active
-- resident matches its stored occupying verified identity and no opposing
-- owner/tenant households exist. W14 is classified for review but is never
-- mutated here: its controlled remediation is a separately approved operation.
WITH classification AS (
  SELECT u.id AS unit_id, u.building, u.unit_number, u.occupant_type,
    count(r.id) FILTER (
      WHERE r.status = 'active'
        AND ((u.occupant_type = 'owner_occupied' AND r.type = 'owner' AND r.linked_user_id = u.verified_owner_id)
          OR (u.occupant_type = 'tenant_occupied' AND r.type = 'tenant' AND r.linked_user_id = u.verified_tenant_id))
    ) AS candidate_count,
    bool_or(r.status = 'active' AND r.type = 'owner') AS active_owner_household,
    bool_or(r.status = 'active' AND r.type = 'tenant') AS active_tenant_household
  FROM units u LEFT JOIN residents r ON r.unit_id = u.id
  WHERE u.occupant_type <> 'vacant'
  GROUP BY u.id, u.building, u.unit_number, u.occupant_type
), classified AS (
  SELECT *, CASE
    WHEN coalesce(active_owner_household, false) AND coalesce(active_tenant_household, false)
      THEN 'OCCUPANCY_OPPOSING_ACTIVE_HOUSEHOLDS'
    WHEN candidate_count = 0 THEN 'OCCUPANCY_PRIMARY_CANDIDATE_MISSING'
    WHEN candidate_count > 1 THEN 'OCCUPANCY_PRIMARY_CANDIDATE_MULTIPLE'
    ELSE 'OCCUPANCY_PRIMARY_UNAMBIGUOUS'
  END AS classification
  FROM classification
)
UPDATE residents r SET is_primary = true
FROM classified c
WHERE r.unit_id = c.unit_id
  AND c.classification = 'OCCUPANCY_PRIMARY_UNAMBIGUOUS'
  AND NOT (upper(btrim(c.building)) = 'W' AND btrim(c.unit_number) = '14')
  AND r.status = 'active'
  AND ((c.occupant_type = 'owner_occupied' AND r.type = 'owner'
        AND r.linked_user_id = (SELECT verified_owner_id FROM units WHERE id = c.unit_id))
    OR (c.occupant_type = 'tenant_occupied' AND r.type = 'tenant'
        AND r.linked_user_id = (SELECT verified_tenant_id FROM units WHERE id = c.unit_id)));

WITH classification AS (
  SELECT u.id AS unit_id, u.building, u.unit_number, u.occupant_type,
    count(r.id) FILTER (WHERE r.status = 'active' AND (
      (u.occupant_type = 'owner_occupied' AND r.type = 'owner' AND r.linked_user_id = u.verified_owner_id) OR
      (u.occupant_type = 'tenant_occupied' AND r.type = 'tenant' AND r.linked_user_id = u.verified_tenant_id)
    )) AS candidate_count,
    bool_or(r.status = 'active' AND r.type = 'owner') AS active_owner_household,
    bool_or(r.status = 'active' AND r.type = 'tenant') AS active_tenant_household
  FROM units u LEFT JOIN residents r ON r.unit_id = u.id
  WHERE u.occupant_type <> 'vacant'
  GROUP BY u.id, u.building, u.unit_number, u.occupant_type
), classified AS (
  SELECT *, CASE
    WHEN coalesce(active_owner_household, false) AND coalesce(active_tenant_household, false) THEN 'OCCUPANCY_OPPOSING_ACTIVE_HOUSEHOLDS'
    WHEN candidate_count = 0 THEN 'OCCUPANCY_PRIMARY_CANDIDATE_MISSING'
    WHEN candidate_count > 1 THEN 'OCCUPANCY_PRIMARY_CANDIDATE_MULTIPLE'
    ELSE 'OCCUPANCY_PRIMARY_UNAMBIGUOUS'
  END AS classification FROM classification
)
INSERT INTO data_migration_corrections(entity_type, source_reference, issue_code, raw_payload, details)
SELECT 'unit', unit_id::text,
  CASE WHEN upper(btrim(building)) = 'W' AND btrim(unit_number) = '14' THEN 'OCCUPANCY_W14_CONTROLLED_REMEDIATION_REQUIRED' ELSE classification END,
  jsonb_build_object('building', building, 'unitNumber', unit_number, 'occupantType', occupant_type,
                     'candidateCount', candidate_count, 'activeOwnerHousehold', coalesce(active_owner_household,false),
                     'activeTenantHousehold', coalesce(active_tenant_household,false), 'classification', classification),
  CASE WHEN upper(btrim(building)) = 'W' AND btrim(unit_number) = '14'
    THEN 'W14 was classified only; no resident or occupancy mutation was made by this migration.'
    ELSE 'Primary classification requires administrator review; no primary was backfilled.' END
FROM classified
WHERE classification <> 'OCCUPANCY_PRIMARY_UNAMBIGUOUS' OR (upper(btrim(building)) = 'W' AND btrim(unit_number) = '14')
ON CONFLICT (entity_type, source_reference, issue_code) DO NOTHING;