import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { and, eq, gte, gt, inArray, isNull, ne, or, sql } = await import("./helpers/mockDb");
  return { and, eq, gte, gt, inArray, isNull, ne, or, sql };
});

import { releaseSubject } from "../lib/releaseSubject";
import { resetMockDb, stores } from "./helpers/mockDb";

const today = () => new Date().toISOString().slice(0, 10);
const future = (hours: number) => new Date(Date.now() + hours * 60 * 60_000);
const past = (hours: number) => new Date(Date.now() - hours * 60 * 60_000);

function input(overrides: Partial<Parameters<typeof releaseSubject>[0]> = {}) {
  return {
    kind: "tenant" as const,
    unitId: 1,
    subjectUserId: 2,
    trigger: { type: "move_out_form" as const, id: 1, idempotencyKey: "release-test-1" },
    actorUserId: 3,
    dryRun: false,
    ...overrides,
  };
}

function seedTenantGraph() {
  stores.units.insert({
    building: "A",
    unitNumber: "101",
    verifiedOwnerId: 1,
    verifiedTenantId: 2,
    occupantType: "tenant_occupied",
    preApprovedClaimId: null,
  });
  stores.users.insert({ clerkId: "clerk-owner", role: "owner", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "clerk-tenant", role: "tenant", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "clerk-admin", role: "admin", unitId: null, status: "active" });
  stores.moveForms.insert({
    type: "move_out",
    status: "approved",
    userId: 2,
    unitNumber: "101",
    unitId: 1,
    revocationProcessedAt: null,
  });

  stores.wahaPassApplications.insert({
    unitId: 1, applicantUserId: 2, occupancyTrack: "tenant", status: "active",
  });
  stores.wahaPassApplications.insert({
    unitId: 1, applicantUserId: 1, occupancyTrack: "owner", status: "active",
  });
  stores.wahaPassCredentials.insert({
    applicationId: 1, heldByUserId: 2, status: "active", passNumber: "WP-TENANT",
  });
  stores.wahaPassCredentials.insert({
    applicationId: 2, heldByUserId: 1, status: "active", passNumber: "WP-OWNER",
  });
  stores.residents.insert({
    unitId: 1, linkedUserId: 2, registeredById: 2, status: "active",
    type: "tenant", isPrimary: true,
    firstName: "Tenant", lastName: "Resident",
  });
  stores.bookings.insert({
    userId: 2, unitId: 1, startTime: future(48), endTime: future(49), status: "confirmed", notes: "private",
  });
  stores.bookings.insert({
    userId: 2, unitId: 1, startTime: past(48), endTime: past(47), status: "confirmed", notes: "historic",
  });
  stores.wahaGuestDayPasses.insert({
    unitId: 1, purchasedByUserId: 2, date: today(), paymentStatus: "paid", amountSar: "12.50", revokedAt: null,
  });
  stores.wahaGuestDayPasses.insert({
    unitId: 1, purchasedByUserId: 2, date: today(), paymentStatus: "paid", amountSar: "20", revokedAt: null,
  });
  stores.wahaGuestDayPasses.insert({
    unitId: 1, purchasedByUserId: 2, date: today(), paymentStatus: "pending", amountSar: "9", revokedAt: null,
  });
  stores.paymentAttempts.insert({ userId: 2, subjectType: "guest_day_pass", subjectId: 1, status: "succeeded" });
  stores.permits.insert({ userId: 2, status: "approved", type: "move_out", contractorName: "Private Co." });
  stores.vehicles.insert({ userId: 2, plateNumber: "ABC 1", istimaraNumber: "secret" });
  stores.unitVerifications.insert({ userId: 2, unitId: 1, status: "approved" });
  stores.unitVerificationOwnerIdAttempts.insert({ userId: 2, unitKey: "A101", attemptCount: 1 });
  stores.pushTokens.insert({ userId: 2, token: "token" });
  stores.notificationPreferences.insert({ userId: 2, eventKey: "booking_status_change", enabled: true });
}

beforeEach(() => {
  resetMockDb();
  seedTenantGraph();
});

