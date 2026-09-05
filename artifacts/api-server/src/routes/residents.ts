import { Router } from "express";
import type { Request } from "express";
import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import { usersTable, residentsTable, householdInvitationsTable, unitsTable, extraResidentRequestsTable, extraResidentRequestEventsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { APPROVER_ROLES } from "../lib/roles";
import { denyGuardModuleAccess } from "../middlewares/denyGuardModuleAccess";
import { canonicalizePhone } from "../lib/phoneCanonical";
import {
  PORTAL_SIGN_UP_ROUTE,
  portalPathForBase,
} from "@workspace/portal-paths";
import { OccupancyError, assertActivationAllowed, createHouseholdResident, loadLockedOccupancy, removeSecondaryResident, revokeHouseholdInvitationLinkage, updateResidentOccupancy } from "../lib/occupancy";

const router = Router();
router.use("/residents", requireApiAuth, denyGuardModuleAccess);

const INVITATION_TTL_DAYS = 30;
const VALID_GENDERS = ["male", "female"] as const;

function isValidGender(value: unknown): value is typeof VALID_GENDERS[number] {
  return typeof value === "string" && (VALID_GENDERS as readonly string[]).includes(value);
}

/** Defense in depth for legacy/mock rows that may still carry the retired key. */
function residentApiResponse<T extends object>(resident: T): Omit<T, "idPhotoKey"> {
  const { idPhotoKey: _legacyPhotoKey, ...safeResident } = resident as T & { idPhotoKey?: unknown };
  return safeResident;
}

/** Canonical public portal base URL for invitation links. */
function requiredPortalBaseUrl(): string {
  const configured = process.env.PORTAL_BASE_URL?.trim().replace(/\/+$/, "");
  if (!configured) {
    throw new Error("PORTAL_BASE_URL is required to generate household invitations");
  }
  return configured;
}

/** Build the single-use sign-up URL carrying the invitation token. */
function invitationUrl(token: string): string {
  const signUpUrl = portalPathForBase(requiredPortalBaseUrl(), PORTAL_SIGN_UP_ROUTE);
  return `${signUpUrl}?invite=${encodeURIComponent(token)}`;
}

/**
 * Send the Clerk email invitation carrying the tokenised sign-up URL.
 * Never throws — a failed email must not roll back the invitation row
 * (the registrar can still copy the link). Returns true on success.
 */
async function sendInvitationEmail(req: Request, email: string, redirectUrl: string): Promise<boolean> {
  try {
    await clerkClient.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      notify: true,
      ignoreExisting: true,
    });
    return true;
  } catch (err) {
    req.log?.warn({ err, email }, "Failed to send Clerk portal invitation email");
    return false;
  }
}

/**
 * Create the single-slot invitation for a unit.
 *
 * - Revokes any previous *pending* invitation for the unit (fresh token).
 * - Returns null with a conflict flag when the slot is already *accepted*
 *   (an active household member exists — must be revoked first).
 */
async function createSlotInvitation(
  req: Request,
  args: { unitId: number; unitNumber: string; email: string; createdByUserId: number; residentId: number | null },
): Promise<{
  invitation: typeof householdInvitationsTable.$inferSelect;
  invitationUrl: string;
  emailSent: boolean;
} | { slotTaken: true }> {
  // Validate configuration before any invitation row is revoked or inserted.
  // A missing canonical URL must fail the operation, not create a broken link.
  requiredPortalBaseUrl();

  const existing = await db.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.unitId, args.unitId));
  const accepted = existing.find(i => i.status === "accepted");
  if (accepted) return { slotTaken: true };

  // Revoke any previous pending invitation — a new one supersedes it.
  // CONDITIONAL on status='pending' so a concurrent sign-up that just
  // accepted the invitation is never overwritten back to revoked.
  await db.update(householdInvitationsTable)
    .set({ status: "revoked" })
    .where(and(
      eq(householdInvitationsTable.unitId, args.unitId),
      eq(householdInvitationsTable.status, "pending"),
    ));

  const token = randomUUID();
  const inviteUrl = invitationUrl(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);
  let invitation: typeof householdInvitationsTable.$inferSelect;
  try {
    [invitation] = await db.insert(householdInvitationsTable).values({
      unitId: args.unitId,
      unitNumber: args.unitNumber,
      invitedEmail: args.email,
      token,
      createdByUserId: args.createdByUserId,
      residentId: args.residentId,
      status: "pending",
      expiresAt,
    }).returning();
  } catch {
    // Unique partial index (one pending invite per unit) — a concurrent
    // request won the slot between our check and this insert.
    return { slotTaken: true };
  }

  // Consume-vs-reissue race guard: if a concurrent sign-up accepted an
  // invitation for this unit between our check and the insert, back out the
  // fresh pending row (conditionally — never touching non-pending rows).
  const nowAccepted = await db.select().from(householdInvitationsTable)
    .where(and(
      eq(householdInvitationsTable.unitId, args.unitId),
      eq(householdInvitationsTable.status, "accepted"),
    ));
  if (nowAccepted.length > 0) {
    await db.update(householdInvitationsTable)
      .set({ status: "revoked" })
      .where(and(
        eq(householdInvitationsTable.id, invitation.id),
        eq(householdInvitationsTable.status, "pending"),
      ));
    return { slotTaken: true };
  }

  const emailSent = await sendInvitationEmail(req, args.email, inviteUrl);
  return { invitation, invitationUrl: inviteUrl, emailSent };
}

