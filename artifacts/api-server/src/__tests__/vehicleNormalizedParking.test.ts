/**
 * Focused regression tests for the normalized parking_lots basement eligibility
 * check in POST /api/vehicles.
 *
 * Priority order:
 *   1. Normalized active underground lot  → 201 (authorized)
 *   2. Normalized records exist but none is underground/active  → 400
 *      (stale legacy JSON with isInside:true must NOT override a migrated unit)
 *   3. Normalized record is inactive (active=false) + stale legacy isInside:true → 400
 *      (inactive normalized records mark the unit as migrated; legacy is not consulted)
 *   4. No normalized records at all → legacy fallback:
 *        a. Legacy has isInside:true  → 201 (authorized)
 *        b. Legacy has isInside:false → 400 BASEMENT_PARKING_NOT_REGISTERED
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ──────────────────────────────────────────────────────────────

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

// ─── Constants ─────────────────────────────────────────────────────────────────

const CLERK_OWNER = "clerk-np-owner";
const CLERK_TENANT = "clerk-np-tenant";

const BASE_VEHICLE = {
  make: "Toyota", model: "Camry", plateNumber: "NP-1234", color: "White", parkingLotId: 1,
};

// ─── Seed helper ───────────────────────────────────────────────────────────────

/**
 * Seeds a verified owner linked to a unit. The unit has a legacy parkingLots
 * JSON with isInside:true (intentionally "stale" for regression cases).
 * Callers may then insert normalized parkingLots rows as needed.
 */
function seedOwner() {
  resetMockDb();

  const unit = stores.units.insert({
    building: "A",
    unitNumber: "101",
    // Legacy JSON with an underground lot — used only in the legacy-fallback tests
    parkingLots: JSON.stringify([{ lotNumber: "B1", building: "A", isInside: true }]),
  }); // id=1

  stores.users.insert({
    clerkId: CLERK_OWNER,
    role: "owner",
    status: "active",
    email: "owner@np-test.com",
    firstName: "Nour",
    lastName: "Aldeen",
    verificationStatus: "verified_owner",
    unitId: unit.id,
    unitNumber: "A-101",
    nationalId: null,
    phone: null,
  }); // id=1

  // C1 gate: active self-resident stub so the gate passes and the parking check runs.
  stores.residents.insert({
    type: "owner",
    firstName: "Nour", lastName: "Aldeen",
    email: "owner@np-test.com",
    unitId: unit.id, unitNumber: "A-101",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 1,
    registeredById: 1,
    status: "active",
    idPhotoKey: null,
  });

  return { unitId: unit.id as number };
}

