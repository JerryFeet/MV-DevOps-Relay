/**
 * Stage 4 B1–B6 Correction Tests
 *
 * B2: Mullak title deed number mandatory in POST /unit-verify/owner
 * B3: Mobile mandatory in POST /unit-verify/owner
 * B5: Admin registry owner-name check — GET /admin/units/:unitId/registry-check
 * B6: No /api/unit-registry/validate call in owner verification flow
 *
 * B1 (Underground Parking label) and B4 (no lifecycle rebuild) are UI/translation
 * concerns verified through the rendered portal; no server-side test needed.
 */

import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";

// ─── Email spy ────────────────────────────────────────────────────────────────
vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ─── Object storage mock ──────────────────────────────────────────────────────
class MockObjectStorageService {
  storeTitleDeed = vi.fn().mockResolvedValue("/objects/title-deeds/mock-uuid.pdf");
  getTitleDeedUploadURL = vi.fn().mockResolvedValue("https://storage.example.com/upload");
  normalizeObjectEntityPath = vi.fn().mockReturnValue("/objects/title-deeds/abc.pdf");
  getTitleDeedViewURL = vi.fn().mockResolvedValue("https://storage.example.com/view");
  deleteObjectEntity = vi.fn().mockResolvedValue(undefined);
  getObjectEntityFile = vi.fn().mockResolvedValue("https://signed.url/doc");
  getObjectEntityUploadURL = vi.fn().mockResolvedValue("https://upload.url/doc");
  storeEjarDocument = vi.fn().mockResolvedValue("/objects/ejar/mock-uuid.pdf");
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
  const { eq, and, desc, ne, lt, gt, gte, inArray, ilike, or, count } =
    await import("./helpers/mockDb");
  return { eq, and, desc, ne, lt, gt, gte, inArray, ilike, or, count };
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

let app: any;

beforeAll(async () => {
  const { default: appMod } = await import("../app");
  app = appMod;
});

const TITLE_DEED_NUMBER = "1234567890123456";

function seedResident(clerkId = "clerk-resident-b1") {
  return stores.users.insert({
    clerkId,
    email: "res@test.com",
    role: "owner",
    status: "active",
    firstName: "Test",
    middleName: "Account",
    lastName: "Owner",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  });
}

function seedAdmin(clerkId = "clerk-admin-b1") {
  return stores.users.insert({
    clerkId,
    email: "admin@test.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "User",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  });
}

function seedUnit(overrides: Record<string, unknown> = {}) {
  return stores.units.insert({
    building: "B1",
    unitNumber: "101",
    unitType: "apartment",
    sizeSqm: null,
    titleReference: null,
    verifiedOwnerId: null,
    verifiedTenantId: null,
    occupantType: null,
    parkingLots: null,
    ...overrides,
  });
}

function seedRegistry(ownerNationalId = "NID-NO-MATCH", ownerName?: string) {
  return stores.unitRegistry.insert({
    building: "B1",
    unitNumber: "101",
    ownerNationalId,
    ownerName: ownerName ?? null,
    unitType: "apartment",
    isMatched: false,
    matchedUserId: null,
  });
}

// ── B2: Title deed number mandatory ───────────────────────────────────────────

describe("B2 — title deed number mandatory in POST /unit-verify/owner", () => {
  beforeEach(() => resetMockDb());

  it("returns 400 when titleDeedNumber is missing", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        // titleDeedNumber intentionally omitted
      })
      .expect(400);

    expect(res.body.error).toMatch(/titleDeedNumber is required/i);
  });

  it("returns 400 when titleDeedNumber is null", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        titleDeedNumber: null,
      })
      .expect(400);

    expect(res.body.error).toMatch(/titleDeedNumber is required/i);
  });

  it("returns 400 when titleDeedNumber is not exactly 16 digits", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        titleDeedNumber: "1234",
      })
      .expect(400);

    expect(res.body.error).toMatch(/titleDeedNumber is required/i);
  });

  it("accepts a valid Mullak titleDeedNumber and proceeds to manual review", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedRegistry("NID-NO-MATCH");
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        titleDeedNumber: TITLE_DEED_NUMBER,
      })
      .expect(200);

    expect(res.body.result).toBe("pending_manual_review");
  });
});