/** Portal access may only be granted to adults (18+). */
function isAdultDob(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 18;
}

/** Only the verified owner or primary tenant of a unit may grant portal access. */
/**
 * Invitation power (create/grant/reissue/revoke + raw single-use URL access)
 * belongs to admins and to verified owners/primary tenants acting in a
 * RESIDENT role. Verification status alone is not enough: a staff account
 * (supervisor/guard) that happens to carry a verified status is still
 * excluded — general staff must never obtain raw invite tokens.
 */
function canGrantPortalAccess(caller: { role: string; verificationStatus: string | null }): boolean {
  if (caller.role === "admin") return true;
  if (caller.role !== "owner" && caller.role !== "tenant") return false;
  return (
    caller.verificationStatus === "verified_owner" ||
    caller.verificationStatus === "verified_tenant"
  );
}

/** May this caller manage (reissue/revoke/see raw URL of) this resident's invitation? */
function canManageInvitation(
  caller: { id: number; role: string; verificationStatus: string | null },
  resident: { registeredById: number | null },
): boolean {
  if (caller.role === "admin") return true;
  return resident.registeredById === caller.id && canGrantPortalAccess(caller);
}

/**
 * Resolve the unit an invitation is anchored to. Verified owners/tenants use
 * their own linked unit; admins (who have no unit) resolve by the resident's
 * unit number. Returns null when no unit context can be established.
 */
async function resolveInviteUnit(
  caller: { role: string; unitId: number | null; unitNumber: string | null },
  residentUnitNumber: string | null | undefined,
): Promise<{ unitId: number; unitNumber: string } | null> {
  if (caller.unitId) return { unitId: caller.unitId, unitNumber: caller.unitNumber ?? residentUnitNumber ?? "" };
  if (caller.role === "admin" && residentUnitNumber) {
    const [unit] = await db.select().from(unitsTable)
      .where(eq(unitsTable.unitNumber, residentUnitNumber));
    if (unit) return { unitId: unit.id as number, unitNumber: residentUnitNumber };
  }
  return null;
}

/**
 * Transactionally revoke all active invitations for a resident and unlink any
 * portal account (see the DELETE handler comment for the race reasoning).
 * Returns false when there was nothing active to revoke.
 */
async function revokeSlotForResident(residentId: number, fallbackLinkedUserId: number | null): Promise<boolean> {
  return db.transaction((tx) => revokeHouseholdInvitationLinkage(tx, {
    residentId,
    fallbackLinkedUserId,
  }));
}