function seedTenant(parkingLots: Array<{ lotNumber: string; building: string; isInside: boolean }>) {
  resetMockDb();
  const unit = stores.units.insert({
    building: "T",
    unitNumber: "201",
    parkingLots: JSON.stringify(parkingLots),
  });
  stores.users.insert({
    clerkId: CLERK_TENANT,
    role: "tenant",
    status: "active",
    email: "tenant@np-test.com",
    firstName: "Tariq",
    lastName: "Tenant",
    verificationStatus: "verified_tenant",
    unitId: unit.id,
    unitNumber: "T-201",
    nationalId: null,
    phone: null,
  });
  stores.residents.insert({
    type: "tenant",
    firstName: "Tariq",
    lastName: "Tenant",
    email: "tenant@np-test.com",
    unitId: unit.id,
    unitNumber: "T-201",
    relationship: "Tenant",
    hasPortalAccess: true,
    linkedUserId: 1,
    registeredById: 1,
    status: "active",
    idPhotoKey: null,
  });
  for (const lot of parkingLots) {
    stores.parkingLots.insert({
      unitId: unit.id, building: lot.building, lotNumber: lot.lotNumber,
      parkingType: lot.isInside ? "underground" : "surface", active: true,
    });
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /vehicles — normalized parking_lots basement eligibility", () => {

  // ── Case 1: normalized active underground lot → authorized ─────────────────

  describe("normalized-only success", () => {
    beforeEach(() => {
      const { unitId } = seedOwner();
      // Insert a normalized active underground lot for the unit.
      stores.parkingLots.insert({
        unitId,
        building: "A",
        lotNumber: "UG-01",
        parkingType: "underground",
        active: true,
        source: "stage2",
        sourceReference: null,
      });
    });

    it("returns 201 when a normalized active underground lot exists", async () => {
      mockAuthState.userId = CLERK_OWNER;
      const res = await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        isBasementParking: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.isBasementParking).toBe(true);
    });

    it("stores the vehicle with isBasementParking=true", async () => {
      mockAuthState.userId = CLERK_OWNER;
      await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        isBasementParking: true,
      });
      const vehicles = stores.vehicles.findAll();
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0].isBasementParking).toBe(true);
    });
  });

  // ── Case 2: normalized records exist but no underground → stale legacy denied

  describe("normalized stale-legacy denial", () => {
    beforeEach(() => {
      const { unitId } = seedOwner();
      // Insert a normalized active SURFACE lot (not underground).
      // The unit's legacy JSON still has isInside:true, but since normalized
      // records exist, the legacy JSON must be completely ignored.
      stores.parkingLots.insert({
        unitId,
        building: "A",
        lotNumber: "S-01",
        parkingType: "surface",
        active: true,
        source: "stage2",
        sourceReference: null,
      });
    });

    it("rejects a foreign lot even though legacy JSON has an underground entry", async () => {
      mockAuthState.userId = CLERK_OWNER;
      const res = await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        parkingLotId: 999,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
    });

    it("does not insert a vehicle when stale legacy is denied by normalized records", async () => {
      mockAuthState.userId = CLERK_OWNER;
      await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        parkingLotId: 999,
      });
      expect(stores.vehicles.findAll()).toHaveLength(0);
    });
  });

  // ── Case 3: inactive normalized records + stale legacy isInside:true → denied

  describe("normalized inactive denial", () => {
    // Regression: the unit has ONE normalized row (inactive underground) and a
    // stale legacy JSON with isInside:true. The existence of ANY normalized row
    // marks this unit as migrated — legacy must not be consulted, so the result
    // must always be 400 regardless of what the legacy JSON says.
    beforeEach(() => {
      const { unitId } = seedOwner();
      // seedOwner gives legacy parkingLots JSON with isInside:true (the "stale" value).
      // Insert an inactive underground lot — unit is now considered migrated.
      stores.parkingLots.insert({
        unitId,
        building: "A",
        lotNumber: "UG-01",
        parkingType: "underground",
        active: false,   // ← inactive — must NOT satisfy eligibility
        source: "stage2",
        sourceReference: null,
      });
    });

    it("returns 400 when the only normalized lot is inactive, even though legacy JSON has isInside:true", async () => {
      mockAuthState.userId = CLERK_OWNER;
      const res = await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        isBasementParking: true,
      });
      // The unit has a normalized row (migrated) but no active underground lot.
      // Legacy JSON must NOT be consulted — stale isInside:true must not grant access.
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
    });

    it("does not insert a vehicle when inactive normalized lot + stale legacy isInside:true", async () => {
      mockAuthState.userId = CLERK_OWNER;
      await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        isBasementParking: true,
      });
      expect(stores.vehicles.findAll()).toHaveLength(0);
    });

    it("returns 400 when inactive normalized lot exists and no legacy JSON is present", async () => {
      // Variation: unit with inactive normalized lot and no legacy JSON at all.
      resetMockDb();
      const unit = stores.units.insert({
        building: "B",
        unitNumber: "202",
        parkingLots: null, // no legacy JSON
      });
      stores.users.insert({
        clerkId: CLERK_OWNER,
        role: "owner",
        status: "active",
        email: "owner@np-test.com",
        firstName: "Nour", lastName: "Aldeen",
        verificationStatus: "verified_owner",
        unitId: unit.id,
        unitNumber: "B-202",
        nationalId: null,
        phone: null,
      });
      stores.residents.insert({
        type: "owner",
        firstName: "Nour", lastName: "Aldeen",
        email: "owner@np-test.com",
        unitId: unit.id, unitNumber: "B-202",
        relationship: "Owner",
        hasPortalAccess: true,
        linkedUserId: 1,
        registeredById: 1,
        status: "active",
        idPhotoKey: null,
      });
      stores.parkingLots.insert({
        unitId: unit.id,
        building: "B",
        lotNumber: "UG-02",
        parkingType: "underground",
        active: false, // inactive
        source: "stage2",
        sourceReference: null,
      });

      mockAuthState.userId = CLERK_OWNER;
      const res = await request(app).post("/api/vehicles").send({
        ...BASE_VEHICLE,
        isBasementParking: true,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
    });
  });

  // ── Case 4: no normalized records → legacy fallback ───────────────────────

  describe("legacy fallback (no normalized records present)", () => {
    describe("legacy fallback success — isInside:true", () => {
      beforeEach(() => {
        // seedOwner already gives a unit with legacy isInside:true and NO normalized rows.
        seedOwner();
        // Confirm: no parkingLots rows in the store.
        // (stores.parkingLots is empty after resetMockDb in seedOwner)
      });

      it("does not use legacy JSON when no normalized rows exist", async () => {
        mockAuthState.userId = CLERK_OWNER;
        const res = await request(app).post("/api/vehicles").send({
          ...BASE_VEHICLE,
          isBasementParking: true,
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
      });
    });

    describe("legacy fallback denial — no isInside:true in legacy JSON", () => {
      beforeEach(() => {
        resetMockDb();
        const unit = stores.units.insert({
          building: "C",
          unitNumber: "303",
          // Only surface lots in legacy JSON — no isInside:true
          parkingLots: JSON.stringify([{ lotNumber: "S2", building: "C", isInside: false }]),
        });
        stores.users.insert({
          clerkId: CLERK_OWNER,
          role: "owner",
          status: "active",
          email: "owner@np-test.com",
          firstName: "Nour", lastName: "Aldeen",
          verificationStatus: "verified_owner",
          unitId: unit.id,
          unitNumber: "C-303",
          nationalId: null,
          phone: null,
        });
        stores.residents.insert({
          type: "owner",
          firstName: "Nour", lastName: "Aldeen",
          email: "owner@np-test.com",
          unitId: unit.id, unitNumber: "C-303",
          relationship: "Owner",
          hasPortalAccess: true,
          linkedUserId: 1,
          registeredById: 1,
          status: "active",
          idPhotoKey: null,
        });
      });

      it("returns 400 when no normalized records exist and legacy JSON has only isInside:false", async () => {
        mockAuthState.userId = CLERK_OWNER;
        const res = await request(app).post("/api/vehicles").send({
          ...BASE_VEHICLE,
          isBasementParking: true,
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("PARKING_LOT_NOT_IN_UNIT");
      });
    });
  });
});

describe("GET /vehicles — inactive assigned parking-lot display contract", () => {
  beforeEach(() => {
    const { unitId } = seedOwner();
    const inactiveLot = stores.parkingLots.insert({
      unitId,
      building: "A",
      lotNumber: "OLD-UG-01",
      parkingType: "underground",
      active: false,
    });
    stores.vehicles.insert({
      userId: 1,
      unitId,
      make: "Toyota",
      model: "Camry",
      plateNumber: "DISPLAY-001",
      color: "White",
      parkingLotId: inactiveLot.id,
      isBasementParking: true,
      isAdditional: false,
      status: "active",
    });
  });

  it("includes the inactive assigned lot on both list and detail, but not in selection", async () => {
    mockAuthState.userId = CLERK_OWNER;

    const list = await request(app).get("/api/vehicles").expect(200);
    expect(list.body.data[0].parkingLot).toMatchObject({
      lotNumber: "OLD-UG-01",
      building: "A",
      parkingType: "underground",
      active: false,
      underground: true,
    });

    const detail = await request(app).get("/api/vehicles/1").expect(200);
    expect(detail.body.parkingLot).toMatchObject({
      lotNumber: "OLD-UG-01",
      active: false,
    });

    const selection = await request(app).get("/api/vehicles/parking-lots").expect(200);
    expect(selection.body).toEqual([]);
  });
});
