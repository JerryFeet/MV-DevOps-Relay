import {
  bookingsTable,
  db,
  externalIdentityDeletionJobsTable,
  guestPassesTable,
  guestsTable,
  moveFormsTable,
  notificationPreferencesTable,
  ownershipChangeEventsTable,
  paymentAttemptsTable,
  permitsTable,
  pushTokensTable,
  releaseOperationsTable,
  residentsTable,
  tenancyLifecyclesTable,
  unitsTable,
  unitVerificationsTable,
  unitVerificationOwnerIdAttemptsTable,
  usersTable,
  vehiclesTable,
  wahaGuestDayPassesTable,
  wahaPassApplicationsTable,
  wahaPassCredentialsTable,
  wahaPassEventsTable,
} from "@workspace/db";
import {
  and,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { lockOccupancyUnit } from "./occupancyLock";
import {
  applyUnitReleaseOccupancy,
  beginHouseholdRelease,
  clearResidentOccupancyLinkage,
  clearResidentRegistration,
  moveOutHouseholdResidents,
  OccupancyError,
} from "./occupancy";
import { enqueueNotificationForRecipient } from "./notificationService";
import { EVT, moveOutAccessDeactivatedKey } from "./notificationWiring";

export type ReleaseKind = "tenant" | "owner";
export type ReleaseTrigger =
  | { type: "move_out_form"; id: number; idempotencyKey: string }
  | { type: "move_out_permit"; id: number; idempotencyKey: string }
  | { type: "tenancy_expiry"; id: number; idempotencyKey: string }
  | { type: "ownership_change"; id: number; idempotencyKey: string };

export type ReleaseSubjectInput = {
  kind: ReleaseKind;
  unitId: number;
  subjectUserId: number;
  trigger: ReleaseTrigger;
  actorUserId: number;
  dryRun: boolean;
};

type AffectedIds = {
  applications: number[];
  credentials: number[];
  residents: number[];
  bookings: number[];
  futureBookings: number[];
  permits: number[];
  vehicles: number[];
  registeredResidents: number[];
  guests: number[];
  guestPasses: number[];
  dayPasses: number[];
  paymentAttempts: number[];
  unitVerifications: number[];
  ownerIdAttempts: number[];
};

export type ReleasePlan = {
  kind: ReleaseKind;
  unitId: number;
  subjectUserId: number;
  trigger: ReleaseTrigger;
  reason: string;
  transactionNow: string;
  affectedIds: AffectedIds;
  counts: Record<string, number>;
  paidFutureDayPasses: {
    count: number;
    totalSar: number;
  };
  expectedUnitState: {
    verifiedOwnerId: number | null;
    verifiedTenantId: number | null;
    occupantType: "owner_occupied" | "tenant_occupied" | "vacant";
    preApprovedClaimId: number | null;
  };
  postconditionIds: string[];
};

export type ReleaseResult =
  | { outcome: "planned"; plan: ReleasePlan }
  | { outcome: "released"; operationId: number; plan: ReleasePlan }
  | { outcome: "already_ended"; idempotencyKey: string }
  | { outcome: "invalid_subject"; reason: string }
  | { outcome: "precondition_failed"; reason: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class ReleaseInputError extends Error {
  constructor(
    readonly outcome: "invalid_subject" | "precondition_failed",
    message: string,
  ) {
    super(message);
  }
}

type ResolvedRelease = {
  plan: ReleasePlan;
  user: typeof usersTable.$inferSelect;
  unit: typeof unitsTable.$inferSelect;
  applications: (typeof wahaPassApplicationsTable.$inferSelect)[];
  credentials: (typeof wahaPassCredentialsTable.$inferSelect)[];
  residents: (typeof residentsTable.$inferSelect)[];
  bookings: (typeof bookingsTable.$inferSelect)[];
  futureBookings: (typeof bookingsTable.$inferSelect)[];
  permits: (typeof permitsTable.$inferSelect)[];
  vehicles: (typeof vehiclesTable.$inferSelect)[];
  registeredResidents: (typeof residentsTable.$inferSelect)[];
  guests: (typeof guestsTable.$inferSelect)[];
  guestPasses: (typeof guestPassesTable.$inferSelect)[];
  dayPasses: (typeof wahaGuestDayPassesTable.$inferSelect)[];
  paymentAttempts: (typeof paymentAttemptsTable.$inferSelect)[];
  unitVerifications: (typeof unitVerificationsTable.$inferSelect)[];
  ownerIdAttempts: (typeof unitVerificationOwnerIdAttemptsTable.$inferSelect)[];
};

const postconditionIds = [
  "A1-unit-linkage",
  "A2-subject-deleted",
  "A3-applications-revoked",
  "A4-credentials-revoked",
  "A5-waha-events-appended",
  "A6-residents-moved-out",
  "A7-future-bookings-cancelled",
  "A8-bookings-retain-unit-attribution",
  "A9-release-operation-recorded",
  "A10-identity-job-recorded",
  "A11-trigger-marked-terminal",
] as const;

function ids(rows: Array<{ id: number }>): number[] {
  return rows.map((row) => row.id).sort((a, b) => a - b);
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function releaseReason(input: ReleaseSubjectInput): string {
  return `terminal_${input.kind}_${input.trigger.type}`;
}

async function lockUnitAndSubject(tx: Tx, input: ReleaseSubjectInput): Promise<void> {
  await lockOccupancyUnit(tx, input.unitId);
  await tx.execute(sql`SELECT id FROM users WHERE id = ${input.subjectUserId} FOR UPDATE`);
}

async function lockTrigger(tx: Tx, input: ReleaseSubjectInput): Promise<void> {
  if (input.trigger.type === "move_out_form") {
    await tx.execute(
      sql`SELECT id FROM move_forms WHERE id = ${input.trigger.id} FOR UPDATE`,
    );
    return;
  }
  if (input.trigger.type === "ownership_change") {
    await tx.execute(
      sql`SELECT id FROM ownership_change_events WHERE id = ${input.trigger.id} FOR UPDATE`,
    );
    return;
  }
  if (input.trigger.type === "move_out_permit") {
    await tx.execute(sql`SELECT id FROM permits WHERE id = ${input.trigger.id} FOR UPDATE`);
    return;
  }
  await tx.execute(
    sql`SELECT id FROM tenancy_lifecycles WHERE id = ${input.trigger.id} FOR UPDATE`,
  );
}

async function assertAndLockTrigger(
  tx: Tx,
  input: ReleaseSubjectInput,
  unit: typeof unitsTable.$inferSelect,
): Promise<void> {
  if (input.trigger.type === "move_out_form") {
    const [form] = await tx
      .select()
      .from(moveFormsTable)
      .where(eq(moveFormsTable.id, input.trigger.id));
    // `unitId` is canonical for all new forms. Old forms may be honoured only
    // when their legacy number resolves to this *single* unit; never infer an
    // ambiguous bare apartment reference.
    const legacyReferenceMatches = form?.unitId == null && form
      ? form.unitNumber === `${unit.building} ${unit.unitNumber}`
        || (
          form.unitNumber === unit.unitNumber
          && (await tx.select({ id: unitsTable.id }).from(unitsTable)
            .where(eq(unitsTable.unitNumber, form.unitNumber))).length === 1
        )
      : false;
    if (
      !form ||
      form.type !== "move_out" ||
      form.status !== "approved" ||
      form.revocationProcessedAt !== null ||
      form.userId !== input.subjectUserId ||
      (form.unitId != null ? form.unitId !== input.unitId : !legacyReferenceMatches)
    ) {
      throw new ReleaseInputError(
        "invalid_subject",
        "The move-out form does not identify this active tenant and unit.",
      );
    }
    return;
  }
  if (input.trigger.type === "tenancy_expiry") {
    const [lifecycle] = await tx
      .select()
      .from(tenancyLifecyclesTable)
      .where(eq(tenancyLifecyclesTable.id, input.trigger.id));
    if (
      !lifecycle ||
      lifecycle.unitId !== input.unitId ||
      lifecycle.tenantUserId !== input.subjectUserId ||
      !["release_requested", "expired"].includes(lifecycle.status) ||
      lifecycle.releasedAt !== null
    ) {
      throw new ReleaseInputError(
        "invalid_subject",
        "The tenancy lifecycle is not an executable release for this active tenant and unit.",
      );
    }
    return;
  }
  if (input.trigger.type === "move_out_permit") {
    const [permit] = await tx.select().from(permitsTable)
      .where(eq(permitsTable.id, input.trigger.id));
    if (
      !permit || permit.type !== "move_out" || !["approved", "approved_with_conditions", "in_progress", "completed"].includes(permit.status) ||
      permit.unitId !== input.unitId || permit.userId !== input.subjectUserId
    ) {
      throw new ReleaseInputError(
        "invalid_subject",
        "The move-out permit does not identify this completed household move-out.",
      );
    }
    return;
  }

  const [event] = await tx
    .select()
    .from(ownershipChangeEventsTable)
    .where(eq(ownershipChangeEventsTable.id, input.trigger.id));
  if (
    !event ||
    event.status !== "pending" ||
    event.unitId !== input.unitId ||
    event.outgoingOwnerId !== input.subjectUserId
  ) {
    throw new ReleaseInputError(
      "invalid_subject",
      "The ownership-change event does not identify this active owner and unit.",
    );
  }
}

async function resolveReleaseGraph(tx: Tx, input: ReleaseSubjectInput): Promise<ResolvedRelease | null> {
  await lockUnitAndSubject(tx, input);

  const [unit] = await tx
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.id, input.unitId));
  if (!unit) {
    throw new ReleaseInputError("precondition_failed", "The requested unit no longer exists.");
  }
  if (unit.isSystem) {
    throw new ReleaseInputError(
      "invalid_subject",
      "System units are not resident or ownership-release subjects.",
    );
  }
  // Idempotency is evaluated before the active-household predicate. A retry
  // naturally observes moved-out residents after the first committed release
  // and must still return already_ended rather than an occupancy conflict.
  const [existingOperation] = await tx
    .select({ id: releaseOperationsTable.id })
    .from(releaseOperationsTable)
    .where(eq(releaseOperationsTable.idempotencyKey, input.trigger.idempotencyKey));
  if (existingOperation) return null;
  // The release engine owns dependent cleanup, while occupancy.ts remains the
  // single authority for whether a departing household is still active. Its
  // canonical lock is intentionally reacquired (Postgres advisory locks are
  // re-entrant) before any move-out or tenancy terminal work is resolved.
  // Ownership transfer is not a household move-out: its outgoing owner may
  // legitimately be non-resident while a tenant occupies the unit.
  if (input.trigger.type !== "ownership_change") {
    try {
      await beginHouseholdRelease(tx, input.unitId, input.kind);
    } catch (error) {
      if (error instanceof OccupancyError) {
        throw new ReleaseInputError("invalid_subject", error.message);
      }
      throw error;
    }
  }

  await lockTrigger(tx, input);
  await assertAndLockTrigger(tx, input, unit);

  const [user] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, input.subjectUserId));
  if (!user) {
    throw new ReleaseInputError(
      "precondition_failed",
      "The release subject is absent without a committed release operation.",
    );
  }

  const expectedLinkedUserId =
    input.kind === "tenant" ? unit.verifiedTenantId : unit.verifiedOwnerId;
  if (expectedLinkedUserId !== input.subjectUserId) {
    throw new ReleaseInputError(
      "invalid_subject",
      `The requested ${input.kind} is not the unit's active verified ${input.kind}.`,
    );
  }

  const now = new Date();
  const track = input.kind === "tenant" ? "tenant" : "owner";
  const reason = releaseReason(input);

  // Canonical release lock order: unit advisory lock → unit row → trigger and
  // subject → household residents → dependent graphs → operation/audit.
  await tx.execute(
    sql`SELECT id FROM residents WHERE unit_id = ${input.unitId} AND status = 'active' ORDER BY id FOR UPDATE`,
  );

  // The unit advisory lock serializes all terminal engine operations for the
  // unit. These selections are ordered so the graph is deterministic and the
  // exact same graph feeds dry-run and real execution.
  const applications = await tx
    .select()
    .from(wahaPassApplicationsTable)
    .where(
      and(
        eq(wahaPassApplicationsTable.unitId, input.unitId),
        eq(wahaPassApplicationsTable.occupancyTrack, track),
        eq(wahaPassApplicationsTable.status, "active"),
      ),
    )
    .orderBy(wahaPassApplicationsTable.id);
  const applicationIds = ids(applications);

  const credentials = applicationIds.length
    ? await tx
      .select()
      .from(wahaPassCredentialsTable)
      .where(
        and(
          inArray(wahaPassCredentialsTable.applicationId, applicationIds),
          eq(wahaPassCredentialsTable.status, "active"),
        ),
      )
      .orderBy(wahaPassCredentialsTable.id)
    : [];

  const isHouseholdEnding = input.trigger.type !== "ownership_change";
  // A move-out is an occupancy event, not an account event. The unit lock has
  // already serialized this selection with every other household transition.
  const residents = await tx
    .select()
    .from(residentsTable)
    .where(
      isHouseholdEnding
        ? and(eq(residentsTable.unitId, input.unitId), eq(residentsTable.status, "active"))
        : and(eq(residentsTable.linkedUserId, input.subjectUserId), eq(residentsTable.status, "active")),
    )
    .orderBy(residentsTable.id);
  const householdUserIds = [...new Set([
    input.subjectUserId,
    ...residents.flatMap((resident) => resident.linkedUserId === null ? [] : [resident.linkedUserId]),
  ])].sort((a, b) => a - b);
  const bookings = await tx
    .select()
    .from(bookingsTable)
    .where(inArray(bookingsTable.userId, householdUserIds))
    .orderBy(bookingsTable.id);

  const futureBookings = await tx
    .select()
    .from(bookingsTable)
    .where(
      and(
        inArray(bookingsTable.userId, householdUserIds),
        gt(bookingsTable.startTime, now),
        ne(bookingsTable.status, "cancelled"),
      ),
    )
    .orderBy(bookingsTable.id);

  const permits = await tx
    .select()
    .from(permitsTable)
    .where(inArray(permitsTable.userId, householdUserIds))
    .orderBy(permitsTable.id);
  const vehicles = await tx
    .select()
    .from(vehiclesTable)
    .where(inArray(vehiclesTable.userId, householdUserIds))
    .orderBy(vehiclesTable.id);
  const registeredResidents = await tx
    .select()
    .from(residentsTable)
    .where(eq(residentsTable.registeredById, input.subjectUserId))
    .orderBy(residentsTable.id);
  const registeredResidentIds = ids(registeredResidents);
  const guests = registeredResidentIds.length
    ? await tx
      .select()
      .from(guestsTable)
      .where(inArray(guestsTable.residentId, registeredResidentIds))
      .orderBy(guestsTable.id)
    : [];
  const guestIds = ids(guests);
  const guestPasses = guestIds.length
    ? await tx
      .select()
      .from(guestPassesTable)
      .where(inArray(guestPassesTable.guestId, guestIds))
      .orderBy(guestPassesTable.id)
    : [];

  const dayPasses = await tx
    .select()
    .from(wahaGuestDayPassesTable)
    .where(
      and(
        eq(wahaGuestDayPassesTable.unitId, input.unitId),
        eq(wahaGuestDayPassesTable.purchasedByUserId, input.subjectUserId),
        gte(wahaGuestDayPassesTable.date, utcDay(now)),
        isNull(wahaGuestDayPassesTable.revokedAt),
      ),
    )
    .orderBy(wahaGuestDayPassesTable.id);
  const dayPassIds = ids(dayPasses);

  const paymentAttempts = await tx
    .select()
    .from(paymentAttemptsTable)
    .where(
      dayPassIds.length
        ? or(
          eq(paymentAttemptsTable.userId, input.subjectUserId),
          and(
            eq(paymentAttemptsTable.subjectType, "guest_day_pass"),
            inArray(paymentAttemptsTable.subjectId, dayPassIds),
          ),
        )
        : eq(paymentAttemptsTable.userId, input.subjectUserId),
    )
    .orderBy(paymentAttemptsTable.id);
  const unitVerifications = await tx
    .select()
    .from(unitVerificationsTable)
    .where(eq(unitVerificationsTable.userId, input.subjectUserId))
    .orderBy(unitVerificationsTable.id);
  const ownerIdAttempts = await tx
    .select()
    .from(unitVerificationOwnerIdAttemptsTable)
    .where(eq(unitVerificationOwnerIdAttemptsTable.userId, input.subjectUserId))
    .orderBy(unitVerificationOwnerIdAttemptsTable.id);

  const expectedUnitState = input.kind === "tenant"
    ? {
      verifiedOwnerId: unit.verifiedOwnerId,
      verifiedTenantId: null,
      occupantType: "vacant" as const,
      preApprovedClaimId: unit.preApprovedClaimId,
    }
    : (input.trigger.type === "move_out_form" || input.trigger.type === "move_out_permit") ? {
      // Owner move-out relinquishes occupancy only; it is not an ownership
      // transfer and must not erase the verified property claim.
      verifiedOwnerId: unit.verifiedOwnerId,
      verifiedTenantId: unit.verifiedTenantId,
      occupantType: "vacant" as const,
      preApprovedClaimId: unit.preApprovedClaimId,
    } : {
      verifiedOwnerId: null,
      verifiedTenantId: unit.verifiedTenantId,
      occupantType: unit.verifiedTenantId ? "tenant_occupied" as const : "vacant" as const,
      // Stage 6C O5: the incoming owner always uses ordinary B7 verification.
      // An ownership release must never create a claimant-specific promotion slot.
      preApprovedClaimId: null,
    };

  const paidFutureDayPasses = dayPasses
    .filter((pass) => pass.paymentStatus === "paid")
    .reduce(
      (summary, pass) => ({
        count: summary.count + 1,
        totalSar: summary.totalSar + Number(pass.amountSar),
      }),
      { count: 0, totalSar: 0 },
    );

  const affectedIds: AffectedIds = {
    applications: applicationIds,
    credentials: ids(credentials),
    residents: ids(residents),
    bookings: ids(bookings),
    futureBookings: ids(futureBookings),
    permits: ids(permits),
    vehicles: ids(vehicles),
    registeredResidents: registeredResidentIds,
    guests: guestIds,
    guestPasses: ids(guestPasses),
    dayPasses: dayPassIds,
    paymentAttempts: ids(paymentAttempts),
    unitVerifications: ids(unitVerifications),
    ownerIdAttempts: ids(ownerIdAttempts),
  };

  const plan: ReleasePlan = {
    kind: input.kind,
    unitId: input.unitId,
    subjectUserId: input.subjectUserId,
    trigger: input.trigger,
    reason,
    transactionNow: now.toISOString(),
    affectedIds,
    counts: Object.fromEntries(Object.entries(affectedIds).map(([key, value]) => [key, value.length])),
    paidFutureDayPasses,
    expectedUnitState,
    postconditionIds: [...postconditionIds],
  };

  return {
    plan,
    unit,
    user,
    applications,
    credentials,
    residents,
    bookings,
    futureBookings,
    permits,
    vehicles,
    registeredResidents,
    guests,
    guestPasses,
    dayPasses,
    paymentAttempts,
    unitVerifications,
    ownerIdAttempts,
  };
}

