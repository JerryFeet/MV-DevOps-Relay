-- Stage 4b: authenticated, folder-based document library.
-- Keep legacy columns during rollout so existing records can be safely mapped.

CREATE TABLE IF NOT EXISTS document_folders (
  id serial PRIMARY KEY,
  name text NOT NULL,
  name_ar text NOT NULL,
  default_visibility text NOT NULL DEFAULT 'all_portal_users',
  default_download_mode text NOT NULL DEFAULT 'download_allowed',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_triage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_folders_visibility_check
    CHECK (default_visibility IN ('all_portal_users', 'verified_owners', 'admin_only')),
  CONSTRAINT document_folders_download_mode_check
    CHECK (default_download_mode IN ('download_allowed', 'view_only'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_name_unique ON document_folders (name);
CREATE INDEX IF NOT EXISTS idx_document_folders_active_sort ON document_folders (is_active, sort_order);

INSERT INTO document_folders
  (name, name_ar, default_visibility, default_download_mode, sort_order, is_active, is_triage)
VALUES
  ('Rules and Regulations', 'الأنظمة واللوائح', 'all_portal_users', 'download_allowed', 10, true, false),
  ('User Manual', 'دليل الاستخدام', 'all_portal_users', 'download_allowed', 20, true, false),
  ('Forms', 'النماذج', 'all_portal_users', 'download_allowed', 30, true, false),
  ('Notices', 'الإشعارات', 'all_portal_users', 'download_allowed', 40, true, false),
  ('Invoices', 'الفواتير', 'verified_owners', 'download_allowed', 50, true, false),
  ('Financial Reports', 'التقارير المالية', 'verified_owners', 'download_allowed', 60, true, false),
  ('Minutes of Meeting', 'محاضر الاجتماعات', 'verified_owners', 'download_allowed', 70, true, false),
  ('Unmapped legacy documents', 'مستندات قديمة غير مصنفة', 'admin_only', 'download_allowed', 9999, true, true)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS download_mode text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_by_id integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS replaced_by_id integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS replacement_reason text;

UPDATE documents d SET folder_id = f.id
FROM document_folders f
WHERE d.folder_id IS NULL AND (
  (d.category = 'rules' AND f.name = 'Rules and Regulations')
  OR (d.category = 'forms' AND f.name = 'Forms')
  OR (d.category = 'notices' AND f.name = 'Notices')
  OR (d.category = 'financials' AND f.name = 'Financial Reports')
  OR (d.category = 'minutes' AND f.name = 'Minutes of Meeting')
);

UPDATE documents d SET folder_id = f.id
FROM document_folders f
WHERE d.folder_id IS NULL AND f.is_triage = true;

UPDATE documents d
SET visibility = CASE
  WHEN d.is_public THEN 'all_portal_users'
  WHEN f.default_visibility = 'verified_owners' THEN 'verified_owners'
  WHEN f.default_visibility = 'admin_only' THEN 'admin_only'
  ELSE 'all_portal_users'
END,
download_mode = COALESCE(d.download_mode, f.default_download_mode)
FROM document_folders f
WHERE d.folder_id = f.id
  AND (d.visibility IS NULL OR d.download_mode IS NULL);

ALTER TABLE documents
  ALTER COLUMN folder_id SET NOT NULL,
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN download_mode SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES document_folders(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_visibility_check
    CHECK (visibility IN ('all_portal_users', 'verified_owners', 'admin_only'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_download_mode_check
    CHECK (download_mode IN ('download_allowed', 'view_only'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_folder_current
  ON documents (folder_id, is_archived, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_replaced_by_id ON documents (replaced_by_id);
