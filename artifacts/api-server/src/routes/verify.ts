import { Router } from "express";
import { db } from "@workspace/db";
import {
  guestPassesTable,
  guestPassVerificationLogsTable,
  wahaPassCredentialsTable,
  wahaPassApplicationsTable,
  wahaGuestDayPassesTable,
  usersTable,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { GATE_ROLES } from "../lib/roles";
import {
  gateDatedCredentialStatus,
  isDayPassBarcode,
  normalizeGateCredential,
} from "../lib/gateCredentialScan";
import { canonicalUnitReference } from "../lib/unitReference";

const router = Router();

// ─── In-memory rate limiter for /verify (30 req/min per IP) ──────────────────
const ipRateMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkVerifyRateLimit(ip: string): boolean {
  const now = Date.now();
  // Prune expired windows
  for (const [k, entry] of ipRateMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipRateMap.delete(k);
  }
  const entry = ipRateMap.get(ip);
  if (!entry) {
    ipRateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── GET /verify?token=... — public minimum-information QR verdict ───────────
// This endpoint is intentionally public for QR scanners. It must never disclose
// host details, internal IDs, credentials, National IDs, or photographs.
router.get("/verify", async (req, res) => {
  // Rate-limit: 30 requests per minute per IP
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!checkVerifyRateLimit(ip)) {
    return res.status(429).json({
      error: "too_many_requests",
      message: "Too many verification attempts. Please wait before trying again.",
    });
  }

  const { token } = req.query as { token?: string };

  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  const [pass] = await db
    .select()
    .from(guestPassesTable)
    .where(eq(guestPassesTable.verificationToken, token));

  if (!pass) {
    const [dayPass] = await db
      .select()
      .from(wahaGuestDayPassesTable)
      .where(eq(wahaGuestDayPassesTable.verificationToken, token));

    if (!dayPass) {
      return res.json({
        valid: false,
        status: "NOT_FOUND",
        message: "No pass found with this token.",
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const dayBefore = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const dayAfter = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
    const withinDateWindow = dayPass.date >= dayBefore && dayPass.date <= dayAfter;
    const isRevoked = Boolean(dayPass.revokedAt);
    const isExpired = dayPass.date < today;
    const status = isRevoked
      ? "REVOKED"
      : dayPass.paymentStatus !== "paid"
        ? "PAYMENT_PENDING"
        : isExpired || !withinDateWindow
          ? "PASS_EXPIRED"
          : "APPROVED";

    if (!withinDateWindow) {
      return res.status(403).json({
        error: "pass_expired",
        status: "PASS_EXPIRED",
        visitDate: dayPass.date,
        message: "This Guest Day Pass is only valid on its scheduled visit date.",
      });
    }

    return res.json({
      valid: status === "APPROVED",
      status,
      visitDate: dayPass.date,
      message: status === "APPROVED"
        ? "Access approved — Guest Day Pass is valid."
        : status === "REVOKED"
          ? "This Guest Day Pass has been revoked."
          : status === "PAYMENT_PENDING"
            ? "This Guest Day Pass payment is not complete."
            : "This Guest Day Pass has expired.",
    });
  }

  // ── Date-window guard ────────────────────────────────────────────────────────
  // Only return visitor PII when the current date is within ±1 day of visitDate.
  // This prevents a shared QR code from leaking guest details days/weeks later.
  const today    = new Date().toISOString().split("T")[0];
  const dayBefore = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  const dayAfter  = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
  const withinDateWindow = pass.visitDate >= dayBefore && pass.visitDate <= dayAfter;

  if (!withinDateWindow) {
    // Only auto-expire passes whose visit date is actually in the past.
    // Future-dated passes (visitDate > dayAfter) must NOT be mutated — the
    // resident may have a legitimate upcoming visit.
    const isPastDate = pass.visitDate < dayBefore;
    if (isPastDate && pass.status === "approved") {
      await db
        .update(guestPassesTable)
        .set({ status: "expired" })
        .where(eq(guestPassesTable.id, pass.id));
    }
    // Log the out-of-window attempt (no PII in notes)
    await db.insert(guestPassVerificationLogsTable).values({
      passId: pass.id,
      result: "PASS_EXPIRED",
      notes: `QR scan rejected — visitDate ${pass.visitDate} is outside today ±1-day window (${today})`,
    });
    return res.status(403).json({
      error: "pass_expired",
      status: "PASS_EXPIRED",
      visitDate: pass.visitDate,
      message: "This guest pass is only valid on its scheduled visit date.",
    });
  }

  // ── Within the valid date window — evaluate pass status ───────────────────
  const isExpired = pass.visitDate < today;
  let effectiveStatus: string = pass.status.toUpperCase();
  if (pass.status === "approved" && isExpired) {
    effectiveStatus = "EXPIRED";
    await db
      .update(guestPassesTable)
      .set({ status: "expired" })
      .where(eq(guestPassesTable.id, pass.id));
  }

  const valid = effectiveStatus === "APPROVED";

  // Log the verification attempt
  await db.insert(guestPassVerificationLogsTable).values({
    passId: pass.id,
    result: effectiveStatus,
    notes: `QR scan via /verify endpoint`,
  });

  // Public callers receive only the verdict, reason, and scheduled date.
  res.json({
    valid,
    status: effectiveStatus,
    visitDate: pass.visitDate,
    message: valid
      ? "Access approved — guest may enter."
      : effectiveStatus === "EXPIRED"
        ? "This pass has expired."
        : effectiveStatus === "REVOKED"
          ? "This pass has been revoked."
          : "Access denied.",
  });
});

// ─── GET /security/gate/day-pass — authenticated count-based guest pass lookup
// The guard receives validity, date, count, and the optional vehicle plate.
// It never receives resident identity, guest identity, payment details, or the
// verification token. Day Passes do not create individual movement log rows.
router.get("/security/gate/day-pass", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).json({ error: "token is required" });

  const [dayPass] = await db
    .select()
    .from(wahaGuestDayPassesTable)
    .where(eq(wahaGuestDayPassesTable.verificationToken, token));

  if (!dayPass) {
    return res.json({
      valid: false,
      status: "NOT_FOUND",
      message: "No Guest Day Pass found.",
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const dayBefore = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  const dayAfter = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
  const withinDateWindow = dayPass.date >= dayBefore && dayPass.date <= dayAfter;
  const status = dayPass.revokedAt
    ? "REVOKED"
    : dayPass.paymentStatus !== "paid"
      ? "PAYMENT_PENDING"
      : dayPass.date < today || !withinDateWindow
        ? "PASS_EXPIRED"
        : "APPROVED";

  return res.json({
    passType: "daypass",
    valid: status === "APPROVED",
    status,
    visitDate: dayPass.date,
    guestCount: dayPass.guestCount ?? dayPass.extraGuestCount,
    vehiclePlate: dayPass.vehiclePlate ?? null,
    message: status === "APPROVED"
      ? "Access approved — Guest Day Pass is valid."
      : status === "REVOKED"
        ? "This Guest Day Pass has been revoked."
        : status === "PAYMENT_PENDING"
          ? "This Guest Day Pass payment is not complete."
          : "This Guest Day Pass has expired.",
  });
});

// ─── GET /verify/waha — gate Waha Pass lookup (by token or passNumber) ────────
// Requires an authenticated guard/supervisor/admin session (GATE_ROLES).
router.get("/verify/waha", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { token, passNumber } = req.query as { token?: string; passNumber?: string };

  if (!token && !passNumber) {
    return res.status(400).json({ error: "token or passNumber is required" });
  }

  const [cred] = await db
    .select()
    .from(wahaPassCredentialsTable)
    .where(
      token
        ? eq(wahaPassCredentialsTable.verificationToken, token)
        : eq(wahaPassCredentialsTable.passNumber, passNumber!),
    );

  if (!cred) {
    return res.json({ valid: false, status: "NOT_FOUND", message: "No Waha Pass found." });
  }

  const [application] = await db
    .select()
    .from(wahaPassApplicationsTable)
    .where(eq(wahaPassApplicationsTable.id, cred.applicationId));

  const unitReference = await canonicalUnitReference(application?.unitId);

  const isActive = cred.status === "active" && application?.status === "active";
  const valid = isActive;

  const statusLabel = !isActive
    ? cred.status === "revoked" ? "REVOKED"
    : cred.status === "lost"   ? "REPORTED_LOST"
    : cred.status === "stolen" ? "REPORTED_STOLEN"
    : cred.status === "damaged" ? "REPORTED_DAMAGED"
    : application?.status === "revoked" ? "APPLICATION_REVOKED"
    : "INACTIVE"
    : "ACTIVE";

  res.json({
    valid,
    status: statusLabel,
    passNumber: cred.passNumber,
    credentialIndex: cred.credentialIndex,
    holderName: cred.holderName,
    occupancyTrack: application?.occupancyTrack ?? null,
    unitNumber: unitReference,
    unitReference,
    revocationReason: cred.revocationReason ?? null,
    message: valid
      ? "Access approved — Waha Pass holder may enter."
      : `Access denied — pass status: ${statusLabel}.`,
  });
});

// ─── GET /security/gate/scan?code= — unified authenticated gate scanner ───────
// Classifies the credential server-side. The result deliberately excludes raw
// credentials, IDs, National ID/Iqama, payment attempts, and photographs.
router.get("/security/gate/scan", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select({ role: usersTable.role }).from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const credential = normalizeGateCredential(req.query.code);
  if (!credential) {
    return res.status(400).json({ error: "code is required" });
  }

  const [guestPass] = await db.select().from(guestPassesTable).where(or(
    eq(guestPassesTable.verificationToken, credential),
    eq(guestPassesTable.passUuid, credential),
  ));
  if (guestPass) {
    const [host] = await db.select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      unitId: usersTable.unitId,
    }).from(usersTable).where(eq(usersTable.id, guestPass.residentId));
    const status = gateDatedCredentialStatus(guestPass.visitDate, guestPass.status);
    const unitReference = host ? await canonicalUnitReference(host.unitId) : null;
    return res.json({
      credentialType: "guest",
      valid: status === "APPROVED",
      status,
      guestName: guestPass.guestName,
      hostName: host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || null : null,
      unitNumber: unitReference,
      unitReference,
      visitDate: guestPass.visitDate,
      vehiclePlate: guestPass.vehiclePlate ?? null,
    });
  }

  const [wahaCredential] = await db.select().from(wahaPassCredentialsTable).where(or(
    eq(wahaPassCredentialsTable.verificationToken, credential),
    eq(wahaPassCredentialsTable.passNumber, credential),
  ));
  if (wahaCredential) {
    const [application] = await db.select().from(wahaPassApplicationsTable)
      .where(eq(wahaPassApplicationsTable.id, wahaCredential.applicationId));
    const unitReference = await canonicalUnitReference(application?.unitId);
    const active = wahaCredential.status === "active" && application?.status === "active";
    const status = active
      ? "ACTIVE"
      : wahaCredential.status === "revoked" ? "REVOKED"
      : wahaCredential.status === "lost" ? "REPORTED_LOST"
      : wahaCredential.status === "stolen" ? "REPORTED_STOLEN"
      : wahaCredential.status === "damaged" ? "REPORTED_DAMAGED"
      : application?.status === "revoked" ? "APPLICATION_REVOKED"
      : "INACTIVE";
    return res.json({
      credentialType: "waha",
      valid: active,
      status,
      holderName: wahaCredential.holderName,
      unitNumber: unitReference,
      unitReference,
    });
  }

  const [dayPass] = isDayPassBarcode(credential)
    ? await db.select().from(wahaGuestDayPassesTable)
      .where(eq(wahaGuestDayPassesTable.id, Number(credential)))
    : await db.select().from(wahaGuestDayPassesTable)
      .where(eq(wahaGuestDayPassesTable.verificationToken, credential));
  if (dayPass) {
    const [host] = dayPass.purchasedByUserId
      ? await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable).where(eq(usersTable.id, dayPass.purchasedByUserId))
      : [null];
    const status = gateDatedCredentialStatus(dayPass.date, "paid", {
      revoked: Boolean(dayPass.revokedAt),
      paid: dayPass.paymentStatus === "paid",
    });
    const unitReference = await canonicalUnitReference(dayPass.unitId);
    return res.json({
      credentialType: "daypass",
      valid: status === "APPROVED",
      status,
      hostName: host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || null : null,
      unitNumber: unitReference,
      unitReference,
      visitDate: dayPass.date,
      guestCount: dayPass.guestCount ?? dayPass.extraGuestCount,
      vehiclePlate: dayPass.vehiclePlate ?? null,
      paid: dayPass.paymentStatus === "paid",
    });
  }

  return res.json({
    credentialType: "unknown",
    valid: false,
    status: "NOT_VALID_MADAIN_VILLAGE_CREDENTIAL",
  });
});

export default router;
