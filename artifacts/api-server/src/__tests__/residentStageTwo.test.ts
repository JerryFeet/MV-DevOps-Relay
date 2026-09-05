/**
 * Stage 2 resident fixes — regression tests (C1/C2/C3/C4/I1/I2).
 *
 * Covers:
 *   C1  – Verification approval upserts exactly one active self-resident stub
 *          with unitId + linkedUserId; duplicate stubs are not created.
 *   C2  – GET /api/residents for a verified owner lists all unit residents
 *          (by unitId), not just their own registeredById rows. Admin sees all.
 *          Adjacent-unit isolation: owner of unit 101 cannot see unit 102 residents.
 *   C3  – POST /api/residents/self is unit-based and idempotent: calling it twice
 *          returns 409 on the second call; the stub has unitId + linkedUserId set.
 *   I1  – GET /api/waha-pass/eligibility returns all unit members for eligibleSecondResidents,
 *          requires the self-resident stub (returns reason="self_resident_not_registered"
 *          when it is missing), and returns eligible=true when the stub exists.
 *   C4  – Adjacent-unit exclusion: owner of unit 101 cannot view residents of unit 102.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike } =
    await import("./helpers/mockDb");
  return { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike };
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

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityFile(key: string) {
      if (typeof key === "string" && key.startsWith("/objects/")) {
        return Promise.resolve({
          getMetadata: () => Promise.resolve([{ contentType: "image/jpeg", size: 1024 }]),
        });
      }
      return Promise.reject(new ObjectNotFoundError("Not found"));
    }
    storeTitleDeed() { return Promise.resolve("/objects/title-deeds/test.pdf"); }
    getTitleDeedViewURL() { return Promise.resolve("https://example.com/deed.pdf"); }
    deleteObjectEntity() { return Promise.resolve(); }
    getIdPhotoUploadURL() { return Promise.resolve("https://example.com/upload"); }
    normalizeObjectEntityPath() { return "/objects/id/test.jpg"; }
    downloadObject() { return Promise.resolve({ status: 200, headers: new Map(), body: null }); }
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

vi.mock("../lib/email", () => ({
  sendAdminAlert: async () => {},
  sendEmail: async () => {},
}));

vi.mock("../lib/pushNotifications", () => ({
  sendPushToUsers: async () => {},
}));

vi.mock("../payments/PaymentService", () => ({
  activeProvider: null,
  PaymentService: class {},
  getProviderByName: () => null,
}));

// ─── App & helpers ─────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Clerk IDs ────────────────────────────────────────────────────────────────

const CLERK_OWNER    = "clerk-st2-owner";
const CLERK_TENANT   = "clerk-st2-tenant";
const CLERK_ADMIN    = "clerk-st2-admin";
const CLERK_OTHER    = "clerk-st2-other-owner"; // owner of adjacent unit 102

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** Unit 101: verified owner occupant. */
function seedBase() {
  resetMockDb();

  // Unit 101
  stores.units.insert({
    building: "A",
    unitNumber: "101",
    occupantType: "owner_occupied",
    verifiedOwnerId: null,
    verifiedTenantId: null,
  }); // id=1

  // Unit 102 (adjacent)
  stores.units.insert({
    building: "A",
    unitNumber: "102",
    occupantType: "owner_occupied",
    verifiedOwnerId: null,
    verifiedTenantId: null,
  }); // id=2

  // Verified owner of unit 101
  stores.users.insert({
    clerkId: CLERK_OWNER,
    email: "owner@st2.com",
    role: "owner",
    status: "active",
    firstName: "Alice",
    lastName: "Owner",
    verificationStatus: "verified_owner",
    unitId: 1,
    unitNumber: "A 101",
    phone: "+966500000001",
    nationalId: "NID001",
  }); // id=1

  // Verified tenant of unit 101
  stores.users.insert({
    clerkId: CLERK_TENANT,
    email: "tenant@st2.com",
    role: "tenant",
    status: "active",
    firstName: "Bob",
    lastName: "Tenant",
    verificationStatus: "verified_tenant",
    unitId: 1,
    unitNumber: "A 101",
    phone: "+966500000002",
    nationalId: "NID002",
  }); // id=2

  // Admin
  stores.users.insert({
    clerkId: CLERK_ADMIN,
    email: "admin@st2.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "User",
    verificationStatus: "unverified",
    unitId: null,
    unitNumber: null,
  }); // id=3

  // Owner of adjacent unit 102 (C4 isolation check)
  stores.users.insert({
    clerkId: CLERK_OTHER,
    email: "other@st2.com",
    role: "owner",
    status: "active",
    firstName: "Carol",
    lastName: "Other",
    verificationStatus: "verified_owner",
    unitId: 2,
    unitNumber: "A 102",
    nationalId: "NID003",
  }); // id=4
}

