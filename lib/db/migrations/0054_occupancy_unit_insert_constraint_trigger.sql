-- 0053 covered resident changes and unit updates. Extend the same deferred
-- constraint trigger to unit INSERT so raw writers cannot create an already
-- occupied unit without its matching active resident in the transaction.
-- Keep the stable trigger/function/error identities from 0053.
DROP TRIGGER trg_units_occupancy_track_consistency ON units;

CREATE CONSTRAINT TRIGGER trg_units_occupancy_track_consistency
AFTER INSERT OR UPDATE ON units
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_occupancy_track_from_unit();