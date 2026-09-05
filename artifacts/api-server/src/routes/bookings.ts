import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import { usersTable, unitsTable, bookingsTable, facilitiesTable, hoaSettingsTable, monthlyBookingAllowancesTable } from "@workspace/db";
import { eq, and, lt, gt, inArray, desc, count, sql } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { logger } from "../lib/logger";

import { APPROVER_ROLES } from "../lib/roles";
import { denyGuardModuleAccess } from "../middlewares/denyGuardModuleAccess";
import { enqueueBothNotificationChannels } from "../lib/notificationProducer";
import { EVT, bookingStatusKey } from "../lib/notificationWiring";
import { hasActiveWahaPass } from "../lib/wahaPassCheck";
import {
  facilityMinuteMs,
  findContainingFacilityServiceWindow,
  formatOperatingHour,
  startsOnFacilityGrid,
} from "../lib/facilityOperatingHours";
import { FACILITY_BOOKING_ADVISORY_LOCK_NAMESPACE } from "../lib/advisoryLockNamespaces";
import { BOOKING_UNIT_FACILITY_ADVISORY_LOCK_NAMESPACE } from "../lib/advisoryLockNamespaces";
import { assertActiveOccupantEligibility, OccupancyError } from "../lib/occupancy";

const router = Router();
router.use("/bookings", requireApiAuth, denyGuardModuleAccess);

// Helper: enrich bookings with facility name and resident name
async function enrichBookings(bookings: typeof bookingsTable.$inferSelect[]) {
  if (bookings.length === 0) return [];
  const facilityIds = [...new Set(bookings.map(b => b.facilityId))];
  const userIds = [...new Set(
    bookings.map((booking) => booking.userId).filter((id): id is number => id !== null),
  )];
  const unitIds = [...new Set(
    bookings.map((booking) => booking.unitId).filter((id): id is number => id !== null),
  )];
  const [facilities, users, units] = await Promise.all([
    db.select({ id: facilitiesTable.id, name: facilitiesTable.name }).from(facilitiesTable)
      .where(inArray(facilitiesTable.id, facilityIds)),
    userIds.length
      ? db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, unitNumber: usersTable.unitNumber })
        .from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([]),
    unitIds.length
      ? db.select({ id: unitsTable.id, building: unitsTable.building, unitNumber: unitsTable.unitNumber })
        .from(unitsTable).where(inArray(unitsTable.id, unitIds))
      : Promise.resolve([]),
  ]);
  const facMap = Object.fromEntries(facilities.map(f => [f.id, f.name]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const unitMap = Object.fromEntries(units.map(unit => [unit.id, unit]));
  return bookings.map(b => ({
    ...b,
    // Prefer the live facility name; fall back to the name snapshotted at booking time
    // so old bookings for deactivated/deleted facilities still display correctly.
    facilityName: facMap[b.facilityId] ?? b.facilityName ?? "Unknown",
    resident: b.userId === null ? null : userMap[b.userId] ?? null,
    // The booking anchor, rather than the current user profile, is authoritative:
    // admin bookings are anchored to HOA/COMMON and released accounts can be unitless.
    unit: b.unitId === null ? null : unitMap[b.unitId] ?? null,
  }));
}

router.get("/bookings", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { facilityId, status, upcoming } = req.query as Record<string, string>;
  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);

  const isStaff = APPROVER_ROLES.includes(caller.role);
  const where = and(
    isStaff ? undefined : eq(bookingsTable.userId, caller.id),
    facilityId ? eq(bookingsTable.facilityId, Number(facilityId)) : undefined,
    status ? eq(bookingsTable.status, status as any) : undefined,
    upcoming === "true" ? gt(bookingsTable.startTime, new Date()) : undefined,
  );

  const [{ total }] = await db.select({ total: count() }).from(bookingsTable).where(where);
  const bookings = await db.select().from(bookingsTable)
    .where(where)
    .orderBy(desc(bookingsTable.startTime))
    .limit(limit)
    .offset(offset);

  res.json(paginatedResponse(await enrichBookings(bookings), Number(total), page, limit));
});