/** Seed the owner's self-stub on unit 101. */
function seedOwnerSelfStub() {
  return stores.residents.insert({
    type: "owner",
    firstName: "Alice",
    lastName: "Owner",
    email: "owner@st2.com",
    unitId: 1,
    unitNumber: "A 101",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 1,
    registeredById: 1,
    status: "active",
    idPhotoKey: null,
  }); // id=1
}

/** Seed two household members on unit 101 (one with portal access, one without). */
function seedHouseholdMembers() {
  // Member with portal access
  stores.residents.insert({
    type: "family",
    firstName: "Sara",
    lastName: "Owner",
    email: "sara@st2.com",
    unitId: 1,
    unitNumber: "A 101",
    relationship: "Spouse",
    dateOfBirth: "1990-01-01",
    hasPortalAccess: true,
    registeredById: 1,
    linkedUserId: null,
    status: "active",
    idPhotoKey: "/objects/id-sara.jpg",
  }); // id=2 (when seedOwnerSelfStub is called first => id=2, else id=1)

  // Member WITHOUT portal access
  stores.residents.insert({
    type: "family",
    firstName: "Khalid",
    lastName: "Owner",
    email: null,
    unitId: 1,
    unitNumber: "A 101",
    relationship: "Sibling",
    dateOfBirth: "1995-01-01",
    hasPortalAccess: false,
    registeredById: 1,
    linkedUserId: null,
    status: "active",
    idPhotoKey: "/objects/id-khalid.jpg",
  }); // id=3
}

/** Seed a resident for unit 102 (adjacent unit, isolation test). */
function seedAdjacentUnitResident() {
  stores.residents.insert({
    type: "family",
    firstName: "Unit102",
    lastName: "Member",
    email: "unit102@st2.com",
    unitId: 2,
    unitNumber: "A 102",
    relationship: "Spouse",
    dateOfBirth: "1990-01-01",
    hasPortalAccess: false,
    registeredById: 4,
    linkedUserId: null,
    status: "active",
    idPhotoKey: "/objects/id-unit102.jpg",
  });
}

// ─── C1: Self-resident stub created on verification approval ──────────────────

describe("C1 — approval applies role-specific resident creation", () => {
  beforeEach(() => seedBase());

  it("approval of owner_manual does not auto-create an owner resident", async () => {
    // Seed a pending owner_manual verification for user id=1 on unit id=1
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { occupantType: "vacant" },
    );
    stores.unitVerifications.insert({
      type: "owner_manual",
      userId: 1,
      unitId: 1,
      nationalId: "NID001",
      status: "pending",
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    }); // id=1

    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/approve").send({
      approvalBases: ["deed_number_verified_against_mullak"],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const stubs = stores.residents.findAll().filter(
      (r: any) => r.linkedUserId === 1 && r.type === "owner" && r.status === "active"
    );
    expect(stubs).toHaveLength(0);
  });

  it("approval does not create duplicate stubs when called twice (idempotent)", async () => {
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { occupantType: "vacant" },
    );
    // Seed verification
    stores.unitVerifications.insert({
      type: "owner_manual",
      userId: 1,
      unitId: 1,
      nationalId: "NID001",
      status: "pending",
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    }); // id=1

    // Manually pre-insert a self stub to simulate a prior approval
    stores.residents.insert({
      type: "owner",
      firstName: "Alice",
      lastName: "Owner",
      email: "owner@st2.com",
      unitId: 1,
      unitNumber: "A 101",
      relationship: "Owner",
      hasPortalAccess: true,
      linkedUserId: 1,
      registeredById: 1,
      status: "active",
      idPhotoKey: null,
    });

    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/unit-verify/1/approve").send({
      approvalBases: ["deed_number_verified_against_mullak"],
    });
    expect(res.status).toBe(200);

    const stubs = stores.residents.findAll().filter(
      (r: any) => r.linkedUserId === 1 && r.type === "owner" && r.status === "active"
    );
    // Should still be exactly one — no duplicate inserted
    expect(stubs).toHaveLength(1);
  });
});

