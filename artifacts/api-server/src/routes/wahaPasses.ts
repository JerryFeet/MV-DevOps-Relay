import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  residentsTable,
  guestsTable,
  wahaPassApplicationsTable,
  wahaPassCredentialsTable,
  wahaPassEventsTable,
  wahaReplacementRequestsTable,
  notificationPreferencesTable,
} from "@workspace/db";
import { eq, and, or, sql, count } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { APPROVER_ROLES } from "../lib/roles";
import { sendAdminAlert } from "../lib/email";
import { randomUUID } from "crypto";
import { initiatePayment } from "../payments/PaymentCore";
import { getPaymentPurposeAmount, PaymentPricingError } from "../payments/PurposeRegistry";
import { enqueueNotification } from "../lib/notificationService";
import { enqueueBothNotificationChannels } from "../lib/notificationProducer";
import { EVT, wahaPassDecisionKey, wahaCredentialRevokedKey } from "../lib/notificationWiring";
import { enforceDurableRateLimit, rateLimitUserSubject } from "../lib/durableRateLimit";
import { assertActiveOccupantEligibility, OccupancyError } from "../lib/occupancy";
import { canonicalUnitReference } from "../lib/unitReference";

const router = Router();

function baseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:80";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

import { cancelFutureBookings } from "../lib/cancelFutureBookings";

// I5: Resident must have a date_of_birth on file and be at least 18 years old.
function isAdultDob(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob <= cutoff;
}

async function getCallerWithUnit(clerkId: string) {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return caller ?? null;
}

async function notifyApprovalRoutedAdmins(input: {
  queue: string;
  itemId: number;
  detail: string;
}) {
  const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  await Promise.all(admins.map(async (admin) => {
    const [preferences] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, admin.id));
    if (!preferences?.receivesApprovalNotifications) return;
    const idempotencyKey = `approval-required:${input.queue}:${input.itemId}`;
    const payload = {
      title: "Approval required / مطلوب موافقة",
      body: `${input.detail}\n\n${input.detail}`,
      html: `<p><strong>Approval required</strong> / <strong>مطلوب موافقة</strong></p><p>${input.detail}</p>`,
      data: { screen: "admin", queue: input.queue, itemId: input.itemId },
    };
    await Promise.all([
      enqueueNotification({
        eventType: "approval_required",
        idempotencyKey,
        recipientUserId: admin.id,
        recipientEmail: admin.email,
        channel: "email",
        locale: "ar",
        payload,
        preferencePolicy: "mandatory",
      }),
      enqueueNotification({
        eventType: "approval_required",
        idempotencyKey,
        recipientUserId: admin.id,
        channel: "push",
        locale: "ar",
        payload,
        preferencePolicy: "mandatory",
      }),
    ]);
  }));
}

// Pass numbers follow the pattern WP-{YEAR}-{seq:06d}.
// The sequence is the credential's own SERIAL primary key — guaranteed unique
// and monotonically increasing by the DB, with no race-condition risk.
// Per spec: "sequential, formatted WP-YYYY-NNNNNN, generated from serial credential ID after insert".
async function generatePassNumber(credentialId: number): Promise<string> {
  const year = new Date().getFullYear();
  return `WP-${year}-${String(credentialId).padStart(6, "0")}`;
}

async function enrichApplication(app: typeof wahaPassApplicationsTable.$inferSelect) {
  const [applicant] = app.applicantUserId === null
    ? [null]
    : await db.select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      unitId: usersTable.unitId,
    }).from(usersTable).where(eq(usersTable.id, app.applicantUserId));

  let secondResident = null;
  if (app.secondResidentId) {
    const [r] = await db.select().from(residentsTable).where(eq(residentsTable.id, app.secondResidentId));
    secondResident = r ?? null;
  }

  const credentials = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(eq(wahaPassCredentialsTable.applicationId, app.id));

  const events = await db
    .select()
    .from(wahaPassEventsTable)
    .where(eq(wahaPassEventsTable.applicationId, app.id));

  const unitReference = await canonicalUnitReference(app.unitId);
  return { ...app, applicant: applicant && { ...applicant, unitReference }, secondResident, credentials, events, unitReference };
}

