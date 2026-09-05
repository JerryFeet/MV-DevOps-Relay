import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireApiAuth, requireApiAuthForProvisioning } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import { usersTable, residentsTable, householdInvitationsTable, permitsTable, unitsTable, notificationPreferencesTable, vehiclesTable, notificationEventsTable, dataMigrationCorrectionsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { canonicalizePhone } from "../lib/phoneCanonical";
import { enforceDurableRateLimit, rateLimitUserSubject } from "../lib/durableRateLimit";
import { GATE_ROLES } from "../lib/roles";
import {
  GATE_IDENTIFIER_FAILURE_MESSAGE,
  gateIdentifierSubject,
  searchGateResidents,
} from "../lib/gateResidentSearch";
import { gatePlateSubject, lookupGatePlate, normalizePlateNumber } from "../lib/gatePlateLookup";
import {
  normalizeGateUnitNumber,
  projectMoveInPermit,
  projectMoveOutPermit,
  projectRenovationPermit,
} from "../lib/gatePermitProjection";
import { consumeInvitationLinkage } from "../lib/occupancy";
import { canonicalUnitReferenceMap } from "../lib/unitReference";

const router = Router();

function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "guard";
}

function optionalTrimmedName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type SyncDbClient = typeof db;

type SyncProvisioningInput = {
  clerkId: string;
  email: unknown;
  firstName: unknown;
  lastName: unknown;
};

const INITIAL_ADMIN_EMAILS_ENV = "PORTAL_INITIAL_ADMIN_EMAILS";
const INITIAL_ADMIN_ISSUE_CODE = "initial_admin_bootstrap";

export function parseInitialAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  );
}

async function clerkVerifiedBootstrapEmail(clerkId: string): Promise<string | null> {
  const configured = parseInitialAdminEmails(process.env[INITIAL_ADMIN_EMAILS_ENV]);
  if (configured.size === 0) return null;

  // Bootstrap must never turn normal profile synchronization into a 500 when
  // Clerk is temporarily unavailable. It is an optional, one-time elevation
  // check; failing closed simply means no elevation is granted.
  let clerkUser: Awaited<ReturnType<typeof clerkClient.users.getUser>>;
  try {
    clerkUser = await clerkClient.users.getUser(clerkId);
  } catch {
    return null;
  }
  const verifiedEmails = (clerkUser.emailAddresses ?? [])
    .filter((entry: { verification?: { status?: string } | null }) =>
      entry.verification?.status === "verified")
    .map((entry: { emailAddress: string }) => entry.emailAddress.trim().toLowerCase());
  return verifiedEmails.find((email: string) => configured.has(email)) ?? null;
}

/**
 * Consume one configured initial-admin address exactly once.
 *
 * The durable correction row is both the audit record and the permanent
 * consumption marker. Once it exists, a later role removal is authoritative:
 * subsequent sign-ins can never re-grant admin.
 */
