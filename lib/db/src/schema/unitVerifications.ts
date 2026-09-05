import { pgTable, text, serial, timestamp, integer, pgEnum, index, uniqueIndex, date, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export const verificationTypeEnum = pgEnum("verification_type", ["owner_manual", "tenant_request"]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

export const unitVerificationsTable = pgTable("unit_verifications", {
  id: serial("id").primaryKey(),
  type: verificationTypeEnum("type").notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "restrict" }),
  nationalId: text("national_id"),              // submitted by the user (for tenant: tenant's NID)
  documentNote: text("document_note"),          // owner manual: doc upload note
  ejarReference: text("ejar_reference"),        // tenant: Ejar contract ref
  ejarDocumentKey: text("ejar_document_key"),   // private Ejar file; removed after decision
  leaseStartDate: date("lease_start_date", { mode: "string" }),
  leaseEndDate: date("lease_end_date", { mode: "string" }),
  status: verificationStatusEnum("status").notNull().default("pending"),
  reviewedById: integer("reviewed_by_id"),      // admin who approved/rejected
  reviewNote: text("review_note"),
  // SG11: durable record of the human basis used to approve the claim.
  approvalBases: text("approval_bases"),
  approvalOtherText: text("approval_other_text"),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // for tenant requests: 5-day window
  // Extended identity fields (added UAT R1)
  firstName: text("first_name"),
  middleName: text("middle_name"),
  lastName: text("last_name"),
  mobile: text("mobile"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  nationality: text("nationality"),
  // SG12: nullable for historical rows; required for all new submissions in the API.
  gender: text("gender"),
  ownerNationalId: text("owner_national_id"),  // tenant form: owner's NID claimed by tenant
  parkingLots: text("parking_lots"),            // JSON: [{lotNumber, building, isInside}]
  // Round 2 C2. New owner claims use this Mullak-verifiable 16-digit number.
  // The legacy title-deed metadata below is deliberately retained for rows
  // submitted before that workflow changed.
  titleDeedNumber: text("title_deed_number"),
  titleDeedKey: text("title_deed_key"),         // owner form: storage path; deleted on approve/reject
  titleDeedOriginalFilename: text("title_deed_original_filename"),
  titleDeedContentHash: text("title_deed_content_hash"),
  titleDeedDeletedAt: timestamp("title_deed_deleted_at", { withTimezone: true }),
  ejarOriginalFilename: text("ejar_original_filename"),
  ejarContentHash: text("ejar_content_hash"),
  ejarDeletedAt: timestamp("ejar_deleted_at", { withTimezone: true }),
  documentDecision: text("document_decision"),  // approved, rejected, or cancelled audit stub
  documentDecidedById: integer("document_decided_by_id"),
  documentDecidedAt: timestamp("document_decided_at", { withTimezone: true }),
  cancelledById: integer("cancelled_by_id"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  routedTo: text("routed_to"),                    // owner | admin transition evidence
  routedAt: timestamp("routed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_unit_verifications_user_id").on(t.userId),
  index("idx_unit_verifications_unit_id").on(t.unitId),
  index("idx_unit_verifications_reviewed_by_id").on(t.reviewedById),
  // The enum currently maps 1:1 to claim classes: owner_manual => owner and
  // tenant_request => tenant. Re-evaluate this index if a third type is added.
  uniqueIndex("uq_unit_verifications_claim_per_unit")
    .on(t.unitId, t.type)
    .where(sql`status IN ('pending', 'approved')`),
  // B7 Rule 6: a claimant can have only one approved unit verification.
  // This is enforced by PostgreSQL so concurrent approvals cannot both commit.
  uniqueIndex("uq_unit_verifications_approved_user")
    .on(t.userId)
    .where(sql`status = 'approved'`),
  check(
    "unit_verifications_routed_to_check",
    sql`${t.routedTo} IS NULL OR ${t.routedTo} IN ('owner', 'admin')`,
  ),
]);

export const insertUnitVerificationSchema = createInsertSchema(unitVerificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnitVerification = z.infer<typeof insertUnitVerificationSchema>;
export type UnitVerification = typeof unitVerificationsTable.$inferSelect;