function assertPlanIsExecutable(resolved: ResolvedRelease): void {
  if (!resolved.user.clerkId) {
    throw new ReleaseInputError("precondition_failed", "The departing user has no Clerk identity.");
  }
  if (resolved.plan.paidFutureDayPasses.totalSar < 0) {
    throw new ReleaseInputError("precondition_failed", "Day Pass financial summary is invalid.");
  }
}

async function anonymizeDependentPii(tx: Tx, resolved: ResolvedRelease): Promise<void> {
  const { subjectUserId } = resolved.plan;
  await tx
    .update(bookingsTable)
    .set({ notes: null })
    .where(eq(bookingsTable.userId, subjectUserId));
  await tx
    .update(permitsTable)
    .set({
      movingCompanyContact: null,
      contractorName: null,
      contractorContact: null,
      contractorLicense: null,
      description: null,
    })
    .where(eq(permitsTable.userId, subjectUserId));
  await tx
    .update(vehiclesTable)
    .set({ istimaraNumber: null })
    .where(eq(vehiclesTable.userId, subjectUserId));

  if (resolved.plan.affectedIds.guests.length) {
    await tx
      .update(guestsTable)
      .set({ firstName: "[Deleted]", lastName: "", nationalId: null, vehiclePlate: null })
      .where(inArray(guestsTable.id, resolved.plan.affectedIds.guests));
  }
  if (resolved.plan.affectedIds.guestPasses.length) {
    await tx
      .update(guestPassesTable)
      .set({ guestName: "[Deleted]", nationalId: null, vehiclePlate: null })
      .where(inArray(guestPassesTable.id, resolved.plan.affectedIds.guestPasses));
  }
}

