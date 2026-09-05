import { Router } from "express";
import { Readable } from "stream";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  vehiclesTable,
  unitsTable,
  residentsTable,
  parkingLotsTable,
} from "@workspace/db";

// E5: controlled rejection reasons — kept local to avoid import of non-table exports
// from @workspace/db in test environments.  Must mirror VEHICLE_REJECTION_REASONS in schema.
const VEHICLE_REJECTION_REASONS_LIST = [
  "registration_name_mismatch",
  "parking_lot_entitlement_exceeded",
] as const;
import { eq, desc, and, count, sql, inArray } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { APPROVER_ROLES } from "../lib/roles";
import { denyGuardModuleAccess } from "../middlewares/denyGuardModuleAccess";
import { sendAdminAlert } from "../lib/email";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { enqueueBothNotificationChannels } from "../lib/notificationProducer";
import { EVT, vehicleDecisionKey } from "../lib/notificationWiring";
import { VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE } from "../lib/advisoryLockNamespaces";
import { assertActiveOccupantEligibility, OccupancyError } from "../lib/occupancy";

const objectStorage = new ObjectStorageService();

const router = Router();
router.use("/vehicles", requireApiAuth, denyGuardModuleAccess);

// ── GET /vehicles ─────────────────────────────────────────────────────────────
// Staff see all; residents see only their own.
// E2: returned records include verifiedResidentName from the caller's active
//     self-resident stub so the UI can display the authenticated name.
router.get("/vehicles", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);
  const isStaff = APPROVER_ROLES.includes(caller.role);
  const where = isStaff ? undefined : eq(vehiclesTable.userId, caller.id);

  const [{ total }] = await db.select({ total: count() }).from(vehiclesTable).where(where);
  const vehicles = await db.select().from(vehiclesTable)
    .where(where)
    .orderBy(desc(vehiclesTable.createdAt))
    .limit(limit)
    .offset(offset);
  const vehicleUserIds = [...new Set(
    vehicles.map((vehicle) => vehicle.userId).filter((id): id is number => id !== null),
  )];
  const [vehicleUsers, vehicleResidents] = vehicleUserIds.length
    ? await Promise.all([
      db.select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      }).from(usersTable).where(inArray(usersTable.id, vehicleUserIds)),
      db.select({
        linkedUserId: residentsTable.linkedUserId,
        firstName: residentsTable.firstName,
        middleName: residentsTable.middleName,
        lastName: residentsTable.lastName,
        idNumber: residentsTable.idNumber,
      }).from(residentsTable).where(and(
        inArray(residentsTable.linkedUserId, vehicleUserIds),
        eq(residentsTable.status, "active"),
      )),
    ])
    : [[], []];
  const usersById = new Map(vehicleUsers.map((user) => [user.id, user]));
  const residentsByUserId = new Map(
    vehicleResidents
      .filter((resident) => resident.linkedUserId != null)
      .map((resident) => [resident.linkedUserId!, resident]),
  );
  const enrichedVehicles = vehicles.map((vehicle) => {
    const resident = vehicle.userId === null ? undefined : residentsByUserId.get(vehicle.userId);
    const user = vehicle.userId === null ? undefined : usersById.get(vehicle.userId);
    const fullName = resident
      ? [resident.firstName, resident.middleName, resident.lastName].filter(Boolean).join(" ")
      : [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "—";
    return {
      ...vehicle,
      resident: { fullName, nationalId: resident?.idNumber ?? null },
    };
  });
  res.json(paginatedResponse(enrichedVehicles, Number(total), page, limit));
});