// ── GET /waha-pass/eligibility ─────────────────────────────────────────────────
router.get("/waha-pass/eligibility", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  let eligibility: Awaited<ReturnType<typeof assertActiveOccupantEligibility>>;
  try {
    // Eligibility is occupancy-derived, never merely a profile verification flag.
    eligibility = await db.transaction((tx) => assertActiveOccupantEligibility(tx, caller.id));
  } catch (error) {
    if (error instanceof OccupancyError) {
      return res.json({
        eligible: false,
        reason: caller.unitId ? "unit_not_verified" : "no_unit_linked",
        eligibleSecondResidents: [],
      });
    }
    throw error;
  }
  if (!eligibility.user.unitId) {
    return res.json({
      eligible: false,
      reason: "no_unit_linked",
      eligibleSecondResidents: [],
    });
  }

  const { track } = eligibility;
  const unitId = eligibility.user.unitId;

  // Check for conflicting active application on this unit (same or opposing track)
  const existingApps = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(
      and(
        eq(wahaPassApplicationsTable.unitId, unitId),
        or(
          eq(wahaPassApplicationsTable.status, "pending_review"),
          eq(wahaPassApplicationsTable.status, "active"),
        ),
      ),
    );

  // The caller already has their own app
  const ownApp = existingApps.find(a => a.applicantUserId === caller.id);
  if (ownApp) {
    return res.json({
      eligible: false,
      reason: "already_applied",
      applicationId: ownApp.id,
      applicationStatus: ownApp.status,
      eligibleSecondResidents: [],
    });
  }

  // Opposing track has an active app → blocked
  const opposingTrack = track === "owner" ? "tenant" : "owner";
  const conflicting = existingApps.find(a => a.occupancyTrack === opposingTrack);
  if (conflicting) {
    return res.json({
      eligible: false,
      reason: "opposing_track_active",
      eligibleSecondResidents: [],
    });
  }

  // I1: Get all active residents for this unit (includes self-owner stub + household members).
  const unitResidents = eligibility.state.active;

  // I1: The self-resident stub (linkedUserId = caller.id) must exist for the caller to be eligible.
  // If the stub is missing, the caller has not completed self-registration — surface this explicitly.
  const selfStub = unitResidents.find((r: typeof residentsTable.$inferSelect) => r.linkedUserId === caller.id);
  if (!selfStub) {
    return res.json({
      eligible: false,
      reason: "self_resident_not_registered",
      eligibleSecondResidents: [],
    });
  }

  // I5: The household members eligible for Credential 2 must be aged ≥ 18
  // (from residents.date_of_birth) and must have portal access.
  // Residents who don't meet these criteria are returned in a separate
  // ineligibleSecondResidents list with the reason so the UI can surface it
  // rather than silently omitting them.
  const otherResidents = unitResidents.filter((r: typeof residentsTable.$inferSelect) => r.linkedUserId !== caller.id);
  const eligibleSecondResidents: typeof otherResidents = [];
  const ineligibleSecondResidents: { resident: typeof otherResidents[0]; reason: string }[] = [];

  for (const r of otherResidents) {
    if (!r.dateOfBirth) {
      ineligibleSecondResidents.push({ resident: r, reason: "dob_absent" });
    } else if (!isAdultDob(r.dateOfBirth)) {
      ineligibleSecondResidents.push({ resident: r, reason: "under_18" });
    } else if (!r.hasPortalAccess) {
      ineligibleSecondResidents.push({ resident: r, reason: "no_portal_access" });
    } else {
      eligibleSecondResidents.push(r);
    }
  }

  res.json({
    eligible: true,
    occupancyTrack: track,
    unitId,
    selfResident: selfStub,
    eligibleSecondResidents,
    ineligibleSecondResidents,
  });
});

