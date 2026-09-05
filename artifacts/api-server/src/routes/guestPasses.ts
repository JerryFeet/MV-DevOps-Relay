import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable, guestsTable, residentsTable,
  guestPassesTable, guestPassVerificationLogsTable, guestEntryExitLogsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { GATE_ROLES } from "../lib/roles";
import { canonicalUnitReferenceMap } from "../lib/unitReference";

const router = Router();

// ─── GET /guest-passes — list passes for the current user's guests ────────────
router.get("/guest-passes", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const isStaff = GATE_ROLES.includes(caller.role);
  const allPasses = await db.select().from(guestPassesTable).orderBy(desc(guestPassesTable.createdAt));
  const passes = isStaff ? allPasses : allPasses.filter(p => p.residentId === caller.id);
  res.json(passes);
});

// ─── GET /guest-passes/:id — single pass ─────────────────────────────────────
router.get("/guest-passes/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [pass] = await db.select().from(guestPassesTable).where(eq(guestPassesTable.id, Number(req.params.id)));
  if (!pass) return res.status(404).json({ error: "Not found" });

  const isStaff = GATE_ROLES.includes(caller.role);
  if (!isStaff && pass.residentId !== caller.id) return res.status(404).json({ error: "Not found" });

  res.json(pass);
});

// ─── GET /guests/:guestId/pass — get pass for a specific guest ───────────────
router.get("/guests/:guestId/pass", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, Number(req.params.guestId)));
  if (!guest) return res.status(404).json({ error: "Not found" });

  const isStaff = GATE_ROLES.includes(caller.role);
  if (!isStaff && guest.residentId !== caller.id) return res.status(404).json({ error: "Not found" });

  const [pass] = await db
    .select()
    .from(guestPassesTable)
    .where(eq(guestPassesTable.guestId, Number(req.params.guestId)))
    .orderBy(desc(guestPassesTable.createdAt))
    .limit(1);
  res.json(pass ?? null);
});

// ─── POST /guest-passes/:id/revoke — revoke a pass ───────────────────────────
router.post("/guest-passes/:id/revoke", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(guestPassesTable).where(eq(guestPassesTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.status === "revoked") {
    return res.status(409).json({ error: "Pass has already been revoked" });
  }

  const [pass] = await db
    .update(guestPassesTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(guestPassesTable.id, Number(req.params.id)))
    .returning();
  if (!pass) return res.status(404).json({ error: "Not found" });
  res.json(pass);
});

// ─── GET /security/gate/passes — staff: all passes for today ─────────────────
router.get("/security/gate/passes", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role)) return res.status(403).json({ error: "Forbidden" });

  const [passes, hosts] = await Promise.all([
    db.select().from(guestPassesTable).orderBy(desc(guestPassesTable.visitDate)),
    db.select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      unitId: usersTable.unitId,
    }).from(usersTable),
  ]);
  const hostById = new Map(hosts.map((host) => [host.id, host]));
  const unitReferences = await canonicalUnitReferenceMap(hosts.map((host) => host.unitId));

  // This is deliberately a gate-decision projection. Never serialize the raw
  // pass row here: verificationToken, nationalId, and internal IDs are secrets
  // even when the caller is using a shared gatehouse account.
  res.json(passes.map((pass) => {
    const host = hostById.get(pass.residentId);
    return {
      guestName: pass.guestName,
      hostName: host
        ? [host.firstName, host.lastName].filter(Boolean).join(" ") || null
        : null,
      unitNumber: host ? unitReferences.get(host.unitId ?? -1) ?? "—" : null,
      unitReference: host ? unitReferences.get(host.unitId ?? -1) ?? "—" : null,
      visitDate: pass.visitDate,
      vehiclePlate: pass.vehiclePlate,
      valid: pass.status === "approved",
      status: pass.status.toUpperCase(),
      message: pass.status === "approved"
        ? "Access approved — guest may enter."
        : pass.status === "expired"
          ? "This pass has expired."
          : "This pass has been revoked.",
    };
  }));
});

// ─── POST /security/gate/entry-exit — log entry or exit ──────────────────────
router.post("/security/gate/entry-exit", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role)) return res.status(403).json({ error: "Forbidden" });

  const { passId, verificationToken, eventType, notes } = req.body;
  if ((!passId && !verificationToken) || !["ENTRY", "EXIT"].includes(eventType)) {
    return res.status(400).json({
      error: "passId or verificationToken and eventType (ENTRY|EXIT) are required",
    });
  }

  const [pass] = await db
    .select()
    .from(guestPassesTable)
    .where(
      verificationToken
        ? eq(guestPassesTable.verificationToken, String(verificationToken))
        : eq(guestPassesTable.id, Number(passId)),
    );
  if (!pass) return res.status(404).json({ error: "Not found" });
  if (pass.status === "revoked") {
    return res.status(409).json({ error: "Cannot log entry/exit for a revoked pass" });
  }
  if (pass.status === "expired") {
    return res.status(409).json({ error: "Cannot log entry/exit for an expired pass" });
  }
  if (pass.status !== "approved") {
    return res.status(422).json({ error: "Cannot log entry/exit: pass is not approved" });
  }

  // Auto-expiry guard: passes whose visit date has passed may no longer be used.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  if (pass.visitDate < today) {
    return res.status(409).json({ error: "Cannot log entry/exit: the visit date has passed" });
  }

  const [log] = await db.insert(guestEntryExitLogsTable).values({
    // The scanner sends a verification token, but it is deliberately never
    // exposed back to the browser. Persist the ID resolved server-side.
    passId: pass.id,
    eventType,
    securityGuardId: clerkId,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(log);
});

// ─── GET /security/gate/entry-exit/:passId — entry/exit history for a pass ───
router.get("/security/gate/entry-exit/:passId", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role)) return res.status(403).json({ error: "Forbidden" });

  const logs = await db
    .select()
    .from(guestEntryExitLogsTable)
    .where(eq(guestEntryExitLogsTable.passId, Number(req.params.passId)))
    .orderBy(desc(guestEntryExitLogsTable.eventTime));
  res.json(logs.map((log) => ({
    eventType: log.eventType,
    eventTime: log.eventTime,
  })));
});

export { randomUUID };
export default router;
