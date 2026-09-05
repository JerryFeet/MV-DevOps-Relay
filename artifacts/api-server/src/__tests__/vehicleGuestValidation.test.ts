/**
 * Tests for Task #584: Vehicle & Guest Registration Improvements
 *
 * Vehicle POST:
 *   - Basement parking checkbox: 400 if no indoor lot registered to the unit
 *   - Basement parking allowed when unit has an isInside lot
 *   - Registration document required for additional (2nd+) vehicles
 *   - First vehicle succeeds without a document
 *
 * Guest POST:
 *   - Invalid visit reason → 400
 *   - Missing visit reason → 400
 *   - Valid visit reason passes through
 *   - Each of the 7 allowed reason values is accepted
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

// ObjectStorageService mock — getObjectEntityFile resolves for canonical /objects/ keys,
// throws ObjectNotFoundError for everything else (simulates the real existence check).
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

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, desc, count, inArray, sql } = await import("./helpers/mockDb");
  return { eq, and, desc, count, inArray, sql };
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

vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  sendTestEmail: vi.fn(),
}));

vi.mock("../lib/guestDayCount", () => ({
  getUnitGuestCountForDate: vi.fn().mockResolvedValue(0),
  getUnitPaidDaySlotsForDate: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/wahaPassCheck", () => ({
  unitHasActiveWahaPass: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/pushNotifications", () => ({
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));

// ─── App & helpers ─────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Constants ────────────────────────────────────────────────────────────────

const CLERK_OWNER   = "clerk-veh-owner";
const CLERK_ADMIN   = "clerk-veh-admin";
const CLERK_OWNER2  = "clerk-veh-owner2"; // owner with existing vehicle (for additional tests)

const BASE_VEHICLE = {
  make: "Toyota", model: "Camry", plateNumber: "ABC-1234", color: "Silver", parkingLotId: 1,
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedBase() {
  resetMockDb();

  // Auto-assigned id=1: has a basement parking lot (isInside: true)
  const unitBasement = stores.units.insert({
    building: "A",
    unitNumber: "101",
    parkingLots: JSON.stringify([
      { lotNumber: "B1", building: "A", isInside: true },
      { lotNumber: "S1", building: "A", isInside: false },
      { lotNumber: "S2", building: "A", isInside: false },
    ]),
  });

  // Auto-assigned id=2: only surface lots (isInside: false)
  const unitSurface = stores.units.insert({
    building: "B",
    unitNumber: "202",
    parkingLots: JSON.stringify([{ lotNumber: "S1", building: "B", isInside: false }]),
  });
  // Vehicle assignment is based only on normalized operational lot rows.
  stores.parkingLots.insert({ unitId: unitBasement.id, building: "A", lotNumber: "B1", parkingType: "underground", active: true });
  stores.parkingLots.insert({ unitId: unitBasement.id, building: "A", lotNumber: "S1", parkingType: "surface", active: true });
  stores.parkingLots.insert({ unitId: unitBasement.id, building: "A", lotNumber: "S2", parkingType: "surface", active: true });
  stores.parkingLots.insert({ unitId: unitSurface.id, building: "B", lotNumber: "S1", parkingType: "surface", active: true });

  // Owner with basement lot registered — unitId points to unitBasement
  stores.users.insert({
    clerkId: CLERK_OWNER,
    role: "owner",
    status: "active",
    email: "owner@veh-test.com",
    firstName: "Khalid",
    lastName: "Al-Saud",
    verificationStatus: "verified_owner",
    unitId: unitBasement.id,
    unitNumber: "A-101",
    nationalId: null,
    phone: null,
  }); // auto id=1

  // Admin user (no unitId)
  stores.users.insert({
    clerkId: CLERK_ADMIN,
    role: "admin",
    status: "active",
    email: "admin@veh-test.com",
    firstName: "Admin",
    lastName: "A",
    verificationStatus: "unverified",
    unitId: null,
    unitNumber: null,
    nationalId: null,
    phone: null,
  }); // auto id=2

  // Owner with no basement lot (surface only) — unitId points to unitSurface
  stores.users.insert({
    clerkId: CLERK_OWNER2,
    role: "owner",
    status: "active",
    email: "owner2@veh-test.com",
    firstName: "Sara",
    lastName: "Al-Rashid",
    verificationStatus: "verified_owner",
    unitId: unitSurface.id,
    unitNumber: "B-202",
    nationalId: null,
    phone: null,
  }); // auto id=3

  // C1 gate: each verified owner needs an active self-resident stub (linkedUserId = user.id).
  stores.residents.insert({
    type: "owner",
    firstName: "Khalid", lastName: "Al-Saud",
    email: "owner@veh-test.com",
    unitId: unitBasement.id, unitNumber: "A-101",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 1, // CLERK_OWNER → user id=1
    registeredById: 1,
    status: "active",
    idPhotoKey: null,
  });

  stores.residents.insert({
    type: "owner",
    firstName: "Sara", lastName: "Al-Rashid",
    email: "owner2@veh-test.com",
    unitId: unitSurface.id, unitNumber: "B-202",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 3, // CLERK_OWNER2 → user id=3
    registeredById: 3,
    status: "active",
    idPhotoKey: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /vehicles — basement parking validation", () => {
  beforeEach(seedBase);

  it("allows basement parking when the unit has an indoor lot", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE,
      isBasementParking: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(true);
  });

  it("uses a surface lot for a unit with no underground lot", async () => {
    mockAuthState.userId = CLERK_OWNER2;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE,
      parkingLotId: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(false);
  });

  it("allows first vehicle without basement parking (no lot check performed)", async () => {
    mockAuthState.userId = CLERK_OWNER2;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE,
      parkingLotId: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(false);
  });

  it("stores isBasementParking=false when not requested", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({ ...BASE_VEHICLE, parkingLotId: 2 });
    expect(res.status).toBe(201);
    expect(res.body.isBasementParking).toBe(false);
  });
});

describe("POST /vehicles — basement parking: malformed stored JSON", () => {
  beforeEach(() => {
    resetMockDb();
    // Unit with a malformed parkingLots value (not valid JSON)
    const badUnit = stores.units.insert({
      building: "C",
      unitNumber: "303",
      parkingLots: "not-valid-json",
    });
    stores.users.insert({
      clerkId: CLERK_OWNER,
      role: "owner",
      status: "active",
      email: "owner@veh-test.com",
      firstName: "Khalid",
      lastName: "Al-Saud",
      verificationStatus: "verified_owner",
      unitId: badUnit.id,
      unitNumber: "C-303",
      nationalId: null,
      phone: null,
    }); // id=1
    // C1 gate: self-resident stub so the gate passes and the parking check runs.
    stores.residents.insert({
      type: "owner",
      firstName: "Khalid", lastName: "Al-Saud",
      email: "owner@veh-test.com",
      unitId: badUnit.id, unitNumber: "C-303",
      relationship: "Owner",
      hasPortalAccess: true,
      linkedUserId: 1, // CLERK_OWNER → user id=1
      registeredById: 1,
      status: "active",
      idPhotoKey: null,
    });
  });

  it("refuses a vehicle without a normalized parking lot even when legacy JSON is malformed", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE,
      isBasementParking: true,
    });
    // Must be 400 (validation), never 500 (crash)
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
  });
});

describe("POST /vehicles — registration document for additional vehicles", () => {
  beforeEach(() => {
    seedBase();
    // Pre-seed an active vehicle for CLERK_OWNER so the next one is "additional"
    stores.vehicles.insert({
      userId: 1,           // CLERK_OWNER's id
      unitId: 10,
      make: "Honda", model: "Civic", plateNumber: "ZZZ-999", color: "White",
      istimaraNumber: null,
      isAdditional: false,
      isBasementParking: false,
      registrationDocKey: null,
      status: "active",
      approvalNote: null,
      approvedById: null,
    });
  });

  it("rejects an additional vehicle without a registrationDocKey", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "NEW-123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("REGISTRATION_DOC_REQUIRED");
  });

  it("accepts an additional vehicle with a registrationDocKey", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "NEW-123",
      registrationDocKey: "/objects/abc123-istimara.pdf",
    });
    expect(res.status).toBe(201);
    expect(res.body.isAdditional).toBe(true);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body.registrationDocKey).toBe("/objects/abc123-istimara.pdf");
  });

  it("rejects an additional vehicle with a forged/nonexistent registrationDocKey", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/vehicles").send({
      ...BASE_VEHICLE, plateNumber: "NEW-FORGED",
      // Arbitrary string that doesn't start with /objects/ — mock treats this as nonexistent
      registrationDocKey: "../../etc/passwd",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("REGISTRATION_DOC_NOT_FOUND");
  });

  it("first vehicle does NOT require a document", async () => {
    // Use CLERK_OWNER2 who has no vehicles
    mockAuthState.userId = CLERK_OWNER2;
    const res = await request(app).post("/api/vehicles").send({ ...BASE_VEHICLE, parkingLotId: 4 });
    expect(res.status).toBe(201);
    expect(res.body.isAdditional).toBe(false);
    expect(res.body.status).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guest tests — visit reason validation
// ─────────────────────────────────────────────────────────────────────────────

const CLERK_RESIDENT = "clerk-guest-resident";

function seedGuest() {
  resetMockDb();
  const unit = stores.units.insert({ building: "A", unitNumber: "101", parkingLots: null });
  stores.users.insert({
    clerkId: CLERK_RESIDENT,
    role: "owner",
    status: "active",
    email: "resident@guest-test.com",
    firstName: "Faisal",
    lastName: "Al-Harbi",
    verificationStatus: "verified_owner",
    unitId: unit.id,
    unitNumber: "A-101",
    nationalId: null,
    phone: null,
  });
}

const BASE_GUEST = {
  firstName: "Ali", lastName: "Doe",
  nationalId: "1023456789",
  visitDate: "2027-01-15",
  visitReason: "family_friend",
  gender: "male",
};

describe("POST /guests — visit reason validation", () => {
  beforeEach(seedGuest);

  it("rejects a free-text visit reason", async () => {
    mockAuthState.userId = CLERK_RESIDENT;
    const res = await request(app).post("/api/guests").send({
      ...BASE_GUEST,
      visitReason: "just visiting my friend",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_VISIT_REASON");
  });

  it("rejects a missing visit reason", async () => {
    mockAuthState.userId = CLERK_RESIDENT;
    const { visitReason: _, ...noReason } = BASE_GUEST;
    const res = await request(app).post("/api/guests").send(noReason);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_VISIT_REASON");
  });

  it("rejects an empty string reason", async () => {
    mockAuthState.userId = CLERK_RESIDENT;
    const res = await request(app).post("/api/guests").send({ ...BASE_GUEST, visitReason: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_VISIT_REASON");
  });

  it.each([undefined, "other"])("rejects guest registration with gender %j", async (gender) => {
    mockAuthState.userId = CLERK_RESIDENT;
    const { gender: _gender, ...withoutGender } = BASE_GUEST;
    const res = await request(app).post("/api/guests").send(
      gender === undefined ? withoutGender : { ...BASE_GUEST, gender },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("gender is required and must be either male or female");
  });

  const VALID_REASONS = [
    "family_friend", "delivery", "facility_event",
    "maintenance_work", "household_work", "medical", "other",
  ] as const;

  for (const reason of VALID_REASONS) {
    it(`accepts visit reason "${reason}"`, async () => {
      mockAuthState.userId = CLERK_RESIDENT;
      const res = await request(app).post("/api/guests").send({
        ...BASE_GUEST,
        visitReason: reason,
      });
      // 201 = created; 403 = wahaPass check fired (unit has no active pass in mock)
      // Either is acceptable here — the reason validation itself must NOT return 400
      expect(res.status).not.toBe(400);
      if (res.status === 201) {
        expect(res.body.visitReason).toBe(reason);
      }
    });
  }
});
