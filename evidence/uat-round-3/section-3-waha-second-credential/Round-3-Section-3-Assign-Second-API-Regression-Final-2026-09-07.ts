/**
 * I5 — Waha Pass composition enforcement tests.
 *
 * Verifies the three new I5 rules for the second credential holder:
 *   DOB-1  secondResidentId with no date_of_birth on file → 422 SECOND_RESIDENT_DOB_ABSENT
 *   DOB-2  secondResidentId with date_of_birth < 18 years ago → 422 SECOND_RESIDENT_UNDER_18
 *   DOB-3  secondResidentId with valid DOB ≥ 18 but hasPortalAccess=false → 422 SECOND_RESIDENT_NO_PORTAL_ACCESS
 *   CTRL   secondResidentId with valid DOB ≥ 18 and hasPortalAccess=true → 201 (accepted)
 *   ELG-1  GET /waha-pass/eligibility — resident with no DOB appears in ineligibleSecondResidents (reason=dob_absent)
 *   ELG-2  GET /waha-pass/eligibility — resident under 18 appears in ineligibleSecondResidents (reason=under_18)
 *   ELG-3  GET /waha-pass/eligibility — resident without portal access appears in ineligibleSecondResidents (reason=no_portal_access)
 *   ELG-4  GET /waha-pass/eligibility — resident meeting all criteria appears in eligibleSecondResidents
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike } =
    await import("./helpers/mockDb");
  return { eq, and, or, desc, ne, lt, gt, gte, inArray, count, isNotNull, isNull, ilike, sql: (s: any) => s };
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

vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityFile() { return Promise.reject(new ObjectNotFoundError("Not found")); }
    storeTitleDeed() { return Promise.resolve("/objects/title-deeds/test.pdf"); }
    getTitleDeedViewURL() { return Promise.resolve("https://example.com/deed.pdf"); }
    deleteObjectEntity() { return Promise.resolve(); }
    getIdPhotoUploadURL() { return Promise.resolve("https://example.com/upload"); }
    normalizeObjectEntityPath() { return "/objects/id/test.jpg"; }
    downloadObject() { return Promise.resolve({ status: 200, headers: new Map(), body: null }); }
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

vi.mock("../lib/email", () => ({ sendAdminAlert: async () => {}, sendEmail: async () => {} }));
vi.mock("../lib/pushNotifications", () => ({ sendPushToUsers: async () => {} }));
vi.mock("../payments/PaymentService", () => ({
  activeProvider: null,
  PaymentService: class {},
  getProviderByName: () => null,
}));
vi.mock("../lib/cancelFutureBookings", () => ({
  cancelFutureBookings: async () => 0,
}));

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

const CLERK_OWNER = "clerk-i5-owner";

// ── Seed helpers ──────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function seedBase() {
  resetMockDb();
  stores.units.insert({ building: "A", unitNumber: "101", occupantType: "owner_occupied", verifiedOwnerId: null, verifiedTenantId: null }); // id=1
  stores.users.insert({
    clerkId: CLERK_OWNER,
    email: "owner@i5.com",
    role: "owner",
    status: "active",
    firstName: "Alice",
    lastName: "I5Owner",
    verificationStatus: "verified_owner",
    unitId: 1,
    unitNumber: "101",
  }); // id=1
  // Self-stub for the applicant
  stores.residents.insert({
    type: "owner",
    firstName: "Alice",
    lastName: "I5Owner",
    email: "owner@i5.com",
    unitNumber: "101",
    unitId: 1,
    status: "active",
    linkedUserId: 1,
    hasPortalAccess: true,
    dateOfBirth: daysAgo(35), // 35 years old
  }); // id=1
}

function seedActiveApplicationWithCredential2(unitId = 1) {
  stores.wahaPassApplications.insert({
    unitId,
    applicantUserId: 1,
    occupancyTrack: "owner",
    status: "active",
    secondResidentId: null,
  }); // id=1
  stores.wahaPassCredentials.insert({
    applicationId: 1,
    credentialIndex: 2,
    holderName: "Unassigned",
    heldByUserId: null,
    status: "active",
  }); // id=1
}

// ── POST /waha-pass/apply I5 tests ────────────────────────────────────────────

describe("POST /waha-pass/apply — I5 second-resident rules", () => {
  beforeEach(() => seedBase());

  it("DOB-1: rejects second resident with no date_of_birth with SECOND_RESIDENT_DOB_ABSENT", async () => {
    // Second resident: no DOB
    stores.residents.insert({
      type: "household_member",
      firstName: "Bob",
      lastName: "NoDob",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: null,
    }); // id=2

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .post("/api/waha-pass/apply")
      .send({ secondResidentId: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_DOB_ABSENT");
  });

  it("DOB-2: rejects second resident under 18 with SECOND_RESIDENT_UNDER_18", async () => {
    // Second resident: 15 years old
    stores.residents.insert({
      type: "household_member",
      firstName: "Charlie",
      lastName: "Young",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: daysAgo(15), // 15 years old
    }); // id=2

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .post("/api/waha-pass/apply")
      .send({ secondResidentId: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_UNDER_18");
  });

  it("DOB-3: rejects second resident without portal access with SECOND_RESIDENT_NO_PORTAL_ACCESS", async () => {
    // Second resident: 25 years old, no portal access
    stores.residents.insert({
      type: "household_member",
      firstName: "Diana",
      lastName: "NoAccess",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: false,
      dateOfBirth: daysAgo(25), // 25 years old, no portal access
    }); // id=2

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .post("/api/waha-pass/apply")
      .send({ secondResidentId: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_NO_PORTAL_ACCESS");
  });

  it("CTRL: accepts second resident with valid DOB ≥18 and portal access", async () => {
    // Second resident: 25 years old, has portal access
    stores.residents.insert({
      type: "household_member",
      firstName: "Eve",
      lastName: "Valid",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: daysAgo(25), // 25 years old, portal access = true
    }); // id=2

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app)
      .post("/api/waha-pass/apply")
      .send({ secondResidentId: 2 });

    expect(res.status).toBe(201);
    expect(res.body.unitId).toBe(1);
    expect(res.body.secondResidentId).toBe(2);
  });
});

// ── POST /waha-pass/:id/assign-second I5 parity tests ─────────────────────────

describe("POST /waha-pass/:id/assign-second — I5 parity with apply", () => {
  beforeEach(() => {
    seedBase();
    seedActiveApplicationWithCredential2();
    mockAuthState.userId = CLERK_OWNER;
  });

  it("rejects a second resident with no DOB", async () => {
    stores.residents.insert({
      type: "family", firstName: "No", lastName: "Dob", unitNumber: "101",
      unitId: 1, status: "active", linkedUserId: null, hasPortalAccess: true, dateOfBirth: null,
    });
    const res = await request(app).post("/api/waha-pass/1/assign-second").send({ secondResidentId: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_DOB_ABSENT");
  });

  it("rejects a second resident under 18", async () => {
    stores.residents.insert({
      type: "family", firstName: "Under", lastName: "Age", unitNumber: "101",
      unitId: 1, status: "active", linkedUserId: null, hasPortalAccess: true, dateOfBirth: daysAgo(15),
    });
    const res = await request(app).post("/api/waha-pass/1/assign-second").send({ secondResidentId: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_UNDER_18");
  });

  it("rejects a second resident without portal access", async () => {
    stores.residents.insert({
      type: "family", firstName: "No", lastName: "Portal", unitNumber: "101",
      unitId: 1, status: "active", linkedUserId: null, hasPortalAccess: false, dateOfBirth: daysAgo(25),
    });
    const res = await request(app).post("/api/waha-pass/1/assign-second").send({ secondResidentId: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("SECOND_RESIDENT_NO_PORTAL_ACCESS");
  });

  it("rejects assignment when the applicant has moved units", async () => {
    // The old active application remains on unit 2 while the caller now belongs
    // to unit 1. The route must not use caller.unitId to attach a resident to it.
    resetMockDb();
    stores.units.insert({ building: "A", unitNumber: "101", occupantType: "owner_occupied", verifiedOwnerId: null, verifiedTenantId: null });
    stores.units.insert({ building: "A", unitNumber: "102", occupantType: "owner_occupied", verifiedOwnerId: null, verifiedTenantId: null });
    stores.users.insert({
      clerkId: CLERK_OWNER, email: "owner@i5.com", role: "owner", status: "active",
      firstName: "Alice", lastName: "I5Owner", verificationStatus: "verified_owner", unitId: 1, unitNumber: "101",
    });
    stores.residents.insert({
      type: "family", firstName: "Current", lastName: "Unit", unitNumber: "101",
      unitId: 1, status: "active", linkedUserId: null, hasPortalAccess: true, dateOfBirth: daysAgo(25),
    });
    seedActiveApplicationWithCredential2(2);
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/waha-pass/1/assign-second").send({ secondResidentId: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("APPLICATION_UNIT_MISMATCH");
  });
});

// ── GET /waha-pass/eligibility I5 tests ───────────────────────────────────────

describe("GET /waha-pass/eligibility — I5 ineligible second resident tagging", () => {
  beforeEach(() => seedBase());

  it("ELG-1: resident with no DOB appears in ineligibleSecondResidents with reason=dob_absent", async () => {
    stores.residents.insert({
      type: "household_member",
      firstName: "Bob",
      lastName: "NoDob",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: null,
    });

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.eligibleSecondResidents).toHaveLength(0);
    expect(res.body.ineligibleSecondResidents).toHaveLength(1);
    expect(res.body.ineligibleSecondResidents[0].reason).toBe("dob_absent");
  });

  it("ELG-2: resident under 18 appears in ineligibleSecondResidents with reason=under_18", async () => {
    stores.residents.insert({
      type: "household_member",
      firstName: "Charlie",
      lastName: "Young",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: daysAgo(15),
    });

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");

    expect(res.status).toBe(200);
    expect(res.body.eligibleSecondResidents).toHaveLength(0);
    expect(res.body.ineligibleSecondResidents[0].reason).toBe("under_18");
  });

  it("ELG-3: resident without portal access appears in ineligibleSecondResidents with reason=no_portal_access", async () => {
    stores.residents.insert({
      type: "household_member",
      firstName: "Diana",
      lastName: "NoAccess",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: false,
      dateOfBirth: daysAgo(25),
    });

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");

    expect(res.status).toBe(200);
    expect(res.body.eligibleSecondResidents).toHaveLength(0);
    expect(res.body.ineligibleSecondResidents[0].reason).toBe("no_portal_access");
  });

  it("ELG-4: resident meeting all I5 criteria appears in eligibleSecondResidents", async () => {
    stores.residents.insert({
      type: "household_member",
      firstName: "Eve",
      lastName: "Valid",
      unitNumber: "101",
      unitId: 1,
      status: "active",
      linkedUserId: null,
      hasPortalAccess: true,
      dateOfBirth: daysAgo(25),
    });

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/waha-pass/eligibility");

    expect(res.status).toBe(200);
    expect(res.body.eligibleSecondResidents).toHaveLength(1);
    expect(res.body.ineligibleSecondResidents).toHaveLength(0);
  });
});
