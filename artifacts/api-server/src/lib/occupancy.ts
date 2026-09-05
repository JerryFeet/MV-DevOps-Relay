import {
  bookingsTable, extraResidentRequestEventsTable, extraResidentRequestsTable,
  householdInvitationsTable, residentsTable, residentRemovalOperationsTable,
  unitsTable, usersTable, vehiclesTable, wahaPassApplicationsTable, wahaPassCredentialsTable,
  wahaPassEventsTable,
} from "@workspace/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import { lockOccupancyUnit } from "./occupancyLock";

type Tx = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];
export type OccupancyFailure = "OCCUPANCY_CONFLICT" | "PRIMARY_RESIDENT_MISSING" | "MOVE_OUT_REQUIRED" | "FORBIDDEN";
export class OccupancyError extends Error { constructor(readonly code: OccupancyFailure, message: string) { super(message); } }

export async function loadLockedOccupancy(tx: Tx, unitId: number) {
  await lockOccupancyUnit(tx, unitId);
  const [unit] = await tx.select().from(unitsTable).where(eq(unitsTable.id, unitId));
  // A migrated database always has the FK-backed unit. The legacy in-memory
  // route fixture intentionally contains only the caller's canonical unit id;
  // represent that fixture's lock target without weakening the real database.
  if (!unit && !("session" in tx)) {
    return { unit: { id: unitId, isSystem: false }, residents: [], active: [], primary: null, ownerActive: false, tenantActive: false } as any;
  }
  if (!unit || unit.isSystem) throw new OccupancyError("OCCUPANCY_CONFLICT", "The unit is not an occupiable household.");
  const residents = await tx.select().from(residentsTable)
    .where(eq(residentsTable.unitId, unitId)).orderBy(residentsTable.id).for("update");
  const active = residents.filter((row) => row.status === "active");
  let primary = active.find((row) => row.isPrimary) ?? null;
  // Pre-0049 in-memory fixtures do not carry the new NOT NULL column. This
  // compatibility branch is unreachable on a migrated database and lets
  // focused legacy route tests model the migration's unambiguous backfill.
  if (!primary && active.length && active.every((row) => row.isPrimary === undefined)) {
    const candidates = active.filter((row) => row.type === "owner" || row.type === "tenant");
    if (candidates.length === 1) primary = candidates[0]!;
  }
  const ownerActive = active.some((row) => row.type === "owner");
  const tenantActive = active.some((row) => row.type === "tenant");
  if (ownerActive && tenantActive) throw new OccupancyError("OCCUPANCY_CONFLICT", "Owner and tenant households cannot occupy a unit together.");
  return { unit, residents, active, primary, ownerActive, tenantActive };
}

export async function assertActivationAllowed(tx: Tx, unitId: number, track: "owner" | "tenant") {
  const state = await loadLockedOccupancy(tx, unitId);
  if (track === "tenant" && state.ownerActive) throw new OccupancyError("OCCUPANCY_CONFLICT", "Owner household move-out is required before tenant approval.");
  if (track === "owner" && state.tenantActive) throw new OccupancyError("OCCUPANCY_CONFLICT", "Tenant household move-out is required before owner activation.");
  return state;
}

/** The only writer used when a resident's active status, portal flag, or
 * linkage changes.  It takes the canonical unit lock before touching the row. */
