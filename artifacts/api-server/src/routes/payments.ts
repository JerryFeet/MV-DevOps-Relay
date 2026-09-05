import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  facilitiesTable,
  permitsTable,
  paymentAttemptsTable,
  wahaGuestDayPassesTable,
  wahaPassCredentialsTable,
} from "@workspace/db";
import { eq, and, or, ne, isNotNull, desc, gte, lt, inArray, sql } from "drizzle-orm";
import { PaymentService, activeProvider, getProviderByName } from "../payments/PaymentService";
import {
  cancelPaymentFromVerifiedProvider,
  confirmPaymentFromVerifiedCallback,
  createPendingPaymentAttempt,
  createProviderChargeForAttempt,
  initiatePayment,
  PaymentCallbackError,
  reconcilePaymentByProviderChargeId,
} from "../payments/PaymentCore";
import { ReconcileMoyasarPaymentBody, ReconcileMoyasarPaymentResponse } from "@workspace/api-zod";
import {
  cancelDeterministicCharge,
  getDeterministicCheckout,
} from "../payments/providers/deterministic";
import { paymentWebhookRouter } from "./paymentWebhook";
import {
  enforceDurableRateLimit,
  rateLimitIpSubject,
  rateLimitUserSubject,
} from "../lib/durableRateLimit";
import { canonicalUnitReferenceMap } from "../lib/unitReference";

const router = Router();
const RETRY_LOCK_NAMESPACE_BY_SUBJECT: Record<string, number> = {
  booking: 82101,
  guest_day_pass: 82102,
  waha_replacement: 82103,
};

async function assertRetrySubjectIsPayable(tx: any, attempt: typeof paymentAttemptsTable.$inferSelect) {
  if (attempt.subjectType === "booking") {
    const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, attempt.subjectId));
    if (!booking || booking.status !== "pending_payment" || (booking.paymentHoldExpiresAt && booking.paymentHoldExpiresAt <= new Date())) {
      throw new PaymentCallbackError("This booking is no longer awaiting payment.");
    }
    return;
  }
  if (attempt.subjectType === "guest_day_pass") {
    const [dayPass] = await tx.select().from(wahaGuestDayPassesTable).where(eq(wahaGuestDayPassesTable.id, attempt.subjectId));
    const visitDate = dayPass?.date ? new Date(`${dayPass.date}T00:00:00.000Z`) : null;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!dayPass || dayPass.paymentStatus !== "pending" || !visitDate || visitDate < today) {
      throw new PaymentCallbackError("This Guest Day Pass is no longer payable.");
    }
    return;
  }
  if (attempt.subjectType === "waha_replacement") {
    const [credential] = await tx.select().from(wahaPassCredentialsTable).where(eq(wahaPassCredentialsTable.id, attempt.subjectId));
    if (
      !credential ||
      credential.replacedByCredentialId ||
      !["lost", "stolen", "damaged"].includes(credential.status)
    ) {
      throw new PaymentCallbackError("This Waha replacement is no longer payable.");
    }
    return;
  }
  throw new PaymentCallbackError("Unsupported payment subject.");
}

function baseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:80";
}

function deterministicCheckoutEnabled(): boolean {
  return (
    process.env["PAYMENT_PROVIDER"] === "moyasar" &&
    process.env["PAYMENT_TEST_PROVIDER"] === "deterministic" &&
    process.env["NODE_ENV"] !== "production"
  );
}

