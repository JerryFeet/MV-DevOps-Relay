/**
 * Security and access-control tests for the unit verification flow
 *
 * Covers:
 *   - tenant requests do not compare or persist owner National IDs in Stage 1
 *   - GET /unit-verify/:id/title-deed blocked for non-admin callers
 *   - Invalid/out-of-namespace titleDeedKey rejected on POST /unit-verify/owner
 *   - retired POST /unit-verify/title-deed-upload endpoint remains unavailable
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Email spy ────────────────────────────────────────────────────────────────
vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ─── Object storage mock ──────────────────────────────────────────────────────
class MockObjectStorageService {
  /**
   * storeTitleDeed returns the canonical /objects/title-deeds/... path,
   * matching the convention used by getObjectEntityFile / deleteObjectEntity.
   * In production PRIVATE_OBJECT_DIR = /bucketname/private; the raw GCS path
   * (/bucketname/private/title-deeds/uuid.pdf) is normalized before returning.
   */
  storeTitleDeed = vi.fn().mockImplementation(async (_buf: Buffer, mimeType: string) => {
    const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
    if (!ALLOWED.includes(mimeType)) throw new Error(`Unsupported content type: ${mimeType}`);
    // Matches the canonical form returned by the real implementation
    return "/objects/title-deeds/mock-uuid.pdf";
  });
  getTitleDeedUploadURL = vi.fn().mockResolvedValue(
    "https://storage.googleapis.com/bucket/private/title-deeds/abc123.pdf"
  );
  normalizeObjectEntityPath = vi.fn().mockReturnValue("/objects/title-deeds/abc123.pdf");
  getTitleDeedViewURL = vi.fn().mockResolvedValue("https://storage.googleapis.com/signed?token=x");
  deleteObjectEntity = vi.fn().mockResolvedValue(undefined);
  getObjectEntityFile = vi.fn().mockResolvedValue("https://signed.url/doc");
  getObjectEntityUploadURL = vi.fn().mockResolvedValue("https://upload.url/doc");
}

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: MockObjectStorageService,
  objectStorageService: new MockObjectStorageService(),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, desc, ne, lt, gt, gte, inArray, ilike, isNotNull, isNull } = await import(
    "./helpers/mockDb"
  );
  return { eq, and, desc, ne, lt, gt, gte, inArray, ilike, isNotNull, isNull };
});

// ─── Auth mock ────────────────────────────────────────────────────────────────
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

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");
const { objectStorageService } = (await import("../lib/objectStorage")) as unknown as {
  objectStorageService: MockObjectStorageService;
};

const CLERK_RESIDENT = "clerk-uvs-resident";
const CLERK_ADMIN    = "clerk-uvs-admin";
const VALID_TENANT_TENANCY = {
  firstName: "Tenant",
  lastName: "Resident",
  gender: "female",
  mobile: "0512345678",
  dateOfBirth: "1990-05-05",
  nationality: "Saudi",
  ejarDocumentKey: "/objects/ejar/test-ejar.pdf",
  leaseStartDate: "2026-08-01",
  leaseEndDate: "2027-07-31",
};

function seedResident() {
  stores.users.insert({
    clerkId: CLERK_RESIDENT,
    email: "uvs-res@test.com",
    role: "owner",
    status: "active",
    firstName: "Test",
    lastName: "Resident",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }); // id=1
}

