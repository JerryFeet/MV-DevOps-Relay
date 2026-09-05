-- Round 2 C2: new owner claims record a Mullak-verifiable title deed number.
-- Existing uploaded-deed columns remain intact for historic records and their
-- document-cleanup routes.
ALTER TABLE unit_verifications
  ADD COLUMN IF NOT EXISTS title_deed_number text;

ALTER TABLE unit_verifications
  ADD CONSTRAINT unit_verifications_title_deed_number_format_check
  CHECK (
    title_deed_number IS NULL
    OR title_deed_number ~ '^[0-9]{16}$'
  );