// ── GET /bookings/config ───────────────────────────────────────────────────────
// Returns the configurable booking advance window so the portal can enforce
// the maxDate on the calendar without re-implementing the server logic.
router.get("/bookings/config", requireApiAuth, async (_req, res) => {
  try {
    const [row] = await db
      .select({ value: hoaSettingsTable.value })
      .from(hoaSettingsTable)
      .where(eq(hoaSettingsTable.key, "booking_advance_days"));
    const advanceDays = row ? parseInt(row.value, 10) : 14;
    res.json({ advanceDays });
  } catch (err) {
    // Root cause: the exact throw site was not captured before this try/catch
    // was added. The 3 ms response time observed during E2E (too fast for a DB
    // round-trip) points to a failure inside requireApiAuth — most likely
    // Clerk's getAuth() receiving an unexpected auth-context state (e.g. an
    // in-flight session-token refresh at page load). Until the condition is
    // reproduced in isolation, logging here makes it observable.
    logger.error({ err }, "GET /bookings/config fallback — hoa_settings lookup failed");
    res.json({ advanceDays: 14 });
  }
});

router.get("/bookings/monthly-allowance", requireApiAuth, async (req, res) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.auth().userId!));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  if (!caller.unitId || caller.role === "admin") {
    return res.json({ available: false, eligibleForBooking: false, periodStart: null, renewsAt: null, reason: "not_resident_unit" });
  }
  const periodResult = await db.execute(sql`
    SELECT
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AS period_start,
      (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh') + interval '1 month')::date AS renews_at
  `);
  const period = periodResult.rows[0];
  const periodStart = String((period as any).period_start).slice(0, 10);
  const [claim] = await db.select().from(monthlyBookingAllowancesTable).where(and(
    eq(monthlyBookingAllowancesTable.unitId, caller.unitId),
    eq(monthlyBookingAllowancesTable.periodStart, periodStart),
  ));
  let activeOccupant = true;
  try {
    await db.transaction((tx) => assertActiveOccupantEligibility(tx, caller.id));
  } catch (error) {
    if (error instanceof OccupancyError) activeOccupant = false;
    else throw error;
  }
  const eligibleForBooking = activeOccupant && await hasActiveWahaPass(caller.id);
  res.json({
    available: !claim,
    eligibleForBooking,
    periodStart,
    renewsAt: (period as any).renews_at,
    reason: eligibleForBooking ? null : "no_waha_pass",
    claim: claim ? { bookingId: claim.bookingId, claimedAt: claim.claimedAt } : null,
  });
});

