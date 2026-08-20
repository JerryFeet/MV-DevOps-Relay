-- Stage 4b r2: repair for a database that previously received r1.
-- This upgrades any below-floor rows, installs both guards, and asserts zero violations.

UPDATE documents d
SET visibility = CASE f.default_visibility
  WHEN 'admin_only' THEN 'admin_only'
  WHEN 'verified_owners' THEN 'verified_owners'
  ELSE 'all_portal_users'
END
FROM document_folders f
WHERE d.folder_id = f.id
  AND (CASE d.visibility
    WHEN 'all_portal_users' THEN 1
    WHEN 'verified_owners' THEN 2
    WHEN 'admin_only' THEN 3
    ELSE 0
  END) < (CASE f.default_visibility
    WHEN 'all_portal_users' THEN 1
    WHEN 'verified_owners' THEN 2
    WHEN 'admin_only' THEN 3
    ELSE 4
  END);

CREATE OR REPLACE FUNCTION enforce_document_visibility_floor()
RETURNS trigger AS $$
DECLARE
  folder_floor text;
BEGIN
  SELECT default_visibility INTO folder_floor
  FROM document_folders
  WHERE id = NEW.folder_id;
  IF folder_floor IS NULL THEN
    RAISE EXCEPTION 'Document folder % does not exist.', NEW.folder_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF (CASE NEW.visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners' THEN 2
        WHEN 'admin_only' THEN 3
        ELSE 0
      END) < (CASE folder_floor
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners' THEN 2
        WHEN 'admin_only' THEN 3
        ELSE 4
      END) THEN
    RAISE EXCEPTION 'Document visibility % is less restrictive than folder visibility %.',
      NEW.visibility, folder_floor
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_visibility_floor_guard ON documents;
CREATE TRIGGER documents_visibility_floor_guard
BEFORE INSERT OR UPDATE OF folder_id, visibility ON documents
FOR EACH ROW EXECUTE FUNCTION enforce_document_visibility_floor();

CREATE OR REPLACE FUNCTION enforce_folder_visibility_floor()
RETURNS trigger AS $$
BEGIN
  IF (CASE NEW.default_visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners' THEN 2
        WHEN 'admin_only' THEN 3
        ELSE 4
      END) > (CASE OLD.default_visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners' THEN 2
        WHEN 'admin_only' THEN 3
        ELSE 0
      END)
    AND EXISTS (
      SELECT 1 FROM documents d
      WHERE d.folder_id = NEW.id
        AND (CASE d.visibility
          WHEN 'all_portal_users' THEN 1
          WHEN 'verified_owners' THEN 2
          WHEN 'admin_only' THEN 3
          ELSE 0
        END) < (CASE NEW.default_visibility
          WHEN 'all_portal_users' THEN 1
          WHEN 'verified_owners' THEN 2
          WHEN 'admin_only' THEN 3
          ELSE 4
        END)
    ) THEN
    RAISE EXCEPTION 'Folder visibility cannot be tightened while it contains less-restrictive documents.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_folders_visibility_floor_guard ON document_folders;
CREATE TRIGGER document_folders_visibility_floor_guard
BEFORE UPDATE OF default_visibility ON document_folders
FOR EACH ROW EXECUTE FUNCTION enforce_folder_visibility_floor();

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM documents d
    JOIN document_folders f ON f.id = d.folder_id
    WHERE (CASE d.visibility
      WHEN 'all_portal_users' THEN 1
      WHEN 'verified_owners' THEN 2
      WHEN 'admin_only' THEN 3
      ELSE 0
    END) < (CASE f.default_visibility
      WHEN 'all_portal_users' THEN 1
      WHEN 'verified_owners' THEN 2
      WHEN 'admin_only' THEN 3
      ELSE 4
    END)
  ) THEN
    RAISE EXCEPTION 'Stage 4b r2 migration left a document below its folder visibility floor.';
  END IF;
END $$;