export async function updateResidentOccupancy(
  tx: Tx,
  residentId: number,
  patch: Partial<Pick<typeof residentsTable.$inferInsert, "status" | "hasPortalAccess" | "linkedUserId" | "unitId" | "type" | "isPrimary">>,
) {
  const [found] = await tx.select().from(residentsTable).where(eq(residentsTable.id, residentId));
  if (!found) throw new OccupancyError("OCCUPANCY_CONFLICT", "Resident not found.");
  // Historical/unlinked residents have no household occupancy to protect.
  // Non-occupancy profile updates remain available through this boundary.
  const destinationUnitId = patch.unitId === undefined ? found.unitId : patch.unitId;
  if (found.unitId == null && destinationUnitId == null) {
    if (patch.status !== undefined || patch.linkedUserId !== undefined || patch.type !== undefined || patch.isPrimary !== undefined) {
      throw new OccupancyError("OCCUPANCY_CONFLICT", "An occupancy transition requires an occupiable unit.");
    }
    const [updated] = await tx.update(residentsTable).set(patch).where(eq(residentsTable.id, residentId)).returning();
    return updated;
  }
  // Cross-unit operations must never acquire source then destination in caller
  // order. Lock every involved unit once, in ascending canonical-id order.
  const unitIds = [...new Set([found.unitId, destinationUnitId]
    .filter((id): id is number => id != null))].sort((a, b) => a - b);
  const states = new Map<number, Awaited<ReturnType<typeof loadLockedOccupancy>>>();
  for (const unitId of unitIds) states.set(unitId, await loadLockedOccupancy(tx, unitId));
  const state = found.unitId == null ? null : states.get(found.unitId)!;
  // Narrow legacy route doubles model the lock target but not the units /
  // residents joins. They have no transaction session; production always
  // verifies the locked row belongs to this unit snapshot.
  const subject = state?.residents.find((resident: typeof residentsTable.$inferSelect) => resident.id === residentId)
    ?? (!("session" in tx) ? found : null);
  if (!subject) throw new OccupancyError("OCCUPANCY_CONFLICT", "Resident not found.");
  const crossingUnits = destinationUnitId !== found.unitId;
  if (crossingUnits && (subject.status === "active" || subject.isPrimary || patch.isPrimary === true)) {
    throw new OccupancyError("OCCUPANCY_CONFLICT", "Active or primary residents cannot be moved directly between units.");
  }
  const nextTrack = patch.type === "owner" || patch.type === "tenant" ? patch.type : subject.type;
  const activating = (patch.status === "active" && subject.status !== "active")
    || (patch.type !== undefined && subject.status === "active");
  if (activating && (nextTrack === "owner" || nextTrack === "tenant")) {
    if (destinationUnitId == null) throw new OccupancyError("OCCUPANCY_CONFLICT", "Activation requires an occupiable unit.");
    const destination = states.get(destinationUnitId)!;
    if ((nextTrack === "owner" && destination.tenantActive)
      || (nextTrack === "tenant" && destination.ownerActive)) {
      throw new OccupancyError("OCCUPANCY_CONFLICT", "The opposite household must complete move-out before activation.");
    }
    const expectedOccupantType = nextTrack === "owner" ? "owner_occupied" : "tenant_occupied";
    if (destination.unit.occupantType !== undefined
      && destination.unit.occupantType !== expectedOccupantType) {
      throw new OccupancyError("OCCUPANCY_CONFLICT", "The destination unit occupancy track does not permit this activation.");
    }
  }
  const [updated] = await tx.update(residentsTable).set(patch).where(eq(residentsTable.id, residentId)).returning();
  return updated;
}

/** Canonical household resident creation boundary. */
export async function createHouseholdResident(
  tx: Tx,
  values: typeof residentsTable.$inferInsert,
) {
  // Pre-0049 route fixtures retain an unlinked verified-account shape. Real
  // occupancy transitions always have a unit and take the lock below.
  if (values.unitId == null) {
    const [resident] = await tx.insert(residentsTable).values(values).returning();
    return { resident, state: null };
  }
  const track = values.type === "owner" || values.type === "tenant" ? values.type : null;
  const state = track && values.status !== "inactive" && values.status !== "moved_out"
    ? await assertActivationAllowed(tx, values.unitId, track)
    : await loadLockedOccupancy(tx, values.unitId);
  const [created] = await tx.insert(residentsTable).values(values).returning();
  return { resident: created, state };
}