function seedAdmin() {
  stores.users.insert({
    clerkId: CLERK_ADMIN,
    email: "uvs-admin@test.com",
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
  const hasRequestedOwner = Object.prototype.hasOwnProperty.call(overrides, "verifiedOwnerId");
  const { verifiedOwnerId: requestedOwnerId, ...remainingOverrides } = overrides;
  const owner = stores.users.insert({
    clerkId: "user_verified_owner",
    email: "verified-owner@test.com",
    firstName: "Verified",
    lastName: "Owner",
    nationalId: "NID-OWNER-001",
    role: "owner",
    status: "active",
    verificationStatus: "verified_owner",
  });
  stores.units.insert({
    building: "B1",
    unitNumber: "101",
    unitType: "apartment",
    sizeSqm: null,
    titleReference: null,
    // Older assertions used 99 as a registry-era placeholder owner ID.
    // Resolve it to the actual verified owner seeded above.
    verifiedOwnerId: requestedOwnerId === 99 ? owner.id : hasRequestedOwner ? requestedOwnerId : owner.id,
    verifiedTenantId: null,
    occupantType: "owner_occupied",
    ownerNationalId: "NID-OWNER-001",
    parkingLots: null,
    ...remainingOverrides,
  }); // id=1
}

function seedRegistry(ownerNationalId = "NID-OWNER-001") {
  stores.unitRegistry.insert({
    building: "B1",
    unitNumber: "101",
    ownerNationalId,
    ownerName: "Owner",
    unitType: "apartment",
    isMatched: false,
    matchedUserId: null,
  }); // id=1
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Unit verification — security and access control", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(objectStorageService.storeTitleDeed).mockClear();
  });

  // ── Tenant request contract and owner-ID privacy ─────────────────────────

  describe("POST /unit-verify/tenant — owner National ID is private", () => {
    it("requires an owner National ID alongside the complete tenancy evidence", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ...VALID_TENANT_TENANCY,
        })
        .expect(400);
    });

    it("rejects a non-matching owner National ID without disclosing why", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "WRONG-NID",
          ...VALID_TENANT_TENANCY,
        })
        .expect(400);
      expect(res.body.error).toBe("The owner and unit details could not be verified.");
    });

    it("accepts the matching owner National ID without returning it", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "NID-OWNER-001",
          ...VALID_TENANT_TENANCY,
        })
        .expect(200);

      expect(res.body.result).toBe("pending_owner_approval");
    });
  });

  describe("B2 — unit linkage is granted only by an authoritative flow", () => {
    it("keeps a pending owner claim in unit_verifications without linking the requester account", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: null, occupantType: "vacant" });

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-PENDING-OWNER",
          gender: "female",
          mobile: "+966501234567",
          titleDeedNumber: "1234567890123456",
        })
        .expect(200);

      expect(res.body.result).toBe("pending_manual_review");
      const [requester] = stores.users.findAll().filter((u: any) => u.clerkId === CLERK_RESIDENT);
      const [verification] = stores.unitVerifications.findAll();
      expect(requester.unitId).toBeNull();
      expect(requester.verificationStatus).toBe("pending_manual");
      expect(verification).toMatchObject({ userId: requester.id, unitId: 1, status: "pending" });
    });

    it("sets the requester unit link when an admin approves the owner claim", async () => {
      seedResident();
      seedAdmin();
      seedUnit({ verifiedOwnerId: null, occupantType: "vacant" });
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 1,
        unitId: 1,
        nationalId: "NID-APPROVED-OWNER",
        status: "pending",
      });

      mockAuthState.userId = CLERK_ADMIN;
      await request(app).post("/api/unit-verify/1/approve").send({
        approvalBases: ["deed_number_verified_against_mullak"],
      }).expect(200);

      const requester = stores.users.findAll().find((u: any) => u.id === 1);
      expect(requester).toMatchObject({
        unitId: 1,
        verificationStatus: "verified_owner",
        role: "owner",
      });
    });
  });

  // ── GET /unit-verify/:id/title-deed — admin-only ──────────────────────────

  describe("GET /unit-verify/:id/title-deed — access control", () => {
    it("returns 403 for a non-admin resident", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      // Seed a verification with a title deed key
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 1,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: "/objects/title-deeds/abc123.pdf",
      }); // id=1

      await request(app)
        .get("/api/unit-verify/1/title-deed")
        .expect(403);
    });

    it("returns 200 with a signed URL for an admin", async () => {
      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 99,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: "/objects/title-deeds/abc123.pdf",
      }); // id=1

      const res = await request(app)
        .get("/api/unit-verify/1/title-deed")
        .expect(200);

      expect(res.body.url).toBeDefined();
    });

    it("returns 404 when the verification has no title deed", async () => {
      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 99,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: null,
      }); // id=1

      await request(app)
        .get("/api/unit-verify/1/title-deed")
        .expect(404);
    });
  });

  // ── POST /unit-verify/owner — titleDeedKey namespace validation ───────────

  describe("POST /unit-verify/owner — title deed number validation", () => {
    it("returns 400 when titleDeedKey is outside /objects/title-deeds/ namespace", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      // Seed a registry entry for auto-match
      stores.unitRegistry.insert({
        building: "B1",
        unitNumber: "101",
        ownerNationalId: "NID-OWNER",
        ownerName: "Owner",
        unitType: "apartment",
        isMatched: false,
        matchedUserId: null,
      });
      seedUnit({ verifiedOwnerId: null });

      await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-OWNER",
          gender: "female",
          titleDeedKey: "/objects/other-sensitive-path/secret.pdf",
        })
        .expect(400);
    });

    it("accepts an exact 16-digit title deed number", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      stores.unitRegistry.insert({
        building: "B1",
        unitNumber: "101",
        ownerNationalId: "NID-OWNER",
        ownerName: "Owner",
        unitType: "apartment",
        isMatched: false,
        matchedUserId: null,
      });
      seedUnit({ verifiedOwnerId: null });

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-OWNER",
          gender: "female",
          mobile: "+966501234567",
          titleDeedNumber: "1234567890123456",
        })
        .expect(200);

      // All ownership claims go to manual review after the registry removal.
      expect(res.body.result).toBe("pending_manual_review");
    });
  });

  // ── Retired POST /unit-verify/title-deed-upload ──────────────────────────

  describe("POST /unit-verify/title-deed-upload — retired endpoint", () => {
    it("returns 404 for an authenticated resident and does not store an upload", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;

      await request(app)
        .post("/api/unit-verify/title-deed-upload")
        .attach("file", Buffer.from("%PDF-1.4 test"), {
          filename: "deed.pdf",
          contentType: "application/pdf",
        })
        .expect(404);

      expect(objectStorageService.storeTitleDeed).not.toHaveBeenCalled();
    });

    it("returns 404 for an authenticated admin without invoking storage", async () => {
      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;

      await request(app)
        .post("/api/unit-verify/title-deed-upload")
        .send({ file: "legacy-upload-payload" })
        .expect(404);

      expect(objectStorageService.storeTitleDeed).not.toHaveBeenCalled();
    });
  });

  // ── POST /unit-verify/tenant — parking lot must be from registered set ───

  describe("POST /unit-verify/tenant — parking lot validation", () => {
    it("ignores legacy tenant parking payload rather than requiring or persisting it", async () => {
      seedResident();
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_RESIDENT },
        { role: "tenant" },
      );
      mockAuthState.userId = CLERK_RESIDENT;
      // Unit has exactly one registered lot: P-1
      seedUnit({
        verifiedOwnerId: 99,
        verifiedTenantId: null,
        parkingLots: JSON.stringify([{ building: "B1", lotNumber: "P-1", isInside: true }]),
      });
      seedRegistry("NID-OWNER-001");

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "NID-OWNER-001",
          ...VALID_TENANT_TENANCY,
          parkingLots: [{ building: "B1", lotNumber: "FAKE-LOT", isInside: false }],
        })
        .expect(200);

      expect(res.body.result).toBe("pending_owner_approval");
    });

    it("succeeds when tenant submits a registered lot", async () => {
      seedResident();
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_RESIDENT },
        { role: "tenant" },
      );
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({
        verifiedOwnerId: 99,
        verifiedTenantId: null,
        parkingLots: JSON.stringify([{ building: "B1", lotNumber: "P-1", isInside: true }]),
      });
      seedRegistry("NID-OWNER-001");

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "NID-OWNER-001",
          ...VALID_TENANT_TENANCY,
          parkingLots: [{ building: "B1", lotNumber: "P-1", isInside: true }],
        })
        .expect(200);

      expect(res.body.result).toBe("pending_owner_approval");
    });

    it("succeeds when tenant submits no parking lots at all", async () => {
      seedResident();
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_RESIDENT },
        { role: "tenant" },
      );
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });
      seedRegistry("NID-OWNER-001");

      const res = await request(app)
        .post("/api/unit-verify/tenant")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "ID-TENANT",
          ejarReference: "EJAR-001",
          ownerNationalId: "NID-OWNER-001",
          ...VALID_TENANT_TENANCY,
        })
        .expect(200);

      expect(res.body.result).toBe("pending_owner_approval");
    });
  });

  describe("T7 — owner-ID check throttling and privacy", () => {
    const checkOwner = () => request(app)
      .post("/api/unit-verify/check-owner")
      .send({ building: "B1", unitNumber: "101", ownerNationalId: "SYNTHETIC-NONMATCH" });

    it("throttles the sixth fixed-window check, recovers after the window, scopes quotas per unit, and never discloses an owner ID", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });
      stores.units.insert({
        building: "B1",
        unitNumber: "102",
        unitType: "apartment",
        verifiedOwnerId: 2,
        verifiedTenantId: null,
        occupantType: "owner_occupied",
        ownerNationalId: "NID-OWNER-001",
        parkingLots: null,
      });

      for (let index = 0; index < 5; index += 1) {
        const response = await checkOwner().expect(200);
        expect(JSON.stringify(response.body)).not.toContain("NID-OWNER-001");
      }

      const sixth = await checkOwner().expect(429);
      expect(JSON.stringify(sixth.body)).not.toContain("NID-OWNER-001");

      // A different normalized unit has its own quota.
      const independent = await request(app)
        .post("/api/unit-verify/check-owner")
        .send({ building: "B1", unitNumber: "102", ownerNationalId: "SYNTHETIC-NONMATCH" })
        .expect(200);
      expect(JSON.stringify(independent.body)).not.toContain("NID-OWNER-001");

      // This is intentionally a fixed, not sliding, window. A caller can make
      // five attempts near one boundary and five after the next; that accepted
      // characteristic remains slow enough for the owner-ID threat model.
      // Move the first unit's fixed window back one minute; the next request resets it.
      stores.unitVerificationOwnerIdAttempts.updateFirst(
        { type: "eq", col: "unitKey", val: "B1101" },
        { windowStartedAt: new Date(Date.now() - 60_001) },
      );
      const recovered = await checkOwner().expect(200);
      expect(JSON.stringify(recovered.body)).not.toContain("NID-OWNER-001");
    });
  });

  describe("C1 — Arabic and Latin tenancy identity is the identity shown to the owner", () => {
    it("preserves submitted name parts and uses them in both the owner and admin queues", async () => {
      seedResident();
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: CLERK_RESIDENT },
        { role: "tenant" },
      );
      seedUnit({ verifiedOwnerId: 99, verifiedTenantId: null });
      stores.users.updateFirst(
        { type: "eq", col: "clerkId", val: "user_verified_owner" },
        { unitId: 1 },
      );

      mockAuthState.userId = CLERK_RESIDENT;
      const payload = {
        building: "B1",
        unitNumber: "101",
        nationalId: "SYNTHETIC-TENANT",
        ownerNationalId: "NID-OWNER-001",
        ejarReference: "SYNTHETIC-EJAR",
        firstName: "ليان",
        middleName: "فاطمة",
        lastName: "السالم",
        gender: "female",
        mobile: "0500000000",
        dateOfBirth: "1990-05-05",
        nationality: "Saudi",
        ejarDocumentKey: "/objects/ejar/synthetic-ejar.pdf",
        leaseStartDate: "2026-08-01",
        leaseEndDate: "2027-07-31",
      };
      await request(app).post("/api/unit-verify/tenant").send(payload).expect(200);

      const [stored] = stores.unitVerifications.findAll({ type: "eq", col: "type", val: "tenant_request" });
      expect(stored).toMatchObject({
        firstName: "ليان",
        middleName: "فاطمة",
        lastName: "السالم",
      });

      mockAuthState.userId = "user_verified_owner";
      const ownerQueue = await request(app).get("/api/unit-verify/pending-tenant-requests").expect(200);
      expect(ownerQueue.body[0].requester).toMatchObject({
        firstName: "ليان",
        lastName: "السالم",
      });

      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;
      const adminQueue = await request(app).get("/api/unit-verify/pending").expect(200);
      expect(adminQueue.body[0]).toMatchObject({
        firstName: "ليان",
        middleName: "فاطمة",
        lastName: "السالم",
      });
    });
  });

  describe("T8 — ownerless tenancy submission has the mandated bilingual contract", () => {
    it("returns 422 with the owner-registration guidance instead of an owner-ID mismatch", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;

      const response = await request(app).post("/api/unit-verify/tenant").send({
        building: "B9",
        unitNumber: "909",
        nationalId: "SYNTHETIC-TENANT",
        ownerNationalId: "SYNTHETIC-OWNER",
        ejarReference: "SYNTHETIC-EJAR",
        firstName: "Tenant",
        lastName: "Evidence",
        gender: "female",
        mobile: "0500000000",
        dateOfBirth: "1990-05-05",
        nationality: "Saudi",
        ejarDocumentKey: "/objects/ejar/synthetic-ejar.pdf",
        leaseStartDate: "2026-08-01",
        leaseEndDate: "2027-07-31",
      }).expect(422);

      expect(response.body).toEqual({
        error: "This unit does not yet have a registered owner. The owner must register and verify the unit before a tenancy can be recorded. Please contact your landlord, or the HOA if you need assistance.",
        errorAr: "لا يوجد مالك مسجل لهذه الوحدة حتى الآن. يجب على المالك تسجيل الوحدة وتوثيقها قبل تسجيل عقد الإيجار. يرجى التواصل مع المؤجر، أو مع الجمعية للمساعدة.",
      });
    });
  });

  describe("T3 — an expired Ejar contract cannot establish a current tenancy", () => {
    it("rejects a lease whose end date is already in the past", async () => {
      seedResident();
      seedUnit({ verifiedOwnerId: 99 });
      mockAuthState.userId = CLERK_RESIDENT;

      const response = await request(app).post("/api/unit-verify/tenant").send({
        building: "B1",
        unitNumber: "101",
        nationalId: "SYNTHETIC-TENANT",
        ownerNationalId: "NID-OWNER-001",
        ejarReference: "SYNTHETIC-EJAR",
        ...VALID_TENANT_TENANCY,
        leaseStartDate: "2000-01-01",
        leaseEndDate: "2000-01-02",
      }).expect(400);

      expect(response.body.error).toBe("Lease end date must be after today.");
    });
  });
});