// ── POST /waha-pass/apply ──────────────────────────────────────────────────────
router.post("/waha-pass/apply", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { secondResidentId } = req.body;
  // Preserve precise client remediation errors, then repeat the relevant
  // checks from locked occupancy state in the mutation transaction below.
  if (caller.unitId) {
    const [selfStub] = await db.select().from(residentsTable).where(and(
      eq(residentsTable.linkedUserId, caller.id),
      eq(residentsTable.unitId, caller.unitId),
      eq(residentsTable.status, "active"),
    ));
    if (!selfStub) {
      return res.status(422).json({ error: "Self-registration incomplete. Please complete your resident profile before applying." });
    }
    if (secondResidentId) {
      const [resident] = await db.select().from(residentsTable).where(and(
        eq(residentsTable.id, Number(secondResidentId)),
        eq(residentsTable.unitId, caller.unitId),
        eq(residentsTable.status, "active"),
      ));
      if (!resident) return res.status(400).json({ error: "Second resident not found or not eligible" });
      if (!resident.dateOfBirth) return res.status(422).json({ error: "SECOND_RESIDENT_DOB_ABSENT", message: "The selected resident has no date of birth on file. Please update their record before applying." });
      if (!isAdultDob(resident.dateOfBirth)) return res.status(422).json({ error: "SECOND_RESIDENT_UNDER_18", message: "The selected resident must be 18 years of age or older." });
      if (!resident.hasPortalAccess) return res.status(422).json({ error: "SECOND_RESIDENT_NO_PORTAL_ACCESS", message: "The selected resident does not have portal access. Please grant portal access before adding them as a second credential holder." });
    }
  }
  let application: typeof wahaPassApplicationsTable.$inferSelect;
  let track: "owner" | "tenant" = "owner";
  try {
    application = await db.transaction(async (tx) => {
      // This lock/recheck is immediately before all entitlement writes.
      const eligibility = await assertActiveOccupantEligibility(tx, caller.id);
      track = eligibility.track as "owner" | "tenant";
      const unitId = eligibility.user.unitId!;
      const existingApps = await tx.select().from(wahaPassApplicationsTable).where(and(
        eq(wahaPassApplicationsTable.unitId, unitId),
        or(eq(wahaPassApplicationsTable.status, "pending_review"), eq(wahaPassApplicationsTable.status, "active")),
      ));
      if (existingApps.some(a => a.applicantUserId === caller.id)) throw new OccupancyError("OCCUPANCY_CONFLICT", "You already have an active or pending Waha Pass application");
      if (existingApps.some(a => a.occupancyTrack !== track)) throw new OccupancyError("OCCUPANCY_CONFLICT", "A Waha Pass already exists for the other household type on this unit");
      const selfStub = eligibility.state.active.find((r: typeof residentsTable.$inferSelect) => r.linkedUserId === caller.id);
      if (!selfStub) throw new OccupancyError("FORBIDDEN", "Self-registration incomplete. Please complete your resident profile before applying.");
      const resident = secondResidentId
        ? eligibility.state.active.find((r: typeof residentsTable.$inferSelect) => r.id === Number(secondResidentId))
        : null;
      if (secondResidentId && !resident) throw new OccupancyError("FORBIDDEN", "Second resident not found or not eligible");
      if (resident && (!resident.dateOfBirth || !isAdultDob(resident.dateOfBirth) || !resident.hasPortalAccess)) throw new OccupancyError("FORBIDDEN", "Second resident does not meet Waha Pass eligibility requirements.");
      const [created] = await tx.insert(wahaPassApplicationsTable).values({ unitId, applicantUserId: caller.id, secondResidentId: secondResidentId ? Number(secondResidentId) : undefined, occupancyTrack: track, status: "pending_review" }).returning();
      await tx.insert(wahaPassEventsTable).values({ applicationId: created.id, eventType: "applied", actorUserId: caller.id, notes: `Applied for Waha Pass (${track} track)` });
      return created;
    });
  } catch (error) {
    if (error instanceof OccupancyError) return res.status(error.code === "OCCUPANCY_CONFLICT" ? 409 : 403).json({ error: error.message });
    throw error;
  }

  const callerName = `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email;
  const unitReference = await canonicalUnitReference(caller.unitId);
  sendAdminAlert(
    `[Action Required] New Waha Pass Application — Unit ${unitReference}`,
    `<h2>New Waha Pass Application Submitted</h2>
     <p><strong>Applicant:</strong> ${callerName}</p>
     <p><strong>Unit:</strong> ${unitReference}</p>
     <p><strong>Track:</strong> ${track}</p>
     <p>Please review and approve or reject in the admin portal.</p>`,
  ).catch(() => {});

  res.status(201).json(application);
});

// ── GET /waha-pass/mine ────────────────────────────────────────────────────────
router.get("/waha-pass/mine", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  if (!caller.unitId) return res.json(null);

  // Find application where caller is applicant
  const [ownApp] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.applicantUserId, caller.id));

  if (ownApp) {
    const enriched = await enrichApplication(ownApp);
    return res.json({ ...enriched, isApplicant: true });
  }

  // Find application where caller holds Credential 2
  const cred2 = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(
      and(
        eq(wahaPassCredentialsTable.heldByUserId, caller.id),
        eq(wahaPassCredentialsTable.credentialIndex, 2),
      ),
    );

  if (cred2.length > 0) {
    const [app] = await db
      .select()
      .from(wahaPassApplicationsTable)
      .where(eq(wahaPassApplicationsTable.id, cred2[0].applicationId));
    if (app) {
      // Second resident sees only their own credential
      return res.json({ ...app, credentials: cred2, isApplicant: false });
    }
  }

  res.json(null);
});

// ── GET /waha-pass/admin ───────────────────────────────────────────────────────
router.get("/waha-pass/admin", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller || !APPROVER_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);

  const [{ total }] = await db.select({ total: count() }).from(wahaPassApplicationsTable);
  const apps = await db
    .select()
    .from(wahaPassApplicationsTable)
    .orderBy(sql`${wahaPassApplicationsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const enriched = await Promise.all(apps.map(enrichApplication));
  res.json(paginatedResponse(enriched, Number(total), page, limit));
});