function checkoutHtml(chargeId: string, amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deterministic Test Checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:2rem}.card{max-width:28rem;margin:8vh auto;background:white;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;box-shadow:0 10px 25px #0f172a12}button{width:100%;border:0;border-radius:.6rem;padding:.8rem;font-weight:700;cursor:pointer;margin-top:.75rem}.pay{background:#0f766e;color:#fff}.cancel{background:#fff;color:#b91c1c;border:1px solid #fecaca}</style>
</head><body><main class="card"><p style="color:#0f766e;font-weight:700;margin-top:0">NON-PRODUCTION TEST CHECKOUT</p><h1>Confirm test payment</h1><p>This screen simulates a provider-hosted checkout. Payment confirmation is recorded on the server before returning to the portal.</p><p><strong>${formatted}</strong></p>
<form method="post" action="/api/payments/deterministic/checkout/${encodeURIComponent(chargeId)}"><button class="pay" name="action" value="pay" type="submit">Complete test payment</button><button class="cancel" name="action" value="cancel" type="submit">Cancel payment</button></form></main></body></html>`;
}

// ─── Deterministic provider browser UAT checkout (non-production only) ───────
router.get("/payments/deterministic/checkout/:chargeId", async (req, res) => {
  if (!deterministicCheckoutEnabled()) return res.status(404).end();
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "deterministic_checkout", minuteLimit: 30, dayLimit: 300 },
    rateLimitIpSubject(req),
  )) return;
  const checkout = getDeterministicCheckout(req.params.chargeId);
  if (!checkout) return res.status(404).send("Test charge not found");
  res.type("html").send(checkoutHtml(checkout.chargeId, checkout.amount, checkout.currency));
});

router.post("/payments/deterministic/checkout/:chargeId", async (req, res) => {
  if (!deterministicCheckoutEnabled()) return res.status(404).end();
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "deterministic_checkout", minuteLimit: 30, dayLimit: 300 },
    rateLimitIpSubject(req),
  )) return;
  const checkout = getDeterministicCheckout(req.params.chargeId);
  if (!checkout) return res.status(404).send("Test charge not found");

  const callbackId = `deterministic-browser-${req.params.chargeId}`;
  try {
    if (req.body?.action === "cancel") {
      cancelDeterministicCharge(req.params.chargeId);
      await cancelPaymentFromVerifiedProvider({ chargeId: req.params.chargeId, callbackId });
    } else {
      // This emulates a provider callback. It verifies the provider's recorded
      // amount, currency and metadata before purpose handlers may issue access.
      await confirmPaymentFromVerifiedCallback({ chargeId: req.params.chargeId, callbackId });
    }
    return res.redirect(303, checkout.callbackUrl);
  } catch (error) {
    req.log.error({ error }, "Deterministic checkout settlement failed");
    return res.status(502).send("Test payment could not be recorded");
  }
});

router.use(paymentWebhookRouter);

// ─── POST /payments/create — initiate a charge via the active provider ────────
// NOTE: Permit payments have been removed. This endpoint only handles bookings.
router.post("/payments/create", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_create", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  )) return;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { bookingId, permitId } = req.body;

  // Permit payments are no longer supported. Return 410 Gone.
  if (permitId) {
    return res.status(410).json({
      error: "Permit payments are no longer required. Permits do not carry fees.",
    });
  }

  // ── Booking payment branch ────────────────────────────────────────────────
  if (!bookingId) return res.status(400).json({ error: "bookingId is required" });

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, Number(bookingId)));

  if (!booking) return res.status(404).json({ error: "Booking not found" });
  // A booking whose resident account has been deleted is staff-only history.
  if (booking.userId !== caller.id) return res.status(403).json({ error: "Not your booking" });
  if (booking.paymentStatus === "paid") return res.status(400).json({ error: "Already paid" });

  const amount = Number(booking.totalAmount);
  if (amount <= 0) {
    return res.status(400).json({ error: "No payment required for this booking" });
  }

  const [facility] = await db
    .select({ name: facilitiesTable.name })
    .from(facilitiesTable)
    .where(eq(facilitiesTable.id, booking.facilityId));

  try {
    const result = await initiatePayment({
      purpose: "facility_booking",
      subjectType: "booking",
      subjectId: booking.id,
      userId: caller.id,
      unitId: caller.unitId,
      amount,
      description: `Facility booking: ${facility?.name ?? "HOA Facility"}`,
      customer: {
        firstName: caller.firstName ?? "Resident",
        lastName: caller.lastName ?? "",
        email: caller.email ?? "",
      },
    });

    await db
      .update(bookingsTable)
      .set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
      })
      .where(eq(bookingsTable.id, booking.id));

    res.json({ paymentUrl: result.paymentUrl, chargeId: result.attempt.providerChargeId, attemptId: result.attempt.id });
  } catch (err: any) {
    const msg: string = err?.message ?? "Payment gateway error";
    if (msg.includes("not configured")) return res.status(503).json({ error: msg });
    req.log.error({ err }, "Payment createCharge failed");
    return res.status(502).json({ error: "Payment gateway error. Please try again." });
  }
});

router.get("/payments/attempts/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [attempt] = await db
    .select()
    .from(paymentAttemptsTable)
    .where(eq(paymentAttemptsTable.id, Number(req.params.id)));
  if (!attempt) return res.status(404).json({ error: "Payment attempt not found" });
  if (attempt.userId !== caller.id && caller.role !== "admin") return res.status(404).json({ error: "Payment attempt not found" });
  return res.json({ id: attempt.id, status: attempt.status, purpose: attempt.purpose, confirmedAt: attempt.confirmedAt });
});

// Legacy browser verification is deliberately terminal: only the signed
// provider webhook may settle a payment. Keep the route rate-limited so stale
// clients cannot use it as an unbounded authenticated probe.
router.post("/payments/verify", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_verify", minuteLimit: 20, dayLimit: 200 },
    rateLimitUserSubject(clerkId),
  )) return;
  return res.status(410).json({
    error: "Browser payment verification is no longer supported. Await the verified provider callback.",
  });
});

// ─── POST /payments/reconcile — admin recovery for an exhausted provider retry ─
router.post("/payments/reconcile", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_reconcile", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  )) return;

  const body = ReconcileMoyasarPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "A valid Moyasar charge ID is required." });
    return;
  }

  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  try {
    const result = await reconcilePaymentByProviderChargeId(body.data.chargeId);
    const response = ReconcileMoyasarPaymentResponse.parse({
      status: result.status,
      attemptId: result.attempt.id,
      purpose: result.attempt.purpose,
      confirmedAt: result.attempt.confirmedAt?.toISOString() ?? null,
    });
    req.log.info(
      { event: "payment_reconciliation_completed", attemptId: response.attemptId, status: response.status },
      "Payment reconciliation completed after direct provider verification",
    );
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment reconciliation failed.";
    if (message === "Payment attempt was not found.") {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes("not configured")) {
      res.status(503).json({ error: message });
      return;
    }
    if (error instanceof PaymentCallbackError) {
      res.status(409).json({ error: message });
      return;
    }
    req.log.error({ error }, "Payment reconciliation failed");
    res.status(502).json({ error: "Payment reconciliation could not be verified." });
  }
});

// ─── POST /payments/attempts/:id/retry — new charge after a terminal outcome ─
router.post("/payments/attempts/:id/retry", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "payment_create", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  )) return;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [attempt] = await db
    .select()
    .from(paymentAttemptsTable)
    .where(eq(paymentAttemptsTable.id, Number(req.params.id)));
  if (!attempt || attempt.userId !== caller.id) return res.status(404).json({ error: "Payment attempt not found" });
  if (!["failed", "cancelled", "rejected", "expired"].includes(attempt.status)) {
    return res.status(409).json({ error: "Only a terminal payment attempt can be retried." });
  }

  try {
    const retryAttempt = await db.transaction(async (tx) => {
      const namespace = RETRY_LOCK_NAMESPACE_BY_SUBJECT[attempt.subjectType];
      if (!namespace) throw new PaymentCallbackError("Unsupported payment subject.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${namespace}, ${attempt.subjectId})`);

      const [current] = await tx
        .select()
        .from(paymentAttemptsTable)
        .where(eq(paymentAttemptsTable.id, attempt.id));
      if (!current || current.userId !== caller.id || !["failed", "cancelled", "rejected", "expired"].includes(current.status)) {
        throw new PaymentCallbackError("This payment attempt is no longer retryable.");
      }
      await assertRetrySubjectIsPayable(tx, current);
      const [existingActive] = await tx
        .select({ id: paymentAttemptsTable.id })
        .from(paymentAttemptsTable)
        .where(and(
          eq(paymentAttemptsTable.purpose, current.purpose),
          eq(paymentAttemptsTable.subjectType, current.subjectType),
          eq(paymentAttemptsTable.subjectId, current.subjectId),
          eq(paymentAttemptsTable.status, "pending"),
        ));
      if (existingActive) throw new PaymentCallbackError("A payment attempt is already active for this item.");

      return createPendingPaymentAttempt({
        purpose: current.purpose,
        subjectType: current.subjectType as "booking" | "guest_day_pass" | "waha_replacement",
        subjectId: current.subjectId,
        userId: caller.id,
        unitId: current.unitId,
        amount: Number(current.amount),
        description: `Retry payment for ${current.purpose.replace(/_/g, " ")}`,
        customer: {
          firstName: caller.firstName ?? "Resident",
          lastName: caller.lastName ?? "",
          email: caller.email ?? "",
        },
      }, tx);
    });
    const result = await createProviderChargeForAttempt(retryAttempt, {
      purpose: attempt.purpose as "facility_booking" | "guest_day_pass" | "waha_replacement",
      userId: caller.id,
      unitId: attempt.unitId,
      amount: Number(attempt.amount),
      description: `Retry payment for ${attempt.purpose.replace(/_/g, " ")}`,
      customer: {
        firstName: caller.firstName ?? "Resident",
        lastName: caller.lastName ?? "",
        email: caller.email ?? "",
      },
    });
    if (attempt.purpose === "guest_day_pass") {
      await db.update(wahaGuestDayPassesTable).set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
        paymentAttemptId: result.attempt.id,
        paymentStatus: "pending",
      }).where(eq(wahaGuestDayPassesTable.id, attempt.subjectId));
    }
    if (attempt.purpose === "waha_replacement") {
      await db.update(wahaPassCredentialsTable).set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
      }).where(eq(wahaPassCredentialsTable.id, attempt.subjectId));
    }
    if (attempt.purpose === "facility_booking") {
      await db.update(bookingsTable).set({
        chargeId: result.attempt.providerChargeId,
        paymentUrl: result.paymentUrl,
        paymentProvider: result.attempt.provider,
      }).where(eq(bookingsTable.id, attempt.subjectId));
    }
    return res.json({ paymentUrl: result.paymentUrl, chargeId: result.attempt.providerChargeId, attemptId: result.attempt.id });
  } catch (err: any) {
    const message = err?.message ?? "Payment gateway error";
    if (message.includes("not configured")) return res.status(503).json({ error: message });
    if (err instanceof PaymentCallbackError) return res.status(409).json({ error: message });
    req.log.error({ err }, "Payment retry failed");
    return res.status(502).json({ error: "Payment retry failed. Please try again." });
  }
});

