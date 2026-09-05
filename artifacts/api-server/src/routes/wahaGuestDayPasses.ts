import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  residentsTable,
  wahaGuestDayPassesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { unitHasActiveWahaPass } from "../lib/wahaPassCheck";
import { getPaymentPurposeAmount, PaymentPricingError } from "../payments/PurposeRegistry";
import { initiatePayment } from "../payments/PaymentCore";
import { enforceDurableRateLimit, rateLimitUserSubject } from "../lib/durableRateLimit";
import { canonicalUnitReference } from "../lib/unitReference";

const router = Router();

function baseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:80";
}

/**
 * H2 decision (b): any portal resident with a completed resident record for a
 * unit may purchase a Guest Day Pass when that unit holds an active credential.
 * The caller never needs to be one of the two credential holders.
 */
function isVerifiedResident(user: typeof usersTable.$inferSelect): boolean {
  return (
    user.verificationStatus === "verified_owner" ||
    user.verificationStatus === "verified_tenant" ||
    user.verificationStatus === "verified_household_member"
  );
}

async function hasCompletedResidentRecord(userId: number, unitId: number): Promise<boolean> {
  const [resident] = await db
    .select({ id: residentsTable.id })
    .from(residentsTable)
    .where(
      and(
        eq(residentsTable.linkedUserId, userId),
        eq(residentsTable.unitId, unitId),
        eq(residentsTable.status, "active"),
      ),
    );
  return Boolean(resident);
}

// ── GET /waha-guest-day-passes/mine — list day passes purchased for caller's unit ──
router.get("/waha-guest-day-passes/mine", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  // I4: Only verified residents may list day passes for their unit
  if (!isVerifiedResident(caller)) {
    return res.status(403).json({ error: "Unit verification required to view Guest Day Passes." });
  }

  if (!caller.unitId) return res.json([]);

  const passes = await db
    .select()
    .from(wahaGuestDayPassesTable)
    .where(eq(wahaGuestDayPassesTable.unitId, caller.unitId))
    .orderBy(desc(wahaGuestDayPassesTable.date));

  res.json(passes);
});

// ── POST /waha-guest-day-passes — initiate day-pass purchase ─────────────────
// I4: Any verified resident (owner or tenant) on a unit with an active Waha Pass
// may purchase a Guest Day Pass. Previously restricted to the pass applicant only.
router.post("/waha-guest-day-passes", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_create", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  )) return;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  if (!caller.unitId) {
    return res.status(403).json({ error: "No unit linked to your account" });
  }

  // H2(b): verified linkage plus a completed active resident record is required.
  if (!isVerifiedResident(caller)) {
    return res.status(403).json({
      error: "COMPLETED_RESIDENT_RECORD_REQUIRED",
      message: "Unit verification is required to purchase a Guest Day Pass",
    });
  }

  if (!await hasCompletedResidentRecord(caller.id, caller.unitId)) {
    return res.status(403).json({
      error: "COMPLETED_RESIDENT_RECORD_REQUIRED",
      message: "An active portal resident record is required to purchase a Guest Day Pass.",
    });
  }

  if (!await unitHasActiveWahaPass(caller.unitId)) {
    return res.status(403).json({
      error: "ACTIVE_UNIT_WAHA_PASS_REQUIRED",
      message: "This unit must hold an active Waha Pass credential to purchase a Guest Day Pass.",
    });
  }

  const { guestCount, visitDate, vehiclePlate } = req.body;
  if (
    !guestCount ||
    typeof guestCount !== "number" ||
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10
  ) {
    return res.status(400).json({ error: "guestCount must be an integer between 1 and 10" });
  }
  if (!visitDate || typeof visitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return res.status(400).json({ error: "visitDate must be a YYYY-MM-DD string" });
  }
  if (vehiclePlate !== undefined && vehiclePlate !== null && (
    typeof vehiclePlate !== "string" || vehiclePlate.trim().length > 32
  )) {
    return res.status(400).json({ error: "vehiclePlate must be an optional string of 32 characters or fewer" });
  }
  const parsedVisitDate = new Date(`${visitDate}T00:00:00.000Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (
    Number.isNaN(parsedVisitDate.getTime()) ||
    parsedVisitDate.toISOString().slice(0, 10) !== visitDate ||
    parsedVisitDate < today
  ) {
    return res.status(400).json({ error: "visitDate must be today or a future calendar date" });
  }

  let amountSar: number;
  try {
    amountSar = await getPaymentPurposeAmount("guest_day_pass", { guestCount });
  } catch (error) {
    if (error instanceof PaymentPricingError) {
      return res.status(503).json({ error: "Guest Day Pass pricing is not configured." });
    }
    throw error;
  }

  // Create the pending record first so we can include day_pass_id in callbackUrl
  const unitReference = await canonicalUnitReference(caller.unitId);
  const [pending] = await db
    .insert(wahaGuestDayPassesTable)
    .values({
      unitId: caller.unitId,
      unitNumber: unitReference,
      date: visitDate,
      extraGuestCount: guestCount,
      vehiclePlate: typeof vehiclePlate === "string" && vehiclePlate.trim()
        ? vehiclePlate.trim()
        : null,
      amountSar: amountSar.toFixed(2),
      chargeId: null,
      paymentUrl: null,
      paymentProvider: null,
      paymentStatus: "pending",
      purchasedByUserId: caller.id,
    })
    .returning();

  try {
    const result = await initiatePayment({
      purpose: "guest_day_pass",
      subjectType: "guest_day_pass",
      subjectId: pending.id,
      userId: caller.id,
      unitId: caller.unitId,
      amount: amountSar,
      description: `Waha Guest Day Pass — ${guestCount} guest${guestCount > 1 ? "s" : ""} on ${visitDate}`,
      customer: {
        firstName: caller.firstName ?? "Resident",
        lastName: caller.lastName ?? "",
        email: caller.email ?? "",
      },
    });

    const [updated] = await db
      .update(wahaGuestDayPassesTable)
      .set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
        paymentAttemptId: result.attempt.id,
        guestCount,
      })
      .where(eq(wahaGuestDayPassesTable.id, pending.id))
      .returning();

    return res.json({
      dayPassId: updated.id,
      paymentUrl: result.paymentUrl,
      chargeId: result.attempt.providerChargeId,
      attemptId: result.attempt.id,
    });
  } catch (err: any) {
    // Clean up the pending record if payment initiation fails
    await db.delete(wahaGuestDayPassesTable).where(eq(wahaGuestDayPassesTable.id, pending.id));
    const msg: string = err?.message ?? "Payment gateway error";
    if (msg.includes("not configured")) return res.status(503).json({ error: msg });
    req.log.error({ err }, "Waha Guest Day Pass payment initiation failed");
    return res.status(502).json({ error: "Payment gateway error. Please try again." });
  }
});

// Browser redirects cannot activate a Day Pass. The signed payment webhook owns
// the confirmed-payment transition and issuance token.
router.post("/waha-guest-day-passes/verify", requireApiAuth, async (req, res) => {
  return res.status(410).json({ error: "Browser payment verification is no longer supported. Await the verified provider callback." });
});

export default router;