// ── POST /waha-pass/:id/approve ────────────────────────────────────────────────
router.post("/waha-pass/:id/approve", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller || !APPROVER_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "pending_review") {
    return res.status(409).json({ error: "Application is not in pending_review status" });
  }
  if (application.applicantUserId === null) {
    return res.status(409).json({ error: "Application applicant is no longer active" });
  }

  // Look up applicant name (Credential 1)
  const [applicant] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, application.applicantUserId));
  const cred1Name = applicant
    ? (`${applicant.firstName ?? ""} ${applicant.lastName ?? ""}`.trim() || applicant.email)
    : "Resident";

  // Look up second resident name and portal account (Credential 2)
  let cred2Name = "Unassigned";
  let cred2UserId: number | null = null;
  if (application.secondResidentId) {
    const [r] = await db
      .select({ firstName: residentsTable.firstName, lastName: residentsTable.lastName, email: residentsTable.email })
      .from(residentsTable)
      .where(eq(residentsTable.id, application.secondResidentId));
    if (r) {
      cred2Name = `${r.firstName} ${r.lastName}`.trim();
      // Try to find a portal account for this resident by email
      if (r.email) {
        const [matchedUser] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, r.email));
        cred2UserId = matchedUser?.id ?? null;
      }
    }
  }

  const { reviewNote } = req.body;
  let cred1: typeof wahaPassCredentialsTable.$inferSelect;
  let cred2: typeof wahaPassCredentialsTable.$inferSelect;
  try {
    [cred1, cred2] = await db.transaction(async (tx) => {
      // Approval rechecks the applicant while holding that unit's canonical
      // occupancy lock; all credential and application writes stay under it.
      const locked = await assertActiveOccupantEligibility(tx, application.applicantUserId!);
      if (locked.state.unit.id !== application.unitId || locked.track !== application.occupancyTrack) {
        throw new OccupancyError("FORBIDDEN", "The applicant is no longer the active occupant for this application.");
      }
      const [current] = await tx.select().from(wahaPassApplicationsTable)
        .where(eq(wahaPassApplicationsTable.id, appId)).for("update");
      if (!current || current.status !== "pending_review") {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "Application is not in pending_review status");
      }
      const [cred1Raw] = await tx.insert(wahaPassCredentialsTable).values({
        applicationId: appId, credentialIndex: 1, verificationToken: randomUUID(),
        holderName: cred1Name, heldByUserId: application.applicantUserId, status: "active",
      }).returning();
      const passNumber1 = await generatePassNumber(cred1Raw.id);
      await tx.update(wahaPassCredentialsTable).set({ passNumber: passNumber1 })
        .where(eq(wahaPassCredentialsTable.id, cred1Raw.id));
      const [cred2Raw] = await tx.insert(wahaPassCredentialsTable).values({
        applicationId: appId, credentialIndex: 2, verificationToken: randomUUID(),
        holderName: cred2Name, heldByUserId: cred2UserId, status: "active",
      }).returning();
      const passNumber2 = await generatePassNumber(cred2Raw.id);
      await tx.update(wahaPassCredentialsTable).set({ passNumber: passNumber2 })
        .where(eq(wahaPassCredentialsTable.id, cred2Raw.id));
      await tx.update(wahaPassApplicationsTable)
        .set({ status: "active", reviewedById: caller.id, reviewNote: reviewNote ?? null })
        .where(eq(wahaPassApplicationsTable.id, appId));
      await tx.insert(wahaPassEventsTable).values({
        applicationId: appId, eventType: "approved", actorUserId: caller.id,
        notes: reviewNote ?? "Application approved; credentials generated.",
      });
      return [{ ...cred1Raw, passNumber: passNumber1 }, { ...cred2Raw, passNumber: passNumber2 }] as const;
    });
  } catch (error) {
    if (error instanceof OccupancyError) {
      return res.status(409).json({ error: "Application applicant is no longer active" });
    }
    throw error;
  }

  // Row 5 — waha_pass_decision (approved)
  enqueueBothNotificationChannels({
    eventType: EVT.WAHA_PASS_DECISION,
    idempotencyKey: wahaPassDecisionKey(appId, "approved"),
    recipientUserId: application.applicantUserId,
    recipientEmail: applicant?.email ?? null,
    payload: {
      title: "✅ Waha Pass Approved",
      body: "Your Waha Pass application has been approved. Your credentials are now active.",
      subject: "Waha Pass approved",
      html: "<p>Your Waha Pass application has been approved. Your credentials are now active.</p>",
      data: { screen: "waha-pass", applicationId: appId },
    },
    preferencePolicy: "decision",
  }).catch(() => {});

  res.json({ application: { ...application, status: "active" }, credentials: [cred1, cred2] });
});