describe("Stage 6A releaseSubject", () => {
  it("uses the exact real-release graph for dry runs while mutating nothing", async () => {
    const dryRun = await releaseSubject(input({ dryRun: true }));

    expect(dryRun).toMatchObject({
      outcome: "planned",
      plan: {
        paidFutureDayPasses: { count: 2, totalSar: 32.5 },
        affectedIds: { bookings: [1, 2], futureBookings: [1], dayPasses: [1, 2, 3] },
      },
    });
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
    expect(stores.bookings.findAll()[0]?.status).toBe("confirmed");
    expect(stores.wahaPassCredentials.findAll()[0]?.status).toBe("active");
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
    expect(stores.externalIdentityDeletionJobs.findAll()).toHaveLength(0);

    const realRun = await releaseSubject(input());
    expect(realRun.outcome).toBe("released");
    if (dryRun.outcome !== "planned" || realRun.outcome !== "released") throw new Error("Unexpected release result");
    expect({
      kind: realRun.plan.kind,
      unitId: realRun.plan.unitId,
      subjectUserId: realRun.plan.subjectUserId,
      trigger: realRun.plan.trigger,
    }).toEqual({
      kind: dryRun.plan.kind,
      unitId: dryRun.plan.unitId,
      subjectUserId: dryRun.plan.subjectUserId,
      trigger: dryRun.plan.trigger,
    });
    expect(realRun.plan.affectedIds).toEqual(dryRun.plan.affectedIds);
    expect(realRun.plan.paidFutureDayPasses).toEqual(dryRun.plan.paidFutureDayPasses);
  });

  it("serializes concurrent terminal requests and returns already_ended without repeated effects", async () => {
    const [first, second] = await Promise.all([releaseSubject(input()), releaseSubject(input())]);
    const results = [first, second];
    const released = results.find((result) => result.outcome === "released");
    const alreadyEnded = results.find((result) => result.outcome === "already_ended");

    expect(released).toMatchObject({
      outcome: "released",
      plan: { paidFutureDayPasses: { count: 2, totalSar: 32.5 } },
    });
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(0);
    expect(stores.units.findAll()[0]).toMatchObject({
      verifiedOwnerId: 1, verifiedTenantId: null, occupantType: "vacant",
    });
    expect(stores.wahaPassApplications.findAll()[0]).toMatchObject({ status: "revoked", applicantUserId: null });
    expect(stores.wahaPassApplications.findAll()[1]?.status).toBe("active");
    expect(stores.wahaPassCredentials.findAll()[0]).toMatchObject({ status: "revoked", heldByUserId: null });
    expect(stores.bookings.findAll()[0]).toMatchObject({ status: "cancelled", userId: null, notes: null });
    expect(stores.bookings.findAll()[1]).toMatchObject({ status: "confirmed", userId: null, notes: null });
    expect(stores.wahaGuestDayPasses.findAll()).toHaveLength(3);
    expect(stores.wahaGuestDayPasses.findAll().every((pass) => pass.purchasedByUserId === null)).toBe(true);
    expect(stores.paymentAttempts.findAll()).toHaveLength(1);
    expect(stores.paymentAttempts.findAll()[0]?.userId).toBeNull();
    expect(stores.releaseOperations.findAll()[0]).toMatchObject({
      effectSummary: expect.objectContaining({ paidFutureDayPasses: { count: 2, totalSar: 32.5 } }),
    });
    expect(stores.externalIdentityDeletionJobs.findAll()[0]).toMatchObject({
      operationId: 1, status: "pending", clerkId: "clerk-tenant",
    });
    expect(alreadyEnded).toEqual({
      outcome: "already_ended",
      idempotencyKey: "release-test-1",
    });
    expect(stores.releaseOperations.findAll()).toHaveLength(1);
    expect(stores.externalIdentityDeletionJobs.findAll()).toHaveLength(1);
  });

  it("keeps tenant records outside a legal ownership-transfer release graph", async () => {
    stores.ownershipChangeEvents.insert({
      unitId: 1, outgoingOwnerId: 1, status: "pending", preApprovedClaimId: null,
    });

    const result = await releaseSubject(input({
      kind: "owner",
      subjectUserId: 1,
      trigger: { type: "ownership_change", id: 1, idempotencyKey: "owner-release-test-1" },
      dryRun: true,
    }));

    expect(result).toMatchObject({
      outcome: "planned",
      plan: {
        affectedIds: {
          applications: [2],
          credentials: [2],
          residents: [],
          futureBookings: [],
          dayPasses: [],
        },
      },
    });
  });

  it("accepts a legacy bare unit number only when it identifies one unit", async () => {
    stores.moveForms.updateFirst({ type: "eq", col: "id", val: 1 }, { unitId: null });
    await expect(releaseSubject(input({ dryRun: true }))).resolves.toMatchObject({ outcome: "planned" });

    stores.units.insert({
      building: "B", unitNumber: "101", verifiedOwnerId: null, verifiedTenantId: null,
      occupantType: "vacant", preApprovedClaimId: null,
    });
    await expect(releaseSubject(input({ dryRun: true }))).resolves.toMatchObject({
      outcome: "invalid_subject",
    });
  });

  it("moves an owner household out while retaining the verified ownership claim", async () => {
    stores.units.updateFirst({ type: "eq", col: "id", val: 1 }, {
      verifiedOwnerId: 1, verifiedTenantId: null, occupantType: "owner_occupied",
    });
    stores.moveForms.updateFirst({ type: "eq", col: "id", val: 1 }, { userId: 1, unitId: 1 });
    stores.residents.updateFirst({ type: "eq", col: "id", val: 1 }, {
      linkedUserId: 1, type: "owner", isPrimary: true,
    });
    stores.residents.insert({
      unitId: 1, linkedUserId: 2, registeredById: 1, status: "active",
      type: "owner", isPrimary: false,
      firstName: "Owner", lastName: "Family",
    });

    const result = await releaseSubject(input({
      kind: "owner", subjectUserId: 1,
      trigger: { type: "move_out_form", id: 1, idempotencyKey: "owner-move-out-1" },
    }));
    expect(result.outcome).toBe("released");
    expect(stores.units.findAll()[0]).toMatchObject({
      verifiedOwnerId: 1, verifiedTenantId: null, occupantType: "vacant",
    });
    expect(stores.residents.findAll().every((resident) => resident.status === "moved_out")).toBe(true);
  });

  it("Stage 6C O3/O4 releases an owner once without a claimant slot and preserves the verified tenant graph", async () => {
    stores.ownershipChangeEvents.insert({
      unitId: 1,
      outgoingOwnerId: 1,
      initiationType: "path_b",
      status: "pending",
      preApprovedClaimId: null,
    });

    const ownerRelease = input({
      kind: "owner",
      subjectUserId: 1,
      trigger: { type: "ownership_change", id: 1, idempotencyKey: "stage6c-owner-release-1" },
    });
    const [first, second] = await Promise.all([releaseSubject(ownerRelease), releaseSubject(ownerRelease)]);

    expect([first.outcome, second.outcome].sort()).toEqual(["already_ended", "released"]);
    expect(stores.releaseOperations.findAll()).toHaveLength(1);
    expect(stores.users.findAll({ type: "eq", col: "id", val: 1 })).toHaveLength(0);
    expect(stores.units.findAll()[0]).toMatchObject({
      verifiedOwnerId: null,
      verifiedTenantId: 2,
      occupantType: "tenant_occupied",
      preApprovedClaimId: null,
    });
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
    expect(stores.wahaPassApplications.findAll()[0]).toMatchObject({ applicantUserId: 2, status: "active" });
    expect(stores.wahaPassCredentials.findAll()[0]).toMatchObject({ heldByUserId: 2, status: "active" });
    expect(stores.residents.findAll()[0]).toMatchObject({ linkedUserId: 2, status: "active" });
    expect(stores.bookings.findAll()[0]).toMatchObject({ userId: 2, unitId: 1, status: "confirmed" });
    expect(stores.ownershipChangeEvents.findAll()[0]).toMatchObject({
      status: "approved",
      outgoingOwnerId: null,
    });
  });

  it("rolls back every mutation when a postcondition is induced to fail", async () => {
    vi.spyOn(stores.wahaPassEvents, "insert").mockImplementation((row) => ({
      ...row,
      id: 999,
    }));

    await expect(releaseSubject(input())).rejects.toThrow("Stage 6A A5 failed");

    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
    expect(stores.units.findAll()[0]?.verifiedTenantId).toBe(2);
    expect(stores.wahaPassApplications.findAll()[0]?.status).toBe("active");
    expect(stores.wahaPassCredentials.findAll()[0]?.status).toBe("active");
    expect(stores.bookings.findAll()[0]?.status).toBe("confirmed");
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
    expect(stores.externalIdentityDeletionJobs.findAll()).toHaveLength(0);
  });

  it("rolls back when a released booking would lose its final unit attribution", async () => {
    stores.bookings.updateFirst({ type: "eq", col: "id", val: 1 }, { unitId: null });

    await expect(releaseSubject(input())).rejects.toThrow("Stage 6A A8 failed");

    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
    expect(stores.bookings.findAll()[0]).toMatchObject({ userId: 2, unitId: null, status: "confirmed" });
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
    expect(stores.externalIdentityDeletionJobs.findAll()).toHaveLength(0);
  });

  it("F11: refuses the HOA COMMON system unit before any release mutation", async () => {
    stores.units.updateFirst({ type: "eq", col: "id", val: 1 }, {
      building: "HOA",
      unitNumber: "COMMON",
      isSystem: true,
    });

    await expect(releaseSubject(input({ dryRun: true }))).resolves.toEqual({
      outcome: "invalid_subject",
      reason: "System units are not resident or ownership-release subjects.",
    });
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
  });
});