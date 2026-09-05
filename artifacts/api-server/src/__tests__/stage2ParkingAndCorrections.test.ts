/**
 * Focused Stage 2 B8/B9 tests
 *
 * Covers:
 *  1. parkingLots input validation at the owner API boundary
 *     - blank building, blank lotNumber, missing/non-boolean isInside rejected
 *  2. Cross-building same-number uniqueness (distinct building+lotNumber per unit)
 *  3. Tenant parking confirmation is optional; legacy confirmation is ignored
 *  4. Owner approval writes nationalId → units.ownerNationalId (B9)
 *  5. ownerNationalId not exposed to non-admin GET /units or GET /units/:id
 *  6. Admin parking lot CRUD role guards (non-admin blocked)
 *  7. Admin data-migration-corrections GET role guard
 */

import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    storeTitleDeed = vi.fn().mockResolvedValue("/objects/title-deeds/mock.pdf");
    getTitleDeedViewURL = vi.fn().mockResolvedValue("https://signed.url");
    deleteObjectEntity = vi.fn().mockResolvedValue(undefined);
    getObjectEntityFile = vi.fn().mockResolvedValue("https://signed.url/doc");
    getObjectEntityUploadURL = vi.fn().mockResolvedValue("https://upload.url/doc");
    normalizeObjectEntityPath = vi.fn().mockReturnValue("/objects/title-deeds/abc.pdf");
  },
  objectStorageService: {
    storeTitleDeed: vi.fn().mockResolvedValue("/objects/title-deeds/mock.pdf"),
    deleteObjectEntity: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, ne, desc, lt, gt, gte, lte, inArray, isNotNull, isNull, ilike, count, or, sql } =
    await import("./helpers/mockDb");
  return { eq, and, ne, desc, lt, gt, gte, lte, inArray, isNotNull, isNull, ilike, count, or, sql };
});

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: mockAuthState.userId });
      next();
    },
    getAuth: (_req: any) => ({ userId: mockAuthState.userId }),
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
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

vi.mock("../lib/pushNotifications", () => ({
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

let app: any;
beforeAll(async () => {
  const { default: appMod } = await import("../app");
  app = appMod;
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const ADMIN_CLERK = "s2-admin-clerk";
const OWNER_CLERK = "s2-owner-clerk";
const TENANT_CLERK = "s2-tenant-clerk";
const VALID_TENANT_TENANCY = {
  firstName: "Bob",
  lastName: "Tenant",
  gender: "male",
  nationalId: "TENANT-NID",
  ownerNationalId: "OWNER-NID",
  mobile: "0512345678",
  dateOfBirth: "1990-05-05",
  ejarDocumentKey: "/objects/ejar/test-ejar.pdf",
  leaseStartDate: "2026-08-01",
  leaseEndDate: "2027-07-31",
};

type UnitFixture = {
  id: number;
};

function seedAdmin() {
  return stores.users.insert({
    clerkId: ADMIN_CLERK,
    email: "s2admin@test.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "A",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  });
}

function seedOwnerUser() {
  return stores.users.insert({
    clerkId: OWNER_CLERK,
    email: "s2owner@test.com",
    role: "owner",
    status: "active",
    firstName: "Alice",
    lastName: "Owner",
    verificationStatus: "unverified",
    nationalId: null,
    unitNumber: null,
    unitId: null,
  });
}

function seedTenantUser() {
  return stores.users.insert({
    clerkId: TENANT_CLERK,
    email: "s2tenant@test.com",
    role: "tenant",
    status: "active",
    firstName: "Bob",
    lastName: "Tenant",
    verificationStatus: "unverified",
    nationalId: null,
    unitNumber: null,
    unitId: null,
  });
}

function seedVerifiedOwnerUser() {
  return stores.users.insert({
    clerkId: "s2-verified-owner-clerk",
    email: "s2verifiedowner@test.com",
    role: "owner",
    status: "active",
    firstName: "Verified",
    lastName: "Owner",
    verificationStatus: "verified_owner",
    nationalId: "NID-VERIFIED-001",
    unitNumber: "B1 101",
    unitId: null,
  });
}

function seedUnit(overrides: Record<string, unknown> = {}) {
  const verifiedOwner = seedVerifiedOwnerUser();
  const unit: UnitFixture = stores.units.insert({
    building: "B1",
    unitNumber: "101",
    unitType: "apartment",
    verifiedOwnerId: verifiedOwner.id,
    verifiedTenantId: null,
    occupantType: "owner_occupied",
    ownerNationalId: "OWNER-NID",
    ...overrides,
  }) as UnitFixture;
  // link verified owner to unit
  stores.users.updateFirst(
    { type: "eq", col: "id", val: verifiedOwner.id },
    { unitId: unit.id },
  );
  return { unit, verifiedOwner };
}

function seedCanonicalParkingLot(unitId: number) {
  return stores.parkingLots.insert({
    unitId,
    building: "B1",
    lotNumber: "P-1",
    parkingType: "underground",
    active: true,
    source: "stage2",
  });
}

beforeEach(() => {
  resetMockDb();
});

// ─── 1. parkingLots input validation at owner boundary ────────────────────────

describe("POST /unit-verify/owner — parkingLots input validation", () => {
  it("rejects parkingLots with a blank building", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: [{ building: "   ", lotNumber: "P-1", isInside: true }],
      })
      .expect(400);

    expect(res.body.error).toMatch(/building/i);
  });

  it("rejects parkingLots with a blank lotNumber", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: [{ building: "B1", lotNumber: "", isInside: false }],
      })
      .expect(400);

    expect(res.body.error).toMatch(/lotNumber/i);
  });

  it("rejects parkingLots where isInside is not a boolean", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: [{ building: "B1", lotNumber: "P-1", isInside: "yes" }],
      })
      .expect(400);

    expect(res.body.error).toMatch(/isInside/i);
  });

  it("rejects parkingLots where an entry is not an object", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: ["not-an-object"],
      })
      .expect(400);

    expect(res.body.error).toMatch(/object/i);
  });

  it("rejects when parkingLots is not an array", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: { building: "B1", lotNumber: "P-1", isInside: true },
      })
      .expect(400);

    expect(res.body.error).toMatch(/array/i);
  });

  it("accepts valid parkingLots with isInside boolean", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
        parkingLots: [{ building: "B1", lotNumber: "P-1", isInside: true }],
      })
      .expect(200);

    expect(res.body.result).toBe("pending_manual_review");
  });

  it("accepts an owner submission with no parkingLots", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "NID-001",
        gender: "female",
        mobile: "+966501234567",
        titleDeedNumber: "1234567890123456",
      })
      .expect(200);

    expect(res.body.result).toBe("pending_manual_review");
  });
});