// ── POST /vehicles ────────────────────────────────────────────────────────────
router.post("/vehicles", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { make, model, year, color, plateNumber, istimaraNumber, isBasementParking, registrationDocKey } = req.body;

  // Occupant eligibility is rechecked under the canonical occupancy lock in
  // the insert transaction below. Staff accounts remain an explicit exception.
  const isStaffCaller = APPROVER_ROLES.includes(caller.role);
  let verifiedResidentName: string | null = null;
  if (!isStaffCaller && caller.unitId != null) {
    const [selfStub] = await db.select().from(residentsTable).where(and(
      eq(residentsTable.unitId, caller.unitId),
      eq(residentsTable.linkedUserId, caller.id),
      eq(residentsTable.status, "active"),
    ));
    if (!selfStub) {
      return res.status(422).json({
        error: "SELF_RESIDENT_NOT_REGISTERED",
        message: "Please complete your resident profile before registering a vehicle.",
      });
    }
  }

  // Resolve the unit's underground entitlement once for both confirmation and capacity checks.
  let hasUndergroundEntitlement = false;
  if (caller.unitId) {
    const allNormalizedLots = await db
      .select()
      .from(parkingLotsTable)
      .where(eq(parkingLotsTable.unitId, caller.unitId));

    if (allNormalizedLots.length > 0) {
      hasUndergroundEntitlement = allNormalizedLots.some(
        lot => lot.active === true && lot.parkingType === "underground",
      );
    } else {
      const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, caller.unitId));
      let legacyLots: { lotNumber: string; building: string; isInside: boolean }[] = [];
      if (unit?.parkingLots) {
        try {
          const parsed = JSON.parse(unit.parkingLots);
          if (Array.isArray(parsed)) legacyLots = parsed;
        } catch {
          // Malformed stored JSON → treat as no eligible lot
        }
      }
      hasUndergroundEntitlement = legacyLots.some(lot => lot.isInside === true);
    }
  }

  if (caller.role === "tenant" && hasUndergroundEntitlement && isBasementParking !== true) {
    return res.status(400).json({
      error: "UNDERGROUND_PARKING_CONFIRMATION_REQUIRED",
      message: "Confirm that this vehicle will use the unit's underground parking before submitting.",
    });
  }

  if (isBasementParking && !caller.unitId) {
    return res.status(400).json({ error: "BASEMENT_NO_UNIT", message: "No unit linked to your account — cannot verify underground parking eligibility." });
  }
  if (isBasementParking && !hasUndergroundEntitlement) {
    return res.status(400).json({ error: "BASEMENT_PARKING_NOT_REGISTERED", message: "Your unit has no registered underground parking space." });
  }

  // Count existing active vehicles for this user
  const existing = await db.select().from(vehiclesTable)
    .where(and(eq(vehiclesTable.userId, caller.id), eq(vehiclesTable.status, "active")));

  const isAdditional = existing.length >= 1;

  // ── Document requirement for additional vehicles ────────────────────────────
  if (isAdditional && !registrationDocKey) {
    return res.status(400).json({ error: "REGISTRATION_DOC_REQUIRED", message: "A vehicle registration document is required for additional vehicle registrations." });
  }

  // ── Verify the supplied document key actually exists in object storage ───────
  if (isAdditional && registrationDocKey) {
    try {
      await objectStorage.getObjectEntityFile(registrationDocKey);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return res.status(400).json({ error: "REGISTRATION_DOC_NOT_FOUND", message: "The registration document could not be verified. Please re-upload the file." });
      }
      return res.status(400).json({ error: "REGISTRATION_DOC_NOT_FOUND", message: "The registration document could not be verified. Please re-upload the file." });
    }
  }

  const status = isAdditional ? "pending_approval" : "active";

  // ── E3 / E4: Per-type parking entitlement + atomic concurrent-request safety ─
  // When the caller's unit is known, we serialise the insert inside a
  // transaction-scoped advisory lock (one per unit) so two simultaneous
  // requests consuming the final slot cannot both succeed.
  //
  // Entitlement rules (B8):
  //   inside  (isBasementParking = true)  → must have a spare underground lot
  //   outside (isBasementParking = false) → must have a spare surface lot
  //
  // Staff callers without a unitId (e.g. an admin registering their own
  // admin account) skip the entitlement check — they have no unit.
  const unitId = caller.unitId ?? undefined;

  // Helper: count active vehicles of the requested type for this unit
  async function checkParkingEntitlement(tx: Pick<typeof db, "select">): Promise<string | null> {
    if (!unitId) return null; // no unit → no entitlement limit applies

    const wantBasement = !!isBasementParking;

    // Count active vehicles of same type already registered to this unit
    const [{ activeCount }] = await tx
      .select({ activeCount: count() })
      .from(vehiclesTable)
      .where(
        and(
          eq(vehiclesTable.unitId, unitId),
          eq(vehiclesTable.status, "active"),
          eq(vehiclesTable.isBasementParking, wantBasement),
        ),
      );

    // Determine the entitlement cap from normalized lots (preferred) or legacy JSON
    const allNormalizedLots = await tx
      .select()
      .from(parkingLotsTable)
      .where(eq(parkingLotsTable.unitId, unitId));

    let cap: number;
    if (allNormalizedLots.length > 0) {
      // Normalized path: count active lots of the matching type
      cap = allNormalizedLots.filter(
        lot => lot.active === true && (wantBasement ? lot.parkingType === "underground" : lot.parkingType === "surface"),
      ).length;
    } else {
      // Legacy JSON path
      const [unit] = await tx.select().from(unitsTable).where(eq(unitsTable.id, unitId));
      let legacyLots: { lotNumber: string; building: string; isInside: boolean }[] = [];
      if (unit?.parkingLots) {
        try {
          const parsed = JSON.parse(unit.parkingLots);
          if (Array.isArray(parsed)) legacyLots = parsed;
        } catch { /* malformed → 0 cap */ }
      }
      cap = legacyLots.filter(lot => (wantBasement ? lot.isInside === true : lot.isInside === false)).length;
    }

    // E2/E3: a zero entitlement refuses the selected type, and every active
    // vehicle consumes one slot of that same type only.
    if (Number(activeCount) >= cap) {
      return wantBasement
        ? `This unit has ${cap} underground parking lot(s) registered and ${Number(activeCount)} vehicle(s) already assigned to them. Please select surface parking, or contact the HOA if the allocation is incorrect.`
        : `This unit has ${cap} surface parking lot(s) registered and ${Number(activeCount)} vehicle(s) already assigned to them. Please select underground parking, or contact the HOA if the allocation is incorrect.`;
    }
    return null;
  }

  const ENTITLEMENT_EXCEEDED = Symbol("entitlement_exceeded");
  let entitlementMessage: string | null = null;

  let vehicle: typeof vehiclesTable.$inferSelect;
  try {
    vehicle = await db.transaction(async (tx) => {
      if (!isStaffCaller) {
        // The occupancy lock must precede the parking entitlement lock.
        const eligibility = await assertActiveOccupantEligibility(tx, caller.id);
        const selfStub = eligibility.state.active.find((resident: typeof residentsTable.$inferSelect) => resident.linkedUserId === caller.id);
        if (!selfStub) throw new OccupancyError("FORBIDDEN", "Please complete your resident profile before registering a vehicle.");
        verifiedResidentName = [selfStub.firstName, selfStub.lastName].filter(Boolean).join(" ") || null;
        if (eligibility.user.unitId !== unitId) throw new OccupancyError("OCCUPANCY_CONFLICT", "The account unit changed while vehicle registration was pending.");
      }
      // E4: advisory lock — serialise concurrent submissions for the same unit
      if (unitId) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE}, ${unitId})`);
      }

      // E3: check entitlement inside the locked transaction
      const entitlementError = await checkParkingEntitlement(tx);
      if (entitlementError !== null) {
        entitlementMessage = entitlementError;
        throw ENTITLEMENT_EXCEEDED;
      }

      const [inserted] = await tx.insert(vehiclesTable).values({
        userId: caller.id,
        unitId: unitId,
        make, model, year, color, plateNumber, istimaraNumber,
        isAdditional,
        isBasementParking: !!isBasementParking,
        registrationDocKey: registrationDocKey ?? null,
        status,
      }).returning();

      return inserted;
    });
  } catch (err: any) {
    if (err instanceof OccupancyError) {
      return res.status(403).json({
        error: "VERIFICATION_REQUIRED",
        message: err.message,
      });
    }
    if (err === ENTITLEMENT_EXCEEDED) {
      return res.status(409).json({
        error: "PARKING_ENTITLEMENT_EXCEEDED",
        message: entitlementMessage ?? "Parking capacity for this type is already at the unit's entitlement limit.",
      });
    }
    throw err;
  }

  if (isAdditional) {
    const callerName = verifiedResidentName
      ?? (`${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email);
    sendAdminAlert(
      `[Action Required] Additional Vehicle Request — ${make} ${model} (${plateNumber})`,
      `<h2>Additional Vehicle Pending Approval</h2>
       <p><strong>Resident:</strong> ${callerName}</p>
       <p><strong>Unit:</strong> ${caller.unitNumber ?? "—"}</p>
       <p><strong>Vehicle:</strong> ${make} ${model} ${year ?? ""}</p>
       <p><strong>Plate Number:</strong> ${plateNumber}</p>
       <p><strong>Color:</strong> ${color ?? "—"}</p>
       <p><strong>Underground Parking:</strong> ${isBasementParking ? "Yes" : "No"}</p>
       <p><strong>Registration Doc:</strong> ${registrationDocKey ? "Attached" : "Not provided"}</p>`,
    ).catch(() => {});
  }

  // E1: include the verified resident name in the response (null for staff without a stub)
  res.status(201).json({ ...vehicle, verifiedResidentName });
});