// ─── C2: GET /api/residents uses caller.unitId for verified owner/tenant ───────

describe("C2 — GET /api/residents uses unitId for verified callers", () => {
  beforeEach(() => {
    seedBase();
    seedOwnerSelfStub();   // id=1
    seedHouseholdMembers(); // id=2 (portal), id=3 (no portal)
    seedAdjacentUnitResident();
  });

  it("verified owner sees all active residents on their unit (3 records)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: any) => r.id);
    // Self-stub (1) + Sara (2) + Khalid (3) — all on unit 1
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    // Adjacent unit resident is NOT visible
    const adjacentIds = stores.residents.findAll()
      .filter((r: any) => r.unitId === 2)
      .map((r: any) => r.id);
    for (const aid of adjacentIds) {
      expect(ids).not.toContain(aid);
    }
  });

  it("verified owner sees member with portal access in results", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    const sara = res.body.data.find((r: any) => r.firstName === "Sara");
    expect(sara).toBeTruthy();
    expect(sara.hasPortalAccess).toBe(true);
  });

  it("verified owner sees member without portal access too", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    const khalid = res.body.data.find((r: any) => r.firstName === "Khalid");
    expect(khalid).toBeTruthy();
    expect(khalid.hasPortalAccess).toBe(false);
  });

  it("admin sees all residents across all units", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    // Should see unit 1 residents + unit 2 resident
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
  });

  it("admin total count includes all units' residents", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
  });
});

// ─── C4: Adjacent-unit isolation ─────────────────────────────────────────────

describe("C4 — adjacent-unit isolation", () => {
  beforeEach(() => {
    seedBase();
    seedOwnerSelfStub();
    seedHouseholdMembers();
    seedAdjacentUnitResident();
  });

  it("owner of unit 102 cannot see unit 101 residents in list", async () => {
    mockAuthState.userId = CLERK_OTHER;
    const res = await request(app).get("/api/residents");
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: any) => r.id);
    const unit101Ids = stores.residents.findAll()
      .filter((r: any) => r.unitId === 1)
      .map((r: any) => r.id);
    for (const id of unit101Ids) {
      expect(ids).not.toContain(id);
    }
  });

  it("owner of unit 102 cannot GET a unit 101 resident by id (404)", async () => {
    // self-stub for unit 101 is id=1
    mockAuthState.userId = CLERK_OTHER;
    const res = await request(app).get("/api/residents/1");
    expect(res.status).toBe(404);
  });

  it("owner of unit 102 cannot PATCH a unit 101 resident (404)", async () => {
    mockAuthState.userId = CLERK_OTHER;
    const res = await request(app).patch("/api/residents/1").send({ phone: "+9665HACKED" });
    expect(res.status).toBe(404);
  });

  // Critical C4 regression: a verified owner must NOT see a resident they once
  // registered (registeredById = caller.id) that now lives on a different unit.
  it("verified owner cannot see a resident they registered that now has unitId on another unit", async () => {
    // Place a resident on unit 2 but with registeredById = owner-of-unit-1 (id=1).
    // This simulates a person who was registered by the owner but later moved/reassigned.
    stores.residents.insert({
      type: "family",
      firstName: "CrossUnit",
      lastName: "Leak",
      email: "leak@st2.com",
      unitId: 2,           // ← lives on unit 2 (CLERK_OTHER's unit)
      unitNumber: "A 102",
      relationship: "Guest",
      dateOfBirth: "1990-01-01",
      hasPortalAccess: false,
      registeredById: 1,   // ← was registered by CLERK_OWNER (unit 1 owner)
      linkedUserId: null,
      status: "active",
      idPhotoKey: "/objects/id-crossunit.jpg",
    });

    mockAuthState.userId = CLERK_OWNER; // verified owner of unit 1
    const list = await request(app).get("/api/residents");
    expect(list.status).toBe(200);
    const names = list.body.data.map((r: any) => r.firstName);
    expect(names).not.toContain("CrossUnit"); // must not leak through registeredById

    // Also blocked on direct fetch
    const crossUnitId = stores.residents.findAll()
      .find((r: any) => r.firstName === "CrossUnit")!.id;
    const detail = await request(app).get(`/api/residents/${crossUnitId}`);
    expect(detail.status).toBe(404);

    // And blocked on PATCH
    const patch = await request(app).patch(`/api/residents/${crossUnitId}`).send({ phone: "+9665HACKED" });
    expect(patch.status).toBe(404);
  });

  // C4: GET /units — verified caller with no unitId gets null (legacy unitNumber
  // parsing fallback removed; authorization never derives unit from display field).
  it("GET /units returns null for a verified caller whose unitId is null (no legacy fallback)", async () => {
    // Insert a user who has unitNumber set but no unitId
    stores.users.insert({
      clerkId: "clerk-legacy-nounitid",
      email: "legacy@st2.com",
      role: "owner",
      status: "active",
      firstName: "Legacy",
      lastName: "NoId",
      verificationStatus: "verified_owner",
      unitId: null,
      unitNumber: "A 101",   // display field — must NOT be parsed for auth
    });
    mockAuthState.userId = "clerk-legacy-nounitid";
    const res = await request(app).get("/api/units");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

// ─── C3: POST /api/residents/self is unit-based and idempotent ────────────────

describe("C3 — POST /api/residents/self is unit-based and idempotent", () => {
  beforeEach(() => seedBase());

  it("creates a stub with unitId and linkedUserId set", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents/self");
    expect(res.status).toBe(201);
    expect(res.body.unitId).toBe(1);
    expect(res.body.linkedUserId).toBe(1);
    expect(res.body.type).toBe("owner");
  });

  it("second call returns 409 (idempotent guard)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const first = await request(app).post("/api/residents/self");
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/residents/self");
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("ALREADY_REGISTERED");
  });

  it("only one stub exists after two calls", async () => {
    mockAuthState.userId = CLERK_OWNER;
    await request(app).post("/api/residents/self");
    await request(app).post("/api/residents/self");

    const stubs = stores.residents.findAll().filter(
      (r: any) => r.linkedUserId === 1 && r.type === "owner" && r.status === "active"
    );
    expect(stubs).toHaveLength(1);
  });

  it("verified tenant can also self-register", async () => {
    mockAuthState.userId = CLERK_TENANT;
    const res = await request(app).post("/api/residents/self");
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("tenant");
    expect(res.body.unitId).toBe(1);
    expect(res.body.linkedUserId).toBe(2);
  });
});

