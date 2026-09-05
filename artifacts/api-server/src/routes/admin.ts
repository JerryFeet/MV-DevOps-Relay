import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable, bookingsTable, moveFormsTable, permitsTable, residentsTable, guestsTable,
  vehiclesTable, wahaPassApplicationsTable, unitsTable, wahaPassCredentialsTable,
  unitVerificationsTable, ownershipChangeEventsTable, communicationsTable,
  wahaReplacementRequestsTable, tenancyLifecyclesTable, portalHelpTicketsTable,
  hoaSettingsTable, guestPassesTable, wahaGuestDayPassesTable, paymentAttemptsTable,
  facilitiesTable, notificationEventsTable, parkingLotsTable,
} from "@workspace/db";
import { eq, count, and, ilike, gte, lt, lte, or, inArray, ne, isNotNull } from "drizzle-orm";
import { parsePaginationParams } from "../lib/pagination";
import { consumeOwnerIdCheckAttempt, purgeExpiredOwnerIdAttempts } from "./units";
import { getSmtpConfig } from "../lib/email";

const router = Router();

const ATTENTION_THRESHOLD_KEY = "admin_attention_threshold_days";
const OVERDUE_THRESHOLD_KEY = "admin_overdue_threshold_days";
const DEFAULT_ATTENTION_THRESHOLD_DAYS = 2;
const DEFAULT_OVERDUE_THRESHOLD_DAYS = 7;

function localDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function positiveIntegerSetting(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

router.get("/admin/summary", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rollingThirtyDayEnd = new Date(today);
  rollingThirtyDayEnd.setDate(rollingThirtyDayEnd.getDate() + 30);

  const [
    [usersCount],
    [bookingsCount],
    [pendingBookings],
    [moveFormsCount],
    [permitsCount],
    [residentsCount],
    [guestsCount],
    [vehiclesCount],
    [pendingVehiclesCount],
    [pendingWahaAppsCount],
    [unitsRegisteredCount],
    [verifiedOwnersCount],
    [activeTenanciesCount],
    [residentsWithPortalAccessCount],
    [tenanciesExpiringNext30DaysCount],
    [wahaPassesIssuedCount],
    [bookingsThisMonthCount],
    [portalHelpThisMonthCount],
    attentionSettings,
    notificationHealthRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(bookingsTable),
    db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending")),
    db.select({ count: count() }).from(moveFormsTable).where(eq(moveFormsTable.status, "pending")),
    db.select({ count: count() }).from(permitsTable).where(eq(permitsTable.status, "submitted")),
    db.select({ count: count() }).from(residentsTable).where(eq(residentsTable.status, "active")),
    db.select({ count: count() }).from(guestsTable).where(eq(guestsTable.status, "pending")),
    db.select({ count: count() }).from(vehiclesTable).where(eq(vehiclesTable.status, "active")),
    db.select({ count: count() }).from(vehiclesTable).where(and(eq(vehiclesTable.status, "pending_approval"), eq(vehiclesTable.isAdditional, true))),
    db.select({ count: count() }).from(wahaPassApplicationsTable).where(eq(wahaPassApplicationsTable.status, "pending_review")),
    db.select({ count: count() }).from(unitsTable).where(eq(unitsTable.isSystem, false)),
    db.select({ count: count() }).from(usersTable).where(and(
      eq(usersTable.role, "owner"),
      eq(usersTable.status, "active"),
      eq(usersTable.verificationStatus, "verified_owner"),
    )),
    db.select({ count: count() }).from(tenancyLifecyclesTable).where(eq(tenancyLifecyclesTable.status, "active")),
    db.select({ count: count() }).from(residentsTable).where(and(
      eq(residentsTable.status, "active"),
      eq(residentsTable.hasPortalAccess, true),
    )),
    db.select({ count: count() }).from(tenancyLifecyclesTable).where(and(
      eq(tenancyLifecyclesTable.status, "active"),
      gte(tenancyLifecyclesTable.leaseEndDate, localDateOnly(today)),
      lte(tenancyLifecyclesTable.leaseEndDate, localDateOnly(rollingThirtyDayEnd)),
    )),
    db.select({ count: count() }).from(wahaPassCredentialsTable).where(eq(wahaPassCredentialsTable.status, "active")),
    db.select({ count: count() }).from(bookingsTable).where(and(
      ne(bookingsTable.status, "cancelled"),
      gte(bookingsTable.startTime, startOfMonth),
      lt(bookingsTable.startTime, startOfNextMonth),
    )),
    db.select({ count: count() }).from(portalHelpTicketsTable).where(and(
      gte(portalHelpTicketsTable.createdAt, startOfMonth),
      lt(portalHelpTicketsTable.createdAt, startOfNextMonth),
    )),
    db.select({ key: hoaSettingsTable.key, value: hoaSettingsTable.value })
      .from(hoaSettingsTable)
      .where(inArray(hoaSettingsTable.key, [ATTENTION_THRESHOLD_KEY, OVERDUE_THRESHOLD_KEY])),
    db.select({
      status: notificationEventsTable.status,
      channel: notificationEventsTable.channel,
      createdAt: notificationEventsTable.createdAt,
    }).from(notificationEventsTable)
      .where(and(eq(notificationEventsTable.channel, "email"), inArray(notificationEventsTable.status, ["retrying", "failed"]))),
  ]);

  const settings = Object.fromEntries(attentionSettings.map((setting) => [setting.key, setting.value]));
  const attentionThresholdDays = positiveIntegerSetting(
    settings[ATTENTION_THRESHOLD_KEY],
    DEFAULT_ATTENTION_THRESHOLD_DAYS,
    1,
  );
  const configuredOverdueThresholdDays = positiveIntegerSetting(
    settings[OVERDUE_THRESHOLD_KEY],
    DEFAULT_OVERDUE_THRESHOLD_DAYS,
    1,
  );
  const overdueThresholdDays = Math.max(attentionThresholdDays, configuredOverdueThresholdDays);
  let smtpStatus: "configured" | "unconfigured" | "credential_unreadable" | "configuration_error" = "unconfigured";
  try {
    smtpStatus = (await getSmtpConfig()) ? "configured" : "unconfigured";
  } catch (error) {
    smtpStatus = error instanceof Error && error.message.includes("credential")
      ? "credential_unreadable"
      : "configuration_error";
  }
  const retryingEmailCount = notificationHealthRows.filter((row) => row.status === "retrying").length;
  const failedEmailRows = notificationHealthRows.filter((row) => row.status === "failed");
  const oldestEmailFailure = failedEmailRows
    .map((row) => row.createdAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  res.json({
    totalUsers: Number(usersCount.count),
    totalBookings: Number(bookingsCount.count),
    pendingBookings: Number(pendingBookings.count),
    pendingMoveForms: Number(moveFormsCount.count),
    pendingPermits: Number(permitsCount.count),
    activeResidents: Number(residentsCount.count),
    pendingGuests: Number(guestsCount.count),
    activeVehicles: Number(vehiclesCount.count),
    pendingVehicles: Number(pendingVehiclesCount.count),
    pendingWahaApps: Number(pendingWahaAppsCount.count),
    unitsRegistered: Number(unitsRegisteredCount.count),
    verifiedOwners: Number(verifiedOwnersCount.count),
    activeTenancies: Number(activeTenanciesCount.count),
    residentsWithPortalAccess: Number(residentsWithPortalAccessCount.count),
    tenanciesExpiringNext30Days: Number(tenanciesExpiringNext30DaysCount.count),
    wahaPassesIssued: Number(wahaPassesIssuedCount.count),
    bookingsThisMonth: Number(bookingsThisMonthCount.count),
    portalHelpTicketsThisMonth: Number(portalHelpThisMonthCount.count),
    attentionThresholdDays,
    overdueThresholdDays,
    smtpStatus,
    retryingEmailNotifications: retryingEmailCount,
    failedEmailNotifications: failedEmailRows.length,
    oldestEmailFailureAt: oldestEmailFailure?.toISOString() ?? null,
  });
});