// ── POST /waha-pass/:id/reject ─────────────────────────────────────────────────
router.post("/waha-pass/:id/reject", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller || !APPROVER_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "pending_review") {
    return res.status(409).json({ error: "Application is not in pending_review status" });
  }

  const { reviewNote } = req.body;
  const [updated] = await db
    .update(wahaPassApplicationsTable)
    .set({ status: "rejected", reviewedById: caller.id, reviewNote: reviewNote ?? null })
    .where(and(
      eq(wahaPassApplicationsTable.id, appId),
      eq(wahaPassApplicationsTable.status, "pending_review"),
    ))
    .returning();
  if (!updated) {
    return res.status(409).json({ error: "Application was decided by another administrator." });
  }

  await db.insert(wahaPassEventsTable).values({
    applicationId: appId,
    eventType: "rejected",
    actorUserId: caller.id,
    notes: reviewNote ?? "Application rejected.",
  });

  // Row 5 — waha_pass_decision (rejected)
  const [applicant] = application.applicantUserId === null
    ? [undefined]
    : await db.select({ email: usersTable.email }).from(usersTable)
      .where(eq(usersTable.id, application.applicantUserId));
  if (application.applicantUserId !== null) enqueueBothNotificationChannels({
    eventType: EVT.WAHA_PASS_DECISION,
    idempotencyKey: wahaPassDecisionKey(appId, "rejected"),
    recipientUserId: application.applicantUserId,
    recipientEmail: applicant?.email ?? null,
    payload: {
      title: "❌ Waha Pass Rejected",
      body: reviewNote
        ? `Your Waha Pass application was rejected. Reason: ${reviewNote}`
        : "Your Waha Pass application was rejected.",
      subject: "Waha Pass rejected",
      html: `<p>Your Waha Pass application was rejected.${reviewNote ? ` Reason: ${reviewNote}` : ""}</p>`,
      data: { screen: "waha-pass", applicationId: appId },
    },
    preferencePolicy: "decision",
  }).catch(() => {});

  res.json(updated);
});

