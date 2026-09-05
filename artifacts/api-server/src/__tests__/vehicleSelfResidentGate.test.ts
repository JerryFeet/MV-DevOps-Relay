/**
 * C1 vehicle-registration gate — focused regression tests.
 *
 * POST /api/vehicles must:
 *   1. Reject an unverified caller with 403 VERIFICATION_REQUIRED.
 *   2. Reject a verified caller (unitId set) who has no active self-resident
 *      stub (linkedUserId = caller.id) with 422 SELF_RESIDENT_NOT_REGISTERED.
 *   3. Allow a verified caller who has a matching active self-resident stub
 *      (201 on first vehicle, existing basement/doc checks intact).
 *   4. Allow an admin (staff) to bypass the gate entirely.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike, sql } =
    await import("./helpers/mockDb");
  return { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike, sql };
});

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: mockAuthState.userId });
      next();
    },
    getAuth: (_req: any) => ({ userId: mockAuthState.userId }),
    clerkClient: {},
  };
});

vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));
vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));
vi.mock("../lib/email", () => ({ sendAdminAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/pushNotifications", () => ({ sendPushToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/wahaPassCheck", () => ({ hasActiveWahaPass: vi.fn().mockResolvedValue(false) }));
vi.mock("../payments/PaymentService", () => ({
  activeProvider: null,
  PaymentService: class {},
  getProviderByName: () => null,
}));

// ObjectStorage mock — all /objects/ keys resolve; anything else throws ObjectNotFoundError.
vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityFile(key: string) {
      if (typeof key === "string" && key.startsWith("/objects/")) {
        return Promise.resolve({});
      }
      return Promise.reject(new ObjectNotFoundError("Not found"));
    }
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Clerk user IDs ──────────────────────────────────────────────────────────

const CLERK_UNVERIFIED  = "vsg-unverified";
const CLERK_VERIFIED_NO_STUB = "vsg-verified-nostub";
const CLERK_VERIFIED_WITH_STUB = "vsg-verified-stub";
const CLERK_ADMIN = "vsg-admin";

// ─── Minimal vehicle payload ──────────────────────────────────────────────────

const BASE_VEHICLE = {
  make: "Toyota", model: "Camry", plateNumber: "SGT-0001", color: "White", parkingLotId: 1,
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedBase() {
  resetMockDb();

  // Unit for verified callers
  stores.units.insert({
    building: "A",
    unitNumber: "101",
    parkingLots: JSON.stringify([
      { lotNumber: "B1", building: "A", isInside: true },
      { lotNumber: "S1", building: "A", isInside: false },
    ]),
  }); // id=1
  stores.parkingLots.insert({ unitId: 1, building: "A", lotNumber: "B1", parkingType: "underground", active: true });
  stores.parkingLots.insert({ unitId: 1, building: "A", lotNumber: "S1", parkingType: "surface", active: true });

  // 1. Unverified owner — no unitId, verificationStatus = "unverified"
  stores.users.insert({
    clerkId: CLERK_UNVERIFIED,
    role: "owner",
    status: "active",
    email: "unverified@vsg.com",
    firstName: "Un", lastName: "Verified",
    verificationStatus: "unverified",
    unitId: null,
    unitNumber: null,
  }); // id=1

  // 2. Verified owner — unitId set, but NO self-resident stub
  stores.users.insert({
    clerkId: CLERK_VERIFIED_NO_STUB,
    role: "owner",
    status: "active",
    email: "verified-nostub@vsg.com",
    firstName: "Ver", lastName: "NoStub",
    verificationStatus: "verified_owner",
    unitId: 1,
    unitNumber: "A 101",
  }); // id=2

  // 3. Verified owner — unitId set AND has an active self-resident stub
  stores.users.insert({
    clerkId: CLERK_VERIFIED_WITH_STUB,
    role: "owner",
    status: "active",
    email: "verified-stub@vsg.com",
    firstName: "Ver", lastName: "WithStub",
    verificationStatus: "verified_owner",
    unitId: 1,
    unitNumber: "A 101",
  }); // id=3

  // Self-resident stub for user id=3 on unit id=1
  stores.residents.insert({
    type: "owner",
    firstName: "Ver", lastName: "WithStub",
    email: "verified-stub@vsg.com",
    unitId: 1,
    unitNumber: "A 101",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 3,      // matches CLERK_VERIFIED_WITH_STUB's user id
    registeredById: 3,
    status: "active",
    idPhotoKey: null,
  }); // id=1

  // 4. Admin — staff bypass
  stores.users.insert({
    clerkId: CLERK_ADMIN,
    role: "admin",
    status: "active",
    email: "admin@vsg.com",
    firstName: "Ad", lastName: "Min",
    verificationStatus: "unverified",
    unitId: null,
    unitNumber: null,
  }); // id=4
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/vehicles — C1 self-resident gate", () => {
  beforeEach(seedBase);

  // ── Case 1: unverified caller ────────────────────────────────────────────

  it("returns 403 VERIFICATION_REQUIRED for an unverified caller", async () => {
    mockAuthState.userId = CLERK_UNVERIFIED;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("VERIFICATION_REQUIRED");
  });

  it("does not insert a vehicle for an unverified caller", async () => {
    mockAuthState.userId = CLERK_UNVERIFIED;
    await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(stores.vehicles.findAll()).toHaveLength(0);
  });

  it("403 error message mentions verification", async () => {
    mockAuthState.userId = CLERK_UNVERIFIED;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.body.message).toMatch(/verified/i);
  });

  // ── Case 2: verified but no self-resident stub ───────────────────────────

  it("returns 422 SELF_RESIDENT_NOT_REGISTERED when verified but stub is missing", async () => {
    mockAuthState.userId = CLERK_VERIFIED_NO_STUB;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SELF_RESIDENT_NOT_REGISTERED");
  });

  it("does not insert a vehicle when verified but stub is missing", async () => {
    mockAuthState.userId = CLERK_VERIFIED_NO_STUB;
    await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(stores.vehicles.findAll()).toHaveLength(0);
  });

  it("422 error message guides the caller to complete their profile", async () => {
    mockAuthState.userId = CLERK_VERIFIED_NO_STUB;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.body.message).toMatch(/resident profile/i);
  });

  // Stale / inactive stub must not satisfy the gate
  it("returns 422 when the only self-resident stub is inactive (stale)", async () => {
    stores.residents.insert({
      type: "owner",
      firstName: "Ver", lastName: "NoStub",
      email: "verified-nostub@vsg.com",
      unitId: 1,
      unitNumber: "A 101",
      relationship: "Owner",
      hasPortalAccess: false,
      linkedUserId: 2,      // id=2 = CLERK_VERIFIED_NO_STUB's user id
      registeredById: 2,
      status: "inactive",   // ← inactive — must NOT satisfy the gate
      idPhotoKey: null,
    });
    mockAuthState.userId = CLERK_VERIFIED_NO_STUB;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SELF_RESIDENT_NOT_REGISTERED");
  });

  // ── Case 3: verified with matching active self-stub ──────────────────────

  it("returns 201 when verified with an active self-resident stub", async () => {
    mockAuthState.userId = CLERK_VERIFIED_WITH_STUB;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(201);
  });

  it("inserts the vehicle record with correct userId", async () => {
    mockAuthState.userId = CLERK_VERIFIED_WITH_STUB;
    await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    const vehicles = stores.vehicles.findAll();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].userId).toBe(3); // CLERK_VERIFIED_WITH_STUB → user id=3
  });

  it("first vehicle is status=active (not pending_approval)", async () => {
    mockAuthState.userId = CLERK_VERIFIED_WITH_STUB;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.body.status).toBe("active");
    expect(res.body.isAdditional).toBe(false);
  });

  // Downstream basement-parking check still runs after the gate passes
  it("foreign parking-lot refusal still fires after the self-resident gate passes", async () => {
    // Add a second unit with only a surface lot
    stores.units.insert({
      building: "B",
      unitNumber: "202",
      parkingLots: JSON.stringify([{ lotNumber: "S1", building: "B", isInside: false }]),
    }); // id=2
    // Verified owner on the surface-only unit with a matching stub
    stores.users.insert({
      clerkId: "vsg-surface-owner",
      role: "owner",
      status: "active",
      email: "surface@vsg.com",
      firstName: "Surf", lastName: "Only",
      verificationStatus: "verified_owner",
      unitId: 2,
      unitNumber: "B 202",
    }); // id=5
    stores.residents.insert({
      type: "owner",
      firstName: "Surf", lastName: "Only",
      email: "surface@vsg.com",
      unitId: 2,
      unitNumber: "B 202",
      relationship: "Owner",
      hasPortalAccess: true,
      linkedUserId: 5,
      registeredById: 5,
      status: "active",
      idPhotoKey: null,
    });
    mockAuthState.userId = "vsg-surface-owner";
    const res = await request(app).post("/api/vehicles").send({ ...BASE_VEHICLE, isBasementParking: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
  });

  // ── Case 4: admin bypasses the gate ──────────────────────────────────────

  it("admin (staff) can register a vehicle without being verified or having a stub", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(201);
  });

  it("admin vehicle has the correct userId on the created record", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    const vehicles = stores.vehicles.findAll();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].userId).toBe(4); // CLERK_ADMIN → user id=4
  });
});