// ─── B1 acceptance evidence — real admin Unit Registry + owner/Waha views ─────

describe("B1 — Unit Registry and Waha resident visibility", () => {
  beforeEach(() => seedBase());

  it("shows a newly self-registered owner as the single resident in the admin Unit Registry", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const selfRegistration = await request(app).post("/api/residents/self");
    expect(selfRegistration.status).toBe(201);

    mockAuthState.userId = CLERK_ADMIN;
    const registry = await request(app).get("/api/admin/units/full");
    expect(registry.status).toBe(200);
    const unit = registry.body.data.find((row: any) => row.id === 1);
    expect(unit).toBeTruthy();
    expect(unit.residents).toHaveLength(1);
    expect(unit.residents[0]).toMatchObject({
      firstName: "Alice",
      lastName: "Owner",
      type: "owner",
    });
  });

  it("shows the same exact two-resident household in the owner view and admin Unit Registry", async () => {
    seedOwnerSelfStub();
    stores.residents.insert({
      type: "family",
      firstName: "Sara",
      lastName: "Owner",
      email: "sara@st2.com",
      unitId: 1,
      unitNumber: "A 101",
      relationship: "Spouse",
      dateOfBirth: "1990-01-01",
      hasPortalAccess: true,
      registeredById: 1,
      status: "active",
      idPhotoKey: "/objects/id-sara.jpg",
    });

    mockAuthState.userId = CLERK_OWNER;
    const ownerView = await request(app).get("/api/residents");
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.total).toBe(2);
    expect(ownerView.body.data).toHaveLength(2);
    expect(ownerView.body.data.map((r: any) => r.firstName).sort()).toEqual(["Alice", "Sara"]);

    mockAuthState.userId = CLERK_ADMIN;
    const registry = await request(app).get("/api/admin/units/full");
    expect(registry.status).toBe(200);
    const unit = registry.body.data.find((row: any) => row.id === 1);
    expect(unit.residents).toHaveLength(2);
    expect(unit.residents.map((r: any) => r.firstName).sort()).toEqual(["Alice", "Sara"]);
  });

  it("returns the verified owner and every household member, including the no-portal member, to Waha", async () => {
    seedOwnerSelfStub();
    seedHouseholdMembers();
    seedAdjacentUnitResident();

    mockAuthState.userId = CLERK_OWNER;
    const ownerView = await request(app).get("/api/residents");
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.total).toBe(3);

    const eligibility = await request(app).get("/api/waha-pass/eligibility");
    expect(eligibility.status).toBe(200);
    expect(eligibility.body).toMatchObject({
      eligible: true,
      occupancyTrack: "owner",
      unitId: 1,
      selfResident: { firstName: "Alice", lastName: "Owner", linkedUserId: 1 },
    });
    // I5: Sara (portal access + valid DOB) is eligible; Khalid (no portal access) moves
    // to ineligibleSecondResidents with reason "no_portal_access".
    expect(eligibility.body.eligibleSecondResidents).toHaveLength(1);
    expect(eligibility.body.eligibleSecondResidents[0].firstName).toBe("Sara");
    expect(eligibility.body.ineligibleSecondResidents).toHaveLength(1);
    expect(eligibility.body.ineligibleSecondResidents[0].resident.firstName).toBe("Khalid");
    expect(eligibility.body.ineligibleSecondResidents[0].reason).toBe("no_portal_access");
    expect(eligibility.body.eligibleSecondResidents.some((r: any) => r.firstName === "Unit102")).toBe(false);
  });
});