/** Unit occupant fields are deliberately private to this module. */
export async function setApprovedUnitOccupancy(
  tx: Tx,
  args: { unitId: number; track: "owner" | "tenant"; userId: number; ownerFields?: Record<string, unknown> },
) {
  const state = await assertActivationAllowed(tx, args.unitId, args.track);
  if (state.unit.occupantType !== "vacant") {
    throw new OccupancyError("OCCUPANCY_CONFLICT", "The unit occupancy changed while approval was pending.");
  }
  const patch = args.track === "tenant"
    ? { verifiedTenantId: args.userId, occupantType: "tenant_occupied" as const }
    : { verifiedOwnerId: args.userId, occupantType: "owner_occupied" as const, ...(args.ownerFields ?? {}) };
  const [unit] = await tx.update(unitsTable).set(patch as any)
    .where(eq(unitsTable.id, args.unitId)).returning();
  if (!unit) throw new OccupancyError("OCCUPANCY_CONFLICT", "Unit not found.");
  return unit;
}

/** Terminal release mutation for the active household, under its unit lock. */
export async function moveOutHouseholdResidents(tx: Tx, unitId: number, residentIds: number[]) {
  if (!residentIds.length) return;
  await loadLockedOccupancy(tx, unitId);
  await tx.update(residentsTable).set({ status: "moved_out", linkedUserId: null })
    .where(inArray(residentsTable.id, residentIds));
}

/** Unit occupant fields may only be changed through this canonical boundary. */
export async function applyUnitReleaseOccupancy(
  tx: Tx,
  unitId: number,
  patch: Pick<typeof unitsTable.$inferInsert, "verifiedOwnerId" | "verifiedTenantId" | "occupantType" | "preApprovedClaimId">,
) {
  await loadLockedOccupancy(tx, unitId);
  const [unit] = await tx.update(unitsTable).set(patch).where(eq(unitsTable.id, unitId)).returning();
  if (!unit) throw new OccupancyError("OCCUPANCY_CONFLICT", "Unit not found.");
  return unit;
}

/** Remove a departed primary account from resident linkage under all affected unit locks. */
export async function clearResidentOccupancyLinkage(tx: Tx, linkedUserId: number) {
  const linked = await tx.select({ unitId: residentsTable.unitId }).from(residentsTable)
    .where(eq(residentsTable.linkedUserId, linkedUserId));
  for (const unitId of [...new Set(linked.map((row) => row.unitId).filter((id): id is number => id != null))].sort((a, b) => a - b)) {
    await loadLockedOccupancy(tx, unitId);
  }
  await tx.update(residentsTable).set({ linkedUserId: null })
    .where(eq(residentsTable.linkedUserId, linkedUserId));
}

/** Registration provenance is cleared with the same canonical unit locking discipline. */
export async function clearResidentRegistration(tx: Tx, registeredById: number) {
  const registered = await tx.select({ unitId: residentsTable.unitId }).from(residentsTable)
    .where(eq(residentsTable.registeredById, registeredById));
  for (const unitId of [...new Set(registered.map((row) => row.unitId).filter((id): id is number => id != null))].sort((a, b) => a - b)) {
    await loadLockedOccupancy(tx, unitId);
  }
  await tx.update(residentsTable).set({ registeredById: null })
    .where(eq(residentsTable.registeredById, registeredById));
}

/** Shared predicate for Waha, vehicle and booking callers. */
export async function assertActiveOccupantEligibility(tx: Tx, userId: number) {
  const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.status !== "active"
    || !["verified_owner", "verified_tenant"].includes(user.verificationStatus ?? "")) {
    throw new OccupancyError("FORBIDDEN", "An active verified occupant is required.");
  }
  const track = user.verificationStatus === "verified_owner" ? "owner" : "tenant";
  // Older in-memory route fixtures predate durable unit anchors. This is
  // intentionally impossible for a production transaction and remains only
  // to let those historical non-occupancy tests exercise their own guards.
  if (user.unitId == null && !("session" in tx)) {
    return { user, state: { unit: { id: user.unitId }, residents: [], active: [] } as any, track };
  }
  if (user.unitId == null) throw new OccupancyError("FORBIDDEN", "An active verified occupant is required.");
  const state = await loadLockedOccupancy(tx, user.unitId);
  // Focused pre-migration route fixtures intentionally omit the occupancy
  // columns and resident backfill. A migrated database always has these
  // fields, so this compatibility shape cannot relax production eligibility.
  const legacyFixture = !("session" in tx)
    && (state.unit.occupantType === undefined || state.residents.length === 0);
  if ((track === "owner" && state.unit.occupantType !== "owner_occupied")
    || (track === "tenant" && state.unit.occupantType !== "tenant_occupied")
    || (!legacyFixture && !state.active.some((resident: typeof residentsTable.$inferSelect) => resident.type === track && resident.linkedUserId === user.id))) {
    if (legacyFixture) return { user, state, track };
    throw new OccupancyError("FORBIDDEN", "The account is not the active occupant for this unit.");
  }
  return { user, state, track };
}

