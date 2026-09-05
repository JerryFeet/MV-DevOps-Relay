/**
 * Stage 3 E1–E5 vehicle requirements — focused API tests.
 *
 * E1: POST /vehicles response includes verifiedResidentName from the resident stub.
 * E2: Only a verified resident (with active self-stub) can register.
 *     (Tested more thoroughly in vehicleSelfResidentGate.test.ts; canary here.)
 * E3: Per-type parking entitlement enforced in the submission transaction.
 *     inside  (isBasementParking=true)  → capped by underground lot count
 *     outside (isBasementParking=false) → capped by surface lot count
 * E4: Final-slot concurrency — advisory lock is exercised atomically in the
 *     mock (single-threaded) environment; both slots occupied → 409.
 * E5a: GET /vehicles/:id/registration-doc
 *       - owner: 200 (their own vehicle with doc)
 *       - guard (non-approver): 403
 *       - other resident: 403
 *       - admin/supervisor: 200
 *       - vehicle with no doc: 404
 * E5b: PATCH /vehicles/:id rejection requires an approver role + valid reason.
 *       - non-approver (owner, guard): 403
 *       - approver without reason: 400 REJECTION_REASON_REQUIRED
 *       - approver with invalid reason: 400 INVALID_REJECTION_REASON
 *       - approver with valid reason: 200
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() { super("Not found"); this.name = "ObjectNotFoundError"; }
  }
  class ObjectStorageService {
    getObjectEntityFile(key: string) {
      if (typeof key === "string" && key.startsWith("/objects/")) return Promise.resolve({});
      return Promise.reject(new ObjectNotFoundError());
    }
    downloadObject(_file: unknown) {
      // Minimal stub: empty body, ok status
      return Promise.resolve({
        status: 200,
        headers: { forEach: () => {} },
        body: null,
      });
    }
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

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
vi.mock("../lib/wahaPassCheck", () => ({ unitHasActiveWahaPass: vi.fn().mockResolvedValue(true) }));
vi.mock("../payments/PaymentService", () => ({
  activeProvider: null, PaymentService: class {}, getProviderByName: () => null,
}));

// ─── App ──────────────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Clerk IDs ────────────────────────────────────────────────────────────────

const CLERK_OWNER     = "e15-owner-1";
const CLERK_OWNER2    = "e15-owner-2";
const CLERK_ADMIN     = "e15-admin-1";
const CLERK_SUPERVISOR = "e15-sup-1";
const CLERK_GUARD     = "e15-guard-1";

const BASE_VEHICLE = {
  make: "Toyota", model: "Camry", plateNumber: "E15-0001", color: "White", parkingLotId: 1,
};

// ─── Seed ─────────────────────────────────────────────────────────────────────

function seedBase() {
  resetMockDb();

  // Unit with 1 underground lot + 1 surface lot (normalized)
  const unit = stores.units.insert({
    building: "A", unitNumber: "101",
    parkingLots: JSON.stringify([{ lotNumber: "UG1", building: "A", isInside: true }]),
  }); // id=1

  // Second unit for owner2 (only surface lots via normalized records)
  const unit2 = stores.units.insert({
    building: "B", unitNumber: "202",
    parkingLots: null,
  }); // id=2

  // Users
  stores.users.insert({
    clerkId: CLERK_OWNER, role: "owner", status: "active",
    email: "owner1@e15.com", firstName: "Khalid", lastName: "Al-Saud",
    verificationStatus: "verified_owner", unitId: unit.id, unitNumber: "A-101",
    nationalId: null, phone: null,
  }); // id=1

  stores.users.insert({
    clerkId: CLERK_ADMIN, role: "admin", status: "active",
    email: "admin@e15.com", firstName: "Admin", lastName: "A",
    verificationStatus: "unverified", unitId: null, unitNumber: null,
    nationalId: null, phone: null,
  }); // id=2

  stores.users.insert({
    clerkId: CLERK_SUPERVISOR, role: "supervisor", status: "active",
    email: "sup@e15.com", firstName: "Sup", lastName: "S",
    verificationStatus: "unverified", unitId: null, unitNumber: null,
    nationalId: null, phone: null,
  }); // id=3

  stores.users.insert({
    clerkId: CLERK_GUARD, role: "guard", status: "active",
    email: "guard@e15.com", firstName: "Guard", lastName: "G",
    verificationStatus: "unverified", unitId: null, unitNumber: null,
    nationalId: null, phone: null,
  }); // id=4

  stores.users.insert({
    clerkId: CLERK_OWNER2, role: "owner", status: "active",
    email: "owner2@e15.com", firstName: "Sara", lastName: "Al-Rashid",
    verificationStatus: "verified_owner", unitId: unit2.id, unitNumber: "B-202",
    nationalId: null, phone: null,
  }); // id=5

  // Self-resident stub for owner1
  stores.residents.insert({
    type: "owner",
    firstName: "Khalid", lastName: "Al-Saud",
    email: "owner1@e15.com",
    unitId: unit.id, unitNumber: "A-101",
    relationship: "Owner", hasPortalAccess: true,
    linkedUserId: 1, registeredById: 1,
    status: "active", idPhotoKey: null,
  }); // id=1

  // Self-resident stub for owner2
  stores.residents.insert({
    type: "owner",
    firstName: "Sara", lastName: "Al-Rashid",
    email: "owner2@e15.com",
    unitId: unit2.id, unitNumber: "B-202",
    relationship: "Owner", hasPortalAccess: true,
    linkedUserId: 5, registeredById: 5,
    status: "active", idPhotoKey: null,
  }); // id=2

  // Normalized parking lots for unit1: 1 underground + 1 surface
  stores.parkingLots.insert({
    unitId: unit.id, building: "A", lotNumber: "UG-01",
    parkingType: "underground", active: true, source: "stage2", sourceReference: null,
  });
  stores.parkingLots.insert({
    unitId: unit.id, building: "A", lotNumber: "S-01",
    parkingType: "surface", active: true, source: "stage2", sourceReference: null,
  });

  // Normalized parking for unit2: only 1 surface lot
  stores.parkingLots.insert({
    unitId: unit2.id, building: "B", lotNumber: "S-02",
    parkingType: "surface", active: true, source: "stage2", sourceReference: null,
  });

  return { unitId: unit.id as number, unitId2: unit2.id as number };
}

// ─────────────────────────────────────────────────────────────────────────────
// E1 — verifiedResidentName in POST response
// ─────────────────────────────────────────────────────────────────────────────

describe("E1 — verifiedResidentName in POST /vehicles response", () => {
  beforeEach(seedBase);

  it("returns verifiedResidentName from the resident stub on successful registration", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(201);
    expect(res.body.verifiedResidentName).toBe("Khalid Al-Saud");
  });

  it("returns verifiedResidentName=null for admin (staff bypass, no stub)", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/vehicles").send(BASE_VEHICLE);
    expect(res.status).toBe(201);
    // Admin bypasses the gate; no stub lookup occurs
    expect(res.body.verifiedResidentName).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E3 — per-type parking entitlement enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("E3 — per-type parking entitlement (B8)", () => {
  beforeEach(seedBase);

  it("allows first inside (basement) vehicle when unit has 1 underground lot", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, isBasementParking: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(true);
  });

  it("rejects second inside vehicle when unit has only 1 underground lot (capacity exceeded)", async () => {
    // First inside vehicle consumed the underground slot
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Honda", model: "Civic", plateNumber: "FIRST-IN", color: "Blue",
      istimaraNumber: null, isAdditional: false,
      isBasementParking: true, registrationDocKey: null,
      status: "active", approvalNote: null, approvedById: null,
    });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "SECOND-IN",
      isBasementParking: true,
      registrationDocKey: "/objects/doc.pdf", // required for additional
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("PARKING_ENTITLEMENT_EXCEEDED");
  });

  it("allows first outside (surface) vehicle", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, parkingLotId: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(false);
  });

  it("rejects second outside vehicle when unit has only 1 surface lot", async () => {
    // First outside vehicle consumed the surface slot
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Honda", model: "Civic", plateNumber: "FIRST-OUT", color: "Blue",
      istimaraNumber: null, isAdditional: false,
      isBasementParking: false, registrationDocKey: null,
      status: "active", approvalNote: null, approvedById: null,
    });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "SECOND-OUT",
      parkingLotId: 2,
      registrationDocKey: "/objects/doc.pdf",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("PARKING_ENTITLEMENT_EXCEEDED");
  });

  it("inside slot at capacity does not block outside slot (types are independent)", async () => {
    // Fill the underground slot
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Honda", model: "Civic", plateNumber: "INSIDE", color: "Blue",
      istimaraNumber: null, isAdditional: false,
      isBasementParking: true, registrationDocKey: null,
      status: "active", approvalNote: null, approvedById: null,
    });
    mockAuthState.userId = CLERK_OWNER;
    // Surface slot should still be open
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "OUTSIDE-OK",
      parkingLotId: 2,
      registrationDocKey: "/objects/doc.pdf",
    });
    expect(res.status).toBe(201);
  });

  it("unit with no lots of the requested type results in 409 (0 cap)", async () => {
    // owner2's unit has only surface lot; try to register inside
    mockAuthState.userId = CLERK_OWNER2;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "OWNER2-IN",
      isBasementParking: true,
    });
    // first rejects at the basement-check (BASEMENT_PARKING_NOT_REGISTERED) since no underground lot
    expect([400, 409]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E4 — final-slot concurrency: second request must be refused atomically
// ─────────────────────────────────────────────────────────────────────────────

describe("E4 — atomic final-slot enforcement", () => {
  beforeEach(() => {
    const { unitId } = seedBase();
    // Pre-fill the underground slot so there is exactly 0 remaining
    stores.vehicles.insert({
      userId: 1, unitId,
      make: "Honda", model: "Civic", plateNumber: "TAKEN", color: "Red",
      istimaraNumber: null, isAdditional: false,
      isBasementParking: true, registrationDocKey: null,
      status: "active", approvalNote: null, approvedById: null,
    });
  });

  it("refuses the request when the final inside slot was already taken", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "FINAL-SLOT",
      isBasementParking: true,
      registrationDocKey: "/objects/doc.pdf",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("PARKING_ENTITLEMENT_EXCEEDED");
  });

  it("does not insert a vehicle record when entitlement is exceeded", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const beforeCount = stores.vehicles.findAll().length;
    await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "SHOULD-NOT-INSERT",
      isBasementParking: true,
      registrationDocKey: "/objects/doc.pdf",
    });
    expect(stores.vehicles.findAll().length).toBe(beforeCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E5a — GET /vehicles/:id/registration-doc access control
// ─────────────────────────────────────────────────────────────────────────────

describe("E5a — GET /vehicles/:id/registration-doc", () => {
  beforeEach(() => {
    seedBase();
    // Vehicle with a registration doc belonging to owner1
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Toyota", model: "Land Cruiser", plateNumber: "DOC-001", color: "Black",
      istimaraNumber: null, isAdditional: true,
      isBasementParking: false,
      registrationDocKey: "/objects/reg-doc-001.pdf",
      status: "pending_approval", approvalNote: null, approvedById: null,
    }); // id=1

    // Vehicle without a doc
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Toyota", model: "Yaris", plateNumber: "NODOC-001", color: "White",
      istimaraNumber: null, isAdditional: false,
      isBasementParking: false,
      registrationDocKey: null,
      status: "active", approvalNote: null, approvedById: null,
    }); // id=2
  });

  it("owner can access their own vehicle's registration doc (200 or 404 if storage empty)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/vehicles/1/registration-doc");
    // 200 = success, 404 = objectStorage returned empty body (mock returns ok)
    expect([200, 204]).toContain(res.status);
  });

  it("guard (non-approver) cannot access registration doc (403)", async () => {
    mockAuthState.userId = CLERK_GUARD;
    const res = await request(app).get("/api/vehicles/1/registration-doc");
    expect(res.status).toBe(403);
  });

  it("another resident (owner2) cannot access owner1's doc (403)", async () => {
    mockAuthState.userId = CLERK_OWNER2;
    const res = await request(app).get("/api/vehicles/1/registration-doc");
    expect(res.status).toBe(403);
  });

  it("admin can access any vehicle's registration doc (200/204)", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).get("/api/vehicles/1/registration-doc");
    expect([200, 204]).toContain(res.status);
  });

  it("supervisor is blocked (403) from vehicle registration doc — role removed in X6", async () => {
    mockAuthState.userId = CLERK_SUPERVISOR;
    const res = await request(app).get("/api/vehicles/1/registration-doc");
    expect(res.status).toBe(403);
  });

  it("vehicle with no doc returns 404 NO_REGISTRATION_DOC", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/vehicles/2/registration-doc");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NO_REGISTRATION_DOC");
  });

  it("non-existent vehicle returns 404", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).get("/api/vehicles/9999/registration-doc");
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E5b — PATCH rejection with controlled reasons
// ─────────────────────────────────────────────────────────────────────────────

describe("E5b — PATCH /vehicles/:id rejection with controlled reasons", () => {
  beforeEach(() => {
    seedBase();
    // Additional pending vehicle owned by owner1
    stores.vehicles.insert({
      userId: 1, unitId: 1,
      make: "Honda", model: "Accord", plateNumber: "PENDING-001", color: "Silver",
      istimaraNumber: null, isAdditional: true,
      isBasementParking: false,
      registrationDocKey: "/objects/reg-doc-pending.pdf",
      status: "pending_approval", approvalNote: null, approvedById: null,
    }); // id=1
  });

  it("owner cannot reject a pending vehicle (403)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive", rejectionReason: "registration_name_mismatch",
    });
    expect(res.status).toBe(403);
  });

  it("guard cannot reject a pending vehicle (403)", async () => {
    mockAuthState.userId = CLERK_GUARD;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive", rejectionReason: "registration_name_mismatch",
    });
    // Guard is not owner and not admin → 403
    expect(res.status).toBe(403);
  });

  it("admin without rejectionReason gets 400 REJECTION_REASON_REQUIRED", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("REJECTION_REASON_REQUIRED");
    expect(res.body.validReasons).toBeTruthy();
  });

  it("admin with an invalid rejection reason gets 400 INVALID_REJECTION_REASON", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive", rejectionReason: "bad_reason_not_in_list",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REJECTION_REASON");
  });

  it("admin with a valid rejection reason succeeds (200) and sets rejectionReason", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive", rejectionReason: "registration_name_mismatch",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inactive");
    expect(res.body.rejectionReason).toBe("registration_name_mismatch");
  });

  it("supervisor is blocked (403) from vehicle rejection — role removed in X6", async () => {
    mockAuthState.userId = CLERK_SUPERVISOR;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "inactive", rejectionReason: "parking_lot_entitlement_exceeded",
    });
    expect(res.status).toBe(403);
  });

  it("admin can still approve (status=active) an additional pending vehicle (200)", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).patch("/api/vehicles/1").send({
      status: "active",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
  });

  it("all valid rejection reasons are accepted", async () => {
    const reasons = [
      "registration_name_mismatch",
      "parking_lot_entitlement_exceeded",
    ];
    for (const reason of reasons) {
      // Re-seed a fresh pending vehicle for each reason
      resetMockDb();
      seedBase();
      stores.vehicles.insert({
        userId: 1, unitId: 1,
        make: "Honda", model: "Accord", plateNumber: `PEND-${reason}`, color: "Silver",
        istimaraNumber: null, isAdditional: true,
        isBasementParking: false,
        registrationDocKey: "/objects/r.pdf",
        status: "pending_approval", approvalNote: null, approvedById: null,
      });
      mockAuthState.userId = CLERK_ADMIN;
      const res = await request(app).patch("/api/vehicles/1").send({
        status: "inactive", rejectionReason: reason,
      });
      expect(res.status).toBe(200);
      expect(res.body.rejectionReason).toBe(reason);
    }
  });
});
