-- Require complete identity data for new tenant verification submissions while
-- preserving nullable historical rows until the next approved reset.
BEGIN;

ALTER TABLE public.unit_verifications
  ADD COLUMN date_of_birth date,
  ADD COLUMN nationality text;

ALTER TABLE public.residents
  ADD COLUMN nationality text;

COMMIT;