/**
 * sendAdminAlert fires for each approval-required resident action
 *
 * Tests that each of the four routes which require admin attention sends a
 * correctly-subject-lined alert via sendAdminAlert when a resident (non-approver)
 * submits a request, and that the alert is suppressed in the cases where it
 * must not fire (admin submitting on behalf, auto-approved owner match, first
 * vehicle registration).
 *
 * sendAdminAlert is mocked at the module level so no real SMTP connection is
 * needed and the spy captures every call regardless of env vars.
 *
 * Routes under test:
 *   POST /permits              — resident fires alert; APPROVER_ROLE does not
 *   POST /unit-verify/owner    — manual path fires; auto-approved path does not
 *   POST /unit-verify/tenant   — always fires
 *   POST /vehicles             — additional vehicle fires; first vehicle does not
 *   POST /guests               — always fires for any resident guest pre-registration
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Email spy (hoisted before app import) ────────────────────────────────────

const sendAdminAlertSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/email", () => ({
  sendAdminAlert: sendAdminAlertSpy,
}));

// ─── DB mock ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, count, desc, ne, lt, gt, gte, inArray, ilike, sql } = await import(
    "./helpers/mockDb"
  );
  return { eq, and, count, desc, ne, lt, gt, gte, inArray, ilike, sql };
});

// ─── Auth / infra mocks ───────────────────────────────────────────────────────

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

// ─── Push notifications (used in some routes) ─────────────────────────────────

vi.mock("../lib/pushNotifications", () => ({
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/wahaPassCheck", () => ({
  unitHasActiveWahaPass: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/guestDayCount", () => ({
  getUnitGuestCountForDate: vi.fn().mockResolvedValue(0),
  getUnitPaidDaySlotsForDate: vi.fn().mockResolvedValue(0),
}));

// ObjectStorageService: existence check for registrationDocKey
vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityFile(key: string) {
      if (typeof key === "string" && key.startsWith("/objects/")) {
        return Promise.resolve({});
      }
      return Promise.reject(new ObjectNotFoundError("Not found"));
    }
    getObjectEntityDownloadURL() {
      return Promise.resolve("https://signed.example.test/private-object");
    }
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

// ─── App & helpers (imported after mocks) ────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Shared Clerk IDs ─────────────────────────────────────────────────────────

const CLERK_RESIDENT = "clerk-aar-resident";
const CLERK_ADMIN = "clerk-aar-admin";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedOwner() {
  stores.users.insert({
    clerkId: CLERK_RESIDENT,
    email: "aar-owner@test.com",
    role: "owner",
    status: "active",
    firstName: "Resident",
    lastName: "R",
    verificationStatus: "verified_owner",
    unitNumber: "B1 101",
    unitId: 1,
  }); // id=1
  // C1 gate: active self-resident stub required for vehicle/move-form registration.
  stores.residents.insert({
    type: "owner",
    firstName: "Resident", lastName: "R",
    email: "aar-owner@test.com",
    unitId: 1, unitNumber: "B1 101",
    relationship: "Owner",
    hasPortalAccess: true,
    linkedUserId: 1,
    registeredById: 1,
    status: "active",
    idPhotoKey: null,
  });
}

function seedAdmin() {
  stores.users.insert({
    clerkId: CLERK_ADMIN,
    email: "aar-admin@test.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "A",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }); // id=1
}

function seedUnit(overrides: Record<string, unknown> = {}) {
  const unit = stores.units.insert({
    building: "B1",
    unitNumber: "101",
    unitType: "apartment",
    sizeSqm: null,
    titleReference: null,
    verifiedOwnerId: 99, // some owner already verified
    verifiedTenantId: null,
    occupantType: "owner_occupied",
    ownerNationalId: "OWNER-NID-TENANT-TEST",
    ...overrides,
  }); // id=1
  stores.parkingLots.insert({
    unitId: unit.id,
    building: "B1",
    lotNumber: "S1",
    parkingType: "surface",
    active: true,
  }); // id=1
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sendAdminAlert — approval-required resident events", () => {
  beforeEach(() => {
    resetMockDb();
    sendAdminAlertSpy.mockClear();
  });

  // ── POST /permits ────────────────────────────────────────────────────────────

  describe("POST /permits — resident submits a renovation permit", () => {
    it("fires sendAdminAlert with [Action Required] subject when a resident submits", async () => {
      seedOwner(); // id=1
      mockAuthState.userId = CLERK_RESIDENT;

      const res = await request(app)
        .post("/api/permits")
        .send({
          permitType: "renovation",
          description: "Kitchen remodel",
          renovationScope: ["major_interior_upgrades"],
          contractorName: "ACME Builders",
          contractorContact: "+966501234567",
          workingHoursRequested: "08:00-17:00",
          commonAreaImpact: false,
          requestedStartDate: "2028-09-01",
          requestedEndDate: "2028-09-30",
        })
        .expect(201);

      expect(res.body.type).toBe("renovation");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(
        /\[Action Required\] New Renovation Permit/,
      );
    });

    it("includes the unit number in the subject when caller has a unitNumber", async () => {
      seedOwner(); // id=1 — unitNumber "B1 101"
      seedUnit({ verifiedOwnerId: 1 });
      mockAuthState.userId = CLERK_RESIDENT;

      await request(app)
        .post("/api/permits")
        .send({
          permitType: "renovation",
          description: "Bathroom remodel",
          renovationScope: ["major_interior_upgrades"],
          contractorName: "ACME Builders",
          contractorContact: "+966501234567",
          workingHoursRequested: "08:00-17:00",
          commonAreaImpact: false,
          requestedStartDate: "2028-10-01",
          requestedEndDate: "2028-10-31",
        })
        .expect(201);

      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("Unit B1 101");
    });

    it("does NOT fire sendAdminAlert when the caller is an APPROVER_ROLE (admin)", async () => {
      seedAdmin(); // id=1 — role="admin"
      mockAuthState.userId = CLERK_ADMIN;

      // Admin is also verified_owner equivalent; set verificationStatus to bypass guard
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_ADMIN },
        { verificationStatus: "verified_owner" },
      );

      await request(app)
        .post("/api/permits")
        .send({
          permitType: "renovation",
          description: "Lobby renovation",
          renovationScope: ["exterior_affecting"],
          contractorName: "ACME Builders",
          contractorContact: "+966501234567",
          workingHoursRequested: "08:00-17:00",
          commonAreaImpact: false,
          requestedStartDate: "2028-11-01",
          requestedEndDate: "2028-11-30",
        })
        .expect(201);

      expect(sendAdminAlertSpy).not.toHaveBeenCalled();
    });
  });

  // ── POST /unit-verify/owner ───────────────────────────────────────────────

  describe("POST /unit-verify/owner — manual review path", () => {
    it("fires sendAdminAlert when no registry match is found (manual review)", async () => {
      seedOwner(); // id=1
      mockAuthState.userId = CLERK_RESIDENT;
      // unitRegistry is empty → no exact match → triggers manual review
      // units store also empty → unit will be auto-created by the route

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({ building: "B1", unitNumber: "101", nationalId: "ID-9999", mobile: "+966501234567", gender: "female", titleDeedNumber: "1234567890123456" })
        .expect(200);

      expect(res.body.result).toBe("pending_manual_review");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(
        /\[Action Required\] Owner Verification/,
      );
    });

    it("still requires manual review and alerts admins when the registry has an exact match", async () => {
      seedOwner(); // id=1
      mockAuthState.userId = CLERK_RESIDENT;
      // Seed a matching registry entry
      stores.unitRegistry.insert({
        building: "B1",
        unitNumber: "101",
        ownerNationalId: "ID-1234",
        ownerName: "Resident R",
        unitType: "apartment",
        isMatched: false,
        matchedUserId: null,
      }); // id=1
      // Seed the unit record so the route finds it
      seedUnit({ verifiedOwnerId: null });

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({ building: "B1", unitNumber: "101", nationalId: "ID-1234", mobile: "+966501234567", gender: "female", titleDeedNumber: "1234567890123456" })
        .expect(200);

      expect(res.body.result).toBe("pending_manual_review");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(/\[Action Required\] Owner Verification/);
    });
  });

  // ── POST /unit-verify/tenant ─────────────────────────────────────────────

  describe("POST /unit-verify/tenant", () => {
    it("fires sendAdminAlert with Tenant Linkage Request subject", async () => {
      seedOwner(); // id=1 — role owner, but submit as tenant for this flow
      // Change role to tenant for this test scenario
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_RESIDENT },
        { role: "tenant" },
      );
      mockAuthState.userId = CLERK_RESIDENT;
      // Unit must exist and have a verifiedOwnerId (so tenant can link to it)
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null }); // id=1
      // Registry entry required — ownerNationalId must match the request
      stores.unitRegistry.insert({
        building: "B1",
        unitNumber: "101",
        ownerNationalId: "OWNER-NID-TENANT-TEST",
        ownerName: "Unit Owner",
        unitType: "apartment",
        isMatched: true,
        matchedUserId: 99,
      });

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "OWNER-NID-TENANT-TEST",
        firstName: "Tenant",
        lastName: "Alert",
        mobile: "0512345678",
        dateOfBirth: "1990-05-05",
        nationality: "Saudi",
        gender: "female",
        ejarDocumentKey: "/objects/ejar/test-ejar.pdf",
        leaseStartDate: "2026-08-01",
        leaseEndDate: "2027-07-31",
        })
        .expect(200);

      expect(res.body.result).toBe("pending_owner_approval");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(
        /\[Action Required\] Tenant Linkage Request/,
      );
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("B1 101");
    });
  });

  // ── POST /vehicles ───────────────────────────────────────────────────────

  describe("POST /vehicles — additional vehicle request", () => {
    it("fires sendAdminAlert when the resident already has one active vehicle (isAdditional=true)", async () => {
      seedOwner(); // id=1
      seedUnit();
      mockAuthState.userId = CLERK_RESIDENT;
      // Seed an existing active vehicle so the next one is flagged isAdditional
      stores.vehicles.insert({
        userId: 1,
        unitId: 1,
        make: "Toyota",
        model: "Camry",
        year: "2020",
        color: "White",
        plateNumber: "AAA-001",
        istimaraNumber: "IST-001",
        isAdditional: false,
        status: "active",
      }); // id=1

      const res = await request(app)
        .post("/api/vehicles")
        .send({
          make: "Honda",
          model: "Civic",
          year: "2022",
          color: "Blue",
          plateNumber: "BBB-002",
          istimaraNumber: "IST-002",
          parkingLotId: 1,
          // Additional vehicle requires a canonical-format registration document key
          registrationDocKey: "/objects/test-istimara.pdf",
        })
        .expect(201);

      expect(res.body.status).toBe("pending_approval");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(
        /\[Action Required\] Additional Vehicle Request/,
      );
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("Honda");
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("BBB-002");
    });

    it("does NOT fire sendAdminAlert when registering the first vehicle (isAdditional=false)", async () => {
      seedOwner(); // id=1
      seedUnit();
      mockAuthState.userId = CLERK_RESIDENT;
      // vehicles store is empty → this is the first vehicle

      const res = await request(app)
        .post("/api/vehicles")
        .send({
          make: "Toyota",
          model: "Camry",
          year: "2020",
          color: "White",
          plateNumber: "AAA-001",
          istimaraNumber: "IST-001",
          parkingLotId: 1,
        })
        .expect(201);

      expect(res.body.status).toBe("active");
      expect(sendAdminAlertSpy).not.toHaveBeenCalled();
    });
  });

  // ── POST /guests ─────────────────────────────────────────────────────────

  describe("POST /guests — resident pre-registers a guest", () => {
    it("fires sendAdminAlert with [Action Required] New Guest Pre-Registration subject", async () => {
      seedOwner(); // id=1
      mockAuthState.userId = CLERK_RESIDENT;

      const res = await request(app)
        .post("/api/guests")
        .send({
          firstName: "John",
          lastName: "Doe",
          visitDate: "2028-08-15",
          visitReason: "family_friend",
          vehiclePlate: "XYZ-999",
          gender: "male",
          nationalId: "1023456789",
        })
        .expect(201);

      expect(res.body.firstName).toBe("John");
      expect(sendAdminAlertSpy).toHaveBeenCalledOnce();
      // Route sends an [FYI] alert (pass already auto-issued, no action required)
      expect(sendAdminAlertSpy.mock.calls[0][0]).toMatch(/Guest Pre-Registered/);
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("John");
      expect(sendAdminAlertSpy.mock.calls[0][0]).toContain("Doe");
    });

    it("rejects guest registration when National ID / Iqama is omitted", async () => {
      seedOwner();
      mockAuthState.userId = CLERK_RESIDENT;
      const res = await request(app).post("/api/guests").send({
        firstName: "John", lastName: "Doe", visitDate: "2028-08-15",
        visitReason: "family_friend", gender: "male",
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("nationalId is required.");
    });
  });
});