// ─── 2. Tenant parking confirmation is optional and legacy fields are ignored ─

describe("POST /unit-verify/tenant — optional parking confirmation", () => {
  it("accepts a tenant request with no parking confirmation", async () => {
    seedTenantUser();
    mockAuthState.userId = TENANT_CLERK;
    const { unit } = seedUnit();
    seedCanonicalParkingLot(unit.id);

    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send({
        building: "B1",
        unitNumber: "101",
        ejarReference: "EJAR-001",
        ...VALID_TENANT_TENANCY,
      })
      .expect(200);

    expect(res.body.result).toBe("pending_owner_approval");
  });

  it("ignores legacy parking confirmation fields", async () => {
    seedTenantUser();
    mockAuthState.userId = TENANT_CLERK;
    const { unit } = seedUnit();
    seedCanonicalParkingLot(unit.id);

    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send({
        building: "B1",
        unitNumber: "101",
        ejarReference: "EJAR-001",
        ...VALID_TENANT_TENANCY,
        // Legacy client payload: parking confirmation is no longer collected or
        // used to authorize tenancy.
        parkingLots: [{ building: "", lotNumber: "", isInside: "yes" }],
      })
      .expect(200);

    expect(res.body.result).toBe("pending_owner_approval");
    const [verification] = stores.unitVerifications.findAll();
    expect(verification).not.toHaveProperty("parkingLots");
  });
});

// ─── 3. Cross-building same-number distinctness ───────────────────────────────

describe("Admin parking lot CRUD — uniqueness per (unitId, building, lotNumber)", () => {
  it("allows the same lotNumber in different buildings for the same unit", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({
      building: "B1", unitNumber: "201", occupantType: "vacant",
    });

    await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B1", lotNumber: "P-1", parkingType: "underground" })
      .expect(201);

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B2", lotNumber: "P-1", parkingType: "surface" })
      .expect(201);

    expect(res.body.label).toBe("B2 P-1");
  });

  it("rejects duplicate building+lotNumber for the same unit", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({
      building: "B1", unitNumber: "202", occupantType: "vacant",
    });

    await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B1", lotNumber: "P-5", parkingType: "underground" })
      .expect(201);

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B1", lotNumber: "P-5", parkingType: "surface" })
      .expect(409);

    expect(res.body.error).toMatch(/already exists/i);
  });
});

