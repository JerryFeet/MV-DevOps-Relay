-- H6/H8a final schema unwind after SG10 removed all application photo handling.
-- The native renovation_scope enum is intentionally idempotent: its prior
-- fail-closed migration may already have removed the orphan.
BEGIN;

DROP TYPE IF EXISTS public.renovation_scope;

ALTER TABLE public.residents
  DROP COLUMN IF EXISTS id_photo_key;

DROP TABLE IF EXISTS public.resident_photo_deletion_jobs;

COMMIT;