async function executeReleaseGraph(
  tx: Tx,
  input: ReleaseSubjectInput,
  resolved: ResolvedRelease,
): Promise<number> {
  const { plan } = resolved;
  const now = new Date(plan.transactionNow);

  if (plan.affectedIds.credentials.length) {
    await tx
      .update(wahaPassCredentialsTable)
      .set({ status: "revoked", revocationReason: plan.reason, revokedAt: now })
      .where(inArray(wahaPassCredentialsTable.id, plan.affectedIds.credentials));
    await tx.insert(wahaPassEventsTable).values(
      plan.affectedIds.credentials.map((credentialId) => ({
        applicationId: resolved.credentials.find((credential) => credential.id === credentialId)!.applicationId,
        credentialId,
        eventType: "revoked" as const,
        actorUserId: input.actorUserId,
        notes: `${input.trigger.idempotencyKey}: ${plan.reason}`,
      })),
    );
  }
  if (plan.affectedIds.applications.length) {
    await tx
      .update(wahaPassApplicationsTable)
      .set({ status: "revoked" })
      .where(inArray(wahaPassApplicationsTable.id, plan.affectedIds.applications));
  }
  if (plan.affectedIds.residents.length) {
    await moveOutHouseholdResidents(tx, plan.unitId, plan.affectedIds.residents);
  }
  if (plan.affectedIds.vehicles.length) {
    // Keep the registration for history, but release its physical parking
    // assignment before unlinking the departed household account.
    await tx
      .update(vehiclesTable)
      .set({ status: "inactive", parkingLotId: null })
      .where(inArray(vehiclesTable.id, plan.affectedIds.vehicles));
  }
  if (plan.affectedIds.futureBookings.length) {
    await tx
      .update(bookingsTable)
      .set({ status: "cancelled" })
      .where(inArray(bookingsTable.id, plan.affectedIds.futureBookings));
  }
  if (plan.affectedIds.dayPasses.length) {
    await tx
      .update(wahaGuestDayPassesTable)
      .set({ revokedAt: now, revocationReason: plan.reason })
      .where(inArray(wahaGuestDayPassesTable.id, plan.affectedIds.dayPasses));
  }

  await anonymizeDependentPii(tx, resolved);

  // Explicitly null every user relationship before deletion. The approved FKs
  // repeat these semantics at the database boundary and protect future callers.
  await applyUnitReleaseOccupancy(tx, plan.unitId, plan.expectedUnitState);
  const linkedHouseholdUserIds = [...new Set(
    resolved.residents.flatMap((resident) => resident.linkedUserId === null ? [] : [resident.linkedUserId]),
  )];
  if (linkedHouseholdUserIds.length) {
    // Secondary household accounts are retained for history rather than
    // deleted blindly, but lose their portal/unit eligibility immediately.
    // The primary subject follows the established deletion workflow below.
    await tx.update(usersTable).set({
      unitId: null,
      status: "suspended",
      verificationStatus: "linkage_ended",
    }).where(and(
      inArray(usersTable.id, linkedHouseholdUserIds),
      ne(usersTable.id, plan.subjectUserId),
    ));
  }
  await clearResidentOccupancyLinkage(tx, plan.subjectUserId);
  await clearResidentRegistration(tx, plan.subjectUserId);
  await tx
    .update(wahaPassApplicationsTable)
    .set({ applicantUserId: null })
    .where(eq(wahaPassApplicationsTable.applicantUserId, plan.subjectUserId));
  await tx
    .update(wahaPassCredentialsTable)
    .set({ heldByUserId: null })
    .where(eq(wahaPassCredentialsTable.heldByUserId, plan.subjectUserId));
  await tx
    .update(bookingsTable)
    .set({ userId: null })
    .where(eq(bookingsTable.userId, plan.subjectUserId));
  await tx
    .update(permitsTable)
    .set({ userId: null })
    .where(eq(permitsTable.userId, plan.subjectUserId));
  await tx
    .update(vehiclesTable)
    .set({ userId: null })
    .where(eq(vehiclesTable.userId, plan.subjectUserId));
  await tx
    .update(unitVerificationsTable)
    .set({ userId: null })
    .where(eq(unitVerificationsTable.userId, plan.subjectUserId));
  await tx
    .update(unitVerificationOwnerIdAttemptsTable)
    .set({ userId: null })
    .where(eq(unitVerificationOwnerIdAttemptsTable.userId, plan.subjectUserId));
  await tx
    .update(wahaGuestDayPassesTable)
    .set({ purchasedByUserId: null })
    .where(eq(wahaGuestDayPassesTable.purchasedByUserId, plan.subjectUserId));
  await tx
    .update(paymentAttemptsTable)
    .set({ userId: null })
    .where(eq(paymentAttemptsTable.userId, plan.subjectUserId));
  await tx
    .delete(pushTokensTable)
    .where(eq(pushTokensTable.userId, plan.subjectUserId));
  await tx
    .delete(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, plan.subjectUserId));

  if (input.trigger.type === "move_out_form") {
    await tx
      .update(moveFormsTable)
      .set({ status: "completed", revocationProcessedAt: now })
      .where(eq(moveFormsTable.id, input.trigger.id));
  } else if (input.trigger.type === "move_out_permit") {
    await tx.update(permitsTable).set({ status: "completed", reviewedById: input.actorUserId })
      .where(eq(permitsTable.id, input.trigger.id));
  } else if (input.trigger.type === "ownership_change") {
    await tx
      .update(ownershipChangeEventsTable)
      .set({
        status: "approved",
        outgoingOwnerId: null,
        reviewedByAdminId: input.actorUserId,
        reviewedAt: now,
      })
      .where(eq(ownershipChangeEventsTable.id, input.trigger.id));
  }

  const [operation] = await tx
    .insert(releaseOperationsTable)
    .values({
      idempotencyKey: input.trigger.idempotencyKey,
      kind: plan.kind,
      triggerType: input.trigger.type,
      triggerId: input.trigger.id,
      unitId: plan.unitId,
      subjectUserId: plan.subjectUserId,
      actorUserId: input.actorUserId,
      reason: plan.reason,
      outcome: "released",
      affectedIds: plan.affectedIds,
      effectSummary: {
        counts: plan.counts,
        paidFutureDayPasses: plan.paidFutureDayPasses,
        futureBookingReason:
          "Cancelled because the associated residency/ownership ended. This booking is non-refundable.",
      },
      postconditionSummary: { assertions: plan.postconditionIds },
    })
    .returning({ id: releaseOperationsTable.id });

  if (input.trigger.type === "tenancy_expiry") {
    await tx
      .update(tenancyLifecyclesTable)
      .set({
        status: "released",
        releasedAt: now,
        releaseExecutedById: input.actorUserId,
        releaseOperationId: operation.id,
      })
      .where(eq(tenancyLifecyclesTable.id, input.trigger.id));
  }

  // An owner move-out deliberately retains the owner account because the
  // verified ownership claim is retained. Ownership transfer remains a
  // separate terminal flow.
  const preservesOwnerClaim = input.kind === "owner" &&
    (input.trigger.type === "move_out_form" || input.trigger.type === "move_out_permit");
  if (!preservesOwnerClaim) {
    await tx.delete(usersTable).where(eq(usersTable.id, plan.subjectUserId));
    await tx.insert(externalIdentityDeletionJobsTable).values({
      operationId: operation.id,
      clerkId: resolved.user.clerkId,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    });
  }

  // Event 15 is persisted before deleting the account. The durable email/push
  // intent remains available to the dispatcher after release; the idempotency
  // key is scoped to the one canonical move-out form.
  if (input.trigger.type === "move_out_form") {
    await enqueueNotificationForRecipient({
      eventType: EVT.MOVE_OUT_ACCESS_DEACTIVATED,
      idempotencyKey: moveOutAccessDeactivatedKey(input.trigger.id),
      recipientUserId: plan.subjectUserId,
      recipientEmail: resolved.user.email,
      data: {
        screen: "tenancy",
        unitId: plan.unitId,
        moveOutFormId: input.trigger.id,
        releaseOperationId: operation.id,
      },
    }, tx, true);
  }

  return operation.id;
}

