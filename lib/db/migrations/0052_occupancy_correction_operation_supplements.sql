-- Operation 1 is immutable evidence and correctly remains untouched.  A
-- supplement records the final queue-resolved view discovered after execution.
CREATE TABLE occupancy_correction_operation_supplements (
  id serial PRIMARY KEY,
  operation_id integer NOT NULL REFERENCES occupancy_correction_operations(id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  final_snapshot jsonb NOT NULL,
  final_snapshot_sha256 text NOT NULL CHECK (final_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  original_after_snapshot_sha256 text NOT NULL CHECK (original_after_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  postcondition_summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_occupancy_correction_operation_supplements_operation
  ON occupancy_correction_operation_supplements(operation_id);
CREATE TRIGGER trg_occupancy_correction_operation_supplements_immutable
  BEFORE UPDATE OR DELETE ON occupancy_correction_operation_supplements
  FOR EACH ROW EXECUTE FUNCTION reject_occupancy_append_only_mutation();