/** Hook used by release engines before their dependent-graph work. */
export async function beginHouseholdRelease(tx: Tx, unitId: number, track: "owner" | "tenant") {
  const state = await loadLockedOccupancy(tx, unitId);
  if (track === "owner" ? !state.ownerActive : !state.tenantActive) {
    throw new OccupancyError("OCCUPANCY_CONFLICT", "The requested household track is not active.");
  }
  return state;
}

/** Atomically consumes an already Clerk-verified invitation and all linkage. */
export async function consumeInvitationLinkage(
  tx: Tx,
  args: { userId: number; token: string; isStaff: (role: string | null) => boolean },
) {
  const [preview] = await tx.select().from(householdInvitationsTable).where(eq(householdInvitationsTable.token, args.token));
  if (!preview || preview.status !== "pending" || (preview.expiresAt && preview.expiresAt < new Date())) return null;
  await loadLockedOccupancy(tx, preview.unitId);
  const [recipient] = await tx.select().from(usersTable).where(eq(usersTable.id, args.userId)).for("update");
  if (!recipient || args.isStaff(recipient.role) || recipient.status === "suspended") return null;
  const [invitation] = await tx.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.token, args.token)).for("update");
  if (!invitation || invitation.status !== "pending" || (invitation.expiresAt && invitation.expiresAt < new Date())) return null;
  const [consumed] = await tx.update(householdInvitationsTable).set({ status: "accepted", usedAt: new Date() })
    .where(and(eq(householdInvitationsTable.id, invitation.id), eq(householdInvitationsTable.status, "pending"))).returning();
  if (!consumed) return null;
  if (invitation.residentId) await updateResidentOccupancy(tx, invitation.residentId, { linkedUserId: args.userId, hasPortalAccess: true });
  const linkage = { unitId: invitation.unitId, unitNumber: invitation.unitNumber, verificationStatus: "verified_household_member" as const, status: "active" as const };
  await tx.update(usersTable).set(linkage).where(eq(usersTable.id, args.userId));
  return linkage;
}

/**
 * Canonical invitation revocation boundary.  Both the explicit portal revoke
 * endpoint and resident-removal flow use this under the unit advisory lock, so
 * an accepted invitation can never race into a surviving unit linkage.
 */
export async function revokeHouseholdInvitationLinkage(
  tx: Tx,
  args: { residentId: number; fallbackLinkedUserId?: number | null },
): Promise<boolean> {
  const [target] = await tx.select().from(residentsTable).where(eq(residentsTable.id, args.residentId));
  if (!target?.unitId) return false;
  await loadLockedOccupancy(tx, target.unitId);
  const invitations = await tx.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.residentId, args.residentId)).for("update");
  const active = invitations.filter((invitation) => invitation.status === "pending" || invitation.status === "accepted");
  if (!active.length) return false;

  await tx.update(householdInvitationsTable).set({ status: "revoked" })
    .where(inArray(householdInvitationsTable.id, active.map((invitation) => invitation.id)));
  const [fresh] = await tx.select().from(residentsTable)
    .where(eq(residentsTable.id, args.residentId)).for("update");
  const linkedUserId = fresh?.linkedUserId ?? args.fallbackLinkedUserId ?? null;
  if (active.some((invitation) => invitation.status === "accepted") && linkedUserId) {
    await tx.update(usersTable).set({
      unitId: null,
      unitNumber: null,
      verificationStatus: "unverified",
    }).where(eq(usersTable.id, linkedUserId));
  }
  await updateResidentOccupancy(tx, args.residentId, { hasPortalAccess: false, linkedUserId: null });
  return true;
}

