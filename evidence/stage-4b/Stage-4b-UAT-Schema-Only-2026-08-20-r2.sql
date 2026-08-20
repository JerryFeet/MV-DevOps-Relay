-- Sanitized schema-only extract from the development database.
-- Generated after applying the Stage 4b r2 repair. No table data is included.

CREATE TABLE public.document_folders (
    id integer NOT NULL,
    name text NOT NULL,
    name_ar text NOT NULL,
    default_visibility text DEFAULT 'all_portal_users'::text NOT NULL,
    default_download_mode text DEFAULT 'download_allowed'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_triage boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_folders_download_mode_check
      CHECK ((default_download_mode = ANY (ARRAY['download_allowed'::text, 'view_only'::text]))),
    CONSTRAINT document_folders_visibility_check
      CHECK ((default_visibility = ANY (ARRAY['all_portal_users'::text, 'verified_owners'::text, 'admin_only'::text])))
);

CREATE TABLE public.documents (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'general'::text NOT NULL,
    file_url text NOT NULL,
    mime_type text,
    file_size integer,
    is_public boolean DEFAULT false NOT NULL,
    uploaded_by_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    folder_id integer NOT NULL,
    visibility text NOT NULL,
    download_mode text NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    archived_by_id integer,
    replaced_by_id integer,
    replacement_reason text,
    CONSTRAINT documents_download_mode_check
      CHECK ((download_mode = ANY (ARRAY['download_allowed'::text, 'view_only'::text]))),
    CONSTRAINT documents_visibility_check
      CHECK ((visibility = ANY (ARRAY['all_portal_users'::text, 'verified_owners'::text, 'admin_only'::text])))
);

ALTER TABLE ONLY public.document_folders
  ADD CONSTRAINT document_folders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.documents
  ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.documents
  ADD CONSTRAINT documents_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.document_folders(id);

CREATE INDEX idx_document_folders_active_sort
  ON public.document_folders USING btree (is_active, sort_order);
CREATE UNIQUE INDEX idx_document_folders_name_unique
  ON public.document_folders USING btree (name);
CREATE INDEX idx_documents_folder_current
  ON public.documents USING btree (folder_id, is_archived, created_at);
CREATE INDEX idx_documents_replaced_by_id
  ON public.documents USING btree (replaced_by_id);
CREATE INDEX idx_documents_uploaded_by_id
  ON public.documents USING btree (uploaded_by_id);

-- Function bodies are in the two published r2 migration files.
CREATE TRIGGER document_folders_visibility_floor_guard
  BEFORE UPDATE OF default_visibility ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_folder_visibility_floor();
CREATE TRIGGER documents_visibility_floor_guard
  BEFORE INSERT OR UPDATE OF folder_id, visibility ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_visibility_floor();