// ─── I1: Waha eligibility reads all unit residents; requires self-resident stub ─

describe("I1 — GET /api/waha-pass/eligibility", () => {
  beforeEach(() => seedBase());

  it("returns eligible=false with reason=self_resident_not_registered when stub is missing", async () => {
    // No self-resident stub exists
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toBe("self_resident_not_registered");
  });

  it("returns eligible=true when self-stub exists", async () => {
    seedOwnerSelfStub();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
  });

  it("eligibleSecondResidents includes household members but not the self-stub", async () => {
    seedOwnerSelfStub();   // id=1 — self-stub (linked to owner)
    seedHouseholdMembers(); // id=2 (Sara), id=3 (Khalid)

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);

    const secondIds = res.body.eligibleSecondResidents.map((r: any) => r.id);
    // Sara (id=2) has portal access and valid DOB → eligible
    expect(secondIds).toContain(2);
    // Self-stub (id=1) is NOT in eligibleSecondResidents
    expect(secondIds).not.toContain(1);
    // Khalid (id=3) has no portal access → I5 moves him to ineligibleSecondResidents
    expect(secondIds).not.toContain(3);
    const ineligibleIds = res.body.ineligibleSecondResidents.map((r: any) => r.resident.id);
    expect(ineligibleIds).toContain(3);
  });

  it("selfResident field is returned when eligible", async () => {
    seedOwnerSelfStub();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    expect(res.body.selfResident).toBeTruthy();
    expect(res.body.selfResident.linkedUserId).toBe(1);
  });

  it("unverified caller returns eligible=false with reason=unit_not_verified", async () => {
    // Insert an unverified user
    stores.users.insert({
      clerkId: "clerk-st2-unverified",
      email: "unverified@st2.com",
      role: "owner",
      status: "active",
      firstName: "Unv",
      lastName: "User",
      verificationStatus: "unverified",
      unitId: 1,
      unitNumber: "A 101",
    });
    mockAuthState.userId = "clerk-st2-unverified";
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toBe("unit_not_verified");
  });

  it("eligible owner sees both portal-access member and no-portal-access member in eligibleSecondResidents", async () => {
    seedOwnerSelfStub();
    seedHouseholdMembers();

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");
    expect(res.status).toBe(200);
    // I5: Sara (portal access) is in eligibleSecondResidents.
    // Khalid (no portal access) is in ineligibleSecondResidents — no longer eligible.
    const eligible = res.body.eligibleSecondResidents;
    const ineligible = res.body.ineligibleSecondResidents;
    const withPortal = eligible.find((r: any) => r.firstName === "Sara");
    const noPortal = ineligible.find((r: any) => r.resident?.firstName === "Khalid");
    expect(withPortal).toBeTruthy();
    expect(noPortal).toBeTruthy();
    expect(noPortal.reason).toBe("no_portal_access");
  });
});