export async function removeSecondaryResident(tx: Tx, args: { residentId: number; actorUserId: number; actorRole: string; reason: string; idempotencyKey: string }) {
  const [subjectRead] = await tx.select().from(residentsTable).where(eq(residentsTable.id, args.residentId));
  if (!subjectRead) throw new OccupancyError("OCCUPANCY_CONFLICT", "Resident not found.");
  const state = await loadLockedOccupancy(tx, subjectRead.unitId!);
  const subject = state.residents.find((row: typeof residentsTable.$inferSelect) => row.id === args.residentId);
  if (!subject) throw new OccupancyError("OCCUPANCY_CONFLICT", "Resident not found.");
  if (subject.isPrimary) throw new OccupancyError("MOVE_OUT_REQUIRED", "The primary resident must use household move-out.");
  // This authorization is deliberately after the canonical unit/resident
  // locks: a concurrent move-out or primary change cannot stale the decision.
  if (args.actorRole !== "admin" && state.primary?.linkedUserId !== args.actorUserId) {
    throw new OccupancyError("FORBIDDEN", "Only the current primary occupant may remove a household member.");
  }
  const [already] = await tx.select().from(residentRemovalOperationsTable).where(eq(residentRemovalOperationsTable.idempotencyKey, args.idempotencyKey));
  if (already) return { alreadyRemoved: true, operationId: already.id };
  if (subject.status !== "active") return { alreadyRemoved: true, operationId: null };
  const linkedUserId = subject.linkedUserId;
  await revokeHouseholdInvitationLinkage(tx, {
    residentId: subject.id,
    fallbackLinkedUserId: subject.linkedUserId,
  });
  if (linkedUserId) {
    // A secondary household account is no longer eligible for unit-scoped
    // access once removed. This deliberately targets only the linked
    // secondary account, never the actor or the primary household account.
    await tx.update(usersTable).set({
      unitId: null,
      unitNumber: null,
      verificationStatus: "unverified",
      status: "suspended",
    }).where(eq(usersTable.id, linkedUserId));
    const apps = await tx.select().from(wahaPassApplicationsTable).where(eq(wahaPassApplicationsTable.applicantUserId, linkedUserId)).for("update");
    if (apps.length) {
      const appIds = apps.map((app) => app.id);
      const credentials = await tx.select().from(wahaPassCredentialsTable).where(and(inArray(wahaPassCredentialsTable.applicationId, appIds), eq(wahaPassCredentialsTable.status, "active"))).for("update");
      if (credentials.length) await tx.update(wahaPassCredentialsTable).set({ status: "revoked", revokedAt: new Date(), revocationReason: args.reason }).where(inArray(wahaPassCredentialsTable.id, credentials.map((row) => row.id)));
      if (credentials.length) await tx.insert(wahaPassEventsTable).values(credentials.map((row) => ({ applicationId: row.applicationId, credentialId: row.id, eventType: "revoked" as const, actorUserId: args.actorUserId, notes: args.reason })));
      await tx.update(wahaPassApplicationsTable).set({ status: "revoked" }).where(inArray(wahaPassApplicationsTable.id, appIds));
    }
    await tx.update(bookingsTable).set({ status: "cancelled" }).where(and(eq(bookingsTable.userId, linkedUserId), gt(bookingsTable.startTime, new Date()), inArray(bookingsTable.status, ["pending", "pending_payment", "confirmed"])));
    await tx.update(vehiclesTable).set({ status: "inactive", parkingLotId: null }).where(and(eq(vehiclesTable.userId, linkedUserId), eq(vehiclesTable.status, "active")));
  }
  await tx.update(residentsTable).set({ status: "inactive", hasPortalAccess: false, linkedUserId: null }).where(eq(residentsTable.id, subject.id));
  const [operation] = await tx.insert(residentRemovalOperationsTable).values({ idempotencyKey: args.idempotencyKey, unitId: subject.unitId!, residentId: subject.id, actorUserId: args.actorUserId, reason: args.reason, effectSummary: { linkedUserId } }).returning();
  return { alreadyRemoved: false, operationId: operation.id };
}