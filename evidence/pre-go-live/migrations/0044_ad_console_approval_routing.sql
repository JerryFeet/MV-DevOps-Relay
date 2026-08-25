-- AD1–AD5: durable replacement approvals and per-account operational routing.
-- This is an active forward migration applied only after the approved schema
-- replay/catalog validation; do not run drizzle-kit push during the freeze.
BEGIN;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS receives_approval_notifications boolean NOT NULL DEFAULT false;

CREATE TYPE public.waha_replacement_request_status AS ENUM (
  'pending_review',
  'approved',
  'rejected',
  'payment_pending',
  'paid'
);

CREATE TABLE public.waha_replacement_requests (
  id serial PRIMARY KEY,
  application_id integer NOT NULL REFERENCES public.waha_pass_applications(id) ON DELETE RESTRICT,
  original_credential_id integer NOT NULL REFERENCES public.waha_pass_credentials(id) ON DELETE RESTRICT,
  requested_by_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status public.waha_replacement_request_status NOT NULL DEFAULT 'pending_review',
  reviewed_by_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text,
  payment_attempt_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  paid_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_waha_replacement_requests_original_credential
  ON public.waha_replacement_requests(original_credential_id);
CREATE INDEX idx_waha_replacement_requests_status
  ON public.waha_replacement_requests(status);
CREATE INDEX idx_waha_replacement_requests_application_id
  ON public.waha_replacement_requests(application_id);

COMMIT;