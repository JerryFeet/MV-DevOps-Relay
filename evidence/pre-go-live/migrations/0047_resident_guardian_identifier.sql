-- C-4b: distinguish a minor's guardian identifier from their own identifier.
ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS id_number_is_guardian boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_residents_id_number
  ON residents (id_number);