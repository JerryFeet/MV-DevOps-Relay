CREATE TYPE "public"."user_role" AS ENUM('owner', 'tenant', 'admin', 'guard');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_verification_status" AS ENUM('unverified', 'pending_manual', 'pending_owner_approval', 'verified_owner', 'verified_tenant', 'linkage_ended', 'pre_approved', 'verified_household_member');--> statement-breakpoint
CREATE TYPE "public"."booking_payment_status" AS ENUM('unpaid', 'paid', 'refunded', 'waived', 'not_required', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'pending_payment', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."move_form_status" AS ENUM('pending', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."move_type" AS ENUM('move_in', 'move_out');--> statement-breakpoint
CREATE TYPE "public"."permit_payment_status" AS ENUM('unpaid', 'paid', 'refund_pending', 'refunded', 'forfeited');--> statement-breakpoint
CREATE TYPE "public"."permit_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'approved_with_conditions', 'rejected', 'in_progress', 'completed', 'deposit_refunded', 'deposit_forfeited');--> statement-breakpoint
CREATE TYPE "public"."permit_type" AS ENUM('move_in', 'move_out', 'renovation', 'additional_vehicle');--> statement-breakpoint
CREATE TYPE "public"."renovation_scope" AS ENUM('cosmetic', 'structural', 'plumbing_electrical', 'exterior_affecting', 'kitchen_bathroom');--> statement-breakpoint
CREATE TYPE "public"."resident_status" AS ENUM('active', 'inactive', 'moved_out');--> statement-breakpoint
CREATE TYPE "public"."resident_type" AS ENUM('owner', 'tenant', 'family');--> statement-breakpoint
CREATE TYPE "public"."guest_status" AS ENUM('pending', 'approved', 'denied', 'checked_in', 'checked_out');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('active', 'inactive', 'pending_approval');--> statement-breakpoint
CREATE TYPE "public"."occupant_type" AS ENUM('owner_occupied', 'tenant_occupied', 'vacant');--> statement-breakpoint
CREATE TYPE "public"."parking_type" AS ENUM('underground', 'surface');--> statement-breakpoint
CREATE TYPE "public"."data_correction_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."verification_type" AS ENUM('owner_manual', 'tenant_request');--> statement-breakpoint
CREATE TYPE "public"."guest_pass_status" AS ENUM('approved', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."waha_pass_application_status" AS ENUM('pending_review', 'active', 'revoked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."waha_pass_credential_status" AS ENUM('active', 'suspended', 'revoked', 'lost', 'stolen', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."waha_pass_event_type" AS ENUM('applied', 'approved', 'rejected', 'revoked', 'lost_reported', 'replacement_paid', 'replacement_issued', 'resident_archived');--> statement-breakpoint
CREATE TYPE "public"."waha_pass_occupancy_track" AS ENUM('owner', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."ownership_change_initiation_type" AS ENUM('path_a', 'path_b');--> statement-breakpoint
CREATE TYPE "public"."ownership_change_status" AS ENUM('pending', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."household_invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'confirmed', 'failed', 'cancelled', 'expired', 'rejected');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"middle_name" text,
	"last_name" text,
	"phone" text,
	"phone_normalized" text,
	"unit_number" text,
	"unit_id" integer,
	"national_id" text,
	"role" "user_role" DEFAULT 'tenant' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"verification_status" "user_verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "announcement_edit_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"announcement_id" integer NOT NULL,
	"edited_by" integer NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text,
	"was_flagged_material" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_arabic" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'all_portal_users' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"author_id" integer NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_per_hour" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_capacity" integer,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"weekday_open_hour" integer DEFAULT 10 NOT NULL,
	"weekday_close_hour" integer DEFAULT 23 NOT NULL,
	"weekend_open_hour" integer DEFAULT 10 NOT NULL,
	"weekend_close_hour" integer DEFAULT 25 NOT NULL,
	"slot_interval_minutes" integer DEFAULT 60 NOT NULL,
	"min_duration_minutes" integer DEFAULT 60 NOT NULL,
	"max_duration_minutes" integer DEFAULT 240 NOT NULL,
	"cleaning_buffer_minutes" integer DEFAULT 15 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"requires_movie_title" boolean DEFAULT false NOT NULL,
	"capacity_mode" text DEFAULT 'numeric' NOT NULL,
	"pricing_model" text DEFAULT 'per_hour' NOT NULL,
	"flat_fee_amount" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_cleaning_buffer_minutes_non_negative" CHECK ("facilities"."cleaning_buffer_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"facility_id" integer NOT NULL,
	"user_id" integer,
	"unit_id" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"payment_status" "booking_payment_status" DEFAULT 'unpaid' NOT NULL,
	"charge_id" text,
	"payment_url" text,
	"payment_provider" text,
	"paid_at" timestamp with time zone,
	"payment_method" text,
	"payment_exemption_reason" text,
	"payment_hold_expires_at" timestamp with time zone,
	"facility_name" text,
	"movie_title" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "move_type" NOT NULL,
	"scheduled_date" date NOT NULL,
	"unit_number" text NOT NULL,
	"notes" text,
	"status" "move_form_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" integer,
	"review_note" text,
	"revocation_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"unit_id" integer,
	"unit_number" text,
	"type" "permit_type" NOT NULL,
	"description" text,
	"requested_start_date" date,
	"requested_end_date" date,
	"status" "permit_status" DEFAULT 'submitted' NOT NULL,
	"conditions" text,
	"review_note" text,
	"reviewed_by_id" integer,
	"admin_fee" numeric(10, 2) DEFAULT '0',
	"deposit_amount" numeric(10, 2) DEFAULT '0',
	"payment_status" "permit_payment_status" DEFAULT 'unpaid' NOT NULL,
	"payment_note" text,
	"charge_id" text,
	"payment_url" text,
	"payment_provider" text,
	"move_type" text,
	"moving_company_name" text,
	"moving_company_contact" text,
	"elevator_slot" text,
	"renovation_scope" text,
	"contractor_name" text,
	"contractor_license" text,
	"contractor_contact" text,
	"working_hours_requested" text,
	"common_area_impact" boolean DEFAULT false,
	"common_area_impact_details" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_plate" text,
	"vehicle_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"default_visibility" text DEFAULT 'all_portal_users' NOT NULL,
	"default_download_mode" text DEFAULT 'download_allowed' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_triage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"is_public" boolean DEFAULT false NOT NULL,
	"uploaded_by_id" integer NOT NULL,
	"folder_id" integer NOT NULL,
	"visibility" text DEFAULT 'all_portal_users' NOT NULL,
	"download_mode" text DEFAULT 'download_allowed' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_id" integer,
	"replaced_by_id" integer,
	"replacement_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residents" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "resident_type" NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"phone_normalized" text,
	"unit_number" text NOT NULL,
	"unit_id" integer,
	"relationship" text,
	"date_of_birth" date,
	"id_number" text,
	"id_photo_key" text,
	"has_portal_access" boolean DEFAULT false NOT NULL,
	"linked_user_id" integer,
	"registered_by_id" integer,
	"status" "resident_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"national_id" text,
	"vehicle_plate" text,
	"visit_date" date NOT NULL,
	"visit_reason" text,
	"status" "guest_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"unit_id" integer,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"color" text,
	"plate_number" text NOT NULL,
	"istimara_number" text,
	"is_additional" boolean DEFAULT false NOT NULL,
	"is_basement_parking" boolean DEFAULT false NOT NULL,
	"parking_lot_id" integer,
	"registration_doc_key" text,
	"status" "vehicle_status" DEFAULT 'active' NOT NULL,
	"approval_note" text,
	"approved_by_id" integer,
	"rejection_reason" text,
	"reviewed_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"building" text NOT NULL,
	"unit_number" text NOT NULL,
	"normalised_unit_number" text GENERATED ALWAYS AS (upper(regexp_replace(coalesce(building, '') || coalesce(unit_number, ''), '\s+', '', 'g'))) STORED NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"floor" text,
	"unit_type" text,
	"size_sqm" numeric(8, 2),
	"title_reference" text,
	"verified_owner_id" integer,
	"verified_tenant_id" integer,
	"pre_approved_claim_id" integer,
	"occupant_type" "occupant_type" DEFAULT 'vacant' NOT NULL,
	"emergency_contact" text,
	"emergency_phone" text,
	"preferred_contact" text,
	"mailing_address" text,
	"notes" text,
	"owner_national_id" text,
	"parking_lots" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parking_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"building" text NOT NULL,
	"lot_number" text NOT NULL,
	"parking_type" "parking_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'stage2' NOT NULL,
	"source_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_migration_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"source_reference" text NOT NULL,
	"issue_code" text NOT NULL,
	"raw_payload" jsonb,
	"details" text,
	"status" "data_correction_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "verification_type" NOT NULL,
	"user_id" integer,
	"unit_id" integer NOT NULL,
	"national_id" text,
	"document_note" text,
	"ejar_reference" text,
	"ejar_document_key" text,
	"lease_start_date" date,
	"lease_end_date" date,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" integer,
	"review_note" text,
	"expires_at" timestamp with time zone,
	"first_name" text,
	"middle_name" text,
	"last_name" text,
	"mobile" text,
	"owner_national_id" text,
	"parking_lots" text,
	"title_deed_key" text,
	"title_deed_original_filename" text,
	"title_deed_content_hash" text,
	"title_deed_deleted_at" timestamp with time zone,
	"ejar_original_filename" text,
	"ejar_content_hash" text,
	"ejar_deleted_at" timestamp with time zone,
	"document_decision" text,
	"document_decided_by_id" integer,
	"document_decided_at" timestamp with time zone,
	"cancelled_by_id" integer,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"routed_to" text,
	"routed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_verifications_routed_to_check" CHECK ("unit_verifications"."routed_to" IS NULL OR "unit_verifications"."routed_to" IN ('owner', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "unit_verification_document_cleanup_retries" (
	"id" serial PRIMARY KEY NOT NULL,
	"verification_id" integer NOT NULL,
	"document_kind" text NOT NULL,
	"object_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_verification_cleanup_document_kind_check" CHECK ("unit_verification_document_cleanup_retries"."document_kind" IN ('title_deed', 'ejar'))
);
--> statement-breakpoint
CREATE TABLE "unit_verification_owner_id_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"unit_key" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hoa_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hoa_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "guest_entry_exit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pass_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"event_time" timestamp with time zone DEFAULT now() NOT NULL,
	"security_guard_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "guest_pass_verification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pass_id" integer NOT NULL,
	"verification_time" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL,
	"security_guard_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "guest_passes" (
	"id" serial PRIMARY KEY NOT NULL,
	"pass_uuid" text NOT NULL,
	"verification_token" text NOT NULL,
	"guest_id" integer NOT NULL,
	"resident_id" integer NOT NULL,
	"guest_name" text NOT NULL,
	"national_id" text,
	"visit_date" date NOT NULL,
	"visit_start_time" text,
	"visit_end_time" text,
	"vehicle_plate" text,
	"reason_for_visit" text,
	"status" "guest_pass_status" DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "guest_passes_pass_uuid_unique" UNIQUE("pass_uuid"),
	CONSTRAINT "guest_passes_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"filename" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"audience" text DEFAULT 'all_portal_users' NOT NULL,
	"uploaded_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "waha_pass_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"applicant_user_id" integer,
	"second_resident_id" integer,
	"occupancy_track" "waha_pass_occupancy_track" NOT NULL,
	"status" "waha_pass_application_status" DEFAULT 'pending_review' NOT NULL,
	"reviewed_by_id" integer,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waha_pass_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"credential_index" integer NOT NULL,
	"pass_number" text,
	"verification_token" text,
	"holder_name" text NOT NULL,
	"held_by_user_id" integer,
	"status" "waha_pass_credential_status" DEFAULT 'active' NOT NULL,
	"revocation_reason" text,
	"revoked_at" timestamp with time zone,
	"replaced_by_credential_id" integer,
	"charge_id" text,
	"payment_url" text,
	"payment_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waha_pass_credentials_pass_number_unique" UNIQUE("pass_number"),
	CONSTRAINT "waha_pass_credentials_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
CREATE TABLE "waha_pass_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"credential_id" integer,
	"event_type" "waha_pass_event_type" NOT NULL,
	"actor_user_id" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"announcements" boolean DEFAULT true NOT NULL,
	"bookings" boolean DEFAULT true NOT NULL,
	"guest_passes" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "waha_guest_day_passes" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"unit_number" text,
	"date" date NOT NULL,
	"extra_guest_count" integer NOT NULL,
	"guest_count" integer,
	"amount_sar" numeric NOT NULL,
	"charge_id" text,
	"payment_url" text,
	"payment_provider" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_attempt_id" integer,
	"purchased_by_user_id" integer,
	"issued_at" timestamp with time zone,
	"verification_token" text,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waha_guest_day_passes_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
CREATE TABLE "ownership_change_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"unit_number" text NOT NULL,
	"initiation_type" "ownership_change_initiation_type" NOT NULL,
	"outgoing_owner_id" integer,
	"outgoing_owner_name" text,
	"outgoing_owner_email" text,
	"outgoing_owner_national_id" text,
	"new_owner_name" text,
	"new_owner_national_id" text,
	"proof_document_key" text,
	"status" "ownership_change_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_admin_id" integer,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"rejection_reason" text,
	"new_owner_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"unit_number" text NOT NULL,
	"invited_email" text NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"resident_id" integer,
	"status" "household_invitation_status" DEFAULT 'pending' NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "unit_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"building" text NOT NULL,
	"unit_number" text NOT NULL,
	"owner_national_id" text NOT NULL,
	"owner_name" text,
	"unit_type" text,
	"size_sqm" text,
	"title_reference" text,
	"is_matched" boolean DEFAULT false NOT NULL,
	"matched_user_id" integer,
	"import_batch" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"user_id" integer,
	"unit_id" integer,
	"provider" text NOT NULL,
	"provider_charge_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"provider_callback_id" text,
	"payment_method" text,
	"confirmed_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_provider_charge_id_unique" UNIQUE("provider_charge_id"),
	CONSTRAINT "payment_attempts_provider_callback_id_unique" UNIQUE("provider_callback_id")
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient_user_id" integer,
	"recipient_email" text,
	"channel" text NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"payload" text NOT NULL,
	"preference_policy" text DEFAULT 'decision' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_identity_deletion_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_id" integer NOT NULL,
	"clerk_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_deletion_jobs_status_check" CHECK ("external_identity_deletion_jobs"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "release_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"subject_user_id" integer NOT NULL,
	"actor_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"outcome" text DEFAULT 'released' NOT NULL,
	"affected_ids" jsonb NOT NULL,
	"effect_summary" jsonb NOT NULL,
	"postcondition_summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_operations_kind_check" CHECK ("release_operations"."kind" IN ('tenant', 'owner')),
	CONSTRAINT "release_operations_trigger_type_check" CHECK ("release_operations"."trigger_type" IN ('move_out_form', 'tenancy_expiry', 'ownership_change')),
	CONSTRAINT "release_operations_outcome_check" CHECK ("release_operations"."outcome" = 'released')
);
--> statement-breakpoint
CREATE TABLE "tenancy_lifecycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"tenant_user_id" integer,
	"verification_id" integer NOT NULL,
	"lease_start_date" date NOT NULL,
	"lease_end_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"release_reason" text,
	"release_evidence_key" text,
	"release_requested_by_id" integer,
	"release_requested_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"release_executed_by_id" integer,
	"released_at" timestamp with time zone,
	"release_operation_id" integer,
	"audit_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenancy_renewals" (
	"id" serial PRIMARY KEY NOT NULL,
	"lifecycle_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"tenant_user_id" integer,
	"lease_start_date" date NOT NULL,
	"lease_end_date" date NOT NULL,
	"ejar_reference" text NOT NULL,
	"ejar_document_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" integer,
	"decision_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" integer,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_registered_by_id_users_id_fk" FOREIGN KEY ("registered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_verified_owner_id_users_id_fk" FOREIGN KEY ("verified_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_verified_tenant_id_users_id_fk" FOREIGN KEY ("verified_tenant_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_verifications" ADD CONSTRAINT "unit_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_verifications" ADD CONSTRAINT "unit_verifications_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_verification_owner_id_attempts" ADD CONSTRAINT "unit_verification_owner_id_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waha_pass_applications" ADD CONSTRAINT "waha_pass_applications_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waha_pass_applications" ADD CONSTRAINT "waha_pass_applications_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waha_pass_credentials" ADD CONSTRAINT "waha_pass_credentials_held_by_user_id_users_id_fk" FOREIGN KEY ("held_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waha_guest_day_passes" ADD CONSTRAINT "waha_guest_day_passes_purchased_by_user_id_users_id_fk" FOREIGN KEY ("purchased_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identity_deletion_jobs" ADD CONSTRAINT "external_identity_deletion_jobs_operation_id_release_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."release_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_unit_id" ON "users" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_edit_history_announcement_id" ON "announcement_edit_history" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_edit_history_edited_by" ON "announcement_edit_history" USING btree ("edited_by");--> statement-breakpoint
CREATE INDEX "idx_announcements_author_id" ON "announcements" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_user_id" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_unit_id" ON "bookings" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_facility_id" ON "bookings" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_move_forms_user_id" ON "move_forms" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_move_forms_reviewed_by_id" ON "move_forms" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE INDEX "idx_permits_user_id" ON "permits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_permits_unit_id" ON "permits" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_permits_reviewed_by_id" ON "permits" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE INDEX "idx_document_folders_active_sort" ON "document_folders" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_document_folders_name_unique" ON "document_folders" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_documents_uploaded_by_id" ON "documents" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "idx_documents_folder_current" ON "documents" USING btree ("folder_id","is_archived","created_at");--> statement-breakpoint
CREATE INDEX "idx_documents_replaced_by_id" ON "documents" USING btree ("replaced_by_id");--> statement-breakpoint
CREATE INDEX "idx_residents_unit_id" ON "residents" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_residents_registered_by_id" ON "residents" USING btree ("registered_by_id");--> statement-breakpoint
CREATE INDEX "idx_guests_resident_id" ON "guests" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_user_id" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_unit_id" ON "vehicles" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_parking_lot_id" ON "vehicles" USING btree ("parking_lot_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_approved_by_id" ON "vehicles" USING btree ("approved_by_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_reviewed_by_id" ON "vehicles" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE INDEX "idx_units_verified_owner_id" ON "units" USING btree ("verified_owner_id");--> statement-breakpoint
CREATE INDEX "idx_units_verified_tenant_id" ON "units" USING btree ("verified_tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_units_normalised_unit_number" ON "units" USING btree ("normalised_unit_number");--> statement-breakpoint
CREATE INDEX "idx_parking_lots_unit_id" ON "parking_lots" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_parking_lots_unit_building_number" ON "parking_lots" USING btree ("unit_id","building","lot_number");--> statement-breakpoint
CREATE INDEX "idx_data_migration_corrections_status" ON "data_migration_corrections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_data_migration_correction_source_issue" ON "data_migration_corrections" USING btree ("entity_type","source_reference","issue_code");--> statement-breakpoint
CREATE INDEX "idx_unit_verifications_user_id" ON "unit_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_unit_verifications_unit_id" ON "unit_verifications" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_unit_verifications_reviewed_by_id" ON "unit_verifications" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_unit_verifications_claim_per_unit" ON "unit_verifications" USING btree ("unit_id","type") WHERE status IN ('pending', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_unit_verifications_approved_user" ON "unit_verifications" USING btree ("user_id") WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX "idx_unit_verification_cleanup_pending" ON "unit_verification_document_cleanup_retries" USING btree ("processed_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_unit_verification_cleanup_document" ON "unit_verification_document_cleanup_retries" USING btree ("verification_id","document_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_verification_owner_id_attempts_live_user_unit_unique" ON "unit_verification_owner_id_attempts" USING btree ("user_id","unit_key") WHERE "unit_verification_owner_id_attempts"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_communications_user_id" ON "communications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_guest_entry_exit_logs_pass_id" ON "guest_entry_exit_logs" USING btree ("pass_id");--> statement-breakpoint
CREATE INDEX "idx_guest_pass_verification_logs_pass_id" ON "guest_pass_verification_logs" USING btree ("pass_id");--> statement-breakpoint
CREATE INDEX "idx_guest_passes_guest_id" ON "guest_passes" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_guest_passes_resident_id" ON "guest_passes" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "idx_ai_knowledge_chunks_document_id" ON "ai_knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_ai_knowledge_documents_uploaded_by_id" ON "ai_knowledge_documents" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "idx_push_tokens_user_id" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_user_device_unique" ON "push_tokens" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_applications_unit_id" ON "waha_pass_applications" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_applications_applicant_user_id" ON "waha_pass_applications" USING btree ("applicant_user_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_applications_second_resident_id" ON "waha_pass_applications" USING btree ("second_resident_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_applications_reviewed_by_id" ON "waha_pass_applications" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_credentials_application_id" ON "waha_pass_credentials" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_credentials_held_by_user_id" ON "waha_pass_credentials" USING btree ("held_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_credentials_replaced_by_credential_id" ON "waha_pass_credentials" USING btree ("replaced_by_credential_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_events_application_id" ON "waha_pass_events" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_events_credential_id" ON "waha_pass_events" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_waha_pass_events_actor_user_id" ON "waha_pass_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_waha_guest_day_passes_unit_date" ON "waha_guest_day_passes" USING btree ("unit_id","date");--> statement-breakpoint
CREATE INDEX "idx_ownership_change_events_unit_id" ON "ownership_change_events" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_ownership_change_events_outgoing_owner_id" ON "ownership_change_events" USING btree ("outgoing_owner_id");--> statement-breakpoint
CREATE INDEX "idx_ownership_change_events_status" ON "ownership_change_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_household_invitations_unit_id" ON "household_invitations" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_household_invitations_invited_email" ON "household_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_household_invitations_unit_pending" ON "household_invitations" USING btree ("unit_id") WHERE "household_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_unit_registry_matched_user_id" ON "unit_registry" USING btree ("matched_user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_attempts_subject" ON "payment_attempts" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_payment_attempts_pending" ON "payment_attempts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_charge_unique" ON "payment_attempts" USING btree ("provider","provider_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_events_delivery_unique" ON "notification_events" USING btree ("event_type","idempotency_key","recipient_user_id","channel");--> statement-breakpoint
CREATE INDEX "idx_notification_events_due" ON "notification_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_deletion_jobs_operation_unique" ON "external_identity_deletion_jobs" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_external_identity_deletion_jobs_due" ON "external_identity_deletion_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "release_operations_idempotency_key_unique" ON "release_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_release_operations_unit_created" ON "release_operations" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tenancy_lifecycles_unit_status" ON "tenancy_lifecycles" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "idx_tenancy_lifecycles_tenant_status" ON "tenancy_lifecycles" USING btree ("tenant_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tenancy_lifecycles_expiry" ON "tenancy_lifecycles" USING btree ("lease_end_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancy_lifecycles_one_open_unit" ON "tenancy_lifecycles" USING btree ("unit_id") WHERE status <> 'released';--> statement-breakpoint
CREATE INDEX "idx_tenancy_renewals_lifecycle_status" ON "tenancy_renewals" USING btree ("lifecycle_id","status");--> statement-breakpoint
CREATE INDEX "idx_tenancy_renewals_owner_queue" ON "tenancy_renewals" USING btree ("unit_id","status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancy_renewals_one_pending_per_lifecycle" ON "tenancy_renewals" USING btree ("lifecycle_id") WHERE status = 'pending';