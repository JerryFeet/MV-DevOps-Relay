/**
 * Tests for GET /admin/units/full
 * Covers: auth enforcement (admin-only), pagination shape, nested data assembly.
 */

import request from "supertest";
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { vi } from "vitest";

// ── DB mock (hoisted-safe pattern) ────────────────────────────────────────────
vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, or, desc, ne, lt, gt, gte, lte, inArray, isNotNull, ilike, count } =
    await import("./helpers/mockDb");
  return { eq, and, or, desc, ne, lt, gt, gte, lte, inArray, isNotNull, ilike, count };
});

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    getAuth: () => ({ userId: mockAuthState.userId }),
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: mockAuthState.userId });
      next();
    },
  };
});

import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

let app: any;

beforeAll(async () => {
  const { default: appMod } = await import("../app");
  app = appMod;
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedAdmin() {
  const u = stores.users.insert({
    clerkId: "admin_clerk",
    role: "admin",
    firstName: "Admin",
    lastName: "User",
    email: "admin@test.com",
    status: "active",
    verificationStatus: "unverified",
    phone: null,
    unitNumber: null,
    unitId: null,
    nationalId: null,
  });
  mockAuthState.userId = "admin_clerk";
  return u;
}

function seedOwner() {
  const u = stores.users.insert({
    clerkId: "owner_clerk",
    role: "owner",
    firstName: "Ahmed",
    lastName: "Al-Rashidi",
    email: "ahmed@example.com",
    status: "active",
    verificationStatus: "verified_owner",
    phone: "0501234567",
    unitNumber: "A-101",
    unitId: null,
    nationalId: "1234567890",
  });
  return { ...u, id: u.id as number };
}

function seedUnit(verifiedOwnerId: number | null = null, verifiedTenantId: number | null = null) {
  const u = stores.units.insert({
    building: "A",
    unitNumber: "101",
    floor: "1",
    unitType: "apartment",
    sizeSqm: "120.00",
    occupantType: verifiedOwnerId ? "owner_occupied" : "vacant",
    parkingLots: JSON.stringify([{ lotNumber: "P1", building: "A", isInside: true }]),
    verifiedOwnerId,
    verifiedTenantId,
    titleReference: null,
    preApprovedClaimId: null,
    emergencyContact: null,
    emergencyPhone: null,
    preferredContact: null,
    mailingAddress: null,
    notes: null,
  });
  return { ...u, id: u.id as number };
}

function seedTenant(clerkId = "tenant_clerk") {
  const u = stores.users.insert({
    clerkId,
    role: "tenant",
    firstName: "Fatima",
    lastName: "Al-Ansari",
    email: "fatima@example.com",
    status: "active",
    verificationStatus: "verified_tenant",
    phone: "0554443322",
    unitNumber: "A-101",
    unitId: null,
    nationalId: "1122334455",
  });
  return { ...u, id: u.id as number };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /admin/units/full", () => {
  beforeEach(() => {
    resetMockDb();
  });

  // ── Authorization ─────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockAuthState.userId = null;
    const res = await request(app).get("/api/admin/units/full");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an owner user", async () => {
    const owner = seedOwner();
    mockAuthState.userId = "owner_clerk";
    seedUnit(owner.id);

    const res = await request(app).get("/api/admin/units/full");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a tenant user", async () => {
    stores.users.insert({
      clerkId: "tenant_clerk",
      role: "tenant",
      firstName: "T",
      lastName: "U",
      email: "t@u.com",
      status: "active",
      verificationStatus: "unverified",
      phone: null,
      unitNumber: null,
      unitId: null,
      nationalId: null,
    });
    mockAuthState.userId = "tenant_clerk";

    const res = await request(app).get("/api/admin/units/full");
    expect(res.status).toBe(403);
  });

  // ── Successful responses ──────────────────────────────────────────────────

  it("returns 200 with correct shape for admin caller", async () => {
    seedAdmin();
    const owner = seedOwner();
    seedUnit(owner.id);

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body).toHaveProperty("buildings");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(Array.isArray(res.body.buildings)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it("assembles owner info from the verified owner user record", async () => {
    seedAdmin();
    const owner = seedOwner();
    seedUnit(owner.id);

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const unit = res.body.data[0];
    expect(unit.building).toBe("A");
    expect(unit.unitNumber).toBe("101");
    if (unit.owner) {
      expect(unit.owner).toMatchObject({ firstName: "Ahmed", lastName: "Al-Rashidi" });
    }
  });

  it("includes empty residents/vehicles/wahaPasses arrays when none exist", async () => {
    seedAdmin();
    const owner = seedOwner();
    seedUnit(owner.id);

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    const unit = res.body.data[0];
    expect(Array.isArray(unit.residents)).toBe(true);
    expect(Array.isArray(unit.vehicles)).toBe(true);
    expect(Array.isArray(unit.wahaPasses)).toBe(true);
  });

  it("includes residents registered against the unit", async () => {
    seedAdmin();
    const owner = seedOwner();
    const unit = seedUnit(owner.id);

    stores.residents.insert({
      type: "family",
      firstName: "Lina",
      lastName: "Al-Rashidi",
      email: null,
      phone: null,
      unitNumber: "A-101",
      unitId: unit.id,
      relationship: "daughter",
      dateOfBirth: null,
      idNumber: "9988776655",
      idPhotoKey: null,
      hasPortalAccess: false,
      registeredById: owner.id,
      status: "active",
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    const unitData = res.body.data[0];
    expect(unitData.residents.length).toBeGreaterThan(0);
    expect(unitData.residents[0]).toMatchObject({ firstName: "Lina", relationship: "daughter" });
  });

  it("includes vehicles linked to the unit", async () => {
    seedAdmin();
    const owner = seedOwner();
    const unit = seedUnit(owner.id);

    stores.vehicles.insert({
      userId: owner.id,
      unitId: unit.id,
      make: "Toyota",
      model: "Camry",
      year: 2022,
      color: "white",
      plateNumber: "ABC-1234",
      istimaraNumber: null,
      isAdditional: false,
      status: "active",
      approvalNote: null,
      approvedById: null,
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    const unitData = res.body.data[0];
    expect(unitData.vehicles.length).toBeGreaterThan(0);
    expect(unitData.vehicles[0]).toMatchObject({ plateNumber: "ABC-1234", make: "Toyota" });
  });

  it("derives vehicle parking details from the canonical parking lot", async () => {
    seedAdmin();
    const owner = seedOwner();
    const unit = seedUnit();
    const lot = stores.parkingLots.insert({
      unitId: unit.id,
      building: "A",
      lotNumber: "B-12",
      parkingType: "underground",
      active: true,
      source: "stage2",
    });
    stores.vehicles.insert({
      userId: owner.id,
      unitId: unit.id,
      make: "Toyota",
      model: "Camry",
      year: 2022,
      color: "white",
      plateNumber: "ABC-1234",
      istimaraNumber: null,
      isAdditional: false,
      isBasementParking: false,
      parkingLotId: lot.id,
      status: "active",
      approvalNote: null,
      approvedById: null,
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body.data[0].vehicles[0]).toMatchObject({
      parkingLotId: lot.id,
      parkingLotNumber: "B-12",
      parkingType: "underground",
      underground: true,
    });
  });

  it("returns the exhaustive UR1 research record for a seeded unit", async () => {
    seedAdmin();
    const owner = seedOwner();
    const tenant = seedTenant();
    const unit = seedUnit(owner.id, tenant.id);
    const now = new Date("2026-08-31T08:00:00Z");

    const resident = stores.residents.insert({
      type: "family",
      firstName: "Lina",
      lastName: "Al-Rashidi",
      email: "lina@example.com",
      phone: "+966501112233",
      unitNumber: "A-101",
      unitId: unit.id,
      relationship: "daughter",
      idNumber: "3000000003",
      hasPortalAccess: false,
      registeredById: owner.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, type] of ["move_in", "move_out", "renovation", "additional_vehicle"].entries()) {
      stores.permits.insert({
        userId: owner.id,
        unitId: unit.id,
        unitNumber: "A-101",
        type,
        status: index === 0 ? "completed" : "approved",
        requestedStartDate: "2026-08-20",
        requestedEndDate: "2026-08-21",
        renovationScope: type === "renovation" ? JSON.stringify(["cosmetic", "structural"]) : null,
        contractorName: type === "renovation" ? "UR1 Contracting" : null,
        contractorContact: type === "renovation" ? "+966501234567" : null,
        createdAt: new Date(now.getTime() - index * 1_000),
        updatedAt: now,
      });
    }

    const guest = stores.guests.insert({
      residentId: owner.id,
      firstName: "Omar",
      lastName: "Visitor",
      vehiclePlate: "GST-101",
      visitDate: "2026-08-30",
      visitReason: "Family visit",
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
    stores.guestPasses.insert({
      passUuid: "ur1-pass",
      verificationToken: "ur1-secret",
      guestId: guest.id,
      residentId: owner.id,
      guestName: "Omar Visitor",
      visitDate: "2026-08-30",
      visitStartTime: "10:00",
      visitEndTime: "12:00",
      vehiclePlate: "GST-101",
      reasonForVisit: "Family visit",
      status: "approved",
      createdAt: now,
      approvedAt: now,
      revokedAt: null,
    });
    stores.wahaGuestDayPasses.insert({
      unitId: unit.id,
      unitNumber: "A-101",
      date: "2026-08-31",
      extraGuestCount: 3,
      guestCount: 5,
      vehiclePlate: "DAY-101",
      amountSar: "150.00",
      paymentStatus: "paid",
      issuedAt: now,
      revokedAt: null,
      createdAt: now,
    });
    stores.paymentAttempts.insert({
      purpose: "guest_day_pass",
      subjectType: "guest_day_pass",
      subjectId: 1,
      userId: owner.id,
      unitId: unit.id,
      provider: "moyasar",
      amount: "150.00",
      currency: "SAR",
      status: "confirmed",
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const facility = stores.facilities.insert({
      name: "Majlis",
      description: null,
      pricePerHour: "100.00",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    stores.bookings.insert({
      facilityId: facility.id,
      facilityName: "Majlis",
      userId: owner.id,
      unitId: unit.id,
      startTime: new Date("2026-09-02T15:00:00Z"),
      endTime: new Date("2026-09-02T17:00:00Z"),
      status: "confirmed",
      totalAmount: "200.00",
      paymentStatus: "paid",
      createdAt: now,
      updatedAt: now,
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    const record = res.body.data.find((candidate: any) => candidate.id === unit.id);
    expect(record.owner.nationalId).toBe("1234567890");
    expect(record.tenant.nationalId).toBe("1122334455");
    expect(record.residents[0]).toMatchObject({
      idNumber: "3000000003",
      email: "lina@example.com",
      phone: "+966501112233",
    });
    expect(record.permits.map((permit: any) => permit.type).sort()).toEqual(
      ["additional_vehicle", "move_in", "move_out", "renovation"],
    );
    expect(record.permits.find((permit: any) => permit.type === "renovation")).toMatchObject({
      contractorName: "UR1 Contracting",
      contractorContact: "+966501234567",
    });
    expect(record.guests[0]).toMatchObject({
      firstName: "Omar",
      vehiclePlate: "GST-101",
      passes: [expect.objectContaining({ status: "approved" })],
    });
    expect(record.guestDayPasses[0]).toMatchObject({ guestCount: 5, paymentStatus: "paid" });
    expect(record.payments[0]).toMatchObject({ purpose: "guest_day_pass", amount: "150.00", status: "confirmed" });
    expect(record.bookings[0]).toMatchObject({ resolvedFacilityName: "Majlis", status: "confirmed" });
  });

  it("returns empty data array with buildings list when no units exist", async () => {
    seedAdmin();

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
    expect(Array.isArray(res.body.buildings)).toBe(true);
  });

  it("supervisor is blocked (403) — role removed in X6", async () => {
    stores.users.insert({
      clerkId: "sup_clerk",
      role: "supervisor",
      firstName: "S",
      lastName: "V",
      email: "sv@test.com",
      status: "active",
      verificationStatus: "unverified",
      phone: null,
      unitNumber: null,
      unitId: null,
      nationalId: null,
    });
    mockAuthState.userId = "sup_clerk";

    const res = await request(app).get("/api/admin/units/full");
    expect(res.status).toBe(403);
  });

  it("includes parkingLots parsed as an array from JSON string", async () => {
    seedAdmin();
    const owner = seedOwner();
    seedUnit(owner.id);

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    const unit = res.body.data[0];
    expect(Array.isArray(unit.parkingLots)).toBe(true);
    if (unit.parkingLots.length > 0) {
      expect(unit.parkingLots[0]).toMatchObject({ lotNumber: "P1" });
    }
  });

  it("pagination reflects total count", async () => {
    seedAdmin();

    // Insert 3 units
    for (let i = 1; i <= 3; i++) {
      stores.units.insert({
        building: "A",
        unitNumber: `10${i}`,
        floor: "1",
        unitType: "apartment",
        sizeSqm: "100.00",
        occupantType: "vacant",
        parkingLots: null,
        verifiedOwnerId: null,
        verifiedTenantId: null,
        titleReference: null,
        preApprovedClaimId: null,
        emergencyContact: null,
        emergencyPhone: null,
        preferredContact: null,
        mailingAddress: null,
        notes: null,
      });
    }

    const res = await request(app).get("/api/admin/units/full?page=1&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  // ── Name search (?name=) ──────────────────────────────────────────────────

  describe("?name= search", () => {
    function seedResidentOnUnit(unitId: number, firstName: string, lastName: string) {
      return stores.residents.insert({
        type: "family",
        firstName,
        lastName,
        email: null,
        phone: null,
        unitNumber: "A-101",
        unitId,
        relationship: "relative",
        dateOfBirth: null,
        idNumber: null,
        idPhotoKey: null,
        hasPortalAccess: false,
        registeredById: 1,
        status: "active",
      });
    }

    it("returns units where the verified owner first name matches", async () => {
      seedAdmin();
      const owner = seedOwner(); // firstName: "Ahmed"
      seedUnit(owner.id);

      const res = await request(app).get("/api/admin/units/full?name=Ahmed");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].owner.firstName).toBe("Ahmed");
    });

    it("returns units where the verified owner last name matches", async () => {
      seedAdmin();
      const owner = seedOwner(); // lastName: "Al-Rashidi"
      seedUnit(owner.id);

      const res = await request(app).get("/api/admin/units/full?name=Al-Rashidi");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it("returns units when both name tokens match the owner (full-name query)", async () => {
      seedAdmin();
      const owner = seedOwner(); // "Ahmed Al-Rashidi"
      seedUnit(owner.id);

      const res = await request(app).get("/api/admin/units/full?name=Ahmed+Al-Rashidi");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it("returns units where the verified tenant matches", async () => {
      seedAdmin();
      const owner = seedOwner();
      const tenant = seedTenant(); // "Fatima Al-Ansari"
      seedUnit(owner.id, tenant.id);

      const res = await request(app).get("/api/admin/units/full?name=Fatima");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it("returns a unit matched by a household resident (no portal account)", async () => {
      seedAdmin();
      const owner = seedOwner();
      const unit = seedUnit(owner.id);
      // Lina has no portal user account
      seedResidentOnUnit(unit.id, "Lina", "Al-Rashidi");

      const res = await request(app).get("/api/admin/units/full?name=Lina");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].residents.some((r: any) => r.firstName === "Lina")).toBe(true);
    });

    it("does not return a unit when only an inactive resident matches", async () => {
      seedAdmin();
      const owner = seedOwner();
      const unit = seedUnit(owner.id);
      stores.residents.insert({
        type: "family",
        firstName: "GhostUser",
        lastName: "Inactive",
        email: null,
        phone: null,
        unitNumber: "A-101",
        unitId: unit.id,
        relationship: "relative",
        dateOfBirth: null,
        idNumber: null,
        idPhotoKey: null,
        hasPortalAccess: false,
        registeredById: owner.id,
        status: "moved_out",
      });

      const res = await request(app).get("/api/admin/units/full?name=GhostUser");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("returns empty data (not a crash) when no resident matches", async () => {
      seedAdmin();
      const owner = seedOwner();
      seedUnit(owner.id);

      const res = await request(app).get("/api/admin/units/full?name=NonExistentNameXYZ");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("name search combined with building filter narrows results", async () => {
      seedAdmin();
      const owner = seedOwner(); // "Ahmed"
      seedUnit(owner.id); // building "A"
      // Second unit in a different building with a different owner
      const owner2 = stores.users.insert({
        clerkId: "owner2_clerk",
        role: "owner",
        firstName: "Ahmed",
        lastName: "Al-Farsi",
        email: "ahmed2@example.com",
        status: "active",
        verificationStatus: "verified_owner",
        phone: null,
        unitNumber: "B-201",
        unitId: null,
        nationalId: "9999999999",
      });
      stores.units.insert({
        building: "B",
        unitNumber: "201",
        floor: "2",
        unitType: "apartment",
        sizeSqm: "100.00",
        occupantType: "owner_occupied",
        parkingLots: null,
        verifiedOwnerId: owner2.id as number,
        verifiedTenantId: null,
        titleReference: null,
        preApprovedClaimId: null,
        emergencyContact: null,
        emergencyPhone: null,
        preferredContact: null,
        mailingAddress: null,
        notes: null,
      });

      // Both owners named Ahmed, but only building A
      const res = await request(app).get("/api/admin/units/full?name=Ahmed&building=A");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].building).toBe("A");
    });

    it("includes nameSearch in the response body", async () => {
      seedAdmin();

      const res = await request(app).get("/api/admin/units/full?name=Somebody");
      expect(res.status).toBe(200);
      expect(res.body.nameSearch).toBe("Somebody");
    });

    it("pagination still works for name search results", async () => {
      seedAdmin();
      // Create 3 units each with an owner named "Ali"
      for (let i = 1; i <= 3; i++) {
        const u = stores.users.insert({
          clerkId: `ali_clerk_${i}`,
          role: "owner",
          firstName: "Ali",
          lastName: `Owner${i}`,
          email: `ali${i}@example.com`,
          status: "active",
          verificationStatus: "verified_owner",
          phone: null,
          unitNumber: `A-${200 + i}`,
          unitId: null,
          nationalId: `200000000${i}`,
        });
        stores.units.insert({
          building: "A",
          unitNumber: `${200 + i}`,
          floor: "2",
          unitType: "apartment",
          sizeSqm: "100.00",
          occupantType: "owner_occupied",
          parkingLots: null,
          verifiedOwnerId: u.id as number,
          verifiedTenantId: null,
          titleReference: null,
          preApprovedClaimId: null,
          emergencyContact: null,
          emergencyPhone: null,
          preferredContact: null,
          mailingAddress: null,
          notes: null,
        });
      }

      const res = await request(app).get("/api/admin/units/full?name=Ali&page=1&limit=2");
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });
  });

  it("ejar reference is taken from the CURRENT verified tenant, not a prior tenant of the same unit", async () => {
    seedAdmin();
    const owner = seedOwner();
    const currentTenant = seedTenant("current_tenant_clerk");
    // A prior tenant who has since been removed from the unit
    const priorTenant = stores.users.insert({
      clerkId: "prior_tenant_clerk",
      role: "tenant",
      firstName: "Old",
      lastName: "Tenant",
      email: "old@example.com",
      status: "active",
      verificationStatus: "linkage_ended",
      phone: null,
      unitNumber: "A-101",
      unitId: null,
      nationalId: "0000000001",
    });

    const unit = seedUnit(owner.id, currentTenant.id);

    // Prior tenant's approved verification (should NOT appear in result)
    stores.unitVerifications.insert({
      type: "tenant_request",
      userId: priorTenant.id as number,
      unitId: unit.id,
      nationalId: "0000000001",
      ejarReference: "EJAR-OLD-9999",
      status: "approved",
      documentNote: null,
      reviewedById: null,
      reviewNote: null,
      expiresAt: null,
      firstName: null,
      middleName: null,
      lastName: null,
      mobile: null,
      ownerNationalId: null,
      parkingLots: null,
      titleDeedKey: null,
    });

    // Current tenant's approved verification (SHOULD appear in result)
    stores.unitVerifications.insert({
      type: "tenant_request",
      userId: currentTenant.id,
      unitId: unit.id,
      nationalId: "1122334455",
      ejarReference: "EJAR-CURRENT-1234",
      status: "approved",
      documentNote: null,
      reviewedById: null,
      reviewNote: null,
      expiresAt: null,
      firstName: null,
      middleName: null,
      lastName: null,
      mobile: null,
      ownerNationalId: null,
      parkingLots: null,
      titleDeedKey: null,
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const unitData = res.body.data[0];
    expect(unitData.tenant).not.toBeNull();
    // Must show current tenant's ejar reference, not the prior tenant's
    expect(unitData.tenant.ejarReference).toBe("EJAR-CURRENT-1234");
  });

  it("Stage 6C O7 surfaces never-registered and released units as ownerless with elapsed time, excluding HOA COMMON", async () => {
    seedAdmin();
    const neverRegisteredAt = new Date("2026-08-01T09:00:00.000Z");
    const releasedAt = new Date("2026-08-02T10:00:00.000Z");

    stores.units.insert({
      building: "A", unitNumber: "102", occupantType: "vacant",
      verifiedOwnerId: null, verifiedTenantId: null, preApprovedClaimId: null,
      createdAt: neverRegisteredAt,
    });
    const releasedUnit = stores.units.insert({
      building: "A", unitNumber: "103", occupantType: "tenant_occupied",
      verifiedOwnerId: null, verifiedTenantId: null, preApprovedClaimId: null,
      createdAt: new Date("2026-07-01T09:00:00.000Z"),
    });
    stores.ownershipChangeEvents.insert({
      unitId: releasedUnit.id as number,
      unitNumber: "A 103",
      initiationType: "path_a",
      status: "approved",
      reviewedAt: releasedAt,
      outgoingOwnerId: null,
    });
    stores.units.insert({
      building: "HOA", unitNumber: "COMMON", occupantType: "vacant",
      verifiedOwnerId: null, verifiedTenantId: null, preApprovedClaimId: null,
      isSystem: true,
    });

    const res = await request(app).get("/api/admin/units/full");

    expect(res.status).toBe(200);
    expect(res.body.data.some((unit: any) => unit.building === "HOA" && unit.unitNumber === "COMMON")).toBe(false);
    const neverRegistered = res.body.data.find((unit: any) => unit.building === "A" && unit.unitNumber === "102");
    const released = res.body.data.find((unit: any) => unit.building === "A" && unit.unitNumber === "103");
    expect(neverRegistered).toMatchObject({
      owner: null,
      ownerless: {
        source: "never_registered",
        since: neverRegisteredAt.toISOString(),
        elapsedDays: expect.any(Number),
      },
    });
    expect(released).toMatchObject({
      owner: null,
      ownerless: {
        source: "ownership_released",
        since: releasedAt.toISOString(),
        elapsedDays: expect.any(Number),
      },
    });
    expect(neverRegistered.ownerless.elapsedDays).toBeGreaterThanOrEqual(0);
    expect(released.ownerless.elapsedDays).toBeGreaterThanOrEqual(0);
  });
});