export async function applyInitialAdminBootstrap(
  user: typeof usersTable.$inferSelect,
): Promise<typeof usersTable.$inferSelect> {
  const verifiedEmail = await clerkVerifiedBootstrapEmail(user.clerkId);
  if (!verifiedEmail) return user;

  return db.transaction(async (tx) => {
    const [lockedUser] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .for("update");
    if (!lockedUser) throw new Error("Bootstrap user disappeared");

    const [consumed] = await tx
      .select()
      .from(dataMigrationCorrectionsTable)
      .where(and(
        eq(dataMigrationCorrectionsTable.entityType, "user_role"),
        eq(dataMigrationCorrectionsTable.sourceReference, verifiedEmail),
        eq(dataMigrationCorrectionsTable.issueCode, INITIAL_ADMIN_ISSUE_CODE),
      ));
    if (consumed) return lockedUser;

    const eligibleForGrant =
      lockedUser.role === "tenant"
      && lockedUser.unitId === null
      && lockedUser.verificationStatus === "unverified";
    const outcome = eligibleForGrant
      ? "granted"
      : lockedUser.role === "admin"
        ? "already_admin_registered"
        : "refused_non_pristine_account";

    const [claim] = await tx
      .insert(dataMigrationCorrectionsTable)
      .values({
        entityType: "user_role",
        sourceReference: verifiedEmail,
        issueCode: INITIAL_ADMIN_ISSUE_CODE,
        rawPayload: {
          userId: lockedUser.id,
          roleBefore: lockedUser.role,
          roleAfter: eligibleForGrant ? "admin" : lockedUser.role,
          outcome,
          source: INITIAL_ADMIN_EMAILS_ENV,
        },
        details: "One-time initial administrator bootstrap evaluated after Clerk-verified sign-in.",
        status: "resolved",
        resolvedAt: new Date(),
        resolvedById: "system:initial-admin-bootstrap",
      })
      .onConflictDoNothing({
        target: [
          dataMigrationCorrectionsTable.entityType,
          dataMigrationCorrectionsTable.sourceReference,
          dataMigrationCorrectionsTable.issueCode,
        ],
      })
      .returning();
    if (!claim || !eligibleForGrant) return lockedUser;

    const [promoted] = await tx
      .update(usersTable)
      .set({ role: "admin" })
      .where(and(
        eq(usersTable.id, lockedUser.id),
        eq(usersTable.clerkId, lockedUser.clerkId),
        eq(usersTable.role, "tenant"),
      ))
      .returning();
    if (!promoted) throw new Error("Initial administrator bootstrap lost its locked user");
    return promoted;
  });
}

/**
 * Atomically provision the app-user row for a signed-in Clerk identity.
 *
 * The unique clerk_id constraint is the concurrency boundary: every first
 * sign-in uses one INSERT … ON CONFLICT … DO UPDATE … RETURNING statement
 * instead of a read-then-insert race. The conflict action deliberately leaves
 * suspended rows untouched, then callers must evaluate the returned status
 * before they do any further work or return the user to the portal.
 */