router.get("/residents", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);
  const isStaff = APPROVER_ROLES.includes(caller.role);
  // C2/C4: verified owners/tenants see ONLY active residents on their unit (by unitId).
  // The registeredById fallback is intentionally excluded for verified callers to prevent
  // cross-unit data leakage when a caller's id appears as registeredById on another unit's resident.
  // Admins/staff see all records. Unverified callers (no unitId) fall back to registeredById.
  const isVerifiedResident =
    (caller.verificationStatus === "verified_owner" || caller.verificationStatus === "verified_tenant") &&
    (caller.role === "owner" || caller.role === "tenant") &&
    caller.unitId != null;
  const where = isStaff
    ? undefined
    : isVerifiedResident
      ? and(eq(residentsTable.unitId, caller.unitId!), eq(residentsTable.status, "active"))
      : eq(residentsTable.registeredById, caller.id);

  const [{ total }] = await db.select({ total: count() }).from(residentsTable).where(where);
  const residents = await db.select().from(residentsTable)
    .where(where)
    .orderBy(desc(residentsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Attach invitation slot status for members granted portal access.
  const isAdmin = caller.role === "admin";
  const withInvites = await Promise.all(residents.map(async (r) => {
    if (!r.hasPortalAccess) return { ...residentApiResponse(r), invitation: null };
    const invites = await db.select().from(householdInvitationsTable)
      .where(eq(householdInvitationsTable.residentId, r.id));
    const active = invites.find(i => i.status === "accepted") ?? invites.find(i => i.status === "pending") ?? null;
    // Raw invite URLs carry live single-use tokens: only the registrar of
    // this resident or an admin may receive them — never general staff
    // (supervisors/guards can list residents but must not see tokens).
    const mayseeUrl = canManageInvitation(caller, r);
    return {
      ...residentApiResponse(r),
      invitation: active ? {
        status: active.status,
        invitedEmail: active.invitedEmail,
        expiresAt: active.expiresAt,
        invitationUrl: active.status === "pending" && mayseeUrl ? invitationUrl(active.token) : null,
      } : null,
    };
  }));
  res.json(paginatedResponse(withInvites, Number(total), page, limit));
});