// ─── 4. Owner National ID write / no tenant exposure (B9) ─────────────────────

describe("owner_manual approval writes nationalId → units.ownerNationalId (B9)", () => {
  it("sets ownerNationalId on the unit when owner_manual is approved", async () => {
    const admin = seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;

    const ownerUser = stores.users.insert({
      clerkId: "b9-owner-clerk",
      email: "b9owner@test.com",
      role: "owner",
      status: "active",
      firstName: "B9",
      lastName: "Owner",
      verificationStatus: "pending_manual",
      nationalId: "NID-B9-001",
      unitNumber: null,
      unitId: null,
    });

    const unit = stores.units.insert({
      building: "C1",
      unitNumber: "301",
      unitType: "apartment",
      verifiedOwnerId: null,
      verifiedTenantId: null,
      occupantType: "vacant",
      ownerNationalId: null,
    });

    const verification = stores.unitVerifications.insert({
      type: "owner_manual",
      userId: ownerUser.id,
      unitId: unit.id,
      nationalId: "NID-B9-001",
      status: "pending",
      expiresAt: new Date(Date.now() + 86400000),
      titleDeedNumber: "1234567890123456",
    });

    await request(app)
      .post(`/api/unit-verify/${verification.id}/approve`)
      .send({ approvalBases: ["deed_number_verified_against_mullak"] })
      .expect(200);

    const updatedUnit = stores.units.findAll({ type: "eq", col: "id", val: unit.id })[0];
    expect(updatedUnit.ownerNationalId).toBe("NID-B9-001");
  });
});

describe("ownerNationalId not exposed to non-admin callers", () => {
  it("GET /units — does not include ownerNationalId for owner caller", async () => {
    const ownerUser = stores.users.insert({
      clerkId: OWNER_CLERK,
      email: "s2owner2@test.com",
      role: "owner",
      status: "active",
      firstName: "Alice",
      lastName: "Owner",
      verificationStatus: "verified_owner",
      nationalId: "NID-HIDE",
      unitNumber: "B1 101",
      unitId: null,
    });
    const unit = stores.units.insert({
      building: "B1",
      unitNumber: "101",
      verifiedOwnerId: ownerUser.id,
      occupantType: "owner_occupied",
      ownerNationalId: "NID-HIDE",
    });
    stores.users.updateFirst(
      { type: "eq", col: "id", val: ownerUser.id },
      { unitId: unit.id },
    );
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app).get("/api/units").expect(200);
    // Owner sees their own unit — ownerNationalId must be absent
    expect(res.body).not.toBeNull();
    const unitBody = res.body;
    expect(unitBody.ownerNationalId).toBeUndefined();
  });

  it("GET /units/:id — does not include ownerNationalId for owner caller", async () => {
    const ownerUser = stores.users.insert({
      clerkId: OWNER_CLERK,
      email: "s2owner3@test.com",
      role: "owner",
      status: "active",
      firstName: "Alice",
      lastName: "Owner",
      verificationStatus: "verified_owner",
      nationalId: "NID-HIDE2",
      unitNumber: "B1 102",
      unitId: null,
    });
    const unit = stores.units.insert({
      building: "B1",
      unitNumber: "102",
      verifiedOwnerId: ownerUser.id,
      occupantType: "owner_occupied",
      ownerNationalId: "NID-HIDE2",
    });
    stores.users.updateFirst(
      { type: "eq", col: "id", val: ownerUser.id },
      { unitId: unit.id },
    );
    mockAuthState.userId = OWNER_CLERK;

    const res = await request(app).get(`/api/units/${unit.id}`).expect(200);
    expect(res.body.ownerNationalId).toBeUndefined();
  });

  it("GET /units/:id — admin sees ownerNationalId", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({
      building: "B1",
      unitNumber: "103",
      verifiedOwnerId: null,
      occupantType: "vacant",
      ownerNationalId: "NID-ADMIN-VISIBLE",
    });

    const res = await request(app).get(`/api/units/${unit.id}`).expect(200);
    expect(res.body.ownerNationalId).toBe("NID-ADMIN-VISIBLE");
  });
});

// ─── 5. Admin parking lot CRUD role guards ────────────────────────────────────

