import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const helpers = await import("./helpers/mockDb");
  return {
    and: helpers.and,
    eq: helpers.eq,
    inArray: helpers.inArray,
    lte: helpers.lte,
    ne: helpers.ne,
    gt: helpers.gt,
    gte: helpers.gte,
    isNull: helpers.isNull,
    or: helpers.or,
    sql: helpers.sql,
  };
});

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  cancelTenancyRenewal,
  decideTenancyRenewal,
  notificationLocaleFromUnsafeMetadata,
  runTenancyLifecycleScheduler,
  submitTenancyRenewal,
} from "../lib/tenancyLifecycle";
import { resetMockDb, stores } from "./helpers/mockDb";

const pastLeaseEnd = "2020-01-01";
const futureLeaseEnd = "2099-01-01";

function seedExpiredTenancy({
  pendingRenewal = true,
  leaseEndDate = pastLeaseEnd,
}: { pendingRenewal?: boolean; leaseEndDate?: string } = {}) {
  stores.units.insert({
    building: "A",
    unitNumber: "101",
    verifiedOwnerId: 1,
    verifiedTenantId: 2,
    occupantType: "tenant_occupied",
    preApprovedClaimId: null,
  });
  stores.users.insert({ clerkId: "owner-clerk", email: "owner@example.test", role: "owner", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "tenant-clerk", email: "tenant@example.test", role: "tenant", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "admin-clerk", email: "admin@example.test", role: "admin", unitId: null, status: "active" });
  stores.tenancyLifecycles.insert({
    unitId: 1,
    tenantUserId: 2,
    verificationId: 1,
    leaseStartDate: "2019-01-01",
    leaseEndDate,
    status: "active",
    suspendedAt: null,
    expiredAt: null,
    auditTrail: [],
  });
  if (pendingRenewal) {
    stores.tenancyRenewals.insert({
      lifecycleId: 1,
      unitId: 1,
      tenantUserId: 2,
      leaseStartDate: "2020-01-02",
      leaseEndDate: futureLeaseEnd,
      ejarReference: "EJAR-LATE-APPROVAL",
      status: "pending",
    });
  }
  stores.wahaPassApplications.insert({
    unitId: 1,
    applicantUserId: 2,
    occupancyTrack: "tenant",
    status: "active",
  });
  stores.wahaPassCredentials.insert({
    applicationId: 1,
    heldByUserId: 2,
    passNumber: "WP-101",
    status: "active",
  });
  stores.bookings.insert({
    userId: 2,
    unitId: 1,
    startTime: new Date("2099-01-10T10:00:00Z"),
    endTime: new Date("2099-01-10T11:00:00Z"),
    status: "confirmed",
    paymentStatus: "paid",
    totalAmount: "75.00",
  });
}

beforeEach(() => resetMockDb());

function isoDay(offset: number, now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function seedActiveLifecycle(leaseEndDate: string) {
  stores.units.insert({
    building: "A", unitNumber: "101", verifiedOwnerId: 1, verifiedTenantId: 2,
    occupantType: "tenant_occupied", preApprovedClaimId: null,
  });
  stores.users.insert({ clerkId: "p2-owner", email: "owner@example.test", role: "owner", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "p2-tenant", email: "tenant@example.test", role: "tenant", unitId: 1, status: "active" });
  stores.users.insert({ clerkId: "p2-admin", email: "admin@example.test", role: "admin", unitId: null, status: "active" });
  stores.tenancyLifecycles.insert({
    unitId: 1, tenantUserId: 2, verificationId: 1,
    leaseStartDate: isoDay(-365), leaseEndDate, status: "active",
    suspendedAt: null, expiredAt: null, auditTrail: [],
  });
}

function p2Events(type: string) {
  return stores.notificationEvents.findAll({ type: "eq", col: "eventType", val: type }) as any[];
}

describe("F8c / T14d — pending renewal across expiry", () => {
  it("suspends access and retains a paid future booking, then restores both after late owner approval", async () => {
    seedExpiredTenancy();

    await runTenancyLifecycleScheduler();

    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })[0]).toMatchObject({ status: "suspended" });
    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({ status: "suspended" });
    expect(stores.wahaPassCredentials.findAll()[0]).toMatchObject({ status: "suspended" });
    expect(stores.bookings.findAll()[0]).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
    expect(stores.releaseOperations.findAll()).toHaveLength(0);

    const renewal = stores.tenancyRenewals.findAll()[0] as any;
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const owner = stores.users.findAll({ type: "eq", col: "id", val: 1 })[0] as any;
    await decideTenancyRenewal(renewal, lifecycle, owner, "approved", "Late owner approval");

    expect(stores.tenancyRenewals.findAll()[0]).toMatchObject({ status: "approved" });
    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({
      status: "active",
      leaseEndDate: futureLeaseEnd,
      suspendedAt: null,
      expiredAt: null,
    });
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })[0]).toMatchObject({ status: "active" });
    expect(stores.wahaPassCredentials.findAll()[0]).toMatchObject({ status: "active" });
    expect(stores.bookings.findAll()[0]).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
  });
});