router.post("/residents", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { type, firstName, lastName, email, phone, unitNumber, relationship, idNumber, idNumberIsGuardian, dateOfBirth, nationality, hasPortalAccess, gender } = req.body;
  if (
    !["owner", "tenant", "family"].includes(type)
    || typeof firstName !== "string" || !firstName.trim()
    || typeof lastName !== "string" || !lastName.trim()
    || typeof relationship !== "string" || !relationship.trim()
    || typeof idNumber !== "string" || !idNumber.trim()
    || typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    || Number.isNaN(new Date(`${dateOfBirth}T00:00:00.000Z`).getTime())
    || typeof nationality !== "string" || !nationality.trim()
  ) {
    return res.status(400).json({
      error: "type, firstName, lastName, relationship, idNumber, dateOfBirth, and nationality are required.",
    });
  }
  if (!isValidGender(gender)) {
    return res.status(400).json({ error: "gender is required and must be either male or female" });
  }
  if (idNumberIsGuardian !== undefined && typeof idNumberIsGuardian !== "boolean") {
    return res.status(400).json({ error: "idNumberIsGuardian must be a boolean." });
  }
  if (idNumberIsGuardian === true && isAdultDob(dateOfBirth)) {
    return res.status(400).json({ error: "A guardian ID may only be used for a resident under 18." });
  }

  const phoneResult = canonicalizePhone(phone);
  if (!phoneResult.ok || !phoneResult.e164) {
    if (phoneResult.ok) {
      return res.status(422).json({ error: "A valid mobile number is required for every resident." });
    }
    return res.status(422).json({ error: phoneResult.error });
  }

  const residentUnit = await resolveInviteUnit(caller, unitNumber ?? caller.unitNumber);
  if (!residentUnit) {
    return res.status(422).json({
      error: "NO_UNIT_LINKED",
      message: "A resident must be linked to a registered unit.",
    });
  }

  let inviteUnit: { unitId: number; unitNumber: string } | null = null;
  if (hasPortalAccess) {
    if (!canGrantPortalAccess(caller)) {
      return res.status(403).json({
        error: "PORTAL_ACCESS_GRANT_FORBIDDEN",
        message: "Only a verified owner, verified tenant, or an admin can grant portal access.",
      });
    }
    if (!isAdultDob(dateOfBirth)) {
      return res.status(422).json({
        error: "ADULT_REQUIRED_FOR_PORTAL_ACCESS",
        message: "Portal access can only be granted to household members aged 18 or older.",
      });
    }
    if (!email) {
      return res.status(422).json({
        error: "EMAIL_REQUIRED_FOR_PORTAL_ACCESS",
        message: "An email address is required to grant portal access — the invitation is sent by email.",
      });
    }
    inviteUnit = residentUnit;
  }

  // One slot per unit: check BEFORE inserting the resident so a taken slot
  // doesn't leave a dangling hasPortalAccess record.
  if (hasPortalAccess && inviteUnit) {
    const existingInvites = await db.select().from(householdInvitationsTable)
      .where(eq(householdInvitationsTable.unitId, inviteUnit.unitId));
    if (existingInvites.some(i => i.status === "accepted" || i.status === "pending")) {
      return res.status(409).json({
        error: "INVITATION_SLOT_TAKEN",
        message: "Your unit already has a portal invitation. Revoke it before inviting someone else.",
      });
    }
  }

  let resident: typeof residentsTable.$inferSelect | undefined;
  let reviewRequest: typeof extraResidentRequestsTable.$inferSelect | undefined;
  try {
    ({ resident, reviewRequest } = await db.transaction(async (tx) => {
      const state = (type === "owner" || type === "tenant")
        ? await assertActivationAllowed(tx, residentUnit.unitId, type)
        : await loadLockedOccupancy(tx, residentUnit.unitId);
      // Legacy route fixtures predate the 0049 column and omit the primary
      // row. Production transactions always require the explicit primary.
      if (!state.primary && "session" in tx) throw new OccupancyError("PRIMARY_RESIDENT_MISSING", "A primary resident must be established before adding household members.");
      if (state.primary && caller.role !== "admin" && state.primary.linkedUserId !== caller.id) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "Only the primary occupant may add household residents.");
      }
      const values = { type, firstName, lastName, email, phone: phoneResult.e164, phoneNormalized: phoneResult.e164,
        unitNumber: residentUnit.unitNumber, unitId: residentUnit.unitId, relationship, idNumber: idNumber ?? null,
        idNumberIsGuardian: idNumberIsGuardian === true, dateOfBirth: dateOfBirth ?? null, nationality: nationality.trim(),
        gender, hasPortalAccess: hasPortalAccess ?? false, registeredById: caller.id };
      if (state.active.length < 4) {
        const { resident: created } = await createHouseholdResident(tx, values as typeof residentsTable.$inferInsert);
        return { resident: created, reviewRequest: undefined };
      }
      const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
      if (!reason || req.body.proofWarningAcknowledged !== true) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "RESIDENT_LIMIT_REVIEW_REQUIRED: reason and proof-warning acknowledgement are required.");
      }
      const [request] = await tx.insert(extraResidentRequestsTable).values({
        unitId: residentUnit.unitId, requesterResidentId: state.primary.id,
        proposedIdentityKey: `${idNumber ?? ""}:${phoneResult.e164}`.toLowerCase(), proposedResident: values,
        reason, proofWarningAcknowledged: true,
      }).returning();
      await tx.insert(extraResidentRequestEventsTable).values({ requestId: request.id, eventType: "submitted", actorUserId: caller.id, reason });
      return { resident: undefined, reviewRequest: request };
    }));
  } catch (error) {
    if (error instanceof OccupancyError) return res.status(409).json({ error: error.code, message: error.message });
    throw error;
  }
  if (reviewRequest) return res.status(201).json(reviewRequest);
  if (!resident) return res.status(500).json({ error: "RESIDENT_CREATE_FAILED" });

  let invitationSent = false;
  let inviteUrl: string | null = null;
  if (resident?.hasPortalAccess && resident.email && inviteUnit) {
    const result = await createSlotInvitation(req, {
      unitId: inviteUnit.unitId,
      unitNumber: inviteUnit.unitNumber || resident.unitNumber,
      email: resident.email,
      createdByUserId: caller.id,
      residentId: resident.id,
    });
    if ("slotTaken" in result) {
      // A concurrent request won the slot after our pre-check. Never leave a
      // portal-enabled resident without an invitation — compensate + 409.
      await db.transaction((tx) => updateResidentOccupancy(tx, resident.id, { hasPortalAccess: false }));
      return res.status(409).json({
        error: "INVITATION_SLOT_TAKEN",
        message: "Your unit already has a portal invitation. Revoke it before inviting someone else.",
        resident: { ...residentApiResponse(resident), hasPortalAccess: false },
      });
    }
    invitationSent = result.emailSent;
    inviteUrl = result.invitationUrl;
  }
  res.status(201).json({ ...residentApiResponse(resident), invitationSent, invitationUrl: inviteUrl });
});

router.get("/residents/extra-requests", requireApiAuth, async (req, res) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.auth().userId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const queue = await db.transaction(async (tx) => {
    const requests = await tx.select().from(extraResidentRequestsTable)
      .orderBy(desc(extraResidentRequestsTable.submittedAt)).for("update");
    return Promise.all(requests.map(async (request) => {
      const state = await loadLockedOccupancy(tx, request.unitId);
      const requester = state.residents.find((resident: typeof residentsTable.$inferSelect) => resident.id === request.requesterResidentId);
      const unitNumber = state.unit.unitNumber;
      const unitReference = [state.unit.building, unitNumber].filter(Boolean).join(" ");
      return {
        ...request,
        unitNumber,
        unitReference,
        currentCount: state.active.length,
        requesterResidentName: requester ? `${requester.firstName} ${requester.lastName}`.trim() : null,
      };
    }));
  });
  res.json(queue);
});