router.post("/bookings", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const isAdminBooking = caller.role === "admin";
  // Bookings are retained after an account is released, so every new booking
  // needs a durable unit anchor. Staff accounts are deliberately unitless, so
  // administrator exceptions use the seeded HOA COMMON system unit instead.
  let bookingUnitId = caller.unitId;
  if (!isAdminBooking && bookingUnitId === null) {
    return res.status(422).json({
      error: "BOOKING_UNIT_REQUIRED: link the account to a unit before creating a facility booking.",
    });
  }

  const { facilityId, startTime, durationMinutes, notes } = req.body;
  if (!facilityId || !startTime || !durationMinutes) {
    return res.status(400).json({ error: "facilityId, startTime, durationMinutes are required" });
  }

  if (caller.role !== "admin") {
    const passOk = await hasActiveWahaPass(caller.id);
    if (!passOk) return res.status(403).json({ error: "WAHA_PASS_REQUIRED" });
  }

  const [facility] = await db.select().from(facilitiesTable).where(eq(facilitiesTable.id, Number(facilityId)));
  if (!facility || !facility.isActive) return res.status(404).json({ error: "Facility not found" });

  // ── Cinema movie approval: title required so HOA can review content compliance ──
  const movieTitle = typeof req.body.movieTitle === "string" ? req.body.movieTitle.trim() : "";
  if (facility.requiresMovieTitle && !movieTitle) {
    return res.status(400).json({
      error: "A movie title is required for cinema bookings so the HOA can review it for content compliance before approval.",
    });
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({ error: "startTime must be a valid date-time" });
  }

  // ── F9: Advance booking window ─────────────────────────────────────────────
  // Residents may not book more than N calendar days ahead (configurable via
  // hoa_settings key "booking_advance_days"; default 14). Admin is exempt.
  // Activates the dead BOOKING_CUTOFF_EXCEEDED scaffolding already present in
  // the portal client — the server now produces the error the portal expects.
  if (caller.role !== "admin") {
    const [advanceSetting] = await db
      .select({ value: hoaSettingsTable.value })
      .from(hoaSettingsTable)
      .where(eq(hoaSettingsTable.key, "booking_advance_days"));
    const advanceDays = advanceSetting ? parseInt(advanceSetting.value, 10) : 14;

    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);
    const maxAllowed = new Date(todayLocal.getTime() + advanceDays * 24 * 60 * 60 * 1000);
    const bookingDay = new Date(start);
    bookingDay.setHours(0, 0, 0, 0);

    if (bookingDay > maxAllowed) {
      return res.status(400).json({
        error: `BOOKING_CUTOFF_EXCEEDED: ${advanceDays}`,
      });
    }
  }

  const dur = Number(durationMinutes);
  if (!Number.isInteger(dur) || dur % 30 !== 0) {
    return res.status(400).json({ error: "Duration must be a multiple of 30 minutes." });
  }
  const end = new Date(start.getTime() + dur * facilityMinuteMs);

  // ── Validate duration against facility rules ──
  if (dur < facility.minDurationMinutes || dur > facility.maxDurationMinutes) {
    return res.status(400).json({
      error: `Duration must be between ${facility.minDurationMinutes} and ${facility.maxDurationMinutes} minutes for this facility.`,
    });
  }

  // ── Operating-day and grid checks ──
  // A booking after midnight can belong to the prior service day. The resolver
  // intentionally considers both local calendar date and prior date.
  const serviceWindow = findContainingFacilityServiceWindow(facility, start, end);
  if (!serviceWindow) {
    return res.status(400).json({
      error: "This booking is outside the facility's operating hours. Please choose a time within the available booking-day window.",
    });
  }

  if (!startsOnFacilityGrid(start, serviceWindow, facility.slotIntervalMinutes)) {
    return res.status(400).json({
      error: `Booking start time must align to the facility's ${facility.slotIntervalMinutes}-minute slot interval from the ${formatOperatingHour(serviceWindow.openHour)} opening time.`,
    });
  }

  // ── Conflict window with the facility's cleaning buffer ──
  // A conflict exists if either booking's post-booking cleaning interval would
  // overlap the other reservation. This is symmetric: a new 10:00–11:00
  // booking must also be rejected when an existing booking starts at 11:00.
  const cleaningBufferMinutes = facility.cleaningBufferMinutes ?? 15;
  const bufferStart = new Date(start.getTime() - cleaningBufferMinutes * facilityMinuteMs);
  const bufferedEnd = new Date(end.getTime() + cleaningBufferMinutes * facilityMinuteMs);

  // ── Pricing ──
  let totalAmount: string;
  if (facility.pricingModel === "flat" && facility.flatFeeAmount != null) {
    totalAmount = Number(facility.flatFeeAmount).toFixed(2);
  } else {
    const hours = Number(durationMinutes) / 60;
    totalAmount = (Number(facility.pricePerHour) * hours).toFixed(2);
  }

  const isZeroPriceBooking = Number(totalAmount) === 0;
  const [holdSetting] = !isAdminBooking && !isZeroPriceBooking
    ? await db
      .select({ value: hoaSettingsTable.value })
      .from(hoaSettingsTable)
      .where(eq(hoaSettingsTable.key, "booking_payment_hold_minutes"))
    : [undefined];
  const configuredHoldMinutes = Number(holdSetting?.value);
  const holdMinutes = Number.isInteger(configuredHoldMinutes) && configuredHoldMinutes > 0
    ? configuredHoldMinutes
    : 15;
  // F10/F10a: priced resident requests reserve the exclusive slot before
  // checkout. Admin exceptions and genuinely zero-priced facilities confirm
  // directly but are auditable as different payment outcomes.
  const initialStatus = isAdminBooking || isZeroPriceBooking ? "confirmed" : "pending_payment";
  const initialPaymentStatus = isAdminBooking ? "waived" : isZeroPriceBooking ? "not_required" : "unpaid";
  const paymentHoldExpiresAt = initialStatus === "pending_payment"
    ? new Date(Date.now() + holdMinutes * 60_000)
    : null;
  // Do this only after the request's own shape, facility, schedule, and price
  // have passed validation. A malformed booking must return its precise 4xx
  // error instead of being masked by an unrelated infrastructure prerequisite.
  if (isAdminBooking) {
    const [commonUnit] = await db.select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(
        eq(unitsTable.building, "HOA"),
        eq(unitsTable.unitNumber, "COMMON"),
        eq(unitsTable.isSystem, true),
      ));
    if (!commonUnit) {
      return res.status(503).json({
        error: "COMMON_BOOKING_UNIT_UNAVAILABLE: the required HOA system unit is missing.",
      });
    }
    bookingUnitId = commonUnit.id;
  }
  if (bookingUnitId === null) {
    return res.status(503).json({
      error: "BOOKING_UNIT_ANCHOR_UNAVAILABLE: a durable booking unit could not be resolved.",
    });
  }
  const durableBookingUnitId = bookingUnitId;

  // ── Atomic conflict admission ──
  // The buffered-overlap rule spans different grid starts, so the exact-start
  // unique index alone cannot make it race-safe: two concurrent requests for
  // e.g. 10:00–11:00 and 10:30–11:30 could both pass a read-before-insert check
  // and both persist. We serialize all creations for a facility with a
  // transaction-scoped advisory lock, then re-run the buffered-overlap check
  // inside the same transaction before inserting. The exact-start unique index
  // remains as defense-in-depth against any path that bypasses this route.
  const CONFLICT = Symbol("conflict");
  const ACTIVE_UNIT_FACILITY_CONFLICT = Symbol("active_unit_facility_conflict");
  let booking: typeof bookingsTable.$inferSelect;
  try {
    booking = await db.transaction(async (tx) => {
      if (!isAdminBooking) {
        // Canonical occupancy lock is acquired before either booking advisory
        // lock; this order is shared with household release operations.
        const eligibility = await assertActiveOccupantEligibility(tx, caller.id);
        if (eligibility.user.unitId !== durableBookingUnitId) {
          throw new OccupancyError("OCCUPANCY_CONFLICT", "The account unit changed while booking creation was pending.");
        }
      }
      // Serialize concurrent creators for this facility. The lock is released
      // automatically when the transaction commits or rolls back.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${FACILITY_BOOKING_ADVISORY_LOCK_NAMESPACE}, ${Number(facilityId)})`);
       await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOKING_UNIT_FACILITY_ADVISORY_LOCK_NAMESPACE}, ${durableBookingUnitId})`);

       if (!isAdminBooking) {
         const active = await tx.select({ id: bookingsTable.id }).from(bookingsTable).where(and(
           eq(bookingsTable.unitId, durableBookingUnitId),
           eq(bookingsTable.facilityId, Number(facilityId)),
           sql`((status IN ('pending', 'confirmed') AND end_time > CURRENT_TIMESTAMP) OR (status = 'pending_payment' AND payment_hold_expires_at > CURRENT_TIMESTAMP))`,
         ));
         if (active.length) throw ACTIVE_UNIT_FACILITY_CONFLICT;
       }

      const conflicts = await tx
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.facilityId, Number(facilityId)),
            sql`((status IN ('pending', 'confirmed') AND end_time > CURRENT_TIMESTAMP) OR (status = 'pending_payment' AND payment_hold_expires_at > CURRENT_TIMESTAMP))`,
            lt(bookingsTable.startTime, bufferedEnd),
            gt(bookingsTable.endTime, bufferStart),
          )
        );
      if (conflicts.length > 0) throw CONFLICT;

       let [created] = await tx.insert(bookingsTable).values({
        facilityId: Number(facilityId),
        userId: caller.id,
        unitId: durableBookingUnitId,
        startTime: start,
        endTime: end,
        totalAmount,
        status: initialStatus,
        paymentStatus: initialPaymentStatus,
         paymentExemptionReason: isAdminBooking ? "admin_booking" : isZeroPriceBooking ? "zero_price_facility" : null,
        paymentHoldExpiresAt,
        facilityName: facility.name,
        movieTitle: movieTitle || null,
        notes,
      }).returning();
       if (!isAdminBooking && !isZeroPriceBooking) {
         const [claim] = await tx.insert(monthlyBookingAllowancesTable).values({
           unitId: durableBookingUnitId,
           periodStart: sql`(date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh'))::date`,
           bookingId: created.id,
         }).onConflictDoNothing().returning();
         if (claim) {
           [created] = await tx.update(bookingsTable).set({
             status: "confirmed", paymentStatus: "not_required",
             paymentExemptionReason: "monthly_free_allowance", paymentHoldExpiresAt: null,
           }).where(eq(bookingsTable.id, created.id)).returning();
         }
       }
       return created;
    });
  } catch (error: any) {
    if (error instanceof OccupancyError) {
      return res.status(403).json({ error: "ACTIVE_OCCUPANT_REQUIRED", message: error.message });
    }
    if (error === ACTIVE_UNIT_FACILITY_CONFLICT || error?.code === "23P01" || error?.message?.includes("ACTIVE_UNIT_FACILITY_BOOKING_EXISTS")) {
      return res.status(409).json({ error: "ACTIVE_UNIT_FACILITY_BOOKING_EXISTS: this unit already has an active booking for this facility." });
    }
    if (error === CONFLICT || error?.code === "23505") {
      return res.status(409).json({
        error: `This time slot is unavailable. ${cleaningBufferMinutes} minutes of cleaning time is required between reservations.`,
      });
    }
    throw error;
  }

  const [enriched] = await enrichBookings([booking]);
  res.status(201).json(enriched);
});

