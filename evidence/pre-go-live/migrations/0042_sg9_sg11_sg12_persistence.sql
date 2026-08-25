-- SG9d / SG11 / SG12 forward-only persistence.
-- These columns are nullable for records created before the application-layer
-- requirements; new submissions are validated by the API.

ALTER TABLE unit_verifications
  ADD COLUMN gender text,
  ADD COLUMN approval_bases text,
  ADD COLUMN approval_other_text text;

ALTER TABLE residents
  ADD COLUMN gender text;

ALTER TABLE guests
  ADD COLUMN gender text;

ALTER TABLE waha_guest_day_passes
  ADD COLUMN vehicle_plate text;

ALTER TABLE unit_verifications
  ADD CONSTRAINT unit_verifications_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

ALTER TABLE residents
  ADD CONSTRAINT residents_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

ALTER TABLE guests
  ADD CONSTRAINT guests_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));