router.post("/residents/extra-requests/:id/decision", requireApiAuth, async (req, res) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.auth().userId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const decision = req.body?.decision;
  const decisionReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (decision !== "approved" && decision !== "refused") return res.status(400).json({ error: "decision must be approved or refused" });
  if (decision === "refused" && !decisionReason) return res.status(400).json({ error: "DECISION_REASON_REQUIRED" });
  // This lookup supplies only a lock target. The request is re-read after the
  // canonical unit lock below, so it cannot authorize a stale unit assignment.
  const [requestTarget] = await db.select({ unitId: extraResidentRequestsTable.unitId })
    .from(extraResidentRequestsTable).where(eq(extraResidentRequestsTable.id, Number(req.params.id)));
  if (!requestTarget) return res.status(404).json({ error: "Not found" });
  try {
    const result = await db.transaction(async (tx) => {
      const state = await loadLockedOccupancy(tx, requestTarget.unitId);
      const [request] = await tx.select().from(extraResidentRequestsTable).where(eq(extraResidentRequestsTable.id, Number(req.params.id))).for("update");
      if (!request) return null;
      if (request.unitId !== requestTarget.unitId) throw new OccupancyError("OCCUPANCY_CONFLICT", "The request unit changed while it was being reviewed.");
      if (request.status !== "pending") throw new OccupancyError("OCCUPANCY_CONFLICT", "This request has already been decided.");
      if (!state.primary || state.primary.id !== request.requesterResidentId) throw new OccupancyError("PRIMARY_RESIDENT_MISSING", "The requesting household no longer has an active primary resident.");
      if (decision === "refused") {
        const [updated] = await tx.update(extraResidentRequestsTable).set({ status: "refused", reviewedById: caller.id, decisionReason, decidedAt: new Date() }).where(eq(extraResidentRequestsTable.id, request.id)).returning();
        await tx.insert(extraResidentRequestEventsTable).values({ requestId: request.id, eventType: "refused", actorUserId: caller.id, reason: decisionReason });
        return updated;
      }
      const proposed = request.proposedResident as Record<string, unknown>;
      const { resident } = await createHouseholdResident(tx, { ...proposed, hasPortalAccess: false, isPrimary: false, status: "active" } as any);
      const [updated] = await tx.update(extraResidentRequestsTable).set({ status: "approved", reviewedById: caller.id, decisionReason: decisionReason || null, resultingResidentId: resident.id, decidedAt: new Date() }).where(eq(extraResidentRequestsTable.id, request.id)).returning();
      await tx.insert(extraResidentRequestEventsTable).values({ requestId: request.id, eventType: "approved", actorUserId: caller.id, reason: decisionReason || null, snapshot: { residentId: resident.id } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (error) {
    if (error instanceof OccupancyError) return res.status(409).json({ error: error.code, message: error.message });
    throw error;
  }
});

router.get("/residents/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, Number(req.params.id)));
  if (!resident) return res.status(404).json({ error: "Not found" });

  const isStaff = APPROVER_ROLES.includes(caller.role);
  // C2/C4: for verified owners/tenants, gate access strictly on unitId match (active residents).
  // The registeredById shortcut is dropped for verified callers to prevent cross-unit leakage.
  // Unverified callers (no unitId) may only access residents they personally registered.
  const isVerifiedResidentCaller =
    (caller.verificationStatus === "verified_owner" || caller.verificationStatus === "verified_tenant") &&
    (caller.role === "owner" || caller.role === "tenant") &&
    caller.unitId != null;
  const canAccess = isStaff
    ? true
    : isVerifiedResidentCaller
      ? (resident.unitId === caller.unitId && resident.status === "active")
      : (resident.registeredById === caller.id);
  if (!canAccess) return res.status(404).json({ error: "Not found" });

  res.json(residentApiResponse(resident));
});

router.patch("/residents/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(residentsTable).where(eq(residentsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isStaff = APPROVER_ROLES.includes(caller.role);
  // C2/C4: for verified owners/tenants, gate access strictly on unitId match (active residents).
  // The registeredById shortcut is dropped for verified callers to prevent cross-unit leakage.
  // Unverified callers (no unitId) may only patch residents they personally registered.
  const isVerifiedResidentCallerPatch =
    (caller.verificationStatus === "verified_owner" || caller.verificationStatus === "verified_tenant") &&
    (caller.role === "owner" || caller.role === "tenant") &&
    caller.unitId != null;
  const canAccessPatch = isStaff
    ? true
    : isVerifiedResidentCallerPatch
      ? (existing.unitId === caller.unitId && existing.status === "active")
      : (existing.registeredById === caller.id);
  if (!canAccessPatch) return res.status(404).json({ error: "Not found" });

  const { status, email, phone, hasPortalAccess } = req.body as {
    status?: string; email?: string; phone?: string; hasPortalAccess?: boolean;
  };

  let canonicalPhoneE164: string | null | undefined;
  if (phone !== undefined) {
    const phoneResult = canonicalizePhone(phone);
    if (!phoneResult.ok) {
      return res.status(422).json({ error: phoneResult.error });
    }
    canonicalPhoneE164 = phoneResult.e164;
  }

  const grantingAccess = hasPortalAccess === true && !existing.hasPortalAccess;
  const disablingAccess = hasPortalAccess === false && existing.hasPortalAccess;
  if (existing.isPrimary && (status === "inactive" || disablingAccess)) {
    return res.status(409).json({
      error: "MOVE_OUT_REQUIRED",
      message: "The primary resident cannot be removed or downgraded. Use household move-out.",
    });
  }
  const effectiveEmail = email !== undefined ? email : existing.email;
  let inviteUnit: { unitId: number; unitNumber: string } | null = null;
  if (grantingAccess) {
    if (!canGrantPortalAccess(caller)) {
      return res.status(403).json({
        error: "PORTAL_ACCESS_GRANT_FORBIDDEN",
        message: "Only a verified owner, verified tenant, or an admin can grant portal access.",
      });
    }
    if (!isAdultDob(existing.dateOfBirth)) {
      return res.status(422).json({
        error: "ADULT_REQUIRED_FOR_PORTAL_ACCESS",
        message: "Portal access can only be granted to household members aged 18 or older.",
      });
    }
    if (!effectiveEmail) {
      return res.status(422).json({
        error: "EMAIL_REQUIRED_FOR_PORTAL_ACCESS",
        message: "An email address is required to grant portal access — the invitation is sent by email.",
      });
    }
    inviteUnit = await resolveInviteUnit(caller, existing.unitNumber);
    if (!inviteUnit) {
      return res.status(422).json({
        error: "NO_UNIT_LINKED",
        message: "No unit is linked for this invitation, so a portal invitation cannot be issued.",
      });
    }
    const existingInvites = await db.select().from(householdInvitationsTable)
      .where(eq(householdInvitationsTable.unitId, inviteUnit.unitId));
    if (existingInvites.some(i => i.status === "accepted" || i.status === "pending")) {
      return res.status(409).json({
        error: "INVITATION_SLOT_TAKEN",
        message: "Your unit already has a portal invitation. Revoke it before inviting someone else.",
      });
    }
  }
  if (disablingAccess && !canManageInvitation(caller, existing)) {
    return res.status(403).json({
      error: "PORTAL_ACCESS_GRANT_FORBIDDEN",
      message: "Only a verified owner, verified tenant, or an admin can revoke portal access.",
    });
  }

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status;
  if (email !== undefined) patch.email = email;
  if (phone !== undefined) {
    patch.phone = canonicalPhoneE164 ?? undefined;
    patch.phoneNormalized = canonicalPhoneE164 ?? undefined;
  }
  if (hasPortalAccess !== undefined) patch.hasPortalAccess = hasPortalAccess;

  let resident: typeof residentsTable.$inferSelect | undefined;
  try {
    resident = await db.transaction((tx) =>
      updateResidentOccupancy(tx, Number(req.params.id), patch as any));
  } catch (error) {
    if (error instanceof OccupancyError) return res.status(409).json({ error: error.code, message: error.message });
    throw error;
  }
  if (!resident) return res.status(404).json({ error: "Not found" });

  let invitationSent = false;
  let inviteUrl: string | null = null;
  if (disablingAccess) {
    // Disabling portal access must never leave a consumable pending token or
    // a still-linked account — treat it as a full transactional revoke.
    await revokeSlotForResident(resident.id, existing.linkedUserId ?? null);
  }
  if (grantingAccess && effectiveEmail && inviteUnit) {
    const result = await createSlotInvitation(req, {
      unitId: inviteUnit.unitId,
      unitNumber: inviteUnit.unitNumber || resident.unitNumber,
      email: effectiveEmail,
      createdByUserId: caller.id,
      residentId: resident.id,
    });
    if ("slotTaken" in result) {
      // Lost the slot to a concurrent request — revert the grant so the
      // resident is never portal-enabled without an invitation.
      const reverted = await db.transaction((tx) =>
        updateResidentOccupancy(tx, resident!.id, { hasPortalAccess: false }));
      return res.status(409).json({
        error: "INVITATION_SLOT_TAKEN",
        message: "Your unit already has a portal invitation. Revoke it before inviting someone else.",
        resident: reverted
          ? residentApiResponse(reverted)
          : { ...residentApiResponse(resident), hasPortalAccess: false },
      });
    }
    invitationSent = result.emailSent;
    inviteUrl = result.invitationUrl;
  }
  res.json({ ...residentApiResponse(resident), invitationSent, invitationUrl: inviteUrl });
});

// Resend the portal invitation email for a household member who was granted access
router.post("/residents/:id/invite", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(residentsTable).where(eq(residentsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Only the registrar (verified owner/tenant) or an admin may reissue —
  // NOT staff (supervisors/guards must never obtain the raw invite URL),
  // even a staff member who happens to be the registrar of this resident.
  if (!canManageInvitation(caller, existing)) return res.status(404).json({ error: "Not found" });

  if (!existing.hasPortalAccess) {
    return res.status(409).json({
      error: "NO_PORTAL_ACCESS",
      message: "This household member has not been granted portal access.",
    });
  }
  if (!existing.email) {
    return res.status(422).json({
      error: "EMAIL_REQUIRED_FOR_PORTAL_ACCESS",
      message: "This household member has no email address on file. Add one before sending an invitation.",
    });
  }

  // The invitation is anchored to the unit of the user who registered the member.
  const registrarUnitId = existing.registeredById === caller.id
    ? caller.unitId
    : (await db.select().from(usersTable).where(eq(usersTable.id, existing.registeredById!)))[0]?.unitId ?? null;
  if (!registrarUnitId) {
    return res.status(422).json({
      error: "NO_UNIT_LINKED",
      message: "No unit is linked to this household member's registrar, so an invitation cannot be issued.",
    });
  }

  const [current] = await db.select().from(householdInvitationsTable)
    .where(and(
      eq(householdInvitationsTable.unitId, registrarUnitId),
      eq(householdInvitationsTable.status, "accepted"),
    ));
  if (current) {
    return res.status(409).json({
      error: "INVITATION_ALREADY_ACCEPTED",
      message: "This invitation has already been accepted — the member has an active portal account.",
    });
  }

  const result = await createSlotInvitation(req, {
    unitId: registrarUnitId,
    unitNumber: existing.unitNumber,
    email: existing.email,
    createdByUserId: caller.id,
    residentId: existing.id,
  });
  if ("slotTaken" in result) {
    return res.status(409).json({
      error: "INVITATION_ALREADY_ACCEPTED",
      message: "This invitation has already been accepted — the member has an active portal account.",
    });
  }
  res.json({
    ok: true,
    invitationSent: result.emailSent,
    invitationUrl: result.invitationUrl,
    expiresAt: result.invitation.expiresAt,
  });
});

// Revoke the unit's portal invitation (pending or accepted). Frees the slot.
router.delete("/residents/:id/invite", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(residentsTable).where(eq(residentsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Registrar (verified owner/tenant) or admin only — staff excluded.
  if (!canManageInvitation(caller, existing)) return res.status(404).json({ error: "Not found" });

  // Revocation runs in ONE transaction that row-locks the invitations
  // (`SELECT ... FOR UPDATE`). A concurrent consume locks the same invitation
  // row before writing any linkage, so either it committed first (we then see
  // the accepted state AND the linked user under the lock, and fully unlink),
  // or we commit first (the consume then finds the row revoked and links
  // nothing). A revoked invitation can never leave a user linked to the unit.
  const revoked = await revokeSlotForResident(existing.id, existing.linkedUserId ?? null);

  if (!revoked) {
    return res.status(409).json({
      error: "NO_ACTIVE_INVITATION",
      message: "There is no active invitation for this household member.",
    });
  }

  res.json({ ok: true, revoked: true });
});

router.delete("/residents/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, Number(req.params.id)));
  if (!resident) return res.status(404).json({ error: "Not found" });
  const reason = caller.role === "admin" ? String(req.body?.reason ?? "").trim() : "primary_occupant_removed_secondary_resident";
  if (!reason) return res.status(400).json({ error: "AUDIT_REASON_REQUIRED" });
  try {
    const outcome = await db.transaction((tx) => removeSecondaryResident(tx, { residentId: resident.id, actorUserId: caller.id, actorRole: caller.role, reason, idempotencyKey: String(req.header("Idempotency-Key") ?? `resident-removal:${resident.id}`) }));
    res.json({ ok: true, ...outcome });
  } catch (error) {
    if (error instanceof OccupancyError) return res.status(error.code === "FORBIDDEN" ? 403 : 409).json({ error: error.code, message: error.message });
    throw error;
  }
});

// Self-registration: verified owner or primary tenant registers themselves as a resident
// C3: unit-based and idempotent — uses unitId + linkedUserId for duplicate detection.
router.post("/residents/self", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const isVerifiedOwner = caller.verificationStatus === "verified_owner";
  const isVerifiedTenant = caller.verificationStatus === "verified_tenant";

  if (!isVerifiedOwner && !isVerifiedTenant) {
    return res.status(403).json({
      error: "VERIFICATION_REQUIRED",
      message: "Only verified owners and primary tenants can register themselves as a household resident.",
    });
  }

  const selfType = isVerifiedOwner ? "owner" : "tenant";
  const phoneResult = canonicalizePhone(caller.phone);
  if (!phoneResult.ok || !phoneResult.e164) {
    return res.status(422).json({
      error: "RESIDENT_MOBILE_REQUIRED",
      message: "Add a valid mobile number before registering as a resident.",
    });
  }

  // C3: Idempotent — check by unitId + linkedUserId (unit-based, not registeredById).
  // If the stub already exists for this user on this unit, return it (idempotent 201).
  if (caller.unitId != null) {
    const [existingByUnit] = await db
      .select()
      .from(residentsTable)
      .where(
        and(
          eq(residentsTable.linkedUserId, caller.id),
          eq(residentsTable.unitId, caller.unitId),
          eq(residentsTable.type, selfType),
          eq(residentsTable.status, "active"),
        )
      );
    if (existingByUnit) {
      return res.status(409).json({
        error: "ALREADY_REGISTERED",
        message: "You are already registered as a household resident.",
      });
    }
  } else {
    // Fallback: no unitId yet — check by registeredById for backward compat
    const [existingSelf] = await db
      .select()
      .from(residentsTable)
      .where(
        and(
          eq(residentsTable.registeredById, caller.id),
          eq(residentsTable.type, selfType),
          eq(residentsTable.status, "active"),
        )
      );
    if (existingSelf) {
      return res.status(409).json({
        error: "ALREADY_REGISTERED",
        message: "You are already registered as a household resident.",
      });
    }
  }

  const relationship = isVerifiedOwner ? "Owner" : "Primary Tenant";

  let resident: typeof residentsTable.$inferSelect | undefined;
  try { resident = await db.transaction(async (tx) => {
    const unitId = caller.unitId;
    if (unitId != null) {
      await assertActivationAllowed(tx, unitId, selfType);
    }
    const { resident: created } = await createHouseholdResident(tx, {
    type: selfType as "owner" | "tenant",
    firstName: caller.firstName ?? "",
    lastName: caller.lastName ?? "",
    email: caller.email ?? null,
    phone: phoneResult.e164,
    phoneNormalized: phoneResult.e164,
    unitNumber: caller.unitNumber ?? "",
    unitId: caller.unitId ?? null,
    relationship,
    idNumber: caller.nationalId ?? null,
    hasPortalAccess: true,
    linkedUserId: caller.id,
    registeredById: caller.id,
    status: "active",
    isPrimary: true,
    } as typeof residentsTable.$inferInsert);
    return created;
  }); } catch (error) {
    if (error instanceof OccupancyError) return res.status(409).json({ error: error.code, message: error.message });
    throw error;
  }

  if (!resident) return res.status(500).json({ error: "RESIDENT_CREATE_FAILED" });
  res.status(201).json(residentApiResponse(resident));
});

export default router;