// ── GET /vehicles/:id ─────────────────────────────────────────────────────────
router.get("/vehicles/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(req.params.id)));
  if (!vehicle) return res.status(404).json({ error: "Not found" });
  if (!APPROVER_ROLES.includes(caller.role) && vehicle.userId !== caller.id) return res.status(403).json({ error: "Forbidden" });
  res.json(vehicle);
});

// ── GET /vehicles/:id/registration-doc ───────────────────────────────────────
// E5: Serve the registration document.
// Access rules:
//   - Staff (admin / supervisor) can access any vehicle's document.
//   - A resident (owner/tenant) may only access their own vehicle's document.
//   - Guards and other non-approver staff are denied (document is sensitive).
router.get("/vehicles/:id/registration-doc", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(req.params.id)));
  if (!vehicle) return res.status(404).json({ error: "Not found" });

  // Determine access:
  // - Approver roles (admin/supervisor) can access any vehicle's document
  // - Resident can only access their own vehicle's document
  const isApprover = APPROVER_ROLES.includes(caller.role);
  const isOwner = vehicle.userId === caller.id;
  if (!isApprover && !isOwner) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!vehicle.registrationDocKey) {
    return res.status(404).json({ error: "NO_REGISTRATION_DOC", message: "No registration document attached to this vehicle." });
  }

  try {
    const file = await objectStorage.getObjectEntityFile(vehicle.registrationDocKey);
    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `inline; filename="registration-doc-${vehicle.id}"`);
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "NO_REGISTRATION_DOC", message: "Registration document not found in storage." });
    }
    res.status(500).json({ error: "Failed to retrieve registration document" });
  }
});

