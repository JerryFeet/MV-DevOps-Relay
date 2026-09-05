import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable, guestsTable, residentsTable,
  guestPassesTable,
} from "@workspace/db";
import { eq, desc, count, and, inArray } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { randomUUID } from "crypto";
import { APPROVER_ROLES } from "../lib/roles";
import { denyGuardModuleAccess } from "../middlewares/denyGuardModuleAccess";
import { sendPushToUsers } from "../lib/pushNotifications";
import { sendAdminAlert } from "../lib/email";
import { canonicalUnitReference, canonicalUnitReferenceMap } from "../lib/unitReference";

const router = Router();
router.use("/guests", requireApiAuth, denyGuardModuleAccess);
const VALID_GENDERS = ["male", "female"] as const;

function isValidGender(value: unknown): value is typeof VALID_GENDERS[number] {
  return typeof value === "string" && (VALID_GENDERS as readonly string[]).includes(value);
}

async function generatePass(guest: typeof guestsTable.$inferSelect, residentId: number) {
  const [existing] = await db
    .select()
    .from(guestPassesTable)
    .where(eq(guestPassesTable.guestId, guest.id));
  if (existing) return existing;

  const [pass] = await db.insert(guestPassesTable).values({
    passUuid: randomUUID(),
    verificationToken: randomUUID(),
    guestId: guest.id,
    residentId,
    guestName: `${guest.firstName} ${guest.lastName}`,
    nationalId: guest.nationalId ?? null,
    visitDate: guest.visitDate,
    vehiclePlate: guest.vehiclePlate ?? null,
    reasonForVisit: guest.visitReason ?? null,
    status: "approved",
    approvedAt: new Date(),
  }).returning();
  return pass;
}