export async function provisionUserForSync(
  dbClient: SyncDbClient,
  { clerkId, email, firstName, lastName }: SyncProvisioningInput,
) {
  const incomingEmail = typeof email === "string" ? email : "";
  const incomingFirstName = optionalTrimmedName(firstName);
  const incomingLastName = optionalTrimmedName(lastName);

  const [resolvedUser] = await dbClient
    .insert(usersTable)
    .values({
      clerkId,
      email: incomingEmail,
      firstName: incomingFirstName,
      lastName: incomingLastName,
      role: "tenant",
      status: "pending",
      verificationStatus: "unverified",
    })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      // A suspension is authoritative. The statement returns the existing
      // suspended row without changing its profile or status, so the caller
      // can fail closed after the atomic conflict resolution below.
      set: {
        email: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.email}
          ELSE excluded.email
        END`,
        firstName: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.firstName}
          WHEN NULLIF(BTRIM(${usersTable.firstName}), '') IS NULL THEN excluded.first_name
          ELSE ${usersTable.firstName}
        END`,
        lastName: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.lastName}
          WHEN NULLIF(BTRIM(${usersTable.lastName}), '') IS NULL THEN excluded.last_name
          ELSE ${usersTable.lastName}
        END`,
      },
    })
    .returning();

  if (!resolvedUser) {
    throw new Error("Unable to resolve user during profile synchronization");
  }

  // This check intentionally happens AFTER the upsert. Checking before it
  // would reintroduce a race where a concurrent first sync could insert or
  // overwrite a row between the read and the write.
  if (resolvedUser.status === "suspended") {
    return { user: resolvedUser, suspended: true as const };
  }

  return { user: resolvedUser, suspended: false as const };
}

/**
 * Consume a household invitation token (single-use).
 *
 * Security model:
 * - The caller must present the raw invitation TOKEN (from the invite URL);
 *   an email address alone is never sufficient.
 * - The invitation's invitedEmail must match one of the caller's VERIFIED
 *   email addresses as reported by Clerk (server-side lookup — the request
 *   body is not trusted for this check).
 * - Consumption + ALL linkage writes (invitation → accepted, resident link,
 *   user unit linkage) happen in ONE transaction that row-locks the
 *   invitation (`SELECT ... FOR UPDATE`). A concurrent revoke also locks the
 *   invitation row before acting, so either it waits for this transaction to
 *   commit (and then sees the accepted state + linked user to fully unlink),
 *   or it commits first (and this consume finds the row no longer pending
 *   and links nothing). No interleaving can leave a revoked invitation with
 *   a still-linked user.
 */
export async function consumeHouseholdInvitation(userId: number, clerkId: string, token: string | undefined | null) {
  if (!token || typeof token !== "string") return null;

  // Cheap pre-read (no lock) so obviously-invalid tokens skip the Clerk call.
  const [preview] = await db.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.token, token));
  if (!preview || preview.status !== "pending") return null;
  if (preview.expiresAt && new Date(preview.expiresAt) < new Date()) return null;

  // Server-side verified-email check against Clerk — never trust the body.
  // Done OUTSIDE the transaction so no row lock is held across a network call.
  let clerkEmails: string[] = [];
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    clerkEmails = (clerkUser.emailAddresses ?? [])
      .filter((e: { verification?: { status?: string } | null }) =>
        e.verification?.status === "verified")
      .map((e: { emailAddress: string }) => e.emailAddress.toLowerCase());
  } catch {
    return null;
  }
  if (!clerkEmails.includes(preview.invitedEmail.toLowerCase())) return null;

  return db.transaction((tx) =>
    consumeInvitationLinkage(tx, { userId, token, isStaff: isStaffRole }));
}

router.get("/users/me", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.status === "suspended") {
    return res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
  }
  res.json(user);
});

router.put("/users/me", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const { firstName, middleName, lastName, phone, unitNumber } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (isStaffRole(existing.role) && unitNumber !== undefined && unitNumber !== null) {
    return res.status(403).json({ error: "STAFF_UNIT_LINKAGE_FORBIDDEN" });
  }

  const phoneResult = canonicalizePhone(phone);
  if (!phoneResult.ok) {
    return res.status(422).json({ error: phoneResult.error });
  }

  const [user] = await db
    .update(usersTable)
    .set({
      firstName,
      middleName,
      lastName,
      phone: phoneResult.e164 ?? undefined,
      phoneNormalized: phoneResult.e164 ?? undefined,
      unitNumber,
    })
    .where(eq(usersTable.clerkId, clerkId))
    .returning();
  res.json(user);
});

// ── PATCH /users/me/name — required profile-completion gate ──────────────────
router.patch("/users/me/name", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const firstName = optionalTrimmedName(req.body?.firstName);
  const lastName = optionalTrimmedName(req.body?.lastName);
  const middleName = optionalTrimmedName(req.body?.middleName);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "firstName and lastName are required" });
  }

  const [user] = await db.update(usersTable)
    .set({ firstName, middleName, lastName })
    .where(eq(usersTable.clerkId, clerkId))
    .returning();
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

router.post("/users/me/sync", requireApiAuthForProvisioning, async (req, res) => {
  const clerkId = req.auth().userId!;
  if (!await enforceDurableRateLimit(
    req,
    res,
    { scope: "user_sync", minuteLimit: 30, dayLimit: 300 },
    rateLimitUserSubject(clerkId),
  )) return;
  const { email, firstName, lastName, inviteToken } = req.body;
  const resolved = await provisionUserForSync(db, { clerkId, email, firstName, lastName });
  if (resolved.suspended) {
    res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
    return;
  }

  // Auto-link a pending household invitation, but never overwrite an existing
  // unit linkage or a stronger verification status. Concurrent sync calls may
  // both reach this branch; the invitation transaction serializes consumption.
  const bootstrappedUser = await applyInitialAdminBootstrap(resolved.user);

  if (
    !isStaffRole(bootstrappedUser.role)
    && !bootstrappedUser.unitId
    && bootstrappedUser.verificationStatus !== "verified_owner"
    && bootstrappedUser.verificationStatus !== "verified_tenant"
  ) {
    await consumeHouseholdInvitation(bootstrappedUser.id, clerkId, inviteToken);
  }

  // Re-read after invitation consumption so every concurrent caller receives
  // the canonical linked row rather than a stale pre-link snapshot.
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, bootstrappedUser.id));
  if (!user) {
    throw new Error("Resolved user disappeared after profile synchronization");
  }
  if (user.status === "suspended") {
    res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
    return;
  }
  res.json(user);
});

router.get("/users", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { role, status, search, all } = req.query as Record<string, string>;

  const storedUsers = await db.select().from(usersTable);
  const allRows = await Promise.all(storedUsers.map(async (user) => {
    const [preferences] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, user.id));
    return {
      ...user,
      receivesApprovalNotifications: preferences?.receivesApprovalNotifications ?? false,
    };
  }));

  const searchLc = search?.toLowerCase().trim() ?? "";
  const filtered = allRows.filter(u =>
    (!role || u.role === role) &&
    (!status || u.status === status) &&
    (!searchLc || [u.firstName, u.lastName, u.email].some(f => f?.toLowerCase().includes(searchLc)))
  );

  // ?all=true — return every matching row as a flat array (no pagination cap).
  // Used by internal lookups (e.g. Waha Pass actor names) that need the full set.
  if (all === "true") {
    return res.json(filtered);
  }

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  res.json(paginatedResponse(paginated, total, page, limit));
});

router.get("/users/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user) return res.status(404).json({ error: "User not found" });
  const notificationFailures = await db
    .select({
      status: notificationEventsTable.status,
      channel: notificationEventsTable.channel,
      createdAt: notificationEventsTable.createdAt,
    })
    .from(notificationEventsTable)
    .where(and(
      eq(notificationEventsTable.recipientUserId, user.id),
      inArray(notificationEventsTable.status, ["retrying", "failed"]),
    ));
  const failed = notificationFailures.filter((event) => event.status === "failed");
  const retrying = notificationFailures.filter((event) => event.status === "retrying");
  const oldestFailure = failed
    .map((event) => event.createdAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  res.json({
    ...user,
    notificationFailureSummary: {
      retryingCount: retrying.length,
      failedCount: failed.length,
      oldestFailure,
    },
  });
});

router.patch("/users/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { role, status, unitNumber, receivesApprovalNotifications } = req.body;
  if (role === "admin") {
    return res.status(403).json({
      error: "ADMIN_ROLE_RESTRICTED",
      message: "The Admin role cannot be assigned through the portal. Contact the system administrator directly.",
    });
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!target) return res.status(404).json({ error: "User not found" });
  const nextRole = role ?? target.role;
  if (isStaffRole(nextRole) && target.unitId !== null) {
    return res.status(422).json({
      error: "STAFF_UNIT_LINKAGE_FORBIDDEN",
      message: "An account linked to a unit cannot be assigned a staff role.",
    });
  }
  if (isStaffRole(nextRole) && unitNumber !== undefined && unitNumber !== null) {
    return res.status(422).json({ error: "STAFF_UNIT_LINKAGE_FORBIDDEN" });
  }
  const [user] = await db
    .update(usersTable)
    .set({ role, status, unitNumber: isStaffRole(nextRole) ? null : unitNumber })
    .where(eq(usersTable.id, Number(req.params.id)))
    .returning();
  if (typeof receivesApprovalNotifications === "boolean") {
    await db
      .insert(notificationPreferencesTable)
      .values({
        userId: target.id,
        receivesApprovalNotifications,
      })
      .onConflictDoUpdate({
        target: notificationPreferencesTable.userId,
        set: { receivesApprovalNotifications },
      });
  }
  res.json(user);
});

// ─── GET /gate/residents — guard/admin: privacy-safe resident lookup ─────────
router.get("/gate/residents", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const query = req.query as Record<string, string | undefined>;
  const nationalId = query.nationalId;
  const unitNumber = query.unitNumber;
  const name = query.name;

  if (nationalId !== undefined) {
    const identifierValue = typeof nationalId === "string" ? nationalId : "";
    const accountAllowed = await enforceDurableRateLimit(
      req,
      res,
      { scope: "gate_national_id_account", minuteLimit: 5, dayLimit: 100 },
      rateLimitUserSubject(clerkId),
    );
    if (!accountAllowed) return;

    const identifierAllowed = await enforceDurableRateLimit(
      req,
      res,
      { scope: "gate_national_id_value", minuteLimit: 5, dayLimit: 100 },
      gateIdentifierSubject(identifierValue),
    );
    if (!identifierAllowed) return;
  }

  const unitKey = unitNumber === undefined ? null : normalizeGateUnitNumber(unitNumber);
  const [resolvedUnit] = unitNumber === undefined || !unitKey
    ? [null]
    : await db.select({
      id: unitsTable.id,
      building: unitsTable.building,
      unitNumber: unitsTable.unitNumber,
    }).from(unitsTable).where(eq(unitsTable.normalisedUnitNumber, unitKey));
  // Unit-reference lookup is intentionally a separate authoritative path:
  // resolve units.normalisedUnitNumber, then retrieve only records linked by
  // unitId. users.unitNumber is a legacy display field and cannot distinguish
  // e.g. CE34 from another building's apartment 34.
  const allRows = await db.select({
    unitId: usersTable.unitId,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    nationalId: usersTable.nationalId,
    role: usersTable.role,
  }).from(usersTable).where(unitNumber === undefined
    ? undefined
    : resolvedUnit
      ? and(eq(usersTable.unitId, resolvedUnit.id), inArray(usersTable.role, ["owner", "tenant"]))
      : sql`false`);
  const householdRows = await db.select({
    unitId: residentsTable.unitId,
    firstName: residentsTable.firstName,
    lastName: residentsTable.lastName,
    nationalId: residentsTable.idNumber,
    role: residentsTable.type,
    relationship: residentsTable.relationship,
    idNumberIsGuardian: residentsTable.idNumberIsGuardian,
  }).from(residentsTable).where(unitNumber === undefined
    ? eq(residentsTable.status, "active")
    : resolvedUnit
      ? and(eq(residentsTable.status, "active"), eq(residentsTable.unitId, resolvedUnit.id))
      : sql`false`);
  const unitReferences = await canonicalUnitReferenceMap([
    ...allRows.map((row) => row.unitId),
    ...householdRows.map((row) => row.unitId),
  ]);
  const result = searchGateResidents([
    ...allRows
      .filter(row => ["owner", "tenant"].includes(row.role ?? ""))
      .map(row => ({ ...row, unitNumber: unitReferences.get(row.unitId ?? -1) ?? "—", eligible: true })),
    ...householdRows.map(row => ({ ...row, unitNumber: unitReferences.get(row.unitId ?? -1) ?? "—", eligible: true })),
  ], { name, nationalId, unitNumber, unitId: resolvedUnit?.id ?? null });

  if (nationalId !== undefined && result.failedIdentifierLookup) {
    req.log?.warn?.({
      event: "gate_national_id_lookup_failed",
      subject: gateIdentifierSubject(typeof nationalId === "string" ? nationalId : ""),
      reason: "malformed_or_not_found",
      message: GATE_IDENTIFIER_FAILURE_MESSAGE,
      clerkId,
    }, "Gate National ID lookup failed");
    // Unknown, malformed, and non-matching identifiers intentionally share the
    // exact same response so the endpoint cannot be used as an ID oracle.
    return res.json([]);
  }

  res.json(result.matches);
});

// ─── GET /gate/plate-lookup?plate= — guard/admin exact active-vehicle lookup ─
router.get("/gate/plate-lookup", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rawPlate = typeof req.query.plate === "string" ? req.query.plate : "";
  const normalizedPlate = normalizePlateNumber(rawPlate);
  const accountAllowed = await enforceDurableRateLimit(
    req,
    res,
    { scope: "gate_plate_account", minuteLimit: 10, dayLimit: 100 },
    rateLimitUserSubject(clerkId),
  );
  if (!accountAllowed) return;
  const plateAllowed = await enforceDurableRateLimit(
    req,
    res,
    { scope: "gate_plate_value", minuteLimit: 5, dayLimit: 100 },
    gatePlateSubject(normalizedPlate),
  );
  if (!plateAllowed) return;

  // The projection intentionally contains only the gate response fields. It
  // never loads registration documents, owner IDs, contact data, or vehicle IDs.
  const activeVehicles = await db.select({
    plateNumber: vehiclesTable.plateNumber,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    unitId: usersTable.unitId,
    make: vehiclesTable.make,
    model: vehiclesTable.model,
    color: vehiclesTable.color,
  })
    .from(vehiclesTable)
    .innerJoin(usersTable, eq(vehiclesTable.userId, usersTable.id))
    .where(eq(vehiclesTable.status, "active"));

  const unitReferences = await canonicalUnitReferenceMap(activeVehicles.map((vehicle) => vehicle.unitId));
  const result = lookupGatePlate(activeVehicles.map((vehicle) => ({
    ...vehicle,
    unitNumber: unitReferences.get(vehicle.unitId ?? -1) ?? "—",
  })), normalizedPlate);
  if (result.status === "not_registered") {
    req.log?.warn?.({
      event: "gate_plate_lookup_not_registered",
      subject: gatePlateSubject(normalizedPlate),
      clerkId,
    }, "Gate plate lookup did not match an active vehicle");
  }
  res.json(result);
});

// ─── GET /gate/move-out-status?unitNumber= — guard/admin permit check ─────────
router.get("/gate/move-out-status", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rawUnit = typeof req.query.unitNumber === "string" ? req.query.unitNumber : "";
  const unitKey = normalizeGateUnitNumber(rawUnit);
  if (!unitKey) return res.status(400).json({ error: "unitNumber is required" });

  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitKey));
  const permits = await db.select({
    unitId: permitsTable.unitId,
    unitNumber: permitsTable.unitNumber,
    type: permitsTable.type,
    status: permitsTable.status,
    requestedStartDate: permitsTable.requestedStartDate,
    requestedEndDate: permitsTable.requestedEndDate,
  }).from(permitsTable).where(eq(permitsTable.type, "move_out"));

  res.json(projectMoveOutPermit(permits, { unitId: unit?.id ?? null, rawUnitNumber: rawUnit }));
});

// ─── GET /gate/move-in-status?unitNumber= — guard/admin permit check ──────────
router.get("/gate/move-in-status", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rawUnit = typeof req.query.unitNumber === "string" ? req.query.unitNumber : "";
  const unitKey = normalizeGateUnitNumber(rawUnit);
  if (!unitKey) return res.status(400).json({ error: "unitNumber is required" });

  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitKey));
  const permits = await db.select({
    unitId: permitsTable.unitId,
    unitNumber: permitsTable.unitNumber,
    type: permitsTable.type,
    status: permitsTable.status,
    requestedStartDate: permitsTable.requestedStartDate,
    requestedEndDate: permitsTable.requestedEndDate,
  }).from(permitsTable).where(eq(permitsTable.type, "move_in"));

  res.json(projectMoveInPermit(permits, { unitId: unit?.id ?? null, rawUnitNumber: rawUnit }));
});

// ─── GET /gate/renovation-status?unitNumber= — guard/admin permit check ───────
router.get("/gate/renovation-status", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !GATE_ROLES.includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rawUnit = typeof req.query.unitNumber === "string" ? req.query.unitNumber : "";
  const unitKey = normalizeGateUnitNumber(rawUnit);
  if (!unitKey) return res.status(400).json({ error: "unitNumber is required" });

  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitKey));
  const permits = await db.select({
    unitId: permitsTable.unitId,
    unitNumber: permitsTable.unitNumber,
    type: permitsTable.type,
    status: permitsTable.status,
    requestedStartDate: permitsTable.requestedStartDate,
    requestedEndDate: permitsTable.requestedEndDate,
    contractorName: permitsTable.contractorName,
    contractorContact: permitsTable.contractorContact,
  }).from(permitsTable).where(eq(permitsTable.type, "renovation"));

  res.json(projectRenovationPermit(permits, { unitId: unit?.id ?? null, rawUnitNumber: rawUnit }));
});

export default router;
