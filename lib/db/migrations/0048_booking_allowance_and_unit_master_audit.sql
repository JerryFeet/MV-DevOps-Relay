-- F12/F13/Q-1: database-time active-booking admission, immutable allowance claims,
-- and append-only Unit Registry correction evidence.
CREATE TABLE IF NOT EXISTS monthly_booking_allowances (
  id serial PRIMARY KEY,
  unit_id integer NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_booking_allowance_unit_period
  ON monthly_booking_allowances(unit_id, period_start);

CREATE TABLE IF NOT EXISTS unit_master_data_audit (
  id serial PRIMARY KEY,
  unit_id integer NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unit_master_data_audit_unit_created
  ON unit_master_data_audit(unit_id, created_at);
CREATE OR REPLACE FUNCTION reject_immutable_unit_registry_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_UNIT_REGISTRY_EVIDENCE';
END $$;
DROP TRIGGER IF EXISTS trg_monthly_booking_allowances_immutable ON monthly_booking_allowances;
CREATE TRIGGER trg_monthly_booking_allowances_immutable BEFORE UPDATE OR DELETE ON monthly_booking_allowances
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_unit_registry_evidence();
DROP TRIGGER IF EXISTS trg_unit_master_data_audit_append_only ON unit_master_data_audit;
CREATE TRIGGER trg_unit_master_data_audit_append_only BEFORE UPDATE OR DELETE ON unit_master_data_audit
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_unit_registry_evidence();

CREATE OR REPLACE FUNCTION enforce_one_active_unit_facility_booking()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_booking_exists boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM units WHERE id = NEW.unit_id AND is_system) THEN RETURN NEW; END IF;
  -- Must remain compatible with the route: facility lock first, then unit/facility lock.
  PERFORM pg_advisory_xact_lock(4201, NEW.facility_id);
  PERFORM pg_advisory_xact_lock(4205, NEW.unit_id);
  IF (NEW.status IN ('pending','confirmed') AND NEW.end_time > CURRENT_TIMESTAMP)
     OR (NEW.status = 'pending_payment' AND NEW.payment_hold_expires_at > CURRENT_TIMESTAMP) THEN
    SELECT EXISTS (
      SELECT 1 FROM bookings b WHERE b.unit_id = NEW.unit_id AND b.facility_id = NEW.facility_id
        AND b.id IS DISTINCT FROM NEW.id AND (
          (b.status IN ('pending','confirmed') AND b.end_time > CURRENT_TIMESTAMP)
          OR (b.status = 'pending_payment' AND b.payment_hold_expires_at > CURRENT_TIMESTAMP)
        )
    ) INTO active_booking_exists;
    IF active_booking_exists THEN RAISE EXCEPTION 'ACTIVE_UNIT_FACILITY_BOOKING_EXISTS' USING ERRCODE = '23P01'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_one_active_unit_facility_booking ON bookings;
CREATE TRIGGER trg_enforce_one_active_unit_facility_booking
  BEFORE INSERT OR UPDATE OF unit_id, facility_id, status, end_time, payment_hold_expires_at ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_one_active_unit_facility_booking();