router.get("/bookings/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, Number(req.params.id)));
  if (!booking) return res.status(404).json({ error: "Not found" });
  // Account-deleted historical bookings have userId = null and are staff-only.
  if (!APPROVER_ROLES.includes(caller.role) && booking.userId !== caller.id) return res.status(404).json({ error: "Not found" });
  const [enriched] = await enrichBookings([booking]);
  res.json(enriched);
});

router.patch("/bookings/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Account-deleted historical bookings have userId = null and are staff-only.
  if (!APPROVER_ROLES.includes(caller.role) && existing.userId !== caller.id) return res.status(404).json({ error: "Not found" });

  const { status, notes, paymentStatus } = req.body;
  const isStaff = APPROVER_ROLES.includes(caller.role);
  const isApprover = APPROVER_ROLES.includes(caller.role);
  if (status && status !== "cancelled" && !isStaff) {
    return res.status(403).json({ error: "Only HOA staff can change booking status" });
  }
  if (paymentStatus !== undefined) {
    return res.status(403).json({ error: "Payment status is controlled by the verified payment callback." });
  }
  // Approving (confirming) a booking is restricted to approver roles, mirroring
  // /bookings/:id/confirm — prevents guards from bypassing approval via PATCH.
  if (status === "confirmed" && !isApprover) {
    return res.status(403).json({ error: "Only admins can approve bookings" });
  }
  if (status === "confirmed" && existing.status === "pending_payment") {
    return res.status(409).json({ error: "A pending-payment booking can only be confirmed by a verified payment callback." });
  }
  // Past-booking guard: a booking whose end time has passed is immutable —
  // cancellation via PATCH is blocked to mirror the /cancel endpoint guard.
  if (status === "cancelled" && existing.endTime < new Date()) {
    return res.status(409).json({ error: "Cannot cancel a booking that has already passed" });
  }

  const [booking] = await db
    .update(bookingsTable)
    .set({ ...(status && { status }), ...(notes !== undefined && { notes }) })
    .where(eq(bookingsTable.id, Number(req.params.id)))
    .returning();
  const [enriched] = await enrichBookings([booking]);

  if (status === "confirmed" || status === "cancelled") {
    const label = status === "confirmed" ? "✅ Booking Confirmed" : "❌ Booking Cancelled";
    const facilityName = (enriched as any).facilityName ?? "your facility";
    if (existing.userId !== null) {
      // Row 3 — booking_status_change
      enqueueBothNotificationChannels({
        eventType: EVT.BOOKING_STATUS_CHANGE,
        idempotencyKey: bookingStatusKey(booking.id, status),
        recipientUserId: existing.userId,
        recipientEmail: (enriched as { resident?: { email?: string | null } }).resident?.email ?? null,
        payload: {
          title: label,
          subject: `${facilityName} booking ${status}`,
          body: `Your booking for ${facilityName} on ${booking.startTime.toISOString()} has been ${status}.`,
          html: `<p>Your booking for <strong>${facilityName}</strong> on ${booking.startTime.toISOString()} has been ${status}.</p>`,
          data: { screen: "bookings", id: booking.id },
        },
        preferencePolicy: "decision",
      }).catch(() => {});
    }
  }

  res.json(enriched);
});

