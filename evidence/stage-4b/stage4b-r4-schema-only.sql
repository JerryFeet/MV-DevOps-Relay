--
-- PostgreSQL database dump
--

\restrict KmXNgFLdabRSZMNpkdDWuPdXkHgFCcJOZsHT7PBgUhJTkBG8bnwK8HJmw0JhEcy

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: booking_payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.booking_payment_status AS ENUM (
    'unpaid',
    'paid',
    'refunded',
    'waived'
);


ALTER TYPE public.booking_payment_status OWNER TO postgres;

--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'completed'
);


ALTER TYPE public.booking_status OWNER TO postgres;

--
-- Name: data_correction_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.data_correction_status AS ENUM (
    'open',
    'resolved',
    'ignored'
);


ALTER TYPE public.data_correction_status OWNER TO postgres;

--
-- Name: guest_pass_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.guest_pass_status AS ENUM (
    'approved',
    'expired',
    'revoked'
);


ALTER TYPE public.guest_pass_status OWNER TO postgres;

--
-- Name: guest_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.guest_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'checked_in',
    'checked_out'
);


ALTER TYPE public.guest_status OWNER TO postgres;

--
-- Name: household_invitation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.household_invitation_status AS ENUM (
    'pending',
    'accepted',
    'revoked'
);


ALTER TYPE public.household_invitation_status OWNER TO postgres;

--
-- Name: move_form_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.move_form_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'completed'
);


ALTER TYPE public.move_form_status OWNER TO postgres;

--
-- Name: move_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.move_type AS ENUM (
    'move_in',
    'move_out'
);


ALTER TYPE public.move_type OWNER TO postgres;

--
-- Name: occupant_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.occupant_type AS ENUM (
    'owner_occupied',
    'tenant_occupied',
    'vacant'
);


ALTER TYPE public.occupant_type OWNER TO postgres;

--
-- Name: ownership_change_initiation_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ownership_change_initiation_type AS ENUM (
    'path_a',
    'path_b'
);


ALTER TYPE public.ownership_change_initiation_type OWNER TO postgres;

--
-- Name: ownership_change_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ownership_change_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'completed'
);


ALTER TYPE public.ownership_change_status OWNER TO postgres;

--
-- Name: parking_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.parking_type AS ENUM (
    'underground',
    'surface'
);


ALTER TYPE public.parking_type OWNER TO postgres;

--
-- Name: permit_payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.permit_payment_status AS ENUM (
    'unpaid',
    'paid',
    'refund_pending',
    'refunded',
    'forfeited'
);


ALTER TYPE public.permit_payment_status OWNER TO postgres;

--
-- Name: permit_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.permit_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'approved_with_conditions',
    'rejected',
    'in_progress',
    'completed',
    'deposit_refunded',
    'deposit_forfeited'
);


ALTER TYPE public.permit_status OWNER TO postgres;

--
-- Name: permit_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.permit_type AS ENUM (
    'move_in',
    'move_out',
    'renovation',
    'additional_vehicle'
);


ALTER TYPE public.permit_type OWNER TO postgres;

--
-- Name: renovation_scope; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.renovation_scope AS ENUM (
    'cosmetic',
    'structural',
    'plumbing_electrical',
    'exterior_affecting',
    'kitchen_bathroom'
);


ALTER TYPE public.renovation_scope OWNER TO postgres;

--
-- Name: resident_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.resident_status AS ENUM (
    'active',
    'inactive',
    'moved_out'
);


ALTER TYPE public.resident_status OWNER TO postgres;

--
-- Name: resident_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.resident_type AS ENUM (
    'owner',
    'tenant',
    'family'
);


ALTER TYPE public.resident_type OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'tenant',
    'admin',
    'supervisor',
    'guard'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'pending',
    'suspended'
);


ALTER TYPE public.user_status OWNER TO postgres;

--
-- Name: user_verification_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_verification_status AS ENUM (
    'unverified',
    'pending_manual',
    'pending_owner_approval',
    'verified_owner',
    'verified_tenant',
    'linkage_ended',
    'pre_approved',
    'verified_household_member'
);


ALTER TYPE public.user_verification_status OWNER TO postgres;

--
-- Name: vehicle_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.vehicle_status AS ENUM (
    'active',
    'inactive',
    'pending_approval'
);


ALTER TYPE public.vehicle_status OWNER TO postgres;

--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired',
    'cancelled'
);


ALTER TYPE public.verification_status OWNER TO postgres;

--
-- Name: verification_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.verification_type AS ENUM (
    'owner_manual',
    'tenant_request'
);


ALTER TYPE public.verification_type OWNER TO postgres;

--
-- Name: waha_pass_application_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.waha_pass_application_status AS ENUM (
    'pending_review',
    'active',
    'revoked',
    'rejected'
);


ALTER TYPE public.waha_pass_application_status OWNER TO postgres;

--
-- Name: waha_pass_credential_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.waha_pass_credential_status AS ENUM (
    'active',
    'revoked',
    'lost',
    'stolen',
    'damaged'
);


ALTER TYPE public.waha_pass_credential_status OWNER TO postgres;

--
-- Name: waha_pass_event_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.waha_pass_event_type AS ENUM (
    'applied',
    'approved',
    'rejected',
    'revoked',
    'lost_reported',
    'replacement_paid',
    'replacement_issued',
    'resident_archived'
);


ALTER TYPE public.waha_pass_event_type OWNER TO postgres;

--
-- Name: waha_pass_occupancy_track; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.waha_pass_occupancy_track AS ENUM (
    'owner',
    'tenant'
);


ALTER TYPE public.waha_pass_occupancy_track OWNER TO postgres;