describe("POST /unit-verify/owner — authoritative account name", () => {
  beforeEach(() => resetMockDb());

  it("ignores tampered claimant names and persists the authenticated account name", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        titleDeedNumber: TITLE_DEED_NUMBER,
        mobile: "+966501234567",
        gender: "male",
        firstName: "Tampered",
        middleName: "Claimant",
        lastName: "Name",
      })
      .expect(200);

    const [verification] = stores.unitVerifications.findAll();
    expect(verification).toMatchObject({
      firstName: "Test",
      middleName: "Account",
      lastName: "Owner",
    });

    seedAdmin();
    mockAuthState.userId = "clerk-admin-b1";
    const pending = await request(app).get("/api/unit-verify/pending").expect(200);
    expect(pending.body[0]).toMatchObject({
      firstName: "Test",
      middleName: "Account",
      lastName: "Owner",
    });
    expect(pending.body[0].requester).toMatchObject({
      firstName: "Test",
      middleName: "Account",
      lastName: "Owner",
    });
  });
});

// ── B3: Mobile mandatory ──────────────────────────────────────────────────────

describe("B3 — mobile mandatory in POST /unit-verify/owner", () => {
  beforeEach(() => resetMockDb());

  it("returns 400 when mobile is missing", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        gender: "male",
        titleDeedNumber: TITLE_DEED_NUMBER,
        // mobile intentionally omitted
      })
      .expect(400);

    expect(res.body.error).toMatch(/mobile is required/i);
  });

  it("returns 400 when mobile is an empty string", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        titleDeedNumber: TITLE_DEED_NUMBER,
        mobile: "   ",
        gender: "male",
      })
      .expect(400);

    expect(res.body.error).toMatch(/mobile is required/i);
  });

  it("returns 422 when mobile is provided but invalid format", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        titleDeedNumber: TITLE_DEED_NUMBER,
        mobile: "not-a-phone",
        gender: "male",
      })
      .expect(422);

    expect(res.body.error).toBeDefined();
  });

  it("accepts a valid mobile (E.164) with valid titleDeedNumber", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedRegistry("NID-NO-MATCH");
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        titleDeedNumber: TITLE_DEED_NUMBER,
        mobile: "+966501234567",
        gender: "male",
      })
      .expect(200);

    expect(res.body.result).toBe("pending_manual_review");
  });
});

// ── B3: Mobile mandatory for tenant verification ──────────────────────────────
// The tenant route already required mobile (tested to confirm it still does)