router.post("/bookings/:id/cancel", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Account-deleted historical bookings have userId = null and are staff-only.
  if (!APPROVER_ROLES.includes(caller.role) && existing.userId !== caller.id) return res.status(404).json({ error: "Not found" });
  if (existing.status === "cancelled") {
    return res.status(409).json({ error: "Booking is already cancelled" });
  }
  if (existing.endTime < new Date()) {
    return res.status(409).json({ error: "Cannot cancel a booking that has already passed" });
  }
  const [booking] = await db
    .update(bookingsTable)
    .set({
      status: "cancelled",
      ...(existing.status === "pending_payment" ? { paymentStatus: "expired", paymentHoldExpiresAt: null } : {}),
    })
    .where(eq(bookingsTable.id, Number(req.params.id)))
    .returning();
  const [enriched] = await enrichBookings([booking]);

  if (existing.userId !== null) {
    // Row 3 — booking_status_change (cancelled)
    enqueueBothNotificationChannels({
      eventType: EVT.BOOKING_STATUS_CHANGE,
      idempotencyKey: bookingStatusKey(booking.id, "cancelled"),
      recipientUserId: existing.userId,
      recipientEmail: (enriched as { resident?: { email?: string | null } }).resident?.email ?? null,
      payload: {
        title: "❌ Booking Cancelled",
        subject: `${(enriched as any).facilityName ?? "Facility"} booking cancelled`,
        body: `Your booking for ${(enriched as any).facilityName ?? "a facility"} on ${booking.startTime.toISOString()} has been cancelled.`,
        html: `<p>Your booking for <strong>${(enriched as any).facilityName ?? "a facility"}</strong> on ${booking.startTime.toISOString()} has been cancelled.</p>`,
        data: { screen: "bookings", id: booking.id },
      },
      preferencePolicy: "decision",
    }).catch(() => {});
  }

  res.json(enriched);
});