--
-- Name: cascade_folder_visibility_floor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cascade_folder_visibility_floor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only act when the folder is being tightened (higher rank = more restrictive).
  IF (CASE NEW.default_visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners'  THEN 2
        WHEN 'admin_only'       THEN 3
        ELSE 4
      END) > (CASE OLD.default_visibility
        WHEN 'all_portal_users' THEN 1
        WHEN 'verified_owners'  THEN 2
        WHEN 'admin_only'       THEN 3
        ELSE 0
      END) THEN
    -- Raise every document below the new floor up to the new floor.
    -- The document-level BEFORE trigger is not retriggered here because this
    -- AFTER trigger fires after the folder row has already been committed, so
    -- the raised document visibility satisfies the floor check.
    UPDATE documents
    SET visibility = NEW.default_visibility
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
      END);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.cascade_folder_visibility_floor() OWNER TO postgres;

--
-- Name: enforce_document_visibility_floor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_document_visibility_floor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  folder_floor text;
BEGIN
  SELECT default_visibility
  INTO folder_floor
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
$$;


ALTER FUNCTION public.enforce_document_visibility_floor() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_knowledge_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_knowledge_chunks (
    id integer NOT NULL,
    document_id integer NOT NULL,
    filename text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_knowledge_chunks OWNER TO postgres;

--
-- Name: ai_knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_knowledge_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_knowledge_chunks_id_seq OWNER TO postgres;

--
-- Name: ai_knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_knowledge_chunks_id_seq OWNED BY public.ai_knowledge_chunks.id;


--
-- Name: ai_knowledge_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_knowledge_documents (
    id integer NOT NULL,
    filename text NOT NULL,
    mime_type text,
    uploaded_by_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_knowledge_documents OWNER TO postgres;

--
-- Name: ai_knowledge_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_knowledge_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_knowledge_documents_id_seq OWNER TO postgres;

--
-- Name: ai_knowledge_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_knowledge_documents_id_seq OWNED BY public.ai_knowledge_documents.id;


--
-- Name: announcement_edit_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_edit_history (
    id integer NOT NULL,
    announcement_id integer NOT NULL,
    edited_by integer NOT NULL,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    change_summary text,
    was_flagged_material boolean DEFAULT false NOT NULL
);


ALTER TABLE public.announcement_edit_history OWNER TO postgres;

--
-- Name: announcement_edit_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.announcement_edit_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcement_edit_history_id_seq OWNER TO postgres;

--
-- Name: announcement_edit_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.announcement_edit_history_id_seq OWNED BY public.announcement_edit_history.id;


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    author_id integer NOT NULL,
    published_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_arabic text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    title_ar text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcements_id_seq OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    facility_id integer NOT NULL,
    user_id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status public.booking_status DEFAULT 'pending'::public.booking_status NOT NULL,
    total_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    payment_status public.booking_payment_status DEFAULT 'unpaid'::public.booking_payment_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    charge_id text,
    payment_url text,
    paid_at timestamp with time zone,
    payment_method text,
    movie_title text,
    payment_provider text,
    facility_name text
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bookings_id_seq OWNER TO postgres;

--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: communications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.communications OWNER TO postgres;

--
-- Name: communications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.communications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.communications_id_seq OWNER TO postgres;

--
-- Name: communications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.communications_id_seq OWNED BY public.communications.id;


--
-- Name: data_migration_corrections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_migration_corrections (
    id integer NOT NULL,
    entity_type text NOT NULL,
    source_reference text NOT NULL,
    issue_code text NOT NULL,
    raw_payload jsonb,
    details text,
    status public.data_correction_status DEFAULT 'open'::public.data_correction_status NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.data_migration_corrections OWNER TO postgres;

--
-- Name: data_migration_corrections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.data_migration_corrections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.data_migration_corrections_id_seq OWNER TO postgres;

--
-- Name: data_migration_corrections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.data_migration_corrections_id_seq OWNED BY public.data_migration_corrections.id;


--
-- Name: document_folders; Type: TABLE; Schema: public; Owner: postgres
--

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
    CONSTRAINT document_folders_download_mode_check CHECK ((default_download_mode = ANY (ARRAY['download_allowed'::text, 'view_only'::text]))),
    CONSTRAINT document_folders_visibility_check CHECK ((default_visibility = ANY (ARRAY['all_portal_users'::text, 'verified_owners'::text, 'admin_only'::text])))
);


ALTER TABLE public.document_folders OWNER TO postgres;

--
-- Name: document_folders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.document_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.document_folders_id_seq OWNER TO postgres;

--
-- Name: document_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.document_folders_id_seq OWNED BY public.document_folders.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

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
    CONSTRAINT documents_download_mode_check CHECK ((download_mode = ANY (ARRAY['download_allowed'::text, 'view_only'::text]))),
    CONSTRAINT documents_visibility_check CHECK ((visibility = ANY (ARRAY['all_portal_users'::text, 'verified_owners'::text, 'admin_only'::text])))
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.documents_id_seq OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: facilities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facilities (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    price_per_hour numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    max_capacity integer,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    weekday_open_hour integer DEFAULT 10 NOT NULL,
    weekday_close_hour integer DEFAULT 23 NOT NULL,
    weekend_open_hour integer DEFAULT 10 NOT NULL,
    weekend_close_hour integer DEFAULT 25 NOT NULL,
    slot_interval_minutes integer DEFAULT 60 NOT NULL,
    min_duration_minutes integer DEFAULT 60 NOT NULL,
    max_duration_minutes integer DEFAULT 240 NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    pricing_model text DEFAULT 'per_hour'::text NOT NULL,
    flat_fee_amount numeric(10,2),
    requires_movie_title boolean DEFAULT false NOT NULL,
    capacity_mode text DEFAULT 'numeric'::text NOT NULL,
    cleaning_buffer_minutes integer DEFAULT 15 NOT NULL,
    CONSTRAINT facilities_cleaning_buffer_minutes_non_negative CHECK ((cleaning_buffer_minutes >= 0))
);


ALTER TABLE public.facilities OWNER TO postgres;

--
-- Name: facilities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.facilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.facilities_id_seq OWNER TO postgres;

--
-- Name: facilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.facilities_id_seq OWNED BY public.facilities.id;


--
-- Name: facility_booking_config_normalization_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facility_booking_config_normalization_audit (
    id integer NOT NULL,
    facility_id integer NOT NULL,
    previous_slot_interval_minutes integer NOT NULL,
    previous_min_duration_minutes integer NOT NULL,
    previous_max_duration_minutes integer NOT NULL,
    normalized_slot_interval_minutes integer NOT NULL,
    normalized_min_duration_minutes integer NOT NULL,
    normalized_max_duration_minutes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


ALTER TABLE public.facility_booking_config_normalization_audit OWNER TO postgres;

--
-- Name: facility_booking_config_normalization_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.facility_booking_config_normalization_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.facility_booking_config_normalization_audit_id_seq OWNER TO postgres;

--
-- Name: facility_booking_config_normalization_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.facility_booking_config_normalization_audit_id_seq OWNED BY public.facility_booking_config_normalization_audit.id;


--
-- Name: facility_operating_hours_conflicts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facility_operating_hours_conflicts (
    id integer NOT NULL,
    facility_id integer NOT NULL,
    booking_id integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


ALTER TABLE public.facility_operating_hours_conflicts OWNER TO postgres;

--
-- Name: facility_operating_hours_conflicts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.facility_operating_hours_conflicts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.facility_operating_hours_conflicts_id_seq OWNER TO postgres;

--
-- Name: facility_operating_hours_conflicts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.facility_operating_hours_conflicts_id_seq OWNED BY public.facility_operating_hours_conflicts.id;


--
-- Name: guest_entry_exit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guest_entry_exit_logs (
    id integer NOT NULL,
    pass_id integer NOT NULL,
    event_type text NOT NULL,
    event_time timestamp with time zone DEFAULT now() NOT NULL,
    security_guard_id text,
    notes text
);


ALTER TABLE public.guest_entry_exit_logs OWNER TO postgres;

--
-- Name: guest_entry_exit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.guest_entry_exit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.guest_entry_exit_logs_id_seq OWNER TO postgres;

--
-- Name: guest_entry_exit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.guest_entry_exit_logs_id_seq OWNED BY public.guest_entry_exit_logs.id;


--
-- Name: guest_pass_verification_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guest_pass_verification_logs (
    id integer NOT NULL,
    pass_id integer NOT NULL,
    verification_time timestamp with time zone DEFAULT now() NOT NULL,
    result text NOT NULL,
    security_guard_id text,
    notes text
);


ALTER TABLE public.guest_pass_verification_logs OWNER TO postgres;

--
-- Name: guest_pass_verification_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.guest_pass_verification_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.guest_pass_verification_logs_id_seq OWNER TO postgres;

--
-- Name: guest_pass_verification_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.guest_pass_verification_logs_id_seq OWNED BY public.guest_pass_verification_logs.id;


--
-- Name: guest_passes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guest_passes (
    id integer NOT NULL,
    pass_uuid text NOT NULL,
    verification_token text NOT NULL,
    guest_id integer NOT NULL,
    resident_id integer NOT NULL,
    guest_name text NOT NULL,
    visit_date date NOT NULL,
    visit_start_time text,
    visit_end_time text,
    vehicle_plate text,
    reason_for_visit text,
    status public.guest_pass_status DEFAULT 'approved'::public.guest_pass_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    revoked_at timestamp with time zone,
    national_id text
);


ALTER TABLE public.guest_passes OWNER TO postgres;

--
-- Name: guest_passes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.guest_passes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.guest_passes_id_seq OWNER TO postgres;

--
-- Name: guest_passes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.guest_passes_id_seq OWNED BY public.guest_passes.id;


--
-- Name: guests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guests (
    id integer NOT NULL,
    resident_id integer NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    vehicle_plate text,
    visit_date date NOT NULL,
    visit_reason text,
    status public.guest_status DEFAULT 'pending'::public.guest_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    national_id text
);


ALTER TABLE public.guests OWNER TO postgres;

--
-- Name: guests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.guests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.guests_id_seq OWNER TO postgres;

--
-- Name: guests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.guests_id_seq OWNED BY public.guests.id;


--
-- Name: hoa_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hoa_settings (
    id integer NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hoa_settings OWNER TO postgres;

--
-- Name: hoa_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hoa_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.hoa_settings_id_seq OWNER TO postgres;

--
-- Name: hoa_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hoa_settings_id_seq OWNED BY public.hoa_settings.id;


--
-- Name: household_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.household_invitations (
    id integer NOT NULL,
    unit_id integer NOT NULL,
    unit_number text NOT NULL,
    invited_email text NOT NULL,
    token text NOT NULL,
    created_by_user_id integer NOT NULL,
    resident_id integer,
    status public.household_invitation_status DEFAULT 'pending'::public.household_invitation_status NOT NULL,
    used_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.household_invitations OWNER TO postgres;

--
-- Name: household_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.household_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.household_invitations_id_seq OWNER TO postgres;

--
-- Name: household_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.household_invitations_id_seq OWNED BY public.household_invitations.id;


--
-- Name: move_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.move_forms (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type public.move_type NOT NULL,
    scheduled_date date NOT NULL,
    unit_number text NOT NULL,
    notes text,
    status public.move_form_status DEFAULT 'pending'::public.move_form_status NOT NULL,
    reviewed_by_id integer,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revocation_processed_at timestamp with time zone
);


ALTER TABLE public.move_forms OWNER TO postgres;

--
-- Name: move_forms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.move_forms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.move_forms_id_seq OWNER TO postgres;

--
-- Name: move_forms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.move_forms_id_seq OWNED BY public.move_forms.id;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_preferences (
    id integer NOT NULL,
    user_id integer NOT NULL,
    announcements boolean DEFAULT true NOT NULL,
    bookings boolean DEFAULT true NOT NULL,
    guest_passes boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_preferences OWNER TO postgres;

--
-- Name: notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notification_preferences_id_seq OWNER TO postgres;

--
-- Name: notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notification_preferences_id_seq OWNED BY public.notification_preferences.id;


--
-- Name: ownership_change_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ownership_change_events (
    id integer NOT NULL,
    unit_id integer NOT NULL,
    unit_number text NOT NULL,
    initiation_type public.ownership_change_initiation_type NOT NULL,
    outgoing_owner_id integer,
    outgoing_owner_name text,
    outgoing_owner_email text,
    outgoing_owner_national_id text,
    new_owner_name text,
    new_owner_national_id text,
    proof_document_key text,
    status public.ownership_change_status DEFAULT 'pending'::public.ownership_change_status NOT NULL,
    reviewed_by_admin_id integer,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    new_owner_user_id integer,
    rejection_reason text
);


ALTER TABLE public.ownership_change_events OWNER TO postgres;

--
-- Name: ownership_change_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ownership_change_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ownership_change_events_id_seq OWNER TO postgres;

--
-- Name: ownership_change_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ownership_change_events_id_seq OWNED BY public.ownership_change_events.id;


--
-- Name: parking_lots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parking_lots (
    id integer NOT NULL,
    unit_id integer NOT NULL,
    building text NOT NULL,
    lot_number text NOT NULL,
    parking_type public.parking_type NOT NULL,
    active boolean DEFAULT true NOT NULL,
    source text DEFAULT 'stage2'::text NOT NULL,
    source_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.parking_lots OWNER TO postgres;

--
-- Name: parking_lots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.parking_lots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.parking_lots_id_seq OWNER TO postgres;

--
-- Name: parking_lots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.parking_lots_id_seq OWNED BY public.parking_lots.id;


--
-- Name: permits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permits (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type public.permit_type NOT NULL,
    description text,
    contractor_name text,
    contractor_contact text,
    status public.permit_status DEFAULT 'submitted'::public.permit_status NOT NULL,
    reviewed_by_id integer,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_id integer,
    unit_number text,
    requested_start_date date,
    requested_end_date date,
    conditions text,
    admin_fee numeric(10,2) DEFAULT 0,
    deposit_amount numeric(10,2) DEFAULT 0,
    payment_status public.permit_payment_status DEFAULT 'unpaid'::public.permit_payment_status NOT NULL,
    payment_note text,
    move_type text,
    moving_company_name text,
    moving_company_contact text,
    elevator_slot text,
    renovation_scope text,
    contractor_license text,
    working_hours_requested text,
    common_area_impact boolean DEFAULT false,
    common_area_impact_details text,
    vehicle_make text,
    vehicle_model text,
    vehicle_plate text,
    vehicle_color text,
    charge_id text,
    payment_url text,
    payment_provider text
);


ALTER TABLE public.permits OWNER TO postgres;

--
-- Name: permits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.permits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permits_id_seq OWNER TO postgres;

--
-- Name: permits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.permits_id_seq OWNED BY public.permits.id;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id text
);


ALTER TABLE public.push_tokens OWNER TO postgres;

--
-- Name: push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.push_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.push_tokens_id_seq OWNER TO postgres;

--
-- Name: push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.push_tokens_id_seq OWNED BY public.push_tokens.id;


--
-- Name: residents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.residents (
    id integer NOT NULL,
    type public.resident_type NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    unit_number text NOT NULL,
    relationship text,
    registered_by_id integer,
    status public.resident_status DEFAULT 'active'::public.resident_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_id integer,
    date_of_birth date,
    id_number text,
    has_portal_access boolean DEFAULT false NOT NULL,
    id_photo_key text,
    linked_user_id integer,
    middle_name text,
    phone_normalized text
);


ALTER TABLE public.residents OWNER TO postgres;

--
-- Name: residents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.residents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.residents_id_seq OWNER TO postgres;

--
-- Name: residents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.residents_id_seq OWNED BY public.residents.id;


--
-- Name: unit_verification_document_cleanup_retries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unit_verification_document_cleanup_retries (
    id integer NOT NULL,
    verification_id integer NOT NULL,
    document_kind text NOT NULL,
    object_key text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT unit_verification_cleanup_document_kind_check CHECK ((document_kind = ANY (ARRAY['title_deed'::text, 'ejar'::text])))
);


ALTER TABLE public.unit_verification_document_cleanup_retries OWNER TO postgres;

--
-- Name: unit_verification_document_cleanup_retries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.unit_verification_document_cleanup_retries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.unit_verification_document_cleanup_retries_id_seq OWNER TO postgres;

--
-- Name: unit_verification_document_cleanup_retries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.unit_verification_document_cleanup_retries_id_seq OWNED BY public.unit_verification_document_cleanup_retries.id;


--
-- Name: unit_verification_owner_id_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unit_verification_owner_id_attempts (
    user_id integer NOT NULL,
    unit_key text NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.unit_verification_owner_id_attempts OWNER TO postgres;

--
-- Name: unit_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unit_verifications (
    id integer NOT NULL,
    type public.verification_type NOT NULL,
    user_id integer NOT NULL,
    unit_id integer NOT NULL,
    national_id text,
    document_note text,
    ejar_reference text,
    status public.verification_status DEFAULT 'pending'::public.verification_status NOT NULL,
    reviewed_by_id integer,
    review_note text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text,
    middle_name text,
    last_name text,
    mobile text,
    owner_national_id text,
    parking_lots text,
    title_deed_key text,
    ejar_document_key text,
    lease_start_date date,
    lease_end_date date,
    title_deed_original_filename text,
    title_deed_content_hash text,
    title_deed_deleted_at timestamp with time zone,
    ejar_original_filename text,
    ejar_content_hash text,
    ejar_deleted_at timestamp with time zone,
    document_decision text,
    document_decided_by_id integer,
    document_decided_at timestamp with time zone,
    cancelled_by_id integer,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    routed_to text,
    routed_at timestamp with time zone,
    CONSTRAINT unit_verifications_routed_to_check CHECK (((routed_to IS NULL) OR (routed_to = ANY (ARRAY['owner'::text, 'admin'::text]))))
);


ALTER TABLE public.unit_verifications OWNER TO postgres;

--
-- Name: unit_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.unit_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.unit_verifications_id_seq OWNER TO postgres;

--
-- Name: unit_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.unit_verifications_id_seq OWNED BY public.unit_verifications.id;


--
-- Name: units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.units (
    id integer NOT NULL,
    building text NOT NULL,
    unit_number text NOT NULL,
    floor text,
    unit_type text,
    size_sqm numeric(8,2),
    title_reference text,
    verified_owner_id integer,
    verified_tenant_id integer,
    occupant_type public.occupant_type DEFAULT 'vacant'::public.occupant_type NOT NULL,
    emergency_contact text,
    emergency_phone text,
    preferred_contact text,
    mailing_address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pre_approved_claim_id integer,
    parking_lots text,
    normalised_unit_number text GENERATED ALWAYS AS (upper(regexp_replace((COALESCE(building, ''::text) || COALESCE(unit_number, ''::text)), '\s+'::text, ''::text, 'g'::text))) STORED NOT NULL,
    owner_national_id text
);


ALTER TABLE public.units OWNER TO postgres;

--
-- Name: units_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.units_id_seq OWNER TO postgres;

--
-- Name: units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.units_id_seq OWNED BY public.units.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    clerk_id text NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    phone text,
    unit_number text,
    role public.user_role DEFAULT 'tenant'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_id integer,
    national_id text,
    verification_status public.user_verification_status DEFAULT 'unverified'::public.user_verification_status NOT NULL,
    middle_name text,
    phone_normalized text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicles (
    id integer NOT NULL,
    user_id integer NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    year integer,
    color text,
    plate_number text NOT NULL,
    status public.vehicle_status DEFAULT 'active'::public.vehicle_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_id integer,
    istimara_number text,
    is_additional boolean DEFAULT false NOT NULL,
    approval_note text,
    approved_by_id integer,
    is_basement_parking boolean DEFAULT false NOT NULL,
    registration_doc_key text,
    parking_lot_id integer,
    rejection_reason text,
    reviewed_by_id integer
);


ALTER TABLE public.vehicles OWNER TO postgres;

--
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vehicles_id_seq OWNER TO postgres;

--
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vehicles_id_seq OWNED BY public.vehicles.id;


--
-- Name: waha_guest_day_passes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waha_guest_day_passes (
    id integer NOT NULL,
    unit_id integer NOT NULL,
    unit_number text,
    date date NOT NULL,
    extra_guest_count integer NOT NULL,
    amount_sar numeric NOT NULL,
    charge_id text,
    payment_url text,
    payment_provider text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    purchased_by_user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.waha_guest_day_passes OWNER TO postgres;

--
-- Name: waha_guest_day_passes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.waha_guest_day_passes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.waha_guest_day_passes_id_seq OWNER TO postgres;

--
-- Name: waha_guest_day_passes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.waha_guest_day_passes_id_seq OWNED BY public.waha_guest_day_passes.id;


--
-- Name: waha_pass_applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waha_pass_applications (
    id integer NOT NULL,
    unit_id integer NOT NULL,
    applicant_user_id integer NOT NULL,
    second_resident_id integer,
    occupancy_track public.waha_pass_occupancy_track NOT NULL,
    status public.waha_pass_application_status DEFAULT 'pending_review'::public.waha_pass_application_status NOT NULL,
    reviewed_by_id integer,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.waha_pass_applications OWNER TO postgres;

--
-- Name: waha_pass_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.waha_pass_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.waha_pass_applications_id_seq OWNER TO postgres;

--
-- Name: waha_pass_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.waha_pass_applications_id_seq OWNED BY public.waha_pass_applications.id;


--
-- Name: waha_pass_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waha_pass_credentials (
    id integer NOT NULL,
    application_id integer NOT NULL,
    credential_index integer NOT NULL,
    pass_number text,
    verification_token text,
    holder_name text NOT NULL,
    held_by_user_id integer,
    status public.waha_pass_credential_status DEFAULT 'active'::public.waha_pass_credential_status NOT NULL,
    revocation_reason text,
    revoked_at timestamp with time zone,
    replaced_by_credential_id integer,
    charge_id text,
    payment_url text,
    payment_provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.waha_pass_credentials OWNER TO postgres;

--
-- Name: waha_pass_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.waha_pass_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.waha_pass_credentials_id_seq OWNER TO postgres;

--
-- Name: waha_pass_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.waha_pass_credentials_id_seq OWNED BY public.waha_pass_credentials.id;


--
-- Name: waha_pass_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waha_pass_events (
    id integer NOT NULL,
    application_id integer NOT NULL,
    credential_id integer,
    event_type public.waha_pass_event_type NOT NULL,
    actor_user_id integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.waha_pass_events OWNER TO postgres;

--
-- Name: waha_pass_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.waha_pass_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.waha_pass_events_id_seq OWNER TO postgres;

--
-- Name: waha_pass_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.waha_pass_events_id_seq OWNED BY public.waha_pass_events.id;


--
-- Name: ai_knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.ai_knowledge_chunks_id_seq'::regclass);


--
-- Name: ai_knowledge_documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_documents ALTER COLUMN id SET DEFAULT nextval('public.ai_knowledge_documents_id_seq'::regclass);


--
-- Name: announcement_edit_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_edit_history ALTER COLUMN id SET DEFAULT nextval('public.announcement_edit_history_id_seq'::regclass);


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: communications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communications ALTER COLUMN id SET DEFAULT nextval('public.communications_id_seq'::regclass);


--
-- Name: data_migration_corrections id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_migration_corrections ALTER COLUMN id SET DEFAULT nextval('public.data_migration_corrections_id_seq'::regclass);


--
-- Name: document_folders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_folders ALTER COLUMN id SET DEFAULT nextval('public.document_folders_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: facilities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities ALTER COLUMN id SET DEFAULT nextval('public.facilities_id_seq'::regclass);


--
-- Name: facility_booking_config_normalization_audit id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_booking_config_normalization_audit ALTER COLUMN id SET DEFAULT nextval('public.facility_booking_config_normalization_audit_id_seq'::regclass);


--
-- Name: facility_operating_hours_conflicts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_operating_hours_conflicts ALTER COLUMN id SET DEFAULT nextval('public.facility_operating_hours_conflicts_id_seq'::regclass);


--
-- Name: guest_entry_exit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_entry_exit_logs ALTER COLUMN id SET DEFAULT nextval('public.guest_entry_exit_logs_id_seq'::regclass);


--
-- Name: guest_pass_verification_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_pass_verification_logs ALTER COLUMN id SET DEFAULT nextval('public.guest_pass_verification_logs_id_seq'::regclass);


--
-- Name: guest_passes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_passes ALTER COLUMN id SET DEFAULT nextval('public.guest_passes_id_seq'::regclass);


--
-- Name: guests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guests ALTER COLUMN id SET DEFAULT nextval('public.guests_id_seq'::regclass);


--
-- Name: hoa_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hoa_settings ALTER COLUMN id SET DEFAULT nextval('public.hoa_settings_id_seq'::regclass);


--
-- Name: household_invitations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.household_invitations ALTER COLUMN id SET DEFAULT nextval('public.household_invitations_id_seq'::regclass);


--
-- Name: move_forms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.move_forms ALTER COLUMN id SET DEFAULT nextval('public.move_forms_id_seq'::regclass);


--
-- Name: notification_preferences id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.notification_preferences_id_seq'::regclass);


--
-- Name: ownership_change_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ownership_change_events ALTER COLUMN id SET DEFAULT nextval('public.ownership_change_events_id_seq'::regclass);


--
-- Name: parking_lots id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parking_lots ALTER COLUMN id SET DEFAULT nextval('public.parking_lots_id_seq'::regclass);


--
-- Name: permits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permits ALTER COLUMN id SET DEFAULT nextval('public.permits_id_seq'::regclass);


--
-- Name: push_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_tokens ALTER COLUMN id SET DEFAULT nextval('public.push_tokens_id_seq'::regclass);


--
-- Name: residents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.residents ALTER COLUMN id SET DEFAULT nextval('public.residents_id_seq'::regclass);


--
-- Name: unit_verification_document_cleanup_retries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unit_verification_document_cleanup_retries ALTER COLUMN id SET DEFAULT nextval('public.unit_verification_document_cleanup_retries_id_seq'::regclass);


--
-- Name: unit_verifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unit_verifications ALTER COLUMN id SET DEFAULT nextval('public.unit_verifications_id_seq'::regclass);


--
-- Name: units id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units ALTER COLUMN id SET DEFAULT nextval('public.units_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vehicles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN id SET DEFAULT nextval('public.vehicles_id_seq'::regclass);


--
-- Name: waha_guest_day_passes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_guest_day_passes ALTER COLUMN id SET DEFAULT nextval('public.waha_guest_day_passes_id_seq'::regclass);


--
-- Name: waha_pass_applications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_applications ALTER COLUMN id SET DEFAULT nextval('public.waha_pass_applications_id_seq'::regclass);


--
-- Name: waha_pass_credentials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_credentials ALTER COLUMN id SET DEFAULT nextval('public.waha_pass_credentials_id_seq'::regclass);


--
-- Name: waha_pass_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_events ALTER COLUMN id SET DEFAULT nextval('public.waha_pass_events_id_seq'::regclass);


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_documents ai_knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: announcement_edit_history announcement_edit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_edit_history
    ADD CONSTRAINT announcement_edit_history_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: data_migration_corrections data_migration_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_migration_corrections
    ADD CONSTRAINT data_migration_corrections_pkey PRIMARY KEY (id);


--
-- Name: document_folders document_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_folders
    ADD CONSTRAINT document_folders_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);


--
-- Name: facility_booking_config_normalization_audit facility_booking_config_normalization_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_booking_config_normalization_audit
    ADD CONSTRAINT facility_booking_config_normalization_audit_pkey PRIMARY KEY (id);


--
-- Name: facility_operating_hours_conflicts facility_operating_hours_conflicts_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_operating_hours_conflicts
    ADD CONSTRAINT facility_operating_hours_conflicts_booking_id_key UNIQUE (booking_id);


--
-- Name: facility_operating_hours_conflicts facility_operating_hours_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_operating_hours_conflicts
    ADD CONSTRAINT facility_operating_hours_conflicts_pkey PRIMARY KEY (id);


--
-- Name: guest_entry_exit_logs guest_entry_exit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_entry_exit_logs
    ADD CONSTRAINT guest_entry_exit_logs_pkey PRIMARY KEY (id);


--
-- Name: guest_pass_verification_logs guest_pass_verification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_pass_verification_logs
    ADD CONSTRAINT guest_pass_verification_logs_pkey PRIMARY KEY (id);


--
-- Name: guest_passes guest_passes_pass_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_passes
    ADD CONSTRAINT guest_passes_pass_uuid_unique UNIQUE (pass_uuid);


--
-- Name: guest_passes guest_passes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_passes
    ADD CONSTRAINT guest_passes_pkey PRIMARY KEY (id);


--
-- Name: guest_passes guest_passes_verification_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guest_passes
    ADD CONSTRAINT guest_passes_verification_token_unique UNIQUE (verification_token);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: hoa_settings hoa_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hoa_settings
    ADD CONSTRAINT hoa_settings_key_unique UNIQUE (key);


--
-- Name: hoa_settings hoa_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hoa_settings
    ADD CONSTRAINT hoa_settings_pkey PRIMARY KEY (id);


--
-- Name: household_invitations household_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_pkey PRIMARY KEY (id);


--
-- Name: household_invitations household_invitations_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_token_unique UNIQUE (token);


--
-- Name: move_forms move_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.move_forms
    ADD CONSTRAINT move_forms_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_unique UNIQUE (user_id);


--
-- Name: ownership_change_events ownership_change_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ownership_change_events
    ADD CONSTRAINT ownership_change_events_pkey PRIMARY KEY (id);


--
-- Name: parking_lots parking_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parking_lots
    ADD CONSTRAINT parking_lots_pkey PRIMARY KEY (id);


--
-- Name: permits permits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permits
    ADD CONSTRAINT permits_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_unique UNIQUE (token);


--
-- Name: residents residents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.residents
    ADD CONSTRAINT residents_pkey PRIMARY KEY (id);


--
-- Name: unit_verification_document_cleanup_retries unit_verification_document_cleanup_retries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unit_verification_document_cleanup_retries
    ADD CONSTRAINT unit_verification_document_cleanup_retries_pkey PRIMARY KEY (id);


--
-- Name: unit_verification_owner_id_attempts unit_verification_owner_id_attempts_user_id_unit_key_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unit_verification_owner_id_attempts
    ADD CONSTRAINT unit_verification_owner_id_attempts_user_id_unit_key_pk PRIMARY KEY (user_id, unit_key);


--
-- Name: unit_verifications unit_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unit_verifications
    ADD CONSTRAINT unit_verifications_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: users users_clerk_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: waha_guest_day_passes waha_guest_day_passes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_guest_day_passes
    ADD CONSTRAINT waha_guest_day_passes_pkey PRIMARY KEY (id);


--
-- Name: waha_pass_applications waha_pass_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_applications
    ADD CONSTRAINT waha_pass_applications_pkey PRIMARY KEY (id);


--
-- Name: waha_pass_credentials waha_pass_credentials_pass_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_credentials
    ADD CONSTRAINT waha_pass_credentials_pass_number_unique UNIQUE (pass_number);


--
-- Name: waha_pass_credentials waha_pass_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_credentials
    ADD CONSTRAINT waha_pass_credentials_pkey PRIMARY KEY (id);


--
-- Name: waha_pass_credentials waha_pass_credentials_verification_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_credentials
    ADD CONSTRAINT waha_pass_credentials_verification_token_unique UNIQUE (verification_token);


--
-- Name: waha_pass_events waha_pass_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waha_pass_events
    ADD CONSTRAINT waha_pass_events_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_knowledge_chunks_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_knowledge_chunks_document_id ON public.ai_knowledge_chunks USING btree (document_id);


--
-- Name: idx_ai_knowledge_documents_uploaded_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_knowledge_documents_uploaded_by_id ON public.ai_knowledge_documents USING btree (uploaded_by_id);


--
-- Name: idx_announcement_edit_history_announcement_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_edit_history_announcement_id ON public.announcement_edit_history USING btree (announcement_id);


--
-- Name: idx_announcement_edit_history_edited_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_edit_history_edited_by ON public.announcement_edit_history USING btree (edited_by);


--
-- Name: idx_announcements_author_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcements_author_id ON public.announcements USING btree (author_id);


--
-- Name: idx_bookings_facility_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_facility_id ON public.bookings USING btree (facility_id);


--
-- Name: idx_bookings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);


--
-- Name: idx_communications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_communications_user_id ON public.communications USING btree (user_id);


--
-- Name: idx_data_migration_corrections_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_migration_corrections_status ON public.data_migration_corrections USING btree (status);


--
-- Name: idx_document_folders_active_sort; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_folders_active_sort ON public.document_folders USING btree (is_active, sort_order);


--
-- Name: idx_document_folders_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_document_folders_name_unique ON public.document_folders USING btree (name);


--
-- Name: idx_documents_folder_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_folder_current ON public.documents USING btree (folder_id, is_archived, created_at);


--
-- Name: idx_documents_replaced_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_replaced_by_id ON public.documents USING btree (replaced_by_id);


--
-- Name: idx_documents_uploaded_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_uploaded_by_id ON public.documents USING btree (uploaded_by_id);


--
-- Name: idx_guest_entry_exit_logs_pass_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guest_entry_exit_logs_pass_id ON public.guest_entry_exit_logs USING btree (pass_id);


--
-- Name: idx_guest_pass_verification_logs_pass_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guest_pass_verification_logs_pass_id ON public.guest_pass_verification_logs USING btree (pass_id);


--
-- Name: idx_guest_passes_guest_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guest_passes_guest_id ON public.guest_passes USING btree (guest_id);


--
-- Name: idx_guest_passes_resident_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guest_passes_resident_id ON public.guest_passes USING btree (resident_id);


--
-- Name: idx_guests_resident_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guests_resident_id ON public.guests USING btree (resident_id);


--
-- Name: idx_household_invitations_invited_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_household_invitations_invited_email ON public.household_invitations USING btree (invited_email);


--
-- Name: idx_household_invitations_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_household_invitations_unit_id ON public.household_invitations USING btree (unit_id);


--
-- Name: idx_move_forms_reviewed_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_move_forms_reviewed_by_id ON public.move_forms USING btree (reviewed_by_id);


--
-- Name: idx_move_forms_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_move_forms_user_id ON public.move_forms USING btree (user_id);


--
-- Name: idx_ownership_change_events_outgoing_owner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ownership_change_events_outgoing_owner_id ON public.ownership_change_events USING btree (outgoing_owner_id);


--
-- Name: idx_ownership_change_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ownership_change_events_status ON public.ownership_change_events USING btree (status);


--
-- Name: idx_ownership_change_events_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ownership_change_events_unit_id ON public.ownership_change_events USING btree (unit_id);


--
-- Name: idx_parking_lots_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parking_lots_unit_id ON public.parking_lots USING btree (unit_id);


--
-- Name: idx_permits_reviewed_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_permits_reviewed_by_id ON public.permits USING btree (reviewed_by_id);


--
-- Name: idx_permits_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_permits_unit_id ON public.permits USING btree (unit_id);


--
-- Name: idx_permits_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_permits_user_id ON public.permits USING btree (user_id);


--
-- Name: idx_push_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);


--
-- Name: idx_residents_registered_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_residents_registered_by_id ON public.residents USING btree (registered_by_id);


--
-- Name: idx_residents_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_residents_unit_id ON public.residents USING btree (unit_id);


--
-- Name: idx_unit_verification_cleanup_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unit_verification_cleanup_pending ON public.unit_verification_document_cleanup_retries USING btree (processed_at, created_at);


--
-- Name: idx_unit_verifications_reviewed_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unit_verifications_reviewed_by_id ON public.unit_verifications USING btree (reviewed_by_id);


--
-- Name: idx_unit_verifications_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unit_verifications_unit_id ON public.unit_verifications USING btree (unit_id);


--
-- Name: idx_unit_verifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unit_verifications_user_id ON public.unit_verifications USING btree (user_id);


--
-- Name: idx_units_verified_owner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_units_verified_owner_id ON public.units USING btree (verified_owner_id);


--
-- Name: idx_units_verified_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_units_verified_tenant_id ON public.units USING btree (verified_tenant_id);


--
-- Name: idx_users_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_unit_id ON public.users USING btree (unit_id);


--
-- Name: idx_vehicles_approved_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_approved_by_id ON public.vehicles USING btree (approved_by_id);


--
-- Name: idx_vehicles_parking_lot_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_parking_lot_id ON public.vehicles USING btree (parking_lot_id);


--
-- Name: idx_vehicles_reviewed_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_reviewed_by_id ON public.vehicles USING btree (reviewed_by_id);


--
-- Name: idx_vehicles_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_unit_id ON public.vehicles USING btree (unit_id);


--
-- Name: idx_vehicles_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_user_id ON public.vehicles USING btree (user_id);


--
-- Name: idx_waha_guest_day_passes_unit_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_guest_day_passes_unit_date ON public.waha_guest_day_passes USING btree (unit_id, date);


--
-- Name: idx_waha_pass_applications_applicant_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_applications_applicant_user_id ON public.waha_pass_applications USING btree (applicant_user_id);


--
-- Name: idx_waha_pass_applications_reviewed_by_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_applications_reviewed_by_id ON public.waha_pass_applications USING btree (reviewed_by_id);


--
-- Name: idx_waha_pass_applications_second_resident_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_applications_second_resident_id ON public.waha_pass_applications USING btree (second_resident_id);


--
-- Name: idx_waha_pass_applications_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_applications_unit_id ON public.waha_pass_applications USING btree (unit_id);


--
-- Name: idx_waha_pass_credentials_application_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_credentials_application_id ON public.waha_pass_credentials USING btree (application_id);


--
-- Name: idx_waha_pass_credentials_held_by_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_credentials_held_by_user_id ON public.waha_pass_credentials USING btree (held_by_user_id);


--
-- Name: idx_waha_pass_credentials_replaced_by_credential_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_credentials_replaced_by_credential_id ON public.waha_pass_credentials USING btree (replaced_by_credential_id);


--
-- Name: idx_waha_pass_events_actor_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_events_actor_user_id ON public.waha_pass_events USING btree (actor_user_id);


--
-- Name: idx_waha_pass_events_application_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_events_application_id ON public.waha_pass_events USING btree (application_id);


--
-- Name: idx_waha_pass_events_credential_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waha_pass_events_credential_id ON public.waha_pass_events USING btree (credential_id);


--
-- Name: push_tokens_user_device_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX push_tokens_user_device_unique ON public.push_tokens USING btree (user_id, device_id);


--
-- Name: uq_data_migration_correction_source_issue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_data_migration_correction_source_issue ON public.data_migration_corrections USING btree (entity_type, source_reference, issue_code);


--
-- Name: uq_household_invitations_unit_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_household_invitations_unit_pending ON public.household_invitations USING btree (unit_id) WHERE (status = 'pending'::public.household_invitation_status);


--
-- Name: uq_parking_lots_unit_building_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_parking_lots_unit_building_number ON public.parking_lots USING btree (unit_id, building, lot_number);


--
-- Name: uq_unit_verification_cleanup_document; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_unit_verification_cleanup_document ON public.unit_verification_document_cleanup_retries USING btree (verification_id, document_kind);


--
-- Name: uq_unit_verifications_approved_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_unit_verifications_approved_user ON public.unit_verifications USING btree (user_id) WHERE (status = 'approved'::public.verification_status);


--
-- Name: uq_unit_verifications_claim_per_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_unit_verifications_claim_per_unit ON public.unit_verifications USING btree (unit_id, type) WHERE (status = ANY (ARRAY['pending'::public.verification_status, 'approved'::public.verification_status]));


--
-- Name: uq_units_normalised_unit_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_units_normalised_unit_number ON public.units USING btree (normalised_unit_number);


--
-- Name: document_folders document_folders_visibility_floor_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER document_folders_visibility_floor_guard AFTER UPDATE OF default_visibility ON public.document_folders FOR EACH ROW EXECUTE FUNCTION public.cascade_folder_visibility_floor();


--
-- Name: documents documents_visibility_floor_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER documents_visibility_floor_guard BEFORE INSERT OR UPDATE OF folder_id, visibility ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_document_visibility_floor();


--
-- Name: documents documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.document_folders(id);


--
-- Name: facility_booking_config_normalization_audit facility_booking_config_normalization_audit_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_booking_config_normalization_audit
    ADD CONSTRAINT facility_booking_config_normalization_audit_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(id);


--
-- Name: facility_operating_hours_conflicts facility_operating_hours_conflicts_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_operating_hours_conflicts
    ADD CONSTRAINT facility_operating_hours_conflicts_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: facility_operating_hours_conflicts facility_operating_hours_conflicts_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_operating_hours_conflicts
    ADD CONSTRAINT facility_operating_hours_conflicts_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(id);


--
-- PostgreSQL database dump complete
--

\unrestrict KmXNgFLdabRSZMNpkdDWuPdXkHgFCcJOZsHT7PBgUhJTkBG8bnwK8HJmw0JhEcy