// AD1: one authenticated, explicit operational queue. Tenant renewals are
// deliberately excluded because only a unit owner may decide them.
router.get("/admin/pending-items", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const [
    ownerVerifications,
    permits,
    wahaApplications,
    wahaReplacementRequests,
    ownershipChanges,
    tenancyReleaseCases,
    communications,
    portalHelp,
  ] = await Promise.all([
    db.select().from(unitVerificationsTable).where(and(eq(unitVerificationsTable.status, "pending"), ne(unitVerificationsTable.type, "tenant_request"))),
    db.select().from(permitsTable).where(inArray(permitsTable.status, ["submitted", "under_review"])),
    db.select().from(wahaPassApplicationsTable).where(eq(wahaPassApplicationsTable.status, "pending_review")),
    db.select().from(wahaReplacementRequestsTable).where(eq(wahaReplacementRequestsTable.status, "pending_review")),
    db.select().from(ownershipChangeEventsTable).where(eq(ownershipChangeEventsTable.status, "pending")),
    db.select().from(tenancyLifecyclesTable).where(isNotNull(tenancyLifecyclesTable.releaseRequestedAt)),
    db.select().from(communicationsTable).where(eq(communicationsTable.status, "pending")),
    db.select().from(portalHelpTicketsTable).where(eq(portalHelpTicketsTable.status, "pending")),
  ]);

  res.json({
    ownerVerifications,
    permits,
    wahaApplications,
    wahaReplacementRequests,
    ownershipChanges,
    tenancyReleaseCases,
    communications,
    portalHelp,
  });
});

