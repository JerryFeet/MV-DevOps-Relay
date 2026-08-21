-- I5: Enforce one active Waha Pass application per unit at the database level.
--
-- A partial unique index on (unit_id) WHERE status IN ('pending_review', 'active')
-- prevents a second application from being inserted while any pending or active
-- application already exists for the same unit — even under concurrent requests
-- that both pass the application-level duplicate check.
--
-- Revoked and rejected applications are excluded from the index so a unit can
-- re-apply after a previous application ends.

CREATE UNIQUE INDEX waha_pass_applications_one_active_per_unit
  ON waha_pass_applications (unit_id)
  WHERE status IN ('pending_review', 'active');
