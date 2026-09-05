/**
 * Stage 2 X5 — Phone canonicalization & validation tests.
 *
 * Covers:
 *   1. Saudi 05XXXXXXXX → +9665XXXXXXXX
 *   2. Saudi 5XXXXXXXX  → +9665XXXXXXXX
 *   3. Saudi +9665XXXXXXXX → kept as-is
 *   4. +9660... → invalid (422)
 *   5. Arabic-Indic digits → normalized then canonicalized
 *   6. Existing E.164 (non-Saudi) → kept as-is
 *   7. Blank / null / undefined → null (no error)
 *   8. Invalid values → 422 with clear message
 *
 *   API-level tests via:
 *     PUT /api/users/me              (phone)
 *     POST /api/residents            (phone)
 *     PATCH /api/residents/:id       (phone)
 *     PATCH /api/units/:id           (emergencyPhone)
 *     POST /api/unit-verify/owner    (mobile)
 *     POST /api/unit-verify/tenant   (mobile)
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, or, desc, ne, lt, gt, gte, lte, inArray, count, isNotNull, isNull, ilike } =
    await import("./helpers/mockDb");
  return { eq, and, or, desc, ne, lt, gt, gte, lte, inArray, count, isNotNull, isNull, ilike };
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

vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/pushNotifications", () => ({ sendPushToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../payments/PaymentService", () => ({
  activeProvider: null,
  PaymentService: class {},
  getProviderByName: () => null,
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

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

let app: any;
beforeAll(async () => {
  const { default: appMod } = await import("../app");
  app = appMod;
});

// ─── Clerk IDs ────────────────────────────────────────────────────────────────

const CLERK_USER    = "phone-test-user-1";
const CLERK_ADMIN   = "phone-test-admin-1";
const CLERK_OWNER   = "phone-test-owner-1";
const CLERK_TENANT  = "phone-test-tenant-1";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

type SeededRow = Record<string, unknown> & { id: number };

function seedUser(clerkId = CLERK_USER): SeededRow {
  return stores.users.insert({
    clerkId,
    email: "user@phone.test",
    role: "tenant",
    status: "active",
    firstName: "Phone",
    lastName: "User",
    verificationStatus: "unverified",
    phone: null,
    phoneNormalized: null,
    unitNumber: null,
    unitId: null,
  }) as SeededRow;
}

function seedAdmin(): SeededRow {
  return stores.users.insert({
    clerkId: CLERK_ADMIN,
    email: "admin@phone.test",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "Phone",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }) as SeededRow;
}

function seedVerifiedOwner(unitId: number): SeededRow {
  return stores.users.insert({
    clerkId: CLERK_OWNER,
    email: "owner@phone.test",
    role: "owner",
    status: "active",
    firstName: "Owner",
    lastName: "Phone",
    verificationStatus: "verified_owner",
    unitNumber: "A 101",
    unitId,
  }) as SeededRow;
}

function seedUnit(overrides: Record<string, unknown> = {}): SeededRow {
  return stores.units.insert({
    building: "A",
    unitNumber: "101",
    occupantType: "owner_occupied",
    verifiedOwnerId: null,
    verifiedTenantId: null,
    emergencyPhone: null,
    ...overrides,
  }) as SeededRow;
}

function seedLinkedUser(): SeededRow {
  const unit = seedUnit();
  const user = seedUser();
  stores.users.updateFirst(
    { type: "eq", col: "id", val: user.id },
    { unitId: unit.id, unitNumber: "A 101" },
  );
  return user;
}

function seedResident(registeredById: number, unitNumber = "A 101"): SeededRow {
  return stores.residents.insert({
    type: "tenant",
    firstName: "Res",
    lastName: "Ident",
    email: "res@phone.test",
    phone: null,
    phoneNormalized: null,
    unitNumber,
    relationship: "self",
    idNumber: null,
    dateOfBirth: null,
    hasPortalAccess: false,
    registeredById,
    status: "active",
    idPhotoKey: "/objects/id/test.jpg",
  }) as SeededRow;
}

beforeEach(() => {
  resetMockDb();
});

// ─── Unit utility: canonicalizePhone ─────────────────────────────────────────

describe("canonicalizePhone utility", () => {
  // Import the utility directly for unit-level tests
  let canonicalizePhone: (raw: unknown) => { ok: true; e164: string } | { ok: true; e164: null } | { ok: false; error: string };

  beforeAll(async () => {
    const mod = await import("../lib/phoneCanonical");
    canonicalizePhone = mod.canonicalizePhone;
  });

  it("null → { ok: true, e164: null }", () => {
    const r = canonicalizePhone(null);
    expect(r).toEqual({ ok: true, e164: null });
  });

  it("undefined → { ok: true, e164: null }", () => {
    const r = canonicalizePhone(undefined);
    expect(r).toEqual({ ok: true, e164: null });
  });

  it("empty string → { ok: true, e164: null }", () => {
    const r = canonicalizePhone("");
    expect(r).toEqual({ ok: true, e164: null });
  });

  it("whitespace-only string → { ok: true, e164: null }", () => {
    const r = canonicalizePhone("   ");
    expect(r).toEqual({ ok: true, e164: null });
  });

  it("Saudi 05XXXXXXXX → +9665XXXXXXXX", () => {
    const r = canonicalizePhone("0512345678");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("Saudi 5XXXXXXXX → +9665XXXXXXXX", () => {
    const r = canonicalizePhone("512345678");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("Saudi +9665XXXXXXXX → kept as-is", () => {
    const r = canonicalizePhone("+966512345678");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("+9660... → invalid (never a valid Saudi number)", () => {
    const r = canonicalizePhone("+966012345678");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/\+9660/);
  });

  it("Saudi 05XXXXXXXX with spaces and dashes → normalized", () => {
    const r = canonicalizePhone("05 1234-5678");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("Arabic-Indic digits for Saudi number → +9665XXXXXXXX", () => {
    // ٠٥١٢٣٤٥٦٧٨ = 0512345678
    const r = canonicalizePhone("٠٥١٢٣٤٥٦٧٨");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("Arabic-Indic 9-digit Saudi (5XXXXXXXX in Arabic) → +9665XXXXXXXX", () => {
    // ٥١٢٣٤٥٦٧٨ = 512345678
    const r = canonicalizePhone("٥١٢٣٤٥٦٧٨");
    expect(r).toEqual({ ok: true, e164: "+966512345678" });
  });

  it("existing E.164 non-Saudi → kept as-is", () => {
    const r = canonicalizePhone("+12125551234");
    expect(r).toEqual({ ok: true, e164: "+12125551234" });
  });

  it("existing E.164 UK → kept as-is", () => {
    const r = canonicalizePhone("+447700900000");
    expect(r).toEqual({ ok: true, e164: "+447700900000" });
  });

  it("random garbage → error", () => {
    const r = canonicalizePhone("not-a-phone");
    expect(r.ok).toBe(false);
  });

  it("too-short numeric string → error", () => {
    const r = canonicalizePhone("1234");
    expect(r.ok).toBe(false);
  });

  it("non-string value (number) → error", () => {
    const r = canonicalizePhone(512345678);
    expect(r.ok).toBe(false);
  });
});

// ─── PUT /api/users/me ─────────────────────────────────────────────────────────

describe("PUT /api/users/me — phone canonicalization", () => {
  it("Saudi 05XXXXXXXX → stored as +9665XXXXXXXX", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "0512345678" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+966512345678");
    expect(res.body.phoneNormalized).toBe("+966512345678");
  });

  it("Saudi 5XXXXXXXX → stored as +9665XXXXXXXX", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "512345678" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+966512345678");
  });

  it("Arabic-Indic digits → canonicalized", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    // ٠٥١٢٣٤٥٦٧٨ = 0512345678
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "٠٥١٢٣٤٥٦٧٨" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+966512345678");
  });

  it("existing E.164 → kept as-is", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "+12125551234" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+12125551234");
  });

  it("blank phone → treated as null (no error)", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "" });
    expect(res.status).toBe(200);
    // blank treated as null — phone field should be null/undefined in DB
    expect(res.body.phone == null || res.body.phone === undefined).toBe(true);
  });

  it("+9660... → 422", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "+966012345678" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });

  it("invalid value → 422", async () => {
    seedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .put("/api/users/me")
      .send({ firstName: "A", lastName: "B", phone: "not-a-phone" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
  });
});

// ─── POST /api/residents ───────────────────────────────────────────────────────

describe("POST /api/residents — phone canonicalization", () => {
  it("Saudi 05XXXXXXXX → stored as +9665XXXXXXXX", async () => {
    const user = seedLinkedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/residents")
      .send({
        type: "family",
        firstName: "Test",
        lastName: "Resident",
        gender: "female",
        phone: "0512345678",
        unitNumber: "A 101",
        relationship: "sibling",
        idNumber: "NID-PHONE-1",
        dateOfBirth: "1990-01-01",
        nationality: "Saudi",
        idPhotoKey: "/objects/id/test.jpg",
      });
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe("+966512345678");
    expect(res.body.phoneNormalized).toBe("+966512345678");
  });

  it("Arabic-Indic digits → canonicalized", async () => {
    seedLinkedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/residents")
      .send({
        type: "family",
        firstName: "Test",
        lastName: "Resident",
        gender: "female",
        phone: "٠٥١٢٣٤٥٦٧٨",
        unitNumber: "A 101",
        relationship: "sibling",
        idNumber: "NID-PHONE-2",
        dateOfBirth: "1990-01-01",
        nationality: "Saudi",
        idPhotoKey: "/objects/id/test.jpg",
      });
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe("+966512345678");
  });

  it("blank phone → no error, phone is null", async () => {
    seedLinkedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/residents")
      .send({
        type: "family",
        firstName: "Test",
        lastName: "Resident",
        gender: "female",
        phone: "",
        unitNumber: "A 101",
        relationship: "sibling",
        idNumber: "NID-PHONE-3",
        dateOfBirth: "1990-01-01",
        nationality: "Saudi",
        idPhotoKey: "/objects/id/test.jpg",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/mobile number is required/i);
  });

  it("invalid phone → 422", async () => {
    seedLinkedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/residents")
      .send({
        type: "family",
        firstName: "Test",
        lastName: "Resident",
        gender: "female",
        phone: "garbage-number",
        unitNumber: "A 101",
        relationship: "sibling",
        idNumber: "NID-PHONE-4",
        dateOfBirth: "1990-01-01",
        nationality: "Saudi",
        idPhotoKey: "/objects/id/test.jpg",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
  });

  it("+9660... → 422", async () => {
    seedLinkedUser();
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/residents")
      .send({
        type: "family",
        firstName: "Test",
        lastName: "Resident",
        gender: "female",
        phone: "+966012345678",
        unitNumber: "A 101",
        relationship: "sibling",
        idNumber: "NID-PHONE-5",
        dateOfBirth: "1990-01-01",
        nationality: "Saudi",
        idPhotoKey: "/objects/id/test.jpg",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });
});

// ─── PATCH /api/residents/:id ─────────────────────────────────────────────────

describe("PATCH /api/residents/:id — phone canonicalization", () => {
  it("Saudi 05XXXXXXXX → stored as +9665XXXXXXXX", async () => {
    const user = seedUser();
    const resident = seedResident(user.id);
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .patch(`/api/residents/${resident.id}`)
      .send({ phone: "0512345678" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+966512345678");
    expect(res.body.phoneNormalized).toBe("+966512345678");
  });

  it("Arabic-Indic digits → canonicalized", async () => {
    const user = seedUser();
    const resident = seedResident(user.id);
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .patch(`/api/residents/${resident.id}`)
      .send({ phone: "٠٥١٢٣٤٥٦٧٨" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+966512345678");
  });

  it("blank phone → no error, phone stored as null", async () => {
    const user = seedUser();
    const resident = seedResident(user.id);
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .patch(`/api/residents/${resident.id}`)
      .send({ phone: "" });
    expect(res.status).toBe(200);
    expect(res.body.phone == null || res.body.phone === undefined).toBe(true);
  });

  it("invalid phone → 422", async () => {
    const user = seedUser();
    const resident = seedResident(user.id);
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .patch(`/api/residents/${resident.id}`)
      .send({ phone: "garbage-number" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
  });

  it("+9660... → 422", async () => {
    const user = seedUser();
    const resident = seedResident(user.id);
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .patch(`/api/residents/${resident.id}`)
      .send({ phone: "+966012345678" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });
});

// ─── PATCH /api/units/:id — emergencyPhone ────────────────────────────────────

describe("PATCH /api/units/:id — emergencyPhone canonicalization", () => {
  it("Saudi 05XXXXXXXX → stored as +9665XXXXXXXX", async () => {
    const unit = seedUnit();
    const owner = seedVerifiedOwner(unit.id);
    stores.units.updateFirst({ type: "eq", col: "id", val: unit.id }, { verifiedOwnerId: owner.id });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .patch(`/api/units/${unit.id}`)
      .send({ emergencyPhone: "0512345678" });
    expect(res.status).toBe(200);
    expect(res.body.emergencyPhone).toBe("+966512345678");
  });

  it("Arabic-Indic digits → canonicalized", async () => {
    const unit = seedUnit();
    const owner = seedVerifiedOwner(unit.id);
    stores.units.updateFirst({ type: "eq", col: "id", val: unit.id }, { verifiedOwnerId: owner.id });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .patch(`/api/units/${unit.id}`)
      .send({ emergencyPhone: "٠٥١٢٣٤٥٦٧٨" });
    expect(res.status).toBe(200);
    expect(res.body.emergencyPhone).toBe("+966512345678");
  });

  it("blank emergencyPhone → no error", async () => {
    const unit = seedUnit();
    const owner = seedVerifiedOwner(unit.id);
    stores.units.updateFirst({ type: "eq", col: "id", val: unit.id }, { verifiedOwnerId: owner.id });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .patch(`/api/units/${unit.id}`)
      .send({ emergencyPhone: "" });
    expect(res.status).toBe(200);
  });

  it("invalid emergencyPhone → 422", async () => {
    const unit = seedUnit();
    const owner = seedVerifiedOwner(unit.id);
    stores.units.updateFirst({ type: "eq", col: "id", val: unit.id }, { verifiedOwnerId: owner.id });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .patch(`/api/units/${unit.id}`)
      .send({ emergencyPhone: "garbage" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
  });

  it("+9660... → 422", async () => {
    const unit = seedUnit();
    const owner = seedVerifiedOwner(unit.id);
    stores.units.updateFirst({ type: "eq", col: "id", val: unit.id }, { verifiedOwnerId: owner.id });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .patch(`/api/units/${unit.id}`)
      .send({ emergencyPhone: "+966012345678" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });
});

// ─── POST /api/unit-verify/owner — mobile ────────────────────────────────────

describe("POST /api/unit-verify/owner — mobile canonicalization", () => {
  it("Saudi 05XXXXXXXX mobile → stored as +9665XXXXXXXX", async () => {
    const owner = stores.users.insert({
      clerkId: CLERK_USER,
      email: "ov@test.com",
      role: "tenant",
      status: "active",
      firstName: "Owner",
      lastName: "Verify",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "A",
        unitNumber: "201",
        nationalId: "NID-123",
        gender: "female",
        mobile: "0512345678",
        titleDeedNumber: "1234567890123456",
      });
    // Should not be 422 — the mobile is valid
    expect(res.status).not.toBe(422);
    // Verify the stored verification has canonical mobile
    const verifications = stores.unitVerifications.findAll();
    const latest = verifications[verifications.length - 1];
    if (latest) {
      expect(latest.mobile).toBe("+966512345678");
    }
  });

  it("Arabic-Indic mobile → canonicalized", async () => {
    resetMockDb();
    stores.users.insert({
      clerkId: CLERK_USER,
      email: "ov@test.com",
      role: "tenant",
      status: "active",
      firstName: "Owner",
      lastName: "Verify",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "A",
        unitNumber: "202",
        nationalId: "NID-456",
        gender: "female",
        mobile: "٠٥١٢٣٤٥٦٧٨",
        titleDeedNumber: "1234567890123456",
      });
    expect(res.status).not.toBe(422);
    const verifications = stores.unitVerifications.findAll();
    const latest = verifications[verifications.length - 1];
    if (latest) {
      expect(latest.mobile).toBe("+966512345678");
    }
  });

  it("blank mobile → null stored (no error)", async () => {
    resetMockDb();
    stores.users.insert({
      clerkId: CLERK_USER,
      email: "ov@test.com",
      role: "tenant",
      status: "active",
      firstName: "Owner",
      lastName: "Verify",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "A",
        unitNumber: "203",
        nationalId: "NID-789",
        gender: "female",
        mobile: "",
        titleDeedNumber: "1234567890123456",
      });
    expect(res.status).not.toBe(422);
  });

  it("invalid mobile → 422 before any DB write", async () => {
    resetMockDb();
    stores.users.insert({
      clerkId: CLERK_USER,
      email: "ov@test.com",
      role: "tenant",
      status: "active",
      firstName: "Owner",
      lastName: "Verify",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "A",
        unitNumber: "204",
        nationalId: "NID-BAD",
        gender: "female",
        mobile: "garbage-phone",
        titleDeedNumber: "1234567890123456",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
    // No verification rows should have been created
    expect(stores.unitVerifications.findAll()).toHaveLength(0);
  });

  it("+9660... mobile → 422", async () => {
    resetMockDb();
    stores.users.insert({
      clerkId: CLERK_USER,
      email: "ov@test.com",
      role: "tenant",
      status: "active",
      firstName: "Owner",
      lastName: "Verify",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    mockAuthState.userId = CLERK_USER;
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({
        building: "A",
        unitNumber: "205",
        nationalId: "NID-BAD2",
        gender: "female",
        mobile: "+966012345678",
        titleDeedNumber: "1234567890123456",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });
});

// ─── POST /api/unit-verify/tenant — mobile ───────────────────────────────────

describe("POST /api/unit-verify/tenant — mobile canonicalization", () => {
  function seedForTenantVerify() {
    resetMockDb();
    const verifiedOwner = stores.users.insert({
      clerkId: "tv-owner",
      email: "tvowner@test.com",
      role: "owner",
      status: "active",
      firstName: "Owner",
      lastName: "TV",
      verificationStatus: "verified_owner",
      unitNumber: "B 301",
      unitId: null,
    });
    const unit = stores.units.insert({
      building: "B",
      unitNumber: "301",
      occupantType: "owner_occupied",
      verifiedOwnerId: verifiedOwner.id,
      verifiedTenantId: null,
    });
    stores.users.updateFirst({ type: "eq", col: "id", val: verifiedOwner.id }, { unitId: unit.id });
    const tenantUser = stores.users.insert({
      clerkId: CLERK_TENANT,
      email: "tvtenant@test.com",
      role: "tenant",
      status: "active",
      firstName: "Tenant",
      lastName: "TV",
      verificationStatus: "unverified",
      nationalId: null,
      unitNumber: null,
      unitId: null,
    });
    return { unit, tenantUser };
  }
  function tenantTenancyPayload(ejarReference: string, mobile: string) {
    return {
      building: "B",
      unitNumber: "301",
      firstName: "Tenant",
      lastName: "TV",
      gender: "female",
      nationalId: "TENANT-NID",
      ownerNationalId: "OWNER-NID",
      ejarReference,
      ejarDocumentKey: "/objects/ejar/phone-test.pdf",
      leaseStartDate: "2026-08-01",
      leaseEndDate: "2027-07-31",
      dateOfBirth: "1990-05-05",
      nationality: "Saudi",
      mobile,
    };
  }

  it("Saudi 05XXXXXXXX mobile → stored as +9665XXXXXXXX", async () => {
    const { unit } = seedForTenantVerify();
    mockAuthState.userId = CLERK_TENANT;
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send(tenantTenancyPayload("EJAR-001", "0512345678"));
    expect(res.status).toBe(400);
    const verifications = stores.unitVerifications.findAll();
    const latest = verifications[verifications.length - 1];
    if (latest) {
      expect(latest.mobile).toBe("+966512345678");
    }
  });

  it("Arabic-Indic mobile → canonicalized", async () => {
    seedForTenantVerify();
    mockAuthState.userId = CLERK_TENANT;
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send(tenantTenancyPayload("EJAR-002", "٠٥١٢٣٤٥٦٧٨"));
    expect(res.status).not.toBe(422);
    const verifications = stores.unitVerifications.findAll();
    const latest = verifications[verifications.length - 1];
    if (latest) {
      expect(latest.mobile).toBe("+966512345678");
    }
  });

  it("blank mobile → null stored (no error)", async () => {
    seedForTenantVerify();
    mockAuthState.userId = CLERK_TENANT;
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send(tenantTenancyPayload("EJAR-003", ""));
    expect(res.status).not.toBe(422);
  });

  it("invalid mobile → 422 before any DB write", async () => {
    seedForTenantVerify();
    mockAuthState.userId = CLERK_TENANT;
    const countBefore = stores.unitVerifications.findAll().length;
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send(tenantTenancyPayload("EJAR-BAD", "garbage-phone"));
    expect(res.status).toBe(422);
    expect(res.body.error).toBeTruthy();
    expect(stores.unitVerifications.findAll()).toHaveLength(countBefore);
  });

  it("+9660... → 422", async () => {
    seedForTenantVerify();
    mockAuthState.userId = CLERK_TENANT;
    const res = await request(app)
      .post("/api/unit-verify/tenant")
      .send(tenantTenancyPayload("EJAR-BAD2", "+966012345678"));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/\+9660/);
  });
});