describe("Parking lot CRUD — admin-only role guards", () => {
  it("GET /units/:unitId/parking-lots returns 403 for non-admin", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;
    const unit = stores.units.insert({ building: "B1", unitNumber: "999", occupantType: "vacant" });

    await request(app)
      .get(`/api/units/${unit.id}/parking-lots`)
      .expect(403);
  });

  it("POST /units/:unitId/parking-lots returns 403 for non-admin", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;
    const unit = stores.units.insert({ building: "B1", unitNumber: "998", occupantType: "vacant" });

    await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B1", lotNumber: "P-1", parkingType: "underground" })
      .expect(403);
  });

  it("PATCH /units/:unitId/parking-lots/:lotId returns 403 for non-admin", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;
    const unit = stores.units.insert({ building: "B1", unitNumber: "997", occupantType: "vacant" });

    await request(app)
      .patch(`/api/units/${unit.id}/parking-lots/1`)
      .send({ active: false })
      .expect(403);
  });

  it("DELETE /units/:unitId/parking-lots/:lotId returns 403 for non-admin", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;
    const unit = stores.units.insert({ building: "B1", unitNumber: "996", occupantType: "vacant" });

    await request(app)
      .delete(`/api/units/${unit.id}/parking-lots/1`)
      .expect(403);
  });

  it("admin can GET parking lots for a unit", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "101", occupantType: "vacant" });
    stores.parkingLots.insert({
      unitId: unit.id,
      building: "B2",
      lotNumber: "A-1",
      parkingType: "surface",
      active: true,
      source: "stage2",
    });

    const res = await request(app)
      .get(`/api/units/${unit.id}/parking-lots`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe("B2 A-1");
  });

  it("admin can POST a new parking lot", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "102", occupantType: "vacant" });

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B2", lotNumber: "B-3", parkingType: "underground" })
      .expect(201);

    expect(res.body.label).toBe("B2 B-3");
    expect(res.body.parkingType).toBe("underground");
  });

  it("POST rejects blank building", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "103", occupantType: "vacant" });

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "   ", lotNumber: "B-4", parkingType: "surface" })
      .expect(400);

    expect(res.body.error).toMatch(/building/i);
  });

  it("POST rejects blank lotNumber", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "104", occupantType: "vacant" });

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B2", lotNumber: "", parkingType: "surface" })
      .expect(400);

    expect(res.body.error).toMatch(/lotNumber/i);
  });

  it("POST rejects invalid parkingType", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "105", occupantType: "vacant" });

    const res = await request(app)
      .post(`/api/units/${unit.id}/parking-lots`)
      .send({ building: "B2", lotNumber: "C-1", parkingType: "basement" })
      .expect(400);

    expect(res.body.error).toMatch(/parkingType/i);
  });

  it("admin can PATCH a parking lot", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "106", occupantType: "vacant" });
    const lot = stores.parkingLots.insert({
      unitId: unit.id,
      building: "B2",
      lotNumber: "D-1",
      parkingType: "surface",
      active: true,
      source: "stage2",
    });

    const res = await request(app)
      .patch(`/api/units/${unit.id}/parking-lots/${lot.id}`)
      .send({ active: false })
      .expect(200);

    expect(res.body.active).toBe(false);
    expect(res.body.label).toBe("B2 D-1");
  });

  it("returns a safe plain explanation when a parking reduction would overallocate registered vehicles", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "106A", occupantType: "vacant" });
    const lot = stores.parkingLots.insert({
      unitId: unit.id, building: "B2", lotNumber: "D-2", parkingType: "underground", active: true, source: "stage2",
    });
    stores.vehicles.insert({
      userId: 1, unitId: unit.id, make: "Honda", model: "Accord", plateNumber: "OVER-CAP",
      isBasementParking: true, status: "active",
    });

    const res = await request(app)
      .patch(`/api/units/${unit.id}/parking-lots/${lot.id}`)
      .send({ active: false })
      .expect(409);

    expect(res.body).toMatchObject({
      error: "PARKING_ENTITLEMENT_OVERALLOCATED",
      vehiclesCount: 1,
      entitlement: 0,
    });
    expect(res.body.message).toBe(
      "This correction cannot be completed because 1 registered underground vehicle would exceed the resulting entitlement of 0.",
    );
    expect(res.body.message).not.toMatch(/select|insert|update|parking_lots|vehicles|column|relation/i);
  });

  it("returns the same safe explanation when deleting a lot would overallocate registered vehicles", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "106B", occupantType: "vacant" });
    const lot = stores.parkingLots.insert({
      unitId: unit.id, building: "B2", lotNumber: "D-3", parkingType: "surface", active: true, source: "stage2",
    });
    stores.vehicles.insert({
      userId: 1, unitId: unit.id, make: "Honda", model: "Accord", plateNumber: "OVER-CAP-DELETE",
      isBasementParking: false, status: "active",
    });

    const res = await request(app)
      .delete(`/api/units/${unit.id}/parking-lots/${lot.id}`)
      .expect(409);

    expect(res.body.message).toBe(
      "This correction cannot be completed because 1 registered surface vehicle would exceed the resulting entitlement of 0.",
    );
    expect(res.body.message).not.toMatch(/select|insert|update|parking_lots|vehicles|column|relation/i);
  });

  it("PATCH returns 404 for unknown lot", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "107", occupantType: "vacant" });

    await request(app)
      .patch(`/api/units/${unit.id}/parking-lots/9999`)
      .send({ active: false })
      .expect(404);
  });

  it("PATCH rejects blank building", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "108", occupantType: "vacant" });
    const lot = stores.parkingLots.insert({
      unitId: unit.id,
      building: "B2",
      lotNumber: "E-1",
      parkingType: "surface",
      active: true,
      source: "stage2",
    });

    const res = await request(app)
      .patch(`/api/units/${unit.id}/parking-lots/${lot.id}`)
      .send({ building: "" })
      .expect(400);

    expect(res.body.error).toMatch(/building/i);
  });

  it("admin can DELETE a parking lot", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "109", occupantType: "vacant" });
    const lot = stores.parkingLots.insert({
      unitId: unit.id,
      building: "B2",
      lotNumber: "F-1",
      parkingType: "underground",
      active: true,
      source: "stage2",
    });

    await request(app)
      .delete(`/api/units/${unit.id}/parking-lots/${lot.id}`)
      .expect(204);

    const remaining = stores.parkingLots.findAll({ type: "eq", col: "id", val: lot.id });
    expect(remaining).toHaveLength(0);
  });

  it("DELETE returns 404 for unknown lot", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;
    const unit = stores.units.insert({ building: "B2", unitNumber: "110", occupantType: "vacant" });

    await request(app)
      .delete(`/api/units/${unit.id}/parking-lots/9999`)
      .expect(404);
  });
});