router.post("/bookings/:id/confirm", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !APPROVER_ROLES.includes(caller.role)) return res.status(403).json({ error: "Forbidden" });
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.status === "cancelled") {
    return res.status(409).json({ error: "Cannot confirm a cancelled booking" });
  }
  if (existing.status === "confirmed") {
    return res.status(409).json({ error: "Booking is already confirmed" });
  }
  if (existing.endTime < new Date()) {
    return res.status(409).json({ error: "Cannot confirm a booking that has already passed" });
  }
  const [booking] = await db
    .update(bookingsTable)
    .set({ status: "confirmed" })
    .where(eq(bookingsTable.id, Number(req.params.id)))
    .returning();
  const [enriched] = await enrichBookings([booking]);

  if (existing.userId !== null) {
    // Row 3 — booking_status_change (confirmed)
    enqueueBothNotificationChannels({
      eventType: EVT.BOOKING_STATUS_CHANGE,
      idempotencyKey: bookingStatusKey(booking.id, "confirmed"),
      recipientUserId: existing.userId,
      recipientEmail: (enriched as { resident?: { email?: string | null } }).resident?.email ?? null,
      payload: {
        title: "✅ Booking Confirmed",
        subject: `${(enriched as any).facilityName ?? "Facility"} booking confirmed`,
        body: `Your booking for ${(enriched as any).facilityName ?? "a facility"} on ${booking.startTime.toISOString()} has been confirmed.`,
        html: `<p>Your booking for <strong>${(enriched as any).facilityName ?? "a facility"}</strong> on ${booking.startTime.toISOString()} has been confirmed.</p>`,
        data: { screen: "bookings", id: booking.id },
      },
      preferencePolicy: "decision",
    }).catch(() => {});
  }

  res.json(enriched);
});

export default router;
