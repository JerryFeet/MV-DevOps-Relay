-- Stage 4b r4 — Rollback Fixture
-- r4 introduces no new migration (evidence-only revision).
-- This script is identical to stage4b-r3-rollback.sql.
-- It reverts migration 0028_stage4b_folder_cascade.sql.
-- Restores the BEFORE/refuse trigger semantics from migration 0027.
--
-- WARNING: This rollback does NOT re-raise sub-floor documents.
-- Run AFTER verifying no new tightening has cascaded documents in production.

BEGIN;

-- Restore the refuse function from migration 0027.
CREATE OR REPLACE FUNCTION enforce_folder_visibility_floor()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM documents
    WHERE folder_id = NEW.id
      AND (CASE visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners'  THEN 2
        WHEN 'admin_only'       THEN 3
        ELSE 0
      END) < (CASE NEW.default_visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners'  THEN 2
        WHEN 'admin_only'       THEN 3
        ELSE 4
      END)
  ) THEN
    RAISE EXCEPTION
      'Folder visibility floor cannot be raised while it contains less-restrictive documents.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the AFTER/cascade trigger with the BEFORE/refuse trigger.
DROP TRIGGER IF EXISTS document_folders_visibility_floor_guard ON document_folders;
CREATE TRIGGER document_folders_visibility_floor_guard
BEFORE UPDATE OF default_visibility ON document_folders
FOR EACH ROW EXECUTE FUNCTION enforce_folder_visibility_floor();

-- Remove the cascade function; it is no longer needed.
DROP FUNCTION IF EXISTS cascade_folder_visibility_floor();

COMMIT;

-- Integrity guard: verify no documents sit below their folder floor
-- (this would mean the cascade already ran and cannot be simply rolled back).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM documents d
    JOIN document_folders f ON f.id = d.folder_id
    WHERE (CASE d.visibility
      WHEN 'all_portal_users' THEN 1
      WHEN 'verified_owners'  THEN 2
      WHEN 'admin_only'       THEN 3
      ELSE 0
    END) < (CASE f.default_visibility
      WHEN 'all_portal_users' THEN 1
      WHEN 'verified_owners'  THEN 2
      WHEN 'admin_only'       THEN 3
      ELSE 4
    END)
  ) THEN
    RAISE WARNING
      'Stage 4b r4 rollback: some documents remain below their folder floor. '
      'A cascade may already have been applied. Manual remediation required.';
  END IF;
END $$;