// ─── 6. Admin data-migration-corrections role guard ───────────────────────────

describe("GET /data-migration-corrections — admin-only role guard", () => {
  it("returns 403 for non-admin (owner)", async () => {
    seedOwnerUser();
    mockAuthState.userId = OWNER_CLERK;

    await request(app)
      .get("/api/data-migration-corrections")
      .expect(403);
  });

  it("returns 403 for non-admin (tenant)", async () => {
    seedTenantUser();
    mockAuthState.userId = TENANT_CLERK;

    await request(app)
      .get("/api/data-migration-corrections")
      .expect(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    // Auth mock returns null userId which causes 401 from requireApiAuth
    mockAuthState.userId = null;

    await request(app)
      .get("/api/data-migration-corrections")
      .expect(401);
  });

  it("admin can list open corrections (safe fields only)", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;

    stores.dataMigrationCorrections.insert({
      entityType: "unit",
      sourceReference: "units:1:owner_national_id",
      issueCode: "owner_id_missing",
      rawPayload: { unitId: 1 },
      details: "Test correction",
      status: "open",
    });
    stores.dataMigrationCorrections.insert({
      entityType: "unit",
      sourceReference: "units:2:owner_national_id",
      issueCode: "owner_id_ambiguous",
      rawPayload: { unitId: 2 },
      details: "Ambiguous",
      status: "resolved",
    });

    const res = await request(app)
      .get("/api/data-migration-corrections")
      .expect(200);

    // Only open corrections returned
    expect(res.body).toHaveLength(1);
    expect(res.body[0].issueCode).toBe("owner_id_missing");
    expect(res.body[0].entityType).toBe("unit");
    // rawPayload must not be exposed
    expect(res.body[0].rawPayload).toBeUndefined();
  });

  it("admin sees only open corrections (resolved/ignored excluded)", async () => {
    seedAdmin();
    mockAuthState.userId = ADMIN_CLERK;

    stores.dataMigrationCorrections.insert({
      entityType: "user",
      sourceReference: "users:5:phone",
      issueCode: "phone_invalid",
      status: "open",
    });
    stores.dataMigrationCorrections.insert({
      entityType: "user",
      sourceReference: "users:6:phone",
      issueCode: "phone_invalid",
      status: "ignored",
    });

    const res = await request(app)
      .get("/api/data-migration-corrections")
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe("open");
  });
});
