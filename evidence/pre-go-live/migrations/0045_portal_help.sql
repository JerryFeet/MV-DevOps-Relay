-- PH1: dedicated Portal Help service-desk tickets and private screenshot retention.
-- Forward-only migration. Publish and review this file before applying it.
BEGIN;

CREATE TABLE public.portal_help_tickets (
  id serial PRIMARY KEY,
  submitter_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  submitter_role text NOT NULL,
  submitter_unit text NOT NULL,
  category text NOT NULL,
  details text NOT NULL,
  screenshot_object_key text,
  screenshot_content_type text,
  status text NOT NULL DEFAULT 'pending',
  admin_reply text,
  reply_kind text,
  replied_by_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  replied_at timestamp with time zone,
  closed_at timestamp with time zone,
  screenshot_delete_after timestamp with time zone,
  screenshot_deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portal_help_tickets_category_check CHECK (
    category IN (
      'account_access',
      'unit_household_registration',
      'booking_pass',
      'payment',
      'document_opening',
      'vehicle_permit_registration',
      'screen_problem'
    )
  ),
  CONSTRAINT portal_help_tickets_status_check CHECK (
    status IN ('pending', 'in_progress', 'closed')
  ),
  CONSTRAINT portal_help_tickets_details_nonblank_check CHECK (
    length(btrim(details)) > 0
  ),
  CONSTRAINT portal_help_tickets_screenshot_pair_check CHECK (
    (screenshot_object_key IS NULL AND screenshot_content_type IS NULL)
    OR
    (screenshot_object_key IS NOT NULL AND screenshot_content_type IS NOT NULL)
  ),
  CONSTRAINT portal_help_tickets_screenshot_path_check CHECK (
    screenshot_object_key IS NULL OR screenshot_object_key LIKE '/objects/portal-help/%'
  ),
  CONSTRAINT portal_help_tickets_screenshot_mime_check CHECK (
    screenshot_content_type IS NULL
    OR screenshot_content_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT portal_help_tickets_reply_kind_check CHECK (
    reply_kind IS NULL OR reply_kind IN ('reply', 'redirect')
  )
);

CREATE INDEX idx_portal_help_tickets_submitter
  ON public.portal_help_tickets(submitter_user_id, created_at);
CREATE INDEX idx_portal_help_tickets_attention
  ON public.portal_help_tickets(status, created_at);
CREATE INDEX idx_portal_help_tickets_screenshot_retention
  ON public.portal_help_tickets(screenshot_delete_after, screenshot_deleted_at);

CREATE TABLE public.portal_help_screenshot_deletion_jobs (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES public.portal_help_tickets(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp with time zone NOT NULL,
  last_error text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portal_help_screenshot_deletion_status_check CHECK (
    status IN ('pending', 'retrying', 'completed')
  ),
  CONSTRAINT portal_help_screenshot_deletion_attempts_check CHECK (
    attempts >= 0
  ),
  CONSTRAINT portal_help_screenshot_deletion_path_check CHECK (
    object_key LIKE '/objects/portal-help/%'
  )
);

CREATE UNIQUE INDEX uq_portal_help_screenshot_deletion_ticket
  ON public.portal_help_screenshot_deletion_jobs(ticket_id);
CREATE INDEX idx_portal_help_screenshot_deletion_due
  ON public.portal_help_screenshot_deletion_jobs(status, next_attempt_at);

COMMIT;