// ─── GET /payments/history — booking payments only ────────────────────────────
// Stage 3 G6 removes every permit financial step. Historic permit financial
// columns remain in the database for audit retention but are intentionally not
// exposed through the live payment ledger.
router.get("/payments/history", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const isAdmin = caller.role === "admin";
  const { userId: queryUserId, from, to } = req.query as Record<string, string>;

  const targetUserId: number | null = isAdmin
    ? queryUserId ? Number(queryUserId) : null
    : caller.id;

  const fromDate = from ? new Date(from) : undefined;
  const toDate   = to   ? new Date(to + "T23:59:59.999Z") : undefined;

  // ── Fetch bookings ─────────────────────────────────────────────────────────
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        or(isNotNull(bookingsTable.chargeId), ne(bookingsTable.paymentStatus, "unpaid")),
        targetUserId !== null ? eq(bookingsTable.userId, targetUserId) : undefined,
        fromDate ? gte(bookingsTable.createdAt, fromDate) : undefined,
        toDate   ? lt(bookingsTable.createdAt, toDate)   : undefined,
      )
    )
    .orderBy(desc(bookingsTable.createdAt))
    .limit(100);

  // ── Enrich with facility names and user info ───────────────────────────────
  const facilityIds = [...new Set(bookings.map(b => b.facilityId))];
  const allUserIds = [...new Set(
    bookings.map((booking) => booking.userId).filter((id): id is number => id !== null),
  )];

  const [facilities, users] = await Promise.all([
    facilityIds.length > 0
      ? db
          .select({ id: facilitiesTable.id, name: facilitiesTable.name })
          .from(facilitiesTable)
          .where(inArray(facilitiesTable.id, facilityIds))
      : Promise.resolve([]),
    allUserIds.length > 0
      ? db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
            unitId: usersTable.unitId,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, allUserIds))
      : Promise.resolve([]),
  ]);

  const facMap  = Object.fromEntries(facilities.map(f => [f.id, f.name]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const unitReferences = await canonicalUnitReferenceMap(users.map((user) => user.unitId));

  function txnType(status: string): "payment" | "refund" | "waived" {
    if (status === "refunded" || status === "refund_pending") return "refund";
    if (status === "waived") return "waived";
    return "payment";
  }

  const bookingRecords = bookings.map(b => ({
    id: `booking-${b.id}`,
    recordType: "booking" as const,
    recordId: b.id,
    description: `${facMap[b.facilityId] ?? "Facility"} booking — ${new Date(b.startTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    amount: b.totalAmount,
    currency: "SAR",
    transactionType: txnType(b.paymentStatus),
    paymentStatus: b.paymentStatus,
    paidAt: b.paidAt?.toISOString() ?? null,
    chargeId: b.chargeId,
    paymentMethod: b.paymentMethod,
    paymentProvider: b.paymentProvider,
    facilityName: facMap[b.facilityId] ?? null,
    permitType: null,
    serviceDate: b.startTime.toISOString(),
    // Keep the legacy field name for clients, but source its display value from
    // the Unit Registry rather than users.unitNumber.
    unitNumber: b.userId === null ? null : unitReferences.get(userMap[b.userId]?.unitId ?? -1) ?? "—",
    unitReference: b.userId === null ? null : unitReferences.get(userMap[b.userId]?.unitId ?? -1) ?? "—",
    resident: isAdmin ? (b.userId === null ? null : (() => {
      const user = userMap[b.userId];
      return user ? {
        id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email,
        unitReference: unitReferences.get(user.unitId ?? -1) ?? "—",
      } : null;
    })()) : undefined,
    createdAt: b.createdAt.toISOString(),
  }));

  const all = bookingRecords.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json(all);
});

export default router;