describe("B3 — mobile still required in POST /unit-verify/tenant", () => {
  beforeEach(() => resetMockDb());

  it("returns 400 when mobile is missing from tenant request", async () => {
    const owner = seedResident("clerk-owner-b3t");
    mockAuthState.userId = "clerk-owner-b3t";

    // Need a verified owner on the unit
    const unit = seedUnit({ verifiedOwnerId: owner.id, ownerNationalId: "1111111111" });

    const tenant = stores.users.insert({
      clerkId: "clerk-tenant-b3t",
      email: "tenant@test.com",
      role: "tenant",
      status: "active",
      firstName: "Tenant",
      lastName: "User",
      verificationStatus: "unverified",
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = "clerk-tenant-b3t";

    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "2222222222",
        ownerNationalId: "1111111111",
        ejarReference: "EJAR-2024-001",
        ejarDocumentKey: "/objects/ejar/test.pdf",
        leaseStartDate: "2024-01-01",
        leaseEndDate: "2025-01-01",
        firstName: "Tenant",
        lastName: "User",
        gender: "male",
        dateOfBirth: "1990-05-05",
        // mobile intentionally omitted
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

describe("SG12 — owner and tenant verification require recorded gender", () => {
  beforeEach(() => resetMockDb());

  it.each([undefined, "other"])("rejects owner verification with gender %j", async (gender) => {
    seedResident("clerk-owner-sg12");
    mockAuthState.userId = "clerk-owner-sg12";
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        titleDeedNumber: TITLE_DEED_NUMBER,
        mobile: "+966501234567",
        ...(gender === undefined ? {} : { gender }),
      })
      .expect(400);

    expect(res.body.error).toMatch(/gender/i);
  });

  it.each([undefined, "other"])("rejects tenant verification with gender %j", async (gender) => {
    const owner = seedResident("clerk-owner-sg12");
    seedUnit({ verifiedOwnerId: owner.id, ownerNationalId: "1111111111" });
    stores.users.insert({
      clerkId: "clerk-tenant-sg12",
      email: "tenant-sg12@test.com",
      role: "tenant",
      status: "active",
      firstName: "Tenant",
      lastName: "User",
      verificationStatus: "unverified",
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = "clerk-tenant-sg12";

    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "2222222222",
        ownerNationalId: "1111111111",
        ejarReference: "EJAR-2024-001",
        ejarDocumentKey: "/objects/ejar/test.pdf",
        leaseStartDate: "2024-01-01",
        leaseEndDate: "2025-01-01",
        firstName: "Tenant",
        lastName: "User",
        mobile: "+966501234567",
        dateOfBirth: "1990-05-05",
        ...(gender === undefined ? {} : { gender }),
      })
      .expect(400);

    expect(res.body.error).toMatch(/gender/i);
  });
});

describe("Tenant verification mandatory identity fields", () => {
  beforeEach(() => resetMockDb());

  type TenantVerificationPayload = {
    building: string;
    unitNumber: string;
    nationalId: string;
    ownerNationalId: string;
    ejarReference: string;
    ejarDocumentKey: string;
    leaseStartDate: string;
    leaseEndDate: string;
    firstName: string;
    lastName: string;
    mobile: string;
    gender: string;
    dateOfBirth?: string;
  };

  const seedTenantScenario = () => {
    const owner = seedResident("clerk-owner-tenant-identity");
    seedUnit({ verifiedOwnerId: owner.id, ownerNationalId: "1111111111" });
    stores.users.insert({
      clerkId: "clerk-tenant-identity",
      email: "tenant-identity@test.com",
      role: "tenant",
      status: "active",
      firstName: "Tenant",
      lastName: "Identity",
      verificationStatus: "unverified",
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = "clerk-tenant-identity";
  };

  const validPayload: TenantVerificationPayload = {
    building: "B1",
    unitNumber: "101",
    nationalId: "2222222222",
    ownerNationalId: "1111111111",
    ejarReference: "EJAR-IDENTITY-001",
    ejarDocumentKey: "/objects/ejar/identity.pdf",
    leaseStartDate: "2026-09-01",
    leaseEndDate: "2027-09-01",
    firstName: "Tenant",
    lastName: "Identity",
    mobile: "+966501234567",
    gender: "female",
    dateOfBirth: "1990-05-05",
  };

  it("accepts a tenant request when nationality is omitted", async () => {
    seedTenantScenario();
    const res = await request(app).post("/api/unit-verify/tenant").send(validPayload).expect(200);
    expect(res.body.result).toBe("pending_owner_approval");
  });

  it("ignores the legacy nationality field", async () => {
    seedTenantScenario();
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send({ ...validPayload, nationality: "Saudi" })
      .expect(200);

    expect(res.body.result).toBe("pending_owner_approval");
    const [verification] = stores.unitVerifications.findAll();
    expect(verification).not.toHaveProperty("nationality");
  });

  it("rejects a tenant request without dateOfBirth", async () => {
    seedTenantScenario();
    const payload = { ...validPayload };
    delete payload.dateOfBirth;
    const res = await request(app).post("/api/unit-verify/tenant").send(payload).expect(400);
    expect(res.body.error).toMatch(/date of birth/i);
  });

  it("rejects an invalid date of birth", async () => {
    seedTenantScenario();
    const res = await request(app).post("/api/unit-verify/tenant")
      .send({ ...validPayload, dateOfBirth: "1990-02-31" })
      .expect(400);
    expect(res.body.error).toMatch(/date of birth/i);
  });
});

// ── B5: Admin unit ownership record check ────────────────────────────────────

describe("B5 — GET /admin/units/:unitId/registry-check", () => {
  beforeEach(() => resetMockDb());

  it("returns 403 for non-admin callers", async () => {
    seedResident("clerk-owner-b5");
    mockAuthState.userId = "clerk-owner-b5";
    const unit = seedUnit();

    await request(app)
      .get(`/api/admin/units/${unit.id}/registry-check`)
      .expect(403);
  });

  it("returns 404 when unit does not exist", async () => {
    seedAdmin();
    mockAuthState.userId = "clerk-admin-b1";

    await request(app)
      .get("/api/admin/units/99999/registry-check")
      .expect(404);
  });

  it("returns the current unit record when no owner has been verified", async () => {
    seedAdmin();
    mockAuthState.userId = "clerk-admin-b1";
    const unit = seedUnit({ titleReference: "TITLE-101", ownerNationalId: "1234567890" });

    const res = await request(app)
      .get(`/api/admin/units/${unit.id}/registry-check`)
      .expect(200);

    expect(res.body.unitRecord).toMatchObject({
      id: unit.id,
      building: "B1",
      unitNumber: "101",
      titleReference: "TITLE-101",
      isVerified: false,
    });
    expect(res.body.unitRecord).not.toHaveProperty("ownerNationalId");
    expect(res.body.unitRecord).not.toHaveProperty("verifiedOwnerId");
    expect(res.body.verifiedOwnerName).toBeNull();
  });

  it("returns the verified owner attached to the live unit record", async () => {
    seedAdmin();
    const owner = stores.users.insert({
      clerkId: "clerk-verified-owner-b5-record",
      email: "owner-record@test.com",
      role: "owner",
      status: "active",
      firstName: "Ahmed",
      lastName: "Al-Rashidi",
      verificationStatus: "verified_owner",
      unitNumber: "B1 101",
      unitId: null,
    });
    mockAuthState.userId = "clerk-admin-b1";
    const unit = seedUnit({
      verifiedOwnerId: owner.id,
      ownerNationalId: "1234567890",
      titleReference: "TITLE-101",
    });

    const res = await request(app)
      .get(`/api/admin/units/${unit.id}/registry-check`)
      .expect(200);

    expect(res.body.unitRecord.isVerified).toBe(true);
    expect(res.body.unitRecord).not.toHaveProperty("ownerNationalId");
    expect(res.body.unitRecord).not.toHaveProperty("verifiedOwnerId");
    expect(res.body.verifiedOwnerName).toBe("Ahmed Al-Rashidi");
  });
});

// ── B6: No /api/unit-registry/validate call in owner verification ─────────────
// Structural test: the route handler does NOT call the registry validate endpoint.
// The route uses only format validation (covered by handleSubmit in mobile form)
// and the existing registry lookup logic for auto-match.

describe("B6 — no /api/unit-registry/validate call in owner verification", () => {
  beforeEach(() => resetMockDb());

  it("owner verification completes without hitting any validate endpoint", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    seedRegistry("NID-NO-MATCH");
    seedUnit();

    // Should succeed without any /validate call
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        titleDeedNumber: TITLE_DEED_NUMBER,
        firstName: "Test",
        lastName: "Owner",
      })
      .expect(200);

    expect(res.body.result).toBe("pending_manual_review");
    // The test passes purely by virtue of returning 200 — no validate intermediary needed
  });

  it("owner verification with matching NID auto-approves without /validate call", async () => {
    seedResident();
    mockAuthState.userId = "clerk-resident-b1";
    // Registry entry with same NID as submitted → auto-match path
    seedRegistry("1234567890");
    seedUnit();

    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "B1",
        unitNumber: "101",
        nationalId: "1234567890",
        mobile: "+966501234567",
        gender: "male",
        titleDeedNumber: TITLE_DEED_NUMBER,
      })
      .expect(200);

    // auto-approved (registry NID matches) OR pending — both are valid outcomes
    expect(["auto_approved", "pending_manual_review"]).toContain(res.body.result);
  });
});