async function assertReleasePostconditions(
  tx: Tx,
  input: ReleaseSubjectInput,
  resolved: ResolvedRelease,
  operationId: number,
): Promise<void> {
  const { plan } = resolved;
  const [unit] = await tx.select().from(unitsTable).where(eq(unitsTable.id, plan.unitId));
  if (
    !unit ||
    unit.verifiedOwnerId !== plan.expectedUnitState.verifiedOwnerId ||
    unit.verifiedTenantId !== plan.expectedUnitState.verifiedTenantId ||
    unit.occupantType !== plan.expectedUnitState.occupantType ||
    unit.preApprovedClaimId !== plan.expectedUnitState.preApprovedClaimId
  ) {
    throw new Error("Stage 6A A1 failed: unit linkage did not reach the planned terminal state.");
  }

  const preservesOwnerClaim = input.kind === "owner" &&
    (input.trigger.type === "move_out_form" || input.trigger.type === "move_out_permit");
  const [subject] = await tx.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.id, plan.subjectUserId));
  if (subject && !preservesOwnerClaim) throw new Error("Stage 6A A2 failed: departing user still exists.");

  const [bookingStillLinked] = await tx
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(eq(bookingsTable.userId, plan.subjectUserId));
  if (bookingStillLinked) {
    throw new Error("Stage 6A A2 failed: retained booking still references the departing user.");
  }
  if (plan.affectedIds.bookings.length) {
    const [unattributableBooking] = await tx
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(
        and(
          inArray(bookingsTable.id, plan.affectedIds.bookings),
          isNull(bookingsTable.unitId),
        ),
      );
    if (unattributableBooking) {
      throw new Error(
        "Stage 6A A8 failed: a retained booking would have neither resident nor unit attribution.",
      );
    }
  }

  const assertAll = async (
    table: typeof wahaPassApplicationsTable | typeof wahaPassCredentialsTable | typeof residentsTable | typeof bookingsTable,
    selectedIds: number[],
    condition: ReturnType<typeof eq>,
    assertionId: string,
  ) => {
    if (!selectedIds.length) return;
    const rows = await tx.select({ id: table.id }).from(table).where(and(inArray(table.id, selectedIds), condition));
    if (rows.length) throw new Error(`Stage 6A ${assertionId} failed.`);
  };
  await assertAll(
    wahaPassApplicationsTable,
    plan.affectedIds.applications,
    ne(wahaPassApplicationsTable.status, "revoked"),
    "A3",
  );
  await assertAll(
    wahaPassCredentialsTable,
    plan.affectedIds.credentials,
    ne(wahaPassCredentialsTable.status, "revoked"),
    "A4",
  );
  await assertAll(
    residentsTable,
    plan.affectedIds.residents,
    ne(residentsTable.status, "moved_out"),
    "A6",
  );
  await assertAll(
    bookingsTable,
    plan.affectedIds.futureBookings,
    ne(bookingsTable.status, "cancelled"),
    "A7",
  );

  if (plan.affectedIds.credentials.length) {
    const events = await tx
      .select({ credentialId: wahaPassEventsTable.credentialId })
      .from(wahaPassEventsTable)
      .where(
        and(
          inArray(wahaPassEventsTable.credentialId, plan.affectedIds.credentials),
          eq(wahaPassEventsTable.eventType, "revoked"),
        ),
      );
    if (new Set(events.map((event) => event.credentialId)).size !== plan.affectedIds.credentials.length) {
      throw new Error("Stage 6A A5 failed: not every revoked credential has an audit event.");
    }
  }

  const [operation] = await tx
    .select({ id: releaseOperationsTable.id })
    .from(releaseOperationsTable)
    .where(eq(releaseOperationsTable.idempotencyKey, input.trigger.idempotencyKey));
  if (!operation || operation.id !== operationId) {
    throw new Error("Stage 6A A9 failed: immutable release operation missing.");
  }

  const [job] = await tx
    .select({ operationId: externalIdentityDeletionJobsTable.operationId })
    .from(externalIdentityDeletionJobsTable)
    .where(eq(externalIdentityDeletionJobsTable.operationId, operationId));
  if (!job && !preservesOwnerClaim) throw new Error("Stage 6A A10 failed: identity deletion job missing.");

  if (input.trigger.type === "move_out_form") {
    const [form] = await tx.select().from(moveFormsTable).where(eq(moveFormsTable.id, input.trigger.id));
    if (!form || form.status !== "completed" || !form.revocationProcessedAt) {
      throw new Error("Stage 6A A11 failed: move-out form was not terminally marked.");
    }
  } else if (input.trigger.type === "ownership_change") {
    const [event] = await tx
      .select()
      .from(ownershipChangeEventsTable)
      .where(eq(ownershipChangeEventsTable.id, input.trigger.id));
    if (!event || event.status !== "approved" || event.outgoingOwnerId !== null) {
      throw new Error("Stage 6A A11 failed: ownership-change event was not terminally marked.");
    }
  } else if (input.trigger.type === "tenancy_expiry") {
    const [lifecycle] = await tx
      .select()
      .from(tenancyLifecyclesTable)
      .where(eq(tenancyLifecyclesTable.id, input.trigger.id));
    if (
      !lifecycle ||
      lifecycle.status !== "released" ||
      lifecycle.releaseOperationId !== operationId ||
      !lifecycle.releasedAt
    ) {
      throw new Error("Stage 6B A11 failed: tenancy lifecycle was not terminally marked.");
    }
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "40001" || code === "40P01";
}

/**
 * Shared terminal-release substrate for later T13/T14/O3 adapters. It is
 * deliberately server-only: Stage 6A adds no resident/admin UI or scheduler
 * behavior. A dry run executes the identical resolver under the same unit lock
 * and never writes an operation, trigger marker, job, or application record.
 */
export async function releaseSubject(input: ReleaseSubjectInput): Promise<ReleaseResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result: ReleaseResult = await db.transaction(async (tx): Promise<ReleaseResult> => {
        const resolved = await resolveReleaseGraph(tx, input);
        if (!resolved) {
          return { outcome: "already_ended", idempotencyKey: input.trigger.idempotencyKey };
        }
        assertPlanIsExecutable(resolved);
        if (input.dryRun) return { outcome: "planned", plan: resolved.plan };

        const operationId = await executeReleaseGraph(tx, input, resolved);
        await assertReleasePostconditions(tx, input, resolved, operationId);
        return { outcome: "released", operationId, plan: resolved.plan };
      }, { isolationLevel: "serializable" });
      return result;
    } catch (error) {
      if (error instanceof ReleaseInputError) {
        return { outcome: error.outcome, reason: error.message };
      }
      if (attempt < 2 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }
  throw new Error("Stage 6A release transaction retry loop exhausted.");
}