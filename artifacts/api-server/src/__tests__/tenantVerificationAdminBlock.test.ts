/**
 * Task #591 — Admin is blocked from approving or rejecting tenant_request verifications.
 *
 * Business rule: only the unit owner may approve or decline a tenant linkage
 * request.  The API enforces this with a 403 guard on both
 *   POST /unit-verify/:id/approve
 *   POST /unit-verify/:id/reject
 * when the caller is an admin and the verification is of type "tenant_request".
 *
 * Covered cases:
 *   1. Admin → approve tenant_request → 403
 *   2. Admin → reject  tenant_request → 403
 *   3. Unit owner → approve tenant_request → 200 (positive control)
 *   4. Admin → cancel tenant_request → cancelled, then tenant can resubmit
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

// ─── Module mocks (hoisted before any imports that touch them) ────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return {
    db: mockDb,
    ...mockTables,
  };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, desc, ilike, inArray, isNotNull, isNull } = await import(
    "./helpers/mockDb"
  );
  return { eq, and, desc, ilike, inArray, isNotNull, isNull };
});

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: req.headers["x-test-clerk-id"] ?? mockAuthState.userId });
      next();
    },
    getAuth: (req: any) => ({ userId: req.headers["x-test-clerk-id"] ?? mockAuthState.userId }),
  };
});

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/pushNotifications", () => ({
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    storeTitleDeed = vi.fn().mockResolvedValue("/objects/title-deeds/test.pdf");
    getTitleDeedViewURL = vi.fn().mockResolvedValue("https://example.com/deed.pdf");
    deleteObjectEntity = vi.fn().mockResolvedValue(undefined);
  },
}));

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb, mockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Clerk user IDs ───────────────────────────────────────────────────────────

const CLERK_ADMIN  = "clerk-tenant-block-admin";
const CLERK_GUARD  = "clerk-tenant-block-guard";
const CLERK_OWNER  = "clerk-tenant-block-owner";
const CLERK_TENANT = "clerk-tenant-block-tenant";
const CLERK_OTHER_OWNER = "clerk-tenant-block-other-owner";

// ─── Seed ─────────────────────────────────────────────────────────────────────
//
// Insertion order determines serial IDs:
//   admin  → id 1
//   owner  → id 2  (verified owner of unit id 1)
//   tenant → id 3  (pending tenant linkage)
//   unit   → id 1  (verifiedOwnerId = 2)
//   verification → id 1  (type="tenant_request", userId=3, unitId=1, status="pending")

function seedAll() {
  resetMockDb();

  stores.users.insert({
    clerkId: CLERK_ADMIN,
    email: "admin@tenant-block-test.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "A",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }); // id=1

  stores.users.insert({
    clerkId: CLERK_GUARD,
    email: "guard@tenant-block-test.com",
    role: "guard",
    status: "active",
    firstName: "Guard",
    lastName: "G",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }); // id=2

  stores.users.insert({
    clerkId: CLERK_OWNER,
    email: "owner@tenant-block-test.com",
    role: "owner",
    status: "active",
    firstName: "Owner",
    lastName: "O",
    verificationStatus: "verified_owner",
    unitNumber: "B1 101",
    unitId: 1,
  }); // id=3

  stores.users.insert({
    clerkId: CLERK_TENANT,
    email: "tenant@tenant-block-test.com",
    role: "unverified",
    status: "pending",
    firstName: "Tenant",
    lastName: "T",
    verificationStatus: "pending_owner_approval",
    unitNumber: "B1 101",
    unitId: 1,
  }); // id=4

  stores.users.insert({
    clerkId: CLERK_OTHER_OWNER,
    email: "other-owner@tenant-block-test.com",
    role: "owner",
    status: "active",
    firstName: "Other",
    lastName: "Owner",
    verificationStatus: "verified_owner",
    unitNumber: "B1 102",
    unitId: 2,
  }); // id=5

  stores.units.insert({
    building: "B1",
    unitNumber: "101",
    verifiedOwnerId: 3,
    ownerNationalId: "OWNER-NID",
    verifiedTenantId: null,
    occupantType: "vacant",
    parkingLots: null,
    preApprovedClaimId: null,
  }); // id=1

  stores.units.insert({
    building: "B1",
    unitNumber: "102",
    verifiedOwnerId: 5,
    verifiedTenantId: null,
    occupantType: "owner_occupied",
    parkingLots: null,
    preApprovedClaimId: null,
  }); // id=2

  stores.unitVerifications.insert({
    type: "tenant_request",
    userId: 4,
    unitId: 1,
    nationalId: "1234567890",
    ejarReference: "EJAR-001",
    status: "pending",
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    firstName: "Tenant",
    middleName: null,
    lastName: "T",
    mobile: "+966501234567",
    dateOfBirth: "1990-05-05",
    nationality: "Saudi",
    ownerNationalId: null,
    parkingLots: null,
    titleDeedKey: null,
    reviewedById: null,
    reviewNote: null,
  }); // id=1
}

beforeAll(() => {
  seedAll();
});

beforeEach(() => {
  mockAuthState.userId = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/unit-verify/:id/approve — admin is blocked for tenant_request
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/unit-verify/:id/approve — admin blocked for tenant_request", () => {
  it("admin receives 403 when approving a tenant_request verification", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/approve");
    expect(res.status).toBe(403);
  });

  it("admin 403 response body indicates admin cannot approve tenant requests", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/approve");
    expect(res.status).toBe(403);
    // Should carry a meaningful error message (not a generic empty body)
    expect(res.body.error).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/unit-verify/:id/reject — admin is blocked for tenant_request
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/unit-verify/:id/reject — admin blocked for tenant_request", () => {
  it("admin receives 403 when rejecting a tenant_request verification", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/reject");
    expect(res.status).toBe(403);
  });

  it("admin 403 response body indicates admin cannot reject tenant requests", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/reject");
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
  });
});

describe("X8 — deferred T14d tenancy renewal authority boundary", () => {
  it("does not expose approval or rejection actions to an admin before Stage 6B exists", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    await request(app).post("/api/tenancy-renewals/1/approve").send({}).expect(404);
    await request(app).post("/api/tenancy-renewals/1/reject").send({}).expect(404);
  });
});

describe("X8c — staff accounts cannot submit resident claims", () => {
  for (const [label, clerkId] of [
    ["admin", CLERK_ADMIN],
    ["guard", CLERK_GUARD],
  ] as const) {
    it(`${label} cannot start an owner or tenant claim or mutate resident linkage`, async () => {
      seedAll();
      mockAuthState.userId = clerkId;
      const usersBefore = stores.users.findAll();
      const verificationsBefore = stores.unitVerifications.findAll();
      const ownerIdAttemptsBefore = stores.unitVerificationOwnerIdAttempts.findAll();

      await request(app).post("/api/unit-verify/check-owner").send({
        building: "B1",
        unitNumber: "101",
        ownerNationalId: "NID-STAFF",
      }).expect(403, { error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });

      await request(app).post("/api/unit-verify/owner").send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-STAFF",
      }).expect(403, { error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });
      await request(app).post("/api/unit-verify/tenant").send({
        building: "B1",
        unitNumber: "101",
      }).expect(403, { error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });

      expect(stores.users.findAll()).toEqual(usersBefore);
      expect(stores.unitVerifications.findAll()).toEqual(verificationsBefore);
      expect(stores.unitVerificationOwnerIdAttempts.findAll()).toEqual(ownerIdAttemptsBefore);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/unit-verify/:id/approve — unit owner succeeds (positive control)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/unit-verify/:id/approve — unit owner succeeds", () => {
  // Re-seed before this test to ensure verification is still in "pending" state
  // (the admin tests above should not have mutated it, but reseed to be safe).
  beforeEach(() => {
    seedAll();
  });

  it("unit owner receives 200 when approving a tenant_request for their own unit", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/unit-verify/1/approve").send({
      approvalBases: ["ejar_contract_verified"],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(stores.units.findAll()[0]).toEqual(expect.objectContaining({
      verifiedOwnerId: 3,
      verifiedTenantId: 4,
      occupantType: "tenant_occupied",
    }));
    expect(stores.residents.findAll()).toEqual([
      expect.objectContaining({ unitId: 1, linkedUserId: 4, type: "tenant", status: "active", isPrimary: true }),
    ]);
    await Promise.resolve();
    expect(stores.notificationEvents.findAll().filter((row: any) => row.eventType === "10")).toHaveLength(2);
  });
});

describe("SG11 — approval basis validation", () => {
  beforeEach(() => {
    seedAll();
    mockAuthState.userId = CLERK_OWNER;
  });

  it.each([
    [{}, "At least one approval basis is required."],
    [{ approvalBases: ["mullak_verified"] }, "One or more approval bases are not valid for this verification type."],
    [{ approvalBases: ["other"], otherText: "   " }, "Please provide a nonblank description for the Other approval basis."],
  ])("rejects invalid tenant approval bases", async (payload, error) => {
    const response = await request(app).post("/api/unit-verify/1/approve").send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(error);
    expect(stores.unitVerifications.findAll()[0].status).toBe("pending");
  });

  it("accepts a valid tenant approval basis payload", async () => {
    const response = await request(app).post("/api/unit-verify/1/approve").send({
      approvalBases: ["ejar_contract_verified", "other"],
      otherText: "I reviewed the signed agreement with the tenant.",
    });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("rejects tenant-only bases and accepts admin owner-verification bases", async () => {
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 2 },
      { verifiedOwnerId: null, occupantType: "vacant" },
    );
    stores.unitVerifications.insert({
      type: "owner_manual",
      userId: 4,
      unitId: 2,
      nationalId: "2222222222",
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    mockAuthState.userId = CLERK_ADMIN;
    await request(app).post("/api/unit-verify/2/approve").send({
      approvalBases: ["ejar_contract_verified"],
    }).expect(400, { error: "One or more approval bases are not valid for this verification type." });

    const response = await request(app).post("/api/unit-verify/2/approve").send({
      approvalBases: ["mullak_verified", "deed_number_verified_against_mullak"],
    });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe("SG11 — approved verification history", () => {
  beforeEach(() => {
    seedAll();
  });

  it("lets an admin read the persisted tenant approval basis after the request is approved", async () => {
    mockAuthState.userId = CLERK_OWNER;
    await request(app).post("/api/unit-verify/1/approve").send({
      approvalBases: ["ejar_contract_verified", "other"],
      otherText: "Signed agreement reviewed in person.",
    }).expect(200);

    mockAuthState.userId = CLERK_ADMIN;
    const response = await request(app).get("/api/unit-verify/history").expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 1,
        status: "approved",
        approvalBases: JSON.stringify(["ejar_contract_verified", "other"]),
        approvalOtherText: "Signed agreement reviewed in person.",
        unit: expect.objectContaining({ id: 1 }),
      }),
    ]);
    expect(response.body[0]).not.toHaveProperty("ownerNationalId");
  });

  it("keeps approval history admin-only", async () => {
    mockAuthState.userId = CLERK_OWNER;
    await request(app).get("/api/unit-verify/history").expect(403);
  });
});

describe("POST /api/unit-verify/:id/approve and /reject — another unit's owner is blocked", () => {
  beforeEach(() => {
    seedAll();
    mockAuthState.userId = CLERK_OTHER_OWNER;
  });

  it("does not let an owner approve a tenant request for a different unit", async () => {
    await request(app).post("/api/unit-verify/1/approve").send({}).expect(403);
  });

  it("does not let an owner reject a tenant request for a different unit", async () => {
    await request(app).post("/api/unit-verify/1/reject").send({}).expect(403);
  });
});

describe("T11 — an admin cancellation notifies both parties", () => {
  beforeEach(() => {
    seedAll();
    mockAuthState.userId = CLERK_ADMIN;
  });

  it("records the reason and persists bilingual paired cancellation notices to tenant and owner", async () => {
    await request(app)
      .post("/api/unit-verify/1/cancel")
      .send({ reason: "No response after reminders" })
      .expect(200);

    await Promise.resolve();
    const rows = stores.notificationEvents.findAll()
      .filter((row: any) => row.eventType === "11");
    expect(rows).toHaveLength(4);
    for (const recipient of [
      [4, "tenant@tenant-block-test.com"],
      [3, "owner@tenant-block-test.com"],
    ]) {
      const recipientRows = rows.filter((row: any) => row.recipientUserId === recipient[0]);
      expect(recipientRows.map((row: any) => row.channel).sort()).toEqual(["email", "push"]);
      expect(recipientRows.every((row: any) => row.recipientEmail === recipient[1])).toBe(true);
      expect(recipientRows[0].idempotencyKey).toBe(recipientRows[1].idempotencyKey);
      expect(JSON.parse(recipientRows[0].payload as string).body).toContain("No response after reminders");
    }
  });

  it("cancels the pending request and releases the tenant slot for resubmission", async () => {
    const cancellation = await request(app)
      .post("/api/unit-verify/1/cancel")
      .send({ reason: "Owner did not respond" })
      .expect(200);

    expect(cancellation.body).toEqual({ ok: true, status: "cancelled" });
    expect(stores.unitVerifications.findAll()).toEqual([
      expect.objectContaining({
        id: 1,
        status: "cancelled",
        cancelledById: 1,
        cancellationReason: "Owner did not respond",
      }),
    ]);

    mockAuthState.userId = CLERK_TENANT;
    const resubmission = await request(app)
      .post("/api/unit-verify/tenant")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "TENANT-NID-2",
        ownerNationalId: "OWNER-NID",
        ejarReference: "EJAR-002",
        ejarDocumentKey: "/objects/ejar/resubmission.pdf",
        leaseStartDate: "2026-09-01",
        leaseEndDate: "2027-09-01",
        firstName: "Tenant",
        lastName: "T",
        gender: "male",
        mobile: "+966501234567",
        dateOfBirth: "1990-05-05",
        nationality: "Saudi",
      })
      .expect(200);

    expect(resubmission.body.verificationId).toBe(2);
    expect(stores.unitVerifications.findAll()).toEqual([
      expect.objectContaining({ id: 1, status: "cancelled" }),
      expect.objectContaining({ id: 2, type: "tenant_request", status: "pending", unitId: 1 }),
    ]);
  });
});

describe("T12 — occupancy blocks approval, then move-out unblocks the pending request", () => {
  beforeEach(() => {
    seedAll();
    stores.residents.insert({
      unitId: 1,
      firstName: "Household",
      lastName: "Member",
      type: "family",
      status: "active",
      linkedUserId: null,
    });
    mockAuthState.userId = CLERK_OWNER;
  });

  it("returns an occupancy conflict while a household resident is active", async () => {
    const response = await request(app).post("/api/unit-verify/1/approve").send({ approvalBases: ["tenant_known_to_me"] }).expect(409);
    expect(response.body.error).toBe("OCCUPANCY_CONFLICT");
  });

  it("still lets the owner reject while the approval gate is blocked", async () => {
    await request(app).post("/api/unit-verify/1/reject").send({ note: "Not proceeding" }).expect(200);
  });

  it("allows the same pending request to be approved after the household moves out", async () => {
    await request(app).post("/api/unit-verify/1/approve").send({ approvalBases: ["tenant_known_to_me"] }).expect(409);
    stores.residents.updateFirst(
      { type: "eq", col: "unitId", val: 1 },
      { status: "inactive" },
    );
    await request(app).post("/api/unit-verify/1/approve").send({ approvalBases: ["tenant_known_to_me"] }).expect(200);
  });
});

describe("Atomic occupancy activation boundary", () => {
  beforeEach(() => {
    seedAll();
    mockAuthState.userId = CLERK_OWNER;
    vi.restoreAllMocks();
  });

  it("blocks tenant activation from owner_occupied unit state even without an owner resident row", async () => {
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { occupantType: "owner_occupied" },
    );
    await request(app).post("/api/unit-verify/1/approve")
      .send({ approvalBases: ["tenant_known_to_me"] }).expect(409);
    expect(stores.unitVerifications.findAll()[0].status).toBe("pending");
    expect(stores.residents.findAll()).toHaveLength(0);
  });

  it("rolls back verification and unit activation when a durable user write fails", async () => {
    const originalUpdate = mockDb.update;
    vi.spyOn(mockDb, "update").mockImplementation(((table: any) => {
      if (table.__storeName === "users") throw new Error("injected durable failure");
      return originalUpdate(table);
    }) as typeof mockDb.update);
    await request(app).post("/api/unit-verify/1/approve")
      .send({ approvalBases: ["tenant_known_to_me"] }).expect(500);
    expect(stores.unitVerifications.findAll()[0].status).toBe("pending");
    expect(stores.units.findAll()[0]).toEqual(expect.objectContaining({
      verifiedTenantId: null,
      occupantType: "vacant",
    }));
    expect(stores.residents.findAll()).toHaveLength(0);
  });

  it("rolls back approval when the conditional unit expected-state update loses", async () => {
    const originalUpdate = mockDb.update;
    vi.spyOn(mockDb, "update").mockImplementation(((table: any) => {
      if (table.__storeName === "units") {
        return { set: () => ({ where: () => Object.assign(Promise.resolve([]), {
          returning: () => Promise.resolve([]),
        }) }) } as ReturnType<typeof mockDb.update>;
      }
      return originalUpdate(table);
    }) as typeof mockDb.update);
    await request(app).post("/api/unit-verify/1/approve")
      .send({ approvalBases: ["tenant_known_to_me"] }).expect(409);
    expect(stores.unitVerifications.findAll()[0].status).toBe("pending");
    expect(stores.residents.findAll()).toHaveLength(0);
  });

  it("serializes concurrent owner-versus-tenant activation so exactly one wins", async () => {
    const ownerApplicant = stores.users.insert({
      clerkId: "atomic-owner-applicant",
      email: "atomic-owner@test.com",
      role: "unverified",
      status: "pending",
      firstName: "Atomic",
      lastName: "Owner",
      verificationStatus: "pending_manual",
      unitId: null,
      unitNumber: null,
    });
    const ownerVerification = stores.unitVerifications.insert({
      type: "owner_manual",
      userId: ownerApplicant.id,
      unitId: 1,
      nationalId: "ATOMIC-OWNER-NID",
      status: "pending",
    });

    const responses = await Promise.all([
      request(app).post("/api/unit-verify/1/approve")
        .set("x-test-clerk-id", CLERK_OWNER)
        .send({ approvalBases: ["tenant_known_to_me"] }),
      request(app).post(`/api/unit-verify/${ownerVerification.id}/approve`)
        .set("x-test-clerk-id", CLERK_ADMIN)
        .send({ approvalBases: ["deed_number_verified_against_mullak"] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(stores.unitVerifications.findAll().filter((row) => row.status === "approved")).toHaveLength(1);
    expect(["owner_occupied", "tenant_occupied"]).toContain(stores.units.findAll()[0].occupantType);
  });
});