describe("T14 scheduler concurrency", () => {
  it("keeps a concurrent paid booking confirmed and produces no terminal release during duplicated expiry work", async () => {
    seedExpiredTenancy();

    await Promise.all([
      runTenancyLifecycleScheduler(),
      runTenancyLifecycleScheduler(),
      Promise.resolve().then(() => {
        stores.bookings.updateFirst(
          { type: "eq", col: "id", val: 1 },
          { paymentStatus: "paid", status: "confirmed" },
        );
      }),
    ]);

    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({ status: "suspended" });
    expect(stores.bookings.findAll()[0]).toMatchObject({ paymentStatus: "paid", status: "confirmed" });
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(1);
  });
});

describe("X3 event 12 — irreversible deletion notice", () => {
  it("is enqueued once per channel at the 30-day boundary and remains deduplicated across scheduler reruns", async () => {
    const recentlyExpired = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    seedExpiredTenancy({ pendingRenewal: false, leaseEndDate: recentlyExpired });
    stores.hoaSettings.insert({ key: "tenancyExpiryDeletionDelayDays", value: "30" });

    await Promise.all([
      runTenancyLifecycleScheduler(),
      runTenancyLifecycleScheduler(),
      runTenancyLifecycleScheduler(),
      runTenancyLifecycleScheduler(),
    ]);

    const deletionNotices = stores.notificationEvents.findAll(
      { type: "eq", col: "eventType", val: "12" },
    );
    expect(deletionNotices).toHaveLength(2);
    expect(deletionNotices.map((event: any) => event.channel).sort()).toEqual(["email", "push"]);
    expect(deletionNotices.every((event: any) => event.preferencePolicy === "mandatory")).toBe(true);
  });
});

