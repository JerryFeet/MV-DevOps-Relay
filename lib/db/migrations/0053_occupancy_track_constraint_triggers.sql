-- Occupancy is a cross-table invariant and cannot be expressed as a CHECK
-- constraint.  These are deferred deliberately: a release/approval may update
-- residents and units in either order, but may not commit an inconsistent
-- household track.
CREATE OR REPLACE FUNCTION enforce_occupancy_track_consistency(p_unit_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_occupant_type occupant_type;
  v_is_system boolean;
  v_has_owner boolean;
  v_has_tenant boolean;
BEGIN
  SELECT occupant_type, is_system
    INTO v_occupant_type, v_is_system
    FROM units
   WHERE id = p_unit_id;

  -- Deleted residents/units and the HOA common/system unit are not occupancy
  -- subjects. The system row is intentionally exempt from this invariant.
  IF NOT FOUND OR v_is_system THEN RETURN; END IF;

  SELECT
    coalesce(bool_or(status = 'active' AND type = 'owner'), false),
    coalesce(bool_or(status = 'active' AND type = 'tenant'), false)
    INTO v_has_owner, v_has_tenant
    FROM residents
   WHERE unit_id = p_unit_id;

  IF v_has_owner AND v_has_tenant THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'occupancy_track_consistency',
      MESSAGE = 'occupancy_track_consistency: owner and tenant residents cannot both be active';
  END IF;

  IF (v_has_owner AND v_occupant_type <> 'owner_occupied')
     OR (v_has_tenant AND v_occupant_type <> 'tenant_occupied')
     OR (v_occupant_type = 'owner_occupied' AND NOT v_has_owner)
     OR (v_occupant_type = 'tenant_occupied' AND NOT v_has_tenant) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'occupancy_track_consistency',
      MESSAGE = 'occupancy_track_consistency: active resident track must match unit occupant type';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_occupancy_track_from_resident()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM enforce_occupancy_track_consistency(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.unit_id ELSE NEW.unit_id END
  );
  IF TG_OP = 'UPDATE' AND OLD.unit_id IS DISTINCT FROM NEW.unit_id THEN
    PERFORM enforce_occupancy_track_consistency(OLD.unit_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_occupancy_track_from_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM enforce_occupancy_track_consistency(NEW.id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_residents_occupancy_track_consistency
AFTER INSERT OR UPDATE OR DELETE ON residents
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_occupancy_track_from_resident();

CREATE CONSTRAINT TRIGGER trg_units_occupancy_track_consistency
AFTER UPDATE ON units
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_occupancy_track_from_unit();