// E4: approvers obtain a private, short-lived read URL only after this route
// authorizes their identity. The database contains no public URL or storage key.
router.get("/vehicles/:id/registration-doc-url", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !APPROVER_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(req.params.id)));
  if (!vehicle) return res.status(404).json({ error: "Not found" });
  if (!vehicle.registrationDocKey) {
    return res.status(404).json({ error: "NO_REGISTRATION_DOC", message: "No registration document attached to this vehicle." });
  }
  try {
    const expiresInSeconds = 300;
    const downloadUrl = await objectStorage.getObjectEntityDownloadURL(vehicle.registrationDocKey, expiresInSeconds);
    return res.json({
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "NO_REGISTRATION_DOC", message: "Registration document not found in storage." });
    }
    return res.status(500).json({ error: "Failed to prepare registration document access" });
  }
});

// ── PATCH /vehicles/:id ───────────────────────────────────────────────────────
// E5: Reject requires an explicit, controlled rejection reason.
//     Only admin/supervisor (APPROVER_ROLES) may set status to inactive
//     (i.e. reject). Both admin and the vehicle owner may set other fields.
router.patch("/vehicles/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Gate: admin/supervisor (APPROVER_ROLES) can update any vehicle; others only their own.
  const isApproverCaller = APPROVER_ROLES.includes(caller.role);
  if (!isApproverCaller && existing.userId !== caller.id) return res.status(403).json({ error: "Forbidden" });

  const { make, model, year, color, plateNumber, istimaraNumber, status, approvalNote, rejectionReason } = req.body;

  // Only admin can approve additional vehicles
  if (status === "active" && existing.isAdditional && caller.role !== "admin") {
    return res.status(403).json({ error: "Only admins can approve additional vehicle requests" });
  }
  // Approval workflow only applies to additional vehicles
  if (status === "active" && !existing.isAdditional) {
    return res.status(400).json({ error: "Vehicle approval only applies to additional vehicles" });
  }

  // E5: rejection (status → inactive) requires an approver role and a controlled reason
  if (status === "inactive" && existing.isAdditional && existing.status === "pending_approval") {
    if (!APPROVER_ROLES.includes(caller.role)) {
      return res.status(403).json({ error: "Only admins can reject additional vehicle requests" });
    }
    if (!rejectionReason) {
      return res.status(400).json({
        error: "REJECTION_REASON_REQUIRED",
        message: "A rejection reason is required when rejecting a pending additional vehicle request.",
        validReasons: VEHICLE_REJECTION_REASONS_LIST,
      });
    }
    if (!(VEHICLE_REJECTION_REASONS_LIST as readonly string[]).includes(rejectionReason)) {
      return res.status(400).json({
        error: "INVALID_REJECTION_REASON",
        message: `Rejection reason must be one of: ${VEHICLE_REJECTION_REASONS_LIST.join(", ")}`,
        validReasons: VEHICLE_REJECTION_REASONS_LIST,
      });
    }
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set({
      ...(make !== undefined && { make }),
      ...(model !== undefined && { model }),
      ...(year !== undefined && { year }),
      ...(color !== undefined && { color }),
      ...(plateNumber !== undefined && { plateNumber }),
      ...(istimaraNumber !== undefined && { istimaraNumber }),
      ...(status !== undefined && { status }),
      ...(approvalNote !== undefined && { approvalNote }),
      ...(status === "active" && existing.isAdditional && { approvedById: caller.id, reviewedById: caller.id }),
      ...(status === "inactive" && existing.isAdditional && existing.status === "pending_approval" && {
        rejectionReason: rejectionReason ?? null,
        reviewedById: caller.id,
      }),
    })
    .where(eq(vehiclesTable.id, Number(req.params.id)))
    .returning();

  // Row 4 — vehicle_decision (additional vehicle approved or rejected)
  if (vehicle && existing.isAdditional && status !== undefined && existing.userId !== null) {
    const [recipient] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, existing.userId));
    if (status === "active") {
      enqueueBothNotificationChannels({
        eventType: EVT.VEHICLE_DECISION,
        idempotencyKey: vehicleDecisionKey(vehicle.id, "approved"),
        recipientUserId: existing.userId,
        recipientEmail: recipient?.email ?? null,
        payload: {
          title: "✅ Vehicle Approved",
          body: `Your additional vehicle (${existing.plateNumber}) has been approved.`,
          subject: `Vehicle ${existing.plateNumber} approved`,
          html: `<p>Your additional vehicle (<strong>${existing.plateNumber}</strong>) has been approved.</p>`,
          data: { screen: "vehicles", id: vehicle.id },
        },
        preferencePolicy: "decision",
      }).catch(() => {});
    } else if (status === "inactive" && existing.status === "pending_approval") {
      enqueueBothNotificationChannels({
        eventType: EVT.VEHICLE_DECISION,
        idempotencyKey: vehicleDecisionKey(vehicle.id, "rejected"),
        recipientUserId: existing.userId,
        recipientEmail: recipient?.email ?? null,
        payload: {
          title: "❌ Vehicle Request Rejected",
          body: `Your additional vehicle request (${existing.plateNumber}) was rejected. Reason: ${rejectionReason}.`,
          subject: `Vehicle ${existing.plateNumber} rejected`,
          html: `<p>Your additional vehicle request (<strong>${existing.plateNumber}</strong>) was rejected. Reason: ${rejectionReason}.</p>`,
          data: { screen: "vehicles", id: vehicle.id },
        },
        preferencePolicy: "decision",
      }).catch(() => {});
    }
  }

  res.json(vehicle);
});

// ── DELETE /vehicles/:id ──────────────────────────────────────────────────────
router.delete("/vehicles/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (caller.role !== "admin" && existing.userId !== caller.id) return res.status(403).json({ error: "Forbidden" });
  if (caller.role !== "admin" && existing.isAdditional && (existing.status === "active" || existing.status === "pending_approval")) {
    return res.status(403).json({ error: "Additional vehicles (pending or approved) can only be removed by an admin" });
  }
  await db.update(vehiclesTable).set({ status: "inactive" }).where(eq(vehiclesTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