// ── Historical Records Search ─────────────────────────────────────────────────
// Admin-only searchable/paginated archive of moved-out data sets.
// recordType drives which table is queried; currently supports "moved_out_residents".
// The extensible pattern means future types (archived vehicles, etc.) can be
// added by appending a new branch without rebuilding the endpoint shell.
router.get("/admin/historical-records", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const {
    recordType = "moved_out_residents",
    name,
    nationalId,
    unitNumber,
    relationship,
    movedOutAfter,
    movedOutBefore,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? "20", 10)));
  const offset = (pageNum - 1) * limitNum;

  if (recordType !== "moved_out_residents") {
    return res.status(400).json({ error: "Unknown recordType", supportedTypes: ["moved_out_residents"] });
  }

  // Build filter conditions for moved_out residents
  const conditions = [eq(residentsTable.status, "moved_out")];

  if (name) {
    const pattern = `%${name}%`;
    conditions.push(
      or(
        ilike(residentsTable.firstName, pattern),
        ilike(residentsTable.lastName, pattern),
      )!,
    );
  }
  if (nationalId) {
    conditions.push(ilike(residentsTable.idNumber, `%${nationalId}%`));
  }
  if (unitNumber) {
    conditions.push(ilike(residentsTable.unitNumber, `%${unitNumber}%`));
  }
  if (relationship) {
    conditions.push(ilike(residentsTable.relationship, `%${relationship}%`));
  }
  if (movedOutAfter) {
    conditions.push(gte(residentsTable.updatedAt, new Date(movedOutAfter)));
  }
  if (movedOutBefore) {
    const before = new Date(movedOutBefore);
    before.setHours(23, 59, 59, 999);
    conditions.push(lte(residentsTable.updatedAt, before));
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(residentsTable)
    .where(where);

  const rows = await db
    .select()
    .from(residentsTable)
    .where(where)
    .orderBy(residentsTable.updatedAt)
    .limit(limitNum)
    .offset(offset);

  const totalCount = Number(total);
  const totalPages = Math.ceil(totalCount / limitNum);

  res.json({
    recordType,
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
    },
  });
});

