-- Durable evidence for approved, one-time occupancy corrections.  This table
-- deliberately records only committed corrections; a rejected precondition
-- rolls back without an operation row.
CREATE TABLE occupancy_correction_operations (
  id serial PRIMARY KEY,
  idempotency_key text NOT NULL,
  correction_key text NOT NULL,
  unit_id integer NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  affected_ids jsonb NOT NULL,
  postcondition_summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_occupancy_correction_operations_idempotency
  ON occupancy_correction_operations(idempotency_key);
CREATE UNIQUE INDEX uq_occupancy_correction_operations_correction
  ON occupancy_correction_operations(correction_key);
CREATE INDEX idx_occupancy_correction_operations_unit_created
  ON occupancy_correction_operations(unit_id, created_at);

-- `reject_occupancy_append_only_mutation` is established by 0049, which is an
-- active prerequisite for this forward migration.
CREATE TRIGGER trg_occupancy_correction_operations_immutable
  BEFORE UPDATE OR DELETE ON occupancy_correction_operations
  FOR EACH ROW EXECUTE FUNCTION reject_occupancy_append_only_mutation();