// ── POST /waha-pass/:id/revoke ─────────────────────────────────────────────────
// Admin can revoke one specific credential (by credentialId in body) or all credentials.
router.post("/waha-pass/:id/revoke", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller || !APPROVER_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "active") {
    return res.status(409).json({ error: "Application is not active" });
  }

  const { credentialId, reason } = req.body;
  const revocationReason = reason ?? "admin_decision";
  const revokedAt = new Date();

  if (credentialId) {
    // Revoke a specific credential
    await db
      .update(wahaPassCredentialsTable)
      .set({ status: "revoked", revocationReason, revokedAt })
      .where(
        and(
          eq(wahaPassCredentialsTable.id, Number(credentialId)),
          eq(wahaPassCredentialsTable.applicationId, appId),
        ),
      );

    await db.insert(wahaPassEventsTable).values({
      applicationId: appId,
      credentialId: Number(credentialId),
      eventType: "revoked",
      actorUserId: caller.id,
      notes: `Credential ${credentialId} revoked: ${revocationReason}`,
    });

    // If both credentials are now revoked, mark application as revoked too
    const remaining = await db
      .select()
      .from(wahaPassCredentialsTable)
      .where(
        and(
          eq(wahaPassCredentialsTable.applicationId, appId),
          eq(wahaPassCredentialsTable.status, "active"),
        ),
      );
    if (remaining.length === 0) {
      await db
        .update(wahaPassApplicationsTable)
        .set({ status: "revoked" })
        .where(eq(wahaPassApplicationsTable.id, appId));
    }
  } else {
    // Revoke all credentials on this application
    const creds = await db
      .select()
      .from(wahaPassCredentialsTable)
      .where(eq(wahaPassCredentialsTable.applicationId, appId));

    for (const cred of creds) {
      await db
        .update(wahaPassCredentialsTable)
        .set({ status: "revoked", revocationReason, revokedAt })
        .where(eq(wahaPassCredentialsTable.id, cred.id));

      await db.insert(wahaPassEventsTable).values({
        applicationId: appId,
        credentialId: cred.id,
        eventType: "revoked",
        actorUserId: caller.id,
        notes: `Credential ${cred.credentialIndex} revoked: ${revocationReason}`,
      });
    }

    await db
      .update(wahaPassApplicationsTable)
      .set({ status: "revoked" })
      .where(eq(wahaPassApplicationsTable.id, appId));
  }

  // F8: Cancel future bookings for each credential holder whose credential is revoked.
  // This is a best-effort call outside the per-credential DB operations; full atomicity
  // (inside a single transaction) is delivered in Stage 6 when T13/O3 are implemented.
  const revokedCreds = await db
    .select({ heldByUserId: wahaPassCredentialsTable.heldByUserId })
    .from(wahaPassCredentialsTable)
    .where(
      and(
        eq(wahaPassCredentialsTable.applicationId, appId),
        eq(wahaPassCredentialsTable.status, "revoked"),
      ),
    );

  for (const cred of revokedCreds) {
    if (cred.heldByUserId) {
      await cancelFutureBookings(db, cred.heldByUserId, "waha_pass_revoked").catch(() => {});
    }
  }

  // Row 5 — waha_pass_decision (revoked) — notify each revoked credential holder
  const revokedCredsForNotify = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(
      and(
        eq(wahaPassCredentialsTable.applicationId, appId),
        eq(wahaPassCredentialsTable.status, "revoked"),
      ),
    );

  for (const cred of revokedCredsForNotify) {
    if (cred.heldByUserId) {
      const [recipient] = await db.select({ email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, cred.heldByUserId));
      enqueueBothNotificationChannels({
        eventType: EVT.WAHA_PASS_DECISION,
        idempotencyKey: wahaCredentialRevokedKey(cred.id),
        recipientUserId: cred.heldByUserId,
        recipientEmail: recipient?.email ?? null,
        payload: {
          title: "🚫 Waha Pass Revoked",
          body: `Your Waha Pass credential (${cred.passNumber ?? cred.id}) has been revoked.`,
          subject: "Waha Pass revoked",
          html: `<p>Your Waha Pass credential (<strong>${cred.passNumber ?? cred.id}</strong>) has been revoked. Reason: ${revocationReason}.</p>`,
          data: { screen: "waha-pass", applicationId: appId },
        },
        preferencePolicy: "decision",
      }).catch(() => {});
    }
  }

  const enriched = await enrichApplication(application);
  res.json(enriched);
});