router.get("/guests", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);
  const isStaff = APPROVER_ROLES.includes(caller.role);
  const where = isStaff ? undefined : eq(guestsTable.residentId, caller.id);

  const [{ total }] = await db.select({ total: count() }).from(guestsTable).where(where);
  const guests = await db.select().from(guestsTable)
    .where(where)
    .orderBy(desc(guestsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const guestIds = guests.map(g => g.id);
  const residentIds = [...new Set(guests.map(g => g.residentId))];

  const [passes, users] = guests.length
    ? await Promise.all([
        db.select().from(guestPassesTable).where(inArray(guestPassesTable.guestId, guestIds)),
        db.select().from(usersTable).where(inArray(usersTable.id, residentIds)),
      ])
    : [[], []];
  const passMap = new Map(passes.map(p => [p.guestId, p]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const unitReferences = await canonicalUnitReferenceMap(users.map((user) => user.unitId));
  const data = guests.map(g => {
    const host = userMap.get(g.residentId);
    const rawPass = passMap.get(g.id) ?? null;
    const pass = rawPass
      ? {
          ...rawPass,
          firstName: g.firstName,
          lastName: g.lastName,
        }
      : null;
    return {
      ...g,
      pass,
      residentName: host ? `${host.firstName ?? ""} ${host.lastName ?? ""}`.trim() : null,
      residentMobile: host?.phone ?? null,
      residentUnit: host ? unitReferences.get(host.unitId ?? -1) ?? "—" : null,
    };
  });
  res.json(paginatedResponse(data, Number(total), page, limit));
});

router.post("/guests", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  // H1: ordinary guest registration belongs to verified unit linkage. It is
  // deliberately independent of Waha and has no free-guest quota.
  if (caller.role !== "admin" && !caller.unitId) {
    return res.status(403).json({ error: "UNIT_LINK_REQUIRED" });
  }

  const { firstName, lastName, nationalId, vehiclePlate, visitDate, visitReason, gender } = req.body;
  if (typeof nationalId !== "string" || !nationalId.trim()) {
    return res.status(400).json({ error: "nationalId is required." });
  }
  if (!isValidGender(gender)) {
    return res.status(400).json({ error: "gender is required and must be either male or female" });
  }

  // ── Visit reason validation ────────────────────────────────────────────────
  const VALID_VISIT_REASONS = [
    "family_friend", "delivery", "facility_event",
    "maintenance_work", "household_work", "medical", "other",
  ] as const;
  if (!visitReason || !VALID_VISIT_REASONS.includes(visitReason)) {
    return res.status(400).json({ error: "INVALID_VISIT_REASON", message: "visitReason must be one of the allowed categories." });
  }

  const [guest] = await db.insert(guestsTable).values({
    residentId: caller.id, firstName, lastName, nationalId: nationalId.trim(), vehiclePlate, visitDate, visitReason, gender,
    status: "approved",
  }).returning();

  const pass = await generatePass(guest, caller.id);

  const callerName = `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email;
  const unitReference = await canonicalUnitReference(caller.unitId);
  sendAdminAlert(
    `[FYI] Guest Pre-Registered — ${guest.firstName} ${guest.lastName}`,
    `<h2>New Guest Pre-Registered (Pass Already Issued)</h2>
     <p>A gate pass has been automatically issued. No action is required.</p>
     <p><strong>Host:</strong> ${callerName}</p>
     <p><strong>Unit:</strong> ${unitReference}</p>
     <p><strong>Guest:</strong> ${guest.firstName} ${guest.lastName}</p>
     <p><strong>Visit Date:</strong> ${guest.visitDate ?? "—"}</p>
     <p><strong>Reason:</strong> ${guest.visitReason ?? "—"}</p>`,
  ).catch(() => {});

  res.status(201).json({ ...guest, pass: pass ?? null });
});

router.get("/guests/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, Number(req.params.id)));
  if (!guest) return res.status(404).json({ error: "Not found" });

  const isStaff = APPROVER_ROLES.includes(caller.role);
  if (!isStaff && guest.residentId !== caller.id) return res.status(404).json({ error: "Not found" });

  const [pass] = await db.select().from(guestPassesTable).where(eq(guestPassesTable.guestId, guest.id));
  res.json({ ...guest, pass: pass ?? null });
});

router.patch("/guests/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(guestsTable).where(eq(guestsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isStaff = APPROVER_ROLES.includes(caller.role);
  const isApprover = APPROVER_ROLES.includes(caller.role);
  const isOwner = existing.residentId === caller.id;

  if (!isStaff && !isOwner) return res.status(404).json({ error: "Not found" });

  const { status, vehiclePlate, visitReason, visitDate } = req.body;

  if (status !== undefined && !isApprover) {
    return res.status(403).json({ error: "Only staff may approve or reject guest requests" });
  }

  if (visitDate !== undefined && visitDate !== existing.visitDate) {
    const existingVisitDate = new Date(existing.visitDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (existingVisitDate < today) {
      return res.status(400).json({ error: "Cannot change visit date: the visit date has already passed" });
    }
    const [currentPass] = await db.select().from(guestPassesTable).where(eq(guestPassesTable.guestId, existing.id));
    if (!currentPass || currentPass.status !== "approved") {
      return res.status(400).json({ error: "Visit date can only be changed when the pass is in approved status" });
    }
  }

  const [guest] = await db
    .update(guestsTable)
    .set({
      ...(status !== undefined ? { status } : {}),
      ...(vehiclePlate !== undefined ? { vehiclePlate } : {}),
      ...(visitReason !== undefined ? { visitReason } : {}),
      ...(visitDate !== undefined ? { visitDate } : {}),
    })
    .where(eq(guestsTable.id, Number(req.params.id)))
    .returning();
  if (!guest) return res.status(404).json({ error: "Not found" });

  let pass = null;
  if (status === "approved") {
    pass = await generatePass(guest, existing.residentId);
    sendPushToUsers([existing.residentId], {
      title: "🎟️ Guest Pass Approved",
      body: `A pass for ${guest.firstName} ${guest.lastName} has been approved.`,
      data: { screen: "guests", id: guest.id },
    }, "guestPasses").catch(() => {});
  } else if (status === "denied") {
    // Revoke the gate pass so it is rejected at the gate even if someone still has the QR code
    const [updated] = await db
      .update(guestPassesTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(guestPassesTable.guestId, guest.id))
      .returning();
    pass = updated ?? null;
  } else {
    const [existingPass] = await db.select().from(guestPassesTable).where(eq(guestPassesTable.guestId, guest.id));
    pass = existingPass ?? null;
  }

  if (visitDate !== undefined && visitDate !== existing.visitDate && pass?.status === "approved") {
    const [updatedPass] = await db
      .update(guestPassesTable)
      .set({ visitDate })
      .where(eq(guestPassesTable.guestId, guest.id))
      .returning();
    pass = updatedPass ?? pass;
  }

  res.json({ ...guest, pass });
});

router.delete("/guests/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(guestsTable).where(eq(guestsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isAdmin = caller.role === "admin";
  const isOwner = existing.residentId === caller.id;
  if (!isAdmin && !isOwner) return res.status(404).json({ error: "Not found" });

  // Revoke any live gate pass before deleting so the QR code cannot be
  // scanned at the gate after the guest record is removed.
  await db
    .update(guestPassesTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(guestPassesTable.guestId, Number(req.params.id)));

  await db.delete(guestsTable).where(eq(guestsTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