describe("P2 seeded renewal notification lifecycle", () => {
  beforeEach(() => {
    resetMockDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T08:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it.each([["en", "en"], ["ar", "ar"], ["fr", "ar"], [undefined, "ar"]] as const)(
    "resolves Clerk metadata locale %s to %s",
    (metadataLocale, expected) => {
      expect(notificationLocaleFromUnsafeMetadata(metadataLocale)).toBe(expected);
    },
  );

  it.each([
    [31, "rejects"],
    [30, "accepts"],
    [1, "accepts"],
    [0, "rejects"],
  ] as const)("enforces the renewal submission window at %i days: %s", async (days, expected) => {
    seedActiveLifecycle(isoDay(days));
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;
    const attempt = submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(days + 1), leaseEndDate: isoDay(days + 366), ejarReference: `EJAR-WINDOW-${days}`,
    });
    if (expected === "accepts") {
      await expect(attempt).resolves.toMatchObject({ status: "pending" });
    } else {
      await expect(attempt).rejects.toThrow(/opens 30 days|closes one day/i);
    }
  });

  it.each([30, 14, 7, 1])("seeds the %i-day A/B boundary: both recipients receive both mandatory channels", async (days) => {
    seedActiveLifecycle(isoDay(days));
    await runTenancyLifecycleScheduler();

    const tenant = p2Events("tenancy_pre_expiry_tenant");
    const owner = p2Events("tenancy_pre_expiry_landlord");
    expect(tenant).toHaveLength(2);
    expect(owner).toHaveLength(2);
    expect(tenant.map((event) => event.channel).sort()).toEqual(["email", "push"]);
    expect(owner.map((event) => event.channel).sort()).toEqual(["email", "push"]);
    expect([...tenant, ...owner].every((event) => event.preferencePolicy === "mandatory")).toBe(true);
    expect(tenant.every((event) => event.recipientUserId === 2)).toBe(true);
    expect(owner.every((event) => event.recipientUserId === 1)).toBe(true);
  });

  it("seeds B-to-C: submission stops B and creates C immediately, then exactly every two days", async () => {
    seedActiveLifecycle(isoDay(14));
    await runTenancyLifecycleScheduler();
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;

    const renewal = await submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(15), leaseEndDate: isoDay(380), ejarReference: "EJAR-P2",
    });
    stores.tenancyRenewals.updateFirst({ type: "eq", col: "id", val: renewal.id }, { submittedAt: new Date(), createdAt: new Date() });
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(2);

    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_pre_expiry_landlord")).toHaveLength(2);
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(2);

    vi.advanceTimersByTime(2 * 86_400_000);
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(4);
    expect(renewal.status).toBe("pending");
  });

  it("stops C after approval and carries the renewal end date forward", async () => {
    seedActiveLifecycle(isoDay(14));
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;
    const owner = stores.users.findAll({ type: "eq", col: "id", val: 1 })[0] as any;
    const renewal = await submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(15), leaseEndDate: isoDay(380), ejarReference: "EJAR-APPROVE",
    });
    await decideTenancyRenewal(renewal, lifecycle, owner, "approved", null);
    vi.advanceTimersByTime(2 * 86_400_000);
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(2);
    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({ status: "active", leaseEndDate: isoDay(378) });
  });

  it("closes A/B for renewal 2 after renewal 1 established the current lease cycle", async () => {
    seedActiveLifecycle(isoDay(30));
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;
    const owner = stores.users.findAll({ type: "eq", col: "id", val: 1 })[0] as any;
    const renewal1 = await submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(31), leaseEndDate: isoDay(60), ejarReference: "EJAR-CYCLE-1",
    });
    await decideTenancyRenewal(renewal1, lifecycle, owner, "approved", null);
    vi.advanceTimersByTime(30 * 86_400_000);
    const carriedLifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    await submitTenancyRenewal(carriedLifecycle, tenant, {
      leaseStartDate: isoDay(31), leaseEndDate: isoDay(396), ejarReference: "EJAR-CYCLE-2",
    });
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_pre_expiry_tenant")).toHaveLength(0);
    expect(p2Events("tenancy_pre_expiry_landlord")).toHaveLength(0);
    // One immediate C per submitted renewal, each delivered to both channels.
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(4);
  });

  it.each(["rejected", "cancelled"] as const)("stops C after %s terminal decision", async (outcome) => {
    // Advance to the 1-day A/B boundary after the terminal outcome.
    seedActiveLifecycle(isoDay(2));
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;
    const owner = stores.users.findAll({ type: "eq", col: "id", val: 1 })[0] as any;
    const admin = stores.users.findAll({ type: "eq", col: "id", val: 3 })[0] as any;
    const renewal = await submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(3), leaseEndDate: isoDay(380), ejarReference: `EJAR-${outcome}`,
    });
    if (outcome === "rejected") await decideTenancyRenewal(renewal, lifecycle, owner, "rejected", null);
    else await cancelTenancyRenewal(renewal, lifecycle, admin, "T11 stale cancellation");
    vi.advanceTimersByTime(86_400_000);
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(2);
    expect(p2Events("tenancy_pre_expiry_tenant")).toHaveLength(0);
    expect(p2Events("tenancy_pre_expiry_landlord")).toHaveLength(0);
  });

  it("continues C through expiry suspension, then caps it at 30 days without lifting suspension", async () => {
    seedActiveLifecycle(isoDay(1));
    const lifecycle = stores.tenancyLifecycles.findAll()[0] as any;
    const tenant = stores.users.findAll({ type: "eq", col: "id", val: 2 })[0] as any;
    await submitTenancyRenewal(lifecycle, tenant, {
      leaseStartDate: isoDay(2), leaseEndDate: isoDay(380), ejarReference: "EJAR-SUSPENDED",
    });
    stores.tenancyRenewals.updateFirst({ type: "eq", col: "id", val: 1 }, { submittedAt: new Date(), createdAt: new Date() });
    vi.advanceTimersByTime(2 * 86_400_000);
    await runTenancyLifecycleScheduler();
    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({ status: "suspended" });
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(4);
    vi.advanceTimersByTime(28 * 86_400_000);
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(4);
    expect(stores.tenancyLifecycles.findAll()[0]).toMatchObject({ status: "suspended" });
  });

  it.each([
    ["completed move-out / admin release", "released"],
    ["account deletion terminal lifecycle", "expired"],
    ["terminal release request", "release_requested"],
  ] as const)("does not enqueue A, B, or C after %s", async (_scenario, status) => {
    seedActiveLifecycle(isoDay(14));
    stores.tenancyLifecycles.updateFirst({ type: "eq", col: "id", val: 1 }, { status });
    stores.tenancyRenewals.insert({
      lifecycleId: 1, unitId: 1, tenantUserId: 2,
      leaseStartDate: isoDay(15), leaseEndDate: isoDay(380), ejarReference: "EJAR-TERMINAL",
      status: "pending", submittedAt: new Date(), createdAt: new Date(),
    });
    await runTenancyLifecycleScheduler();
    expect(p2Events("tenancy_pre_expiry_tenant")).toHaveLength(0);
    expect(p2Events("tenancy_pre_expiry_landlord")).toHaveLength(0);
    expect(p2Events("tenancy_renewal_decision_reminder")).toHaveLength(0);
  });
});