// ── POST /waha-pass/:id/assign-second ─────────────────────────────────────────
// Applicant assigns or updates the second resident after approval.
router.post("/waha-pass/:id/assign-second", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.applicantUserId !== caller.id) {
    return res.status(403).json({ error: "Only the applicant may assign the second resident" });
  }
  if (application.status !== "active" && application.status !== "pending_review") {
    return res.status(409).json({ error: "Application is not active or pending" });
  }

  const { secondResidentId } = req.body;
  if (!secondResidentId) return res.status(400).json({ error: "secondResidentId is required" });

  const [resident] = await db
    .select()
    .from(residentsTable)
    .where(
      and(
        eq(residentsTable.id, Number(secondResidentId)),
        eq(residentsTable.unitId, caller.unitId!),
        eq(residentsTable.status, "active"),
      ),
    );
  if (!resident) return res.status(400).json({ error: "Resident not found or not eligible" });

  // Try to link to a portal user account via email (best-effort)
  let secondUserId: number | null = null;
  if (resident.email) {
    const [matchedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, resident.email));
    secondUserId = matchedUser?.id ?? null;
  }

  const cred2Name = `${resident.firstName} ${resident.lastName}`.trim();

  await db
    .update(wahaPassApplicationsTable)
    .set({ secondResidentId: Number(secondResidentId) })
    .where(eq(wahaPassApplicationsTable.id, appId));

  // If credentials already exist, update Credential 2's holderName and heldByUserId
  await db
    .update(wahaPassCredentialsTable)
    .set({ holderName: cred2Name, heldByUserId: secondUserId })
    .where(
      and(
        eq(wahaPassCredentialsTable.applicationId, appId),
        eq(wahaPassCredentialsTable.credentialIndex, 2),
      ),
    );

  res.json({ success: true, secondResidentId: Number(secondResidentId), secondResidentName: cred2Name });
});