// ── GET /admin/units/full ─────────────────────────────────────────────────────
// Admin-only consolidated unit view: paginated & searchable list of all units
// with every unit-scoped research record needed by an administrator.
router.get("/admin/units/full", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    search,
    nationalId,
    name,
    building: buildingFilter,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string | undefined>;

  const { page: pageNum, limit: limitNum, offset } = parsePaginationParams({
    page: page ?? "1",
    limit: limit ?? "20",
  });

  const nationalIdQuery = nationalId?.trim() ?? "";
  let nationalIdUnitFilter: ReturnType<typeof or> | null = null;
  if (nationalIdQuery) {
    purgeExpiredOwnerIdAttempts();
    const attempts = await consumeOwnerIdCheckAttempt(caller.id, `admin-national-id:${nationalIdQuery}`);
    if (attempts > 5) {
      return res.status(429).json({ error: "Too many National ID / Iqama ID lookup attempts. Please wait before trying again." });
    }
    const matchedUsers = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.nationalId, nationalIdQuery));
    const matchedUserIds = matchedUsers.map((user) => user.id);
    if (matchedUserIds.length === 0) {
      return res.json({
        data: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
        buildings: [],
        identifierMatch: false,
      });
    }
    nationalIdUnitFilter = or(
      inArray(unitsTable.verifiedOwnerId, matchedUserIds),
      inArray(unitsTable.verifiedTenantId, matchedUserIds),
    );
  }

  // ── Name search: match owner/tenant users AND household residents ──
  // When ?name= is provided we:
  //   1. Tokenise the query so "Ahmed Al-Rashidi" requires both tokens to appear
  //      in the same person's first/last name fields.
  //   2. Search usersTable  → units where verifiedOwnerId or verifiedTenantId matches.
  //   3. Search residentsTable → active household members (family, guests) who have no
  //      portal account — include their unit IDs directly.
  //   4. Return units matching either set.
  let nameUnitFilter: ReturnType<typeof or> | null = null;
  if (name?.trim()) {
    const tokens = name.trim().split(/\s+/).filter(Boolean);

    // Per-token name condition for users
    const userTokenConds = tokens.map(tok => {
      const p = `%${tok}%`;
      return or(ilike(usersTable.firstName, p), ilike(usersTable.lastName, p))!;
    });
    const userNameCond = userTokenConds.length === 1 ? userTokenConds[0] : and(...userTokenConds);

    // Per-token name condition for residents
    const resTokenConds = tokens.map(tok => {
      const p = `%${tok}%`;
      return or(ilike(residentsTable.firstName, p), ilike(residentsTable.lastName, p))!;
    });
    const resNameCond = resTokenConds.length === 1 ? resTokenConds[0] : and(...resTokenConds);

    // Parallel fetch: matched portal users + matched household residents
    const [matchedUsers, matchedResidents] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(userNameCond),
      db.select({ unitId: residentsTable.unitId })
        .from(residentsTable)
        .where(and(resNameCond as any, eq(residentsTable.status, "active")) as any),
    ]);

    const matchedUserIds = matchedUsers.map(u => u.id);
    const matchedResidentUnitIds = matchedResidents
      .map(r => r.unitId)
      .filter((id): id is number => id != null);

    // Nothing matched at all → return empty early
    if (matchedUserIds.length === 0 && matchedResidentUnitIds.length === 0) {
      const allBuildings = await db
        .selectDistinct({ building: unitsTable.building })
        .from(unitsTable)
        .where(eq(unitsTable.isSystem, false))
        .orderBy(unitsTable.building);
      return res.json({
        data: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
        buildings: allBuildings.map(b => b.building),
        nameSearch: name.trim(),
      });
    }

    // Build OR filter: owner match OR tenant match OR household-resident match
    const nameParts: ReturnType<typeof inArray>[] = [];
    if (matchedUserIds.length > 0) {
      nameParts.push(inArray(unitsTable.verifiedOwnerId, matchedUserIds));
      nameParts.push(inArray(unitsTable.verifiedTenantId, matchedUserIds));
    }
    if (matchedResidentUnitIds.length > 0) {
      nameParts.push(inArray(unitsTable.id, matchedResidentUnitIds));
    }
    nameUnitFilter = or(...nameParts);
  }

  // ── Build WHERE conditions ──
  const conditions: ReturnType<typeof eq>[] = [eq(unitsTable.isSystem, false)];
  if (buildingFilter?.trim()) {
    conditions.push(ilike(unitsTable.building, buildingFilter.trim()) as any);
  }
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(unitsTable.building, pattern),
        ilike(unitsTable.unitNumber, pattern),
      ) as any,
    );
  }
  if (nameUnitFilter !== null) {
    conditions.push(nameUnitFilter as any);
  }
  if (nationalIdUnitFilter !== null) {
    conditions.push(nationalIdUnitFilter as any);
  }

  const where = conditions.length > 0 ? and(...(conditions as any[])) : undefined;

  // ── Count + paginate ──
  const [{ total }] = await db.select({ total: count() }).from(unitsTable).where(where);
  const units = await db
    .select()
    .from(unitsTable)
    .where(where)
    .orderBy(unitsTable.building, unitsTable.unitNumber)
    .limit(limitNum)
    .offset(offset);

  const totalCount = Number(total);
  const totalPages = Math.ceil(totalCount / limitNum);

  if (units.length === 0) {
    // Also return the distinct building list for the filter dropdown
    const allBuildings = await db
      .selectDistinct({ building: unitsTable.building })
      .from(unitsTable)
      .where(eq(unitsTable.isSystem, false))
      .orderBy(unitsTable.building);
    return res.json({
      data: [],
      pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
      buildings: allBuildings.map(b => b.building),
      ...(name?.trim() ? { nameSearch: name.trim() } : {}),
      ...(nationalIdQuery ? { identifierMatch: false } : {}),
    });
  }

  const unitIds = units.map(u => u.id);
  const ownerIds = units.map(u => u.verifiedOwnerId).filter((id): id is number => id != null);
  const tenantIds = units.map(u => u.verifiedTenantId).filter((id): id is number => id != null);
  const allUserIds = [...new Set([...ownerIds, ...tenantIds])];

  // ── Batch-fetch related data ──
  const [
    users,
    residents,
    vehicles,
    canonicalParkingLots,
    wahaApps,
    permits,
    guestDayPasses,
    payments,
    bookings,
    tenantVerifications,
    hostVerifications,
    ownershipReleases,
    allBuildings,
  ] = await Promise.all([
    unitIds.length > 0
      ? db.select({
          id: usersTable.id,
          unitId: usersTable.unitId,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
          phone: usersTable.phone,
           clerkId: usersTable.clerkId,
          // UR1 / Decision 132: this field is selected only for the admin-only
          // Unit Registry contract. Every other endpoint keeps its projection
          // omission and response-boundary redaction.
          nationalId: usersTable.nationalId,
          verificationStatus: usersTable.verificationStatus,
           status: usersTable.status,
        }).from(usersTable).where(or(
          inArray(usersTable.id, allUserIds),
          inArray(usersTable.unitId, unitIds),
        ))
      : Promise.resolve([]),

    db.select({
      id: residentsTable.id,
      unitId: residentsTable.unitId,
      firstName: residentsTable.firstName,
      lastName: residentsTable.lastName,
      relationship: residentsTable.relationship,
      idNumber: residentsTable.idNumber,
          idNumberIsGuardian: residentsTable.idNumberIsGuardian,
      email: residentsTable.email,
      phone: residentsTable.phone,
      linkedUserId: residentsTable.linkedUserId,
      registeredById: residentsTable.registeredById,
      type: residentsTable.type,
      status: residentsTable.status,
       hasPortalAccess: residentsTable.hasPortalAccess,
    }).from(residentsTable)
      .where(and(inArray(residentsTable.unitId, unitIds), eq(residentsTable.status, "active"))),

    db.select({
      id: vehiclesTable.id,
      unitId: vehiclesTable.unitId,
      parkingLotId: vehiclesTable.parkingLotId,
      make: vehiclesTable.make,
      model: vehiclesTable.model,
      year: vehiclesTable.year,
      color: vehiclesTable.color,
      plateNumber: vehiclesTable.plateNumber,
      status: vehiclesTable.status,
    }).from(vehiclesTable)
      .where(and(inArray(vehiclesTable.unitId, unitIds))),

    // This normalized table is the canonical source for a vehicle's parking
    // assignment. Do not derive vehicle parking data from units.parkingLots.
    db.select({
      id: parkingLotsTable.id,
      unitId: parkingLotsTable.unitId,
      lotNumber: parkingLotsTable.lotNumber,
      parkingType: parkingLotsTable.parkingType,
    }).from(parkingLotsTable)
      .where(inArray(parkingLotsTable.unitId, unitIds)),

    db.select({
      id: wahaPassApplicationsTable.id,
      unitId: wahaPassApplicationsTable.unitId,
      occupancyTrack: wahaPassApplicationsTable.occupancyTrack,
      status: wahaPassApplicationsTable.status,
    }).from(wahaPassApplicationsTable)
      .where(inArray(wahaPassApplicationsTable.unitId, unitIds)),

    db.select({
      id: permitsTable.id,
      unitId: permitsTable.unitId,
      type: permitsTable.type,
      status: permitsTable.status,
      requestedStartDate: permitsTable.requestedStartDate,
      requestedEndDate: permitsTable.requestedEndDate,
      renovationScope: permitsTable.renovationScope,
      contractorName: permitsTable.contractorName,
      contractorContact: permitsTable.contractorContact,
      createdAt: permitsTable.createdAt,
      updatedAt: permitsTable.updatedAt,
    }).from(permitsTable)
      .where(inArray(permitsTable.unitId, unitIds)),

    db.select({
      id: wahaGuestDayPassesTable.id,
      unitId: wahaGuestDayPassesTable.unitId,
      date: wahaGuestDayPassesTable.date,
      guestCount: wahaGuestDayPassesTable.guestCount,
      extraGuestCount: wahaGuestDayPassesTable.extraGuestCount,
      vehiclePlate: wahaGuestDayPassesTable.vehiclePlate,
      amountSar: wahaGuestDayPassesTable.amountSar,
      paymentStatus: wahaGuestDayPassesTable.paymentStatus,
      issuedAt: wahaGuestDayPassesTable.issuedAt,
      revokedAt: wahaGuestDayPassesTable.revokedAt,
    }).from(wahaGuestDayPassesTable)
      .where(inArray(wahaGuestDayPassesTable.unitId, unitIds)),

    db.select({
      id: paymentAttemptsTable.id,
      unitId: paymentAttemptsTable.unitId,
      purpose: paymentAttemptsTable.purpose,
      amount: paymentAttemptsTable.amount,
      currency: paymentAttemptsTable.currency,
      status: paymentAttemptsTable.status,
      confirmedAt: paymentAttemptsTable.confirmedAt,
      createdAt: paymentAttemptsTable.createdAt,
    }).from(paymentAttemptsTable)
      .where(inArray(paymentAttemptsTable.unitId, unitIds)),

    db.select({
      id: bookingsTable.id,
      unitId: bookingsTable.unitId,
      facilityId: bookingsTable.facilityId,
      facilityName: bookingsTable.facilityName,
      startTime: bookingsTable.startTime,
      endTime: bookingsTable.endTime,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
    }).from(bookingsTable)
      .where(inArray(bookingsTable.unitId, unitIds)),

    // Approved tenant verifications → ejarReference for the *current* verified tenant only.
    // Filter by userId IN tenantIds so historical (now-removed) tenant verifications are excluded.
    // orderBy createdAt DESC so the most-recent approved record wins if there were duplicates.
    tenantIds.length > 0
      ? db.select({
          userId: unitVerificationsTable.userId,
          unitId: unitVerificationsTable.unitId,
          ejarReference: unitVerificationsTable.ejarReference,
        }).from(unitVerificationsTable)
          .where(and(
            inArray(unitVerificationsTable.unitId, unitIds),
            inArray(unitVerificationsTable.userId, tenantIds),
            eq(unitVerificationsTable.type, "tenant_request"),
            eq(unitVerificationsTable.status, "approved"),
          ))
      : Promise.resolve([]),

    db.select({
      userId: unitVerificationsTable.userId,
      unitId: unitVerificationsTable.unitId,
    }).from(unitVerificationsTable)
      .where(and(
        inArray(unitVerificationsTable.unitId, unitIds),
        eq(unitVerificationsTable.status, "approved"),
      )),

    db.select({
      unitId: ownershipChangeEventsTable.unitId,
      reviewedAt: ownershipChangeEventsTable.reviewedAt,
    }).from(ownershipChangeEventsTable)
      .where(and(
        inArray(ownershipChangeEventsTable.unitId, unitIds),
        eq(ownershipChangeEventsTable.status, "approved"),
      )),

    db.selectDistinct({ building: unitsTable.building })
      .from(unitsTable)
      .where(eq(unitsTable.isSystem, false))
      .orderBy(unitsTable.building),
  ]);

  const hostUserIds = [...new Set([
    ...users.map((user) => user.id),
    ...hostVerifications
      .map((verification) => verification.userId)
      .filter((id): id is number => id != null),
    ...residents
      .map((resident) => resident.linkedUserId)
      .filter((id): id is number => id != null),
  ])];
  const [guests, guestPasses, facilities] = await Promise.all([
    hostUserIds.length > 0
      ? db.select({
          id: guestsTable.id,
          residentId: guestsTable.residentId,
          firstName: guestsTable.firstName,
          lastName: guestsTable.lastName,
          vehiclePlate: guestsTable.vehiclePlate,
          visitDate: guestsTable.visitDate,
          visitReason: guestsTable.visitReason,
          status: guestsTable.status,
          createdAt: guestsTable.createdAt,
        }).from(guestsTable).where(inArray(guestsTable.residentId, hostUserIds))
      : Promise.resolve([]),
    hostUserIds.length > 0
      ? db.select({
          id: guestPassesTable.id,
          guestId: guestPassesTable.guestId,
          residentId: guestPassesTable.residentId,
          guestName: guestPassesTable.guestName,
          visitDate: guestPassesTable.visitDate,
          visitStartTime: guestPassesTable.visitStartTime,
          visitEndTime: guestPassesTable.visitEndTime,
          vehiclePlate: guestPassesTable.vehiclePlate,
          reasonForVisit: guestPassesTable.reasonForVisit,
          status: guestPassesTable.status,
          createdAt: guestPassesTable.createdAt,
        }).from(guestPassesTable).where(inArray(guestPassesTable.residentId, hostUserIds))
      : Promise.resolve([]),
    bookings.length > 0
      ? db.select({
          id: facilitiesTable.id,
          name: facilitiesTable.name,
        }).from(facilitiesTable).where(inArray(
          facilitiesTable.id,
          [...new Set(bookings.map((booking) => booking.facilityId))],
        ))
      : Promise.resolve([]),
  ]);

  // Waha pass credentials (keyed by applicationId)
  const appIds = wahaApps.map(a => a.id);
  const wahaCreds = appIds.length > 0
    ? await db.select({
        id: wahaPassCredentialsTable.id,
        applicationId: wahaPassCredentialsTable.applicationId,
        credentialIndex: wahaPassCredentialsTable.credentialIndex,
        passNumber: wahaPassCredentialsTable.passNumber,
        holderName: wahaPassCredentialsTable.holderName,
         heldByUserId: wahaPassCredentialsTable.heldByUserId,
        status: wahaPassCredentialsTable.status,
      }).from(wahaPassCredentialsTable)
        .where(inArray(wahaPassCredentialsTable.applicationId, appIds))
    : [];

  // ── Build lookup maps ──
  // Decision 132 is intentionally scoped here: only this admin-only registry
  // map contains users.nationalId. Never reuse it in a gate or resident route.
  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
  const residentsByUnit = new Map<number, typeof residents>();
  for (const r of residents) {
    if (r.unitId == null) continue;
    if (!residentsByUnit.has(r.unitId)) residentsByUnit.set(r.unitId, []);
    residentsByUnit.get(r.unitId)!.push(r);
  }
  const vehiclesByUnit = new Map<number, typeof vehicles>();
  for (const v of vehicles) {
    if (v.unitId == null) continue;
    if (!vehiclesByUnit.has(v.unitId)) vehiclesByUnit.set(v.unitId, []);
    vehiclesByUnit.get(v.unitId)!.push(v);
  }
  const parkingLotById = new Map(canonicalParkingLots.map((lot) => [lot.id, lot]));
  const appsByUnit = new Map<number, typeof wahaApps>();
  for (const a of wahaApps) {
    if (!appsByUnit.has(a.unitId)) appsByUnit.set(a.unitId, []);
    appsByUnit.get(a.unitId)!.push(a);
  }
  const credsByApp = new Map<number, typeof wahaCreds>();
  for (const c of wahaCreds) {
    if (!credsByApp.has(c.applicationId)) credsByApp.set(c.applicationId, []);
    credsByApp.get(c.applicationId)!.push(c);
  }
  const permitsByUnit = new Map<number, typeof permits>();
  for (const permit of permits) {
    if (permit.unitId == null) continue;
    if (!permitsByUnit.has(permit.unitId)) permitsByUnit.set(permit.unitId, []);
    permitsByUnit.get(permit.unitId)!.push(permit);
  }
  const dayPassesByUnit = new Map<number, typeof guestDayPasses>();
  for (const pass of guestDayPasses) {
    if (!dayPassesByUnit.has(pass.unitId)) dayPassesByUnit.set(pass.unitId, []);
    dayPassesByUnit.get(pass.unitId)!.push(pass);
  }
  const paymentsByUnit = new Map<number, typeof payments>();
  for (const payment of payments) {
    if (payment.unitId == null) continue;
    if (!paymentsByUnit.has(payment.unitId)) paymentsByUnit.set(payment.unitId, []);
    paymentsByUnit.get(payment.unitId)!.push(payment);
  }
  const facilitiesById = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const bookingsByUnit = new Map<number, Array<(typeof bookings)[number] & { resolvedFacilityName: string }>>();
  for (const booking of bookings) {
    const enrichedBooking = {
      ...booking,
      resolvedFacilityName: booking.facilityName ?? facilitiesById.get(booking.facilityId) ?? "Facility",
    };
    if (!bookingsByUnit.has(booking.unitId)) bookingsByUnit.set(booking.unitId, []);
    bookingsByUnit.get(booking.unitId)!.push(enrichedBooking);
  }
  const hostUnitByUserId = new Map<number, number>();
  for (const user of users) {
    if (user.unitId != null) hostUnitByUserId.set(user.id, user.unitId);
  }
  for (const verification of hostVerifications) {
    if (verification.userId != null) {
      hostUnitByUserId.set(verification.userId, verification.unitId);
    }
  }
  for (const unit of units) {
    if (unit.verifiedOwnerId != null) hostUnitByUserId.set(unit.verifiedOwnerId, unit.id);
    if (unit.verifiedTenantId != null) hostUnitByUserId.set(unit.verifiedTenantId, unit.id);
  }
  for (const resident of residents) {
    if (resident.linkedUserId != null && resident.unitId != null) {
      hostUnitByUserId.set(resident.linkedUserId, resident.unitId);
    }
  }
  const guestPassesByGuest = new Map<number, Array<(typeof guestPasses)[number]>>();
  for (const pass of guestPasses) {
    if (!guestPassesByGuest.has(pass.guestId)) guestPassesByGuest.set(pass.guestId, []);
    guestPassesByGuest.get(pass.guestId)!.push(pass);
  }
  const guestsByUnit = new Map<number, Array<(typeof guests)[number] & { passes: typeof guestPasses }>>();
  for (const guest of guests) {
    const unitId = hostUnitByUserId.get(guest.residentId);
    if (unitId == null) continue;
    if (!guestsByUnit.has(unitId)) guestsByUnit.set(unitId, []);
    guestsByUnit.get(unitId)!.push({
      ...guest,
      passes: guestPassesByGuest.get(guest.id) ?? [],
    });
  }
  // Ejar reference keyed by tenant userId (not unitId) so historical tenants never
  // bleed into the current tenant's record. The query above already filters by
  // inArray(userId, tenantIds) ensuring only currently-verified tenants are included.
  const ejarByTenant = new Map<number, string | null>();
  for (const v of tenantVerifications) {
    if (v.userId === null) continue;
    if (!ejarByTenant.has(v.userId)) {
      ejarByTenant.set(v.userId, v.ejarReference ?? null);
    }
  }
  const latestOwnershipReleaseByUnit = new Map<number, Date>();
  for (const event of ownershipReleases) {
    if (!event.reviewedAt) continue;
    const prior = latestOwnershipReleaseByUnit.get(event.unitId);
    if (!prior || event.reviewedAt.getTime() > prior.getTime()) {
      latestOwnershipReleaseByUnit.set(event.unitId, event.reviewedAt);
    }
  }

  // ── Assemble enriched units ──
  const data = units.map(unit => {
    const owner = unit.verifiedOwnerId ? (userMap[unit.verifiedOwnerId] ?? null) : null;
    const releasedAt = unit.verifiedOwnerId == null
      ? latestOwnershipReleaseByUnit.get(unit.id)
      : undefined;
    const ownerlessSince = releasedAt ?? (unit.verifiedOwnerId == null ? unit.createdAt : null);
    const ownerless = ownerlessSince
      ? {
          source: releasedAt ? "ownership_released" as const : "never_registered" as const,
          since: ownerlessSince.toISOString(),
          elapsedDays: Math.max(0, Math.floor((Date.now() - ownerlessSince.getTime()) / (24 * 60 * 60 * 1000))),
        }
      : null;
    const tenantUserRaw = unit.verifiedTenantId ? (userMap[unit.verifiedTenantId] ?? null) : null;
    const tenantUser = tenantUserRaw;
    const tenant = tenantUser
      ? {
          ...tenantUser,
          ejarReference: unit.verifiedTenantId != null
            ? (ejarByTenant.get(unit.verifiedTenantId) ?? null)
            : null,
        }
      : null;

    let parkingLots: unknown[] = [];
    if (unit.parkingLots) {
      try { parkingLots = JSON.parse(unit.parkingLots); } catch {}
    }

    const unitWahaApps = appsByUnit.get(unit.id) ?? [];
    const wahaPasses = unitWahaApps.map(a => ({
      id: a.id,
      occupancyTrack: a.occupancyTrack,
      status: a.status,
      credentials: credsByApp.get(a.id) ?? [],
    }));

    return {
      id: unit.id,
      building: unit.building,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      unitType: unit.unitType,
      sizeSqm: unit.sizeSqm,
      occupantType: unit.occupantType,
      parkingLots,
      owner,
      ownerless,
      tenant,
      // Before self-registration became an explicit resident action, owner
      // verification created an owner resident stub. That identity is already
      // shown in Owner, so omit only those legacy stubs. A current owner who
      // deliberately registers as a resident has registeredById populated and
      // remains visible here.
      residents: (residentsByUnit.get(unit.id) ?? [])
        .filter((resident) => !(
          resident.type === "owner"
          && resident.linkedUserId === unit.verifiedOwnerId
          && resident.registeredById === null
        ))
        .map((resident) => {
         const linkedUser = resident.linkedUserId == null ? null : userMap[resident.linkedUserId] ?? null;
         const hasActiveWahaCredential = wahaPasses.some((pass) =>
           pass.credentials.some((credential) =>
             credential.status === "active" && credential.heldByUserId === resident.linkedUserId));
        const {
          linkedUserId: _linkedUserId,
          registeredById: _registeredById,
          ...registryResident
        } = resident;
         return {
           ...registryResident,
           // The resident flag alone is only an invitation/request. Access is
           // real only when it is linked to a live Clerk identity and an active
           // local account can sign in.
           portalAccess: Boolean(resident.hasPortalAccess && linkedUser?.clerkId && linkedUser.status === "active"),
           hasActiveWahaCredential,
         };
      }),
       vehicles: (vehiclesByUnit.get(unit.id) ?? []).map((vehicle) => {
         const parkingLot = vehicle.parkingLotId == null
           ? null
           : parkingLotById.get(vehicle.parkingLotId) ?? null;
         return {
           ...vehicle,
           parkingLotNumber: parkingLot?.unitId === unit.id ? parkingLot.lotNumber : null,
           parkingType: parkingLot?.unitId === unit.id ? parkingLot.parkingType : null,
           underground: parkingLot?.unitId === unit.id
             ? parkingLot.parkingType === "underground"
             : false,
         };
       }),
      wahaPasses,
      permits: (permitsByUnit.get(unit.id) ?? []).sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()),
      guests: (guestsByUnit.get(unit.id) ?? []).sort((a, b) =>
        b.visitDate.localeCompare(a.visitDate)),
      guestDayPasses: (dayPassesByUnit.get(unit.id) ?? []).sort((a, b) =>
        b.date.localeCompare(a.date)),
      payments: (paymentsByUnit.get(unit.id) ?? []).sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()),
      bookings: (bookingsByUnit.get(unit.id) ?? []).sort((a, b) =>
        b.startTime.getTime() - a.startTime.getTime()),
    };
  });

  res.json({
    data,
    pagination: { page: pageNum, limit: limitNum, total: totalCount, totalPages },
    buildings: allBuildings.map(b => b.building),
    ...(name?.trim() ? { nameSearch: name.trim() } : {}),
    ...(nationalIdQuery ? { identifierMatch: data.length > 0 } : {}),
  });
});

// ── GET /admin/units/:unitId/registry-check — B5 ownership record check ──────
// The legacy unit_registry import was removed. This diagnostic deliberately
// reads the live unit ownership record so it cannot report stale import data.
router.get("/admin/units/:unitId/registry-check", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const unitId = Number(req.params.unitId);
  if (!Number.isFinite(unitId)) return res.status(400).json({ error: "Invalid unitId" });

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  let verifiedOwnerName: string | null = null;

  if (unit.verifiedOwnerId) {
    const [ownerUser] = await db.select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    }).from(usersTable).where(eq(usersTable.id, unit.verifiedOwnerId));

    if (ownerUser) {
      verifiedOwnerName = `${ownerUser.firstName ?? ""} ${ownerUser.lastName ?? ""}`.trim() || null;
    }
  }

  res.json({
    unitId,
    unitRecord: {
      id: unit.id,
      building: unit.building,
      unitNumber: unit.unitNumber,
      titleReference: unit.titleReference,
      isVerified: unit.verifiedOwnerId !== null,
    },
    verifiedOwnerName,
  });
});

export default router;