// ── POST /waha-pass/:id/report-lost ───────────────────────────────────────────
// Applicant reports a credential as lost/stolen/damaged.
router.post("/waha-pass/:id/report-lost", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.applicantUserId !== caller.id) {
    return res.status(403).json({ error: "Only the applicant (pass administrator) may report a credential as lost or stolen" });
  }
  if (application.status !== "active") {
    return res.status(409).json({ error: "Application is not active" });
  }

  const { credentialId, reason } = req.body;
  if (!credentialId) return res.status(400).json({ error: "credentialId is required" });

  const validReasons = ["lost", "stolen", "damaged"] as const;
  type LostReason = typeof validReasons[number];
  const lostReason: LostReason = validReasons.includes(reason) ? reason : "lost";

  const [cred] = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(
      and(
        eq(wahaPassCredentialsTable.id, Number(credentialId)),
        eq(wahaPassCredentialsTable.applicationId, appId),
      ),
    );

  if (!cred) return res.status(404).json({ error: "Credential not found" });
  if (cred.status !== "active") {
    return res.status(409).json({ error: "Credential is not active" });
  }

  await db
    .update(wahaPassCredentialsTable)
    .set({ status: lostReason, revocationReason: lostReason, revokedAt: new Date() })
    .where(eq(wahaPassCredentialsTable.id, cred.id));

  await db.insert(wahaPassEventsTable).values({
    applicationId: appId,
    credentialId: cred.id,
    eventType: "lost_reported",
    actorUserId: caller.id,
    notes: `Credential ${cred.credentialIndex} reported as ${lostReason}`,
  });

  const [replacementRequest] = await db
    .insert(wahaReplacementRequestsTable)
    .values({
      applicationId: appId,
      originalCredentialId: cred.id,
      requestedByUserId: caller.id,
      reason: lostReason,
    })
    .onConflictDoNothing()
    .returning();

  const callerName = `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email;
  sendAdminAlert(
    `[Info] Waha Pass Credential Reported ${lostReason.charAt(0).toUpperCase() + lostReason.slice(1)} — ${cred.passNumber ?? cred.id}`,
    `<h2>Waha Pass Credential Reported ${lostReason}</h2>
     <p><strong>Pass Number:</strong> ${cred.passNumber ?? "—"}</p>
     <p><strong>Holder:</strong> ${cred.holderName}</p>
     <p><strong>Reported by (applicant):</strong> ${callerName}</p>
     <p><strong>Application ID:</strong> ${appId}</p>
     <p>A replacement pass request and payment of SAR 100 will follow.</p>`,
  ).catch(() => {});

  if (replacementRequest) {
    notifyApprovalRoutedAdmins({
      queue: "waha_replacement",
      itemId: replacementRequest.id,
      detail: `Waha Pass replacement for ${cred.passNumber ?? `credential ${cred.id}`} needs review. / طلب بديل لبطاقة واحة يحتاج إلى مراجعة.`,
    }).catch(() => {});
  }

  res.json({
    credentialId: cred.id,
    status: lostReason,
    replacementRequired: true,
    replacementRequestId: replacementRequest?.id ?? null,
  });
});

// ── PATCH /waha-pass/replacements/:id/review ───────────────────────────────────
router.patch("/waha-pass/replacements/:id/review", requireApiAuth, async (req, res) => {
  const caller = await getCallerWithUnit(req.auth().userId!);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const action = req.body?.action;
  if (action !== "approved" && action !== "rejected") {
    return res.status(400).json({ error: "action must be approved or rejected" });
  }
  const [updated] = await db
    .update(wahaReplacementRequestsTable)
    .set({
      status: action,
      reviewedById: caller.id,
      reviewNote: typeof req.body?.reviewNote === "string" ? req.body.reviewNote : null,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(wahaReplacementRequestsTable.id, Number(req.params.id)),
      eq(wahaReplacementRequestsTable.status, "pending_review"),
    ))
    .returning();
  if (!updated) return res.status(409).json({ error: "Replacement request has already been decided." });
  res.json(updated);
});

// ── POST /waha-pass/:id/replacement-pay ───────────────────────────────────────
// Applicant initiates payment for a lost/stolen/damaged credential replacement (SAR 100).
router.post("/waha-pass/:id/replacement-pay", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_create", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  )) return;
  const caller = await getCallerWithUnit(clerkId);
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const appId = Number(req.params.id);
  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, appId));

  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.applicantUserId !== caller.id) {
    return res.status(403).json({ error: "Only the applicant may pay for a replacement" });
  }

  const { credentialId } = req.body;
  if (!credentialId) return res.status(400).json({ error: "credentialId is required" });

  const [cred] = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(
      and(
        eq(wahaPassCredentialsTable.id, Number(credentialId)),
        eq(wahaPassCredentialsTable.applicationId, appId),
      ),
    );

  if (!cred) return res.status(404).json({ error: "Credential not found" });
  if (cred.status !== "lost" && cred.status !== "stolen" && cred.status !== "damaged") {
    return res.status(409).json({ error: "Credential is not in a reportable state" });
  }
  const [replacementRequest] = await db
    .select()
    .from(wahaReplacementRequestsTable)
    .where(eq(wahaReplacementRequestsTable.originalCredentialId, cred.id));
  if (!replacementRequest) {
    return res.status(409).json({ error: "Replacement request must be reviewed before payment." });
  }
  if (replacementRequest.status !== "approved" && replacementRequest.status !== "payment_pending") {
    return res.status(409).json({ error: "Replacement request is not approved for payment." });
  }
  if (cred.chargeId) {
    return res.json({ paymentUrl: cred.paymentUrl, chargeId: cred.chargeId, message: "Payment already initiated" });
  }

  try {
    const amount = await getPaymentPurposeAmount("waha_replacement");
    const result = await initiatePayment({
      purpose: "waha_replacement",
      subjectType: "waha_replacement",
      subjectId: cred.id,
      userId: caller.id,
      unitId: application.unitId,
      amount,
      description: `Waha Pass Replacement — ${cred.passNumber ?? cred.id}`,
      customer: {
        firstName: caller.firstName ?? "Resident",
        lastName: caller.lastName ?? "",
        email: caller.email ?? "",
      },
    });

    await db
      .update(wahaPassCredentialsTable)
      .set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
      })
      .where(eq(wahaPassCredentialsTable.id, cred.id));
    await db
      .update(wahaReplacementRequestsTable)
      .set({ status: "payment_pending", paymentAttemptId: result.attempt.id })
      .where(and(
        eq(wahaReplacementRequestsTable.id, replacementRequest.id),
        eq(wahaReplacementRequestsTable.status, "approved"),
      ));

    res.json({ paymentUrl: result.paymentUrl, chargeId: result.attempt.providerChargeId, attemptId: result.attempt.id });
  } catch (err: any) {
    if (err instanceof PaymentPricingError) {
      return res.status(503).json({ error: "Waha replacement pricing is not configured." });
    }
    const msg: string = err?.message ?? "Payment gateway error";
    if (msg.includes("not configured")) return res.status(503).json({ error: msg });
    req.log.error({ err }, "Waha Pass replacement payment failed");
    return res.status(502).json({ error: "Payment gateway error. Please try again." });
  }
});

// ── POST /waha-pass/replacement-callback ──────────────────────────────────────
// Verify a completed replacement payment and issue a fresh credential.
// Named "callback" to match the spec; keeps authenticated pattern matching the
// rest of the payment verification flow in this app (no raw payment webhooks).
router.post("/waha-pass/replacement-callback", requireApiAuth, async (req, res) => {
  return res.status(410).json({ error: "Browser payment verification is no longer supported. Await the verified provider callback." });
});

export default router;
