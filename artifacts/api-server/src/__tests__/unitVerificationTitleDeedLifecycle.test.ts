/**
 * Title deed key lifecycle tests for the owner_manual verification flow.
 *
 * Covers:
 *   - POST /unit-verify/owner with titleDeedKey → record stored with the key
 *   - GET /unit-verify/pending returns the titleDeedKey on the record
 *   - POST /unit-verify/:id/approve (owner_manual) calls deleteObjectEntity
 *   - POST /unit-verify/:id/approve does NOT write titleDeedKey onto the unit
 *   - POST /unit-verify/:id/reject (owner_manual) calls deleteObjectEntity
 *   - GET /unit-verify/:id/title-deed returns 404 after approve (key cleared)
 *   - GET /unit-verify/:id/title-deed returns 404 after reject (key cleared)
 *   - approve/reject still returns 200 even if deleteObjectEntity throws
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Email spy ────────────────────────────────────────────────────────────────
vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ─── Object storage mock ──────────────────────────────────────────────────────
const mockDeleteObjectEntity = vi.fn().mockResolvedValue(undefined);

class MockObjectStorageService {
  storeTitleDeed = vi.fn().mockResolvedValue("/objects/title-deeds/mock-uuid.pdf");
  getTitleDeedUploadURL = vi.fn().mockResolvedValue(
    "https://storage.googleapis.com/bucket/private/title-deeds/abc123.pdf",
  );
  normalizeObjectEntityPath = vi.fn().mockReturnValue("/objects/title-deeds/abc123.pdf");
  getTitleDeedViewURL = vi.fn().mockResolvedValue("https://storage.googleapis.com/signed?token=x");
  deleteObjectEntity = mockDeleteObjectEntity;
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
  const { eq, and, desc, ne, lt, gt, gte, inArray, ilike, isNull } = await import(
    "./helpers/mockDb"
  );
  return { eq, and, desc, ne, lt, gt, gte, inArray, ilike, isNull };
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
import { mockAuthState, stores, resetMockDb, mockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

const CLERK_RESIDENT = "clerk-td-resident";
const CLERK_ADMIN    = "clerk-td-admin";

const TITLE_DEED_KEY = "/objects/title-deeds/test-deed-uuid.pdf";
const RESIDENT_ID_PHOTO_KEY = "/objects/id/synthetic-id-photo.jpg";
const OWNER_APPROVAL = { approvalBases: ["deed_number_verified_against_mullak"] };

function seedResident() {
  stores.users.insert({
    clerkId: CLERK_RESIDENT,
    email: "td-res@test.com",
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
    email: "td-admin@test.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "A",
    verificationStatus: "unverified",
    unitNumber: null,
    unitId: null,
  }); // id=1
}

/** Seed the target user for approval/rejection flows (the one being verified). */
function seedTargetUser() {
  stores.users.insert({
    clerkId: "clerk-td-target",
    email: "td-target@test.com",
    role: "owner",
    status: "active",
    firstName: "Target",
    lastName: "User",
    verificationStatus: "pending_manual",
    unitNumber: "B1 101",
    unitId: null,
  }); // id depends on insertion order
}

function seedResidentIdPhoto() {
  stores.residents.insert({
    unitId: 1,
    firstName: "Resident",
    lastName: "Identity",
    type: "family",
    status: "active",
    idPhotoKey: RESIDENT_ID_PHOTO_KEY,
  });
}

function seedUnit(overrides: Record<string, unknown> = {}) {
  stores.units.insert({
    building: "B1",
    unitNumber: "101",
    unitType: "apartment",
    sizeSqm: null,
    titleReference: null,
    verifiedOwnerId: null,
    verifiedTenantId: null,
    occupantType: "vacant",
    parkingLots: null,
    ...overrides,
  }); // id=1
}

function seedRegistry(ownerNationalId = "NID-NOMATCH-999") {
  stores.unitRegistry.insert({
    building: "B1",
    unitNumber: "101",
    ownerNationalId,
    ownerName: "Registry Owner",
    unitType: "apartment",
    isMatched: false,
    matchedUserId: null,
  }); // id=1
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Title deed key lifecycle — owner_manual verification", () => {
  beforeEach(() => {
    resetMockDb();
    mockDeleteObjectEntity.mockClear();
  });

  it("retires the title-deed upload endpoint while retaining legacy-key lifecycle operations", async () => {
    seedResident();
    mockAuthState.userId = CLERK_RESIDENT;

    await request(app)
      .post("/api/unit-verify/title-deed-upload")
      .attach("file", Buffer.from("not a deed"), "title-deed.pdf")
      .expect(404);
  });

  // ── 1. a new claim stores the exact Mullak title-deed number ─────────────

  describe("POST /unit-verify/owner — titleDeedNumber persisted on manual-review record", () => {
    it("stores the exact titleDeedNumber on the pending verification record when NID has no registry match", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      // Registry entry with a different NID so no auto-match → manual review path
      seedRegistry("NID-NOMATCH-999");
      seedUnit({ verifiedOwnerId: null });

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-RESIDENT-001",
          mobile: "+966501234567",
          gender: "male",
          titleDeedNumber: "1234567890123456",
        })
        .expect(200);

      expect(res.body.result).toBe("pending_manual_review");
      const verificationId: number = res.body.verificationId;
      expect(verificationId).toBeDefined();

      // Confirm the stored record carries the title-deed number. Object keys
      // are legacy-only and are seeded directly in cleanup/view tests below.
      const [stored] = stores.unitVerifications.findAll(
        { type: "eq", col: "id", val: verificationId },
      );
      expect(stored).toBeDefined();
      expect(stored.titleDeedNumber).toBe("1234567890123456");
    });
  });

  // ── 2. GET /unit-verify/pending returns titleDeedKey ─────────────────────

  describe("GET /unit-verify/pending — titleDeedKey visible to admin", () => {
    it("includes titleDeedKey on the pending record returned to admin", async () => {
      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      // Insert a pending owner_manual verification with a title deed key
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 99,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
      });

      const res = await request(app)
        .get("/api/unit-verify/pending")
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].titleDeedKey).toBe(TITLE_DEED_KEY);
    });

    it("titleDeedKey is null when no deed was uploaded", async () => {
      seedAdmin();
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 99,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: null,
      });

      const res = await request(app)
        .get("/api/unit-verify/pending")
        .expect(200);

      expect(res.body[0].titleDeedKey).toBeNull();
    });
  });

  // ── 3. Approve (owner_manual) — deleteObjectEntity called, key not on unit ─

  describe("POST /unit-verify/:id/approve (owner_manual) — deleteObjectEntity called", () => {
    it("calls deleteObjectEntity with the titleDeedKey on approval", async () => {
      // Admin is caller (id=1), target user is being approved (id=2)
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,  // target user
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
        parkingLots: null,
      }); // id=1

      await request(app)
        .post("/api/unit-verify/1/approve")
        .send(OWNER_APPROVAL)
        .expect(200);

      expect(mockDeleteObjectEntity).toHaveBeenCalledWith(TITLE_DEED_KEY);
    });

    it("does NOT call deleteObjectEntity when there is no titleDeedKey", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: null,
        parkingLots: null,
      }); // id=1

      await request(app)
        .post("/api/unit-verify/1/approve")
        .send(OWNER_APPROVAL)
        .expect(200);

      expect(mockDeleteObjectEntity).not.toHaveBeenCalled();
    });

    it("does NOT write titleDeedKey onto the approved unit record", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
        parkingLots: null,
      }); // id=1

      await request(app)
        .post("/api/unit-verify/1/approve")
        .send(OWNER_APPROVAL)
        .expect(200);

      const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
      expect(unit).toBeDefined();
      // titleDeedKey must never be written to the unit row
      expect((unit as any).titleDeedKey).toBeUndefined();
    });

    it("retains the recorded approval basis after deleting the title deed", async () => {
      seedAdmin();
      seedTargetUser();
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
        parkingLots: null,
      });

      await request(app)
        .post("/api/unit-verify/1/approve")
        .send({
          approvalBases: ["deed_number_verified_against_mullak", "other"],
          otherText: "Ownership documents matched the unit registry.",
        })
        .expect(200);

      expect(mockDeleteObjectEntity).toHaveBeenCalledWith(TITLE_DEED_KEY);
      expect(stores.unitVerifications.findAll()[0]).toMatchObject({
        status: "approved",
        approvalBases: JSON.stringify(["deed_number_verified_against_mullak", "other"]),
        approvalOtherText: "Ownership documents matched the unit registry.",
      });
    });
  });

  // ── 4. Reject (owner_manual) — deleteObjectEntity called ─────────────────

  describe("POST /unit-verify/:id/reject (owner_manual) — deleteObjectEntity called", () => {
    it("calls deleteObjectEntity with the titleDeedKey on rejection", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
      }); // id=1

      await request(app)
        .post("/api/unit-verify/1/reject")
        .send({ note: "Document unclear" })
        .expect(200);

      expect(mockDeleteObjectEntity).toHaveBeenCalledWith(TITLE_DEED_KEY);
    });

    it("does NOT call deleteObjectEntity for a tenant_request rejection (no deed)", async () => {
      // Unit needs a verified owner for tenant flow; owner is user id=1 (admin in this test)
      seedAdmin();           // id=1 — also acting as the verified owner
      seedTargetUser();      // id=2 — the tenant being rejected
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: 1 }); // admin is also the owner

      stores.unitVerifications.insert({
        type: "tenant_request",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-TENANT",
        titleDeedKey: null,
      }); // id=1

      // Admin cannot reject tenant_request — 403 expected
      const res = await request(app)
        .post("/api/unit-verify/1/reject")
        .send({})
        .expect(403);

      expect(res.body.error).toMatch(/unit owner/i);
      expect(mockDeleteObjectEntity).not.toHaveBeenCalled();
    });

    it("does NOT call deleteObjectEntity when there is no titleDeedKey on rejection", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: null,
      }); // id=1

      await request(app)
        .post("/api/unit-verify/1/reject")
        .send({})
        .expect(200);

      expect(mockDeleteObjectEntity).not.toHaveBeenCalled();
    });
  });

  // ── 5. GET /unit-verify/:id/title-deed returns 404 after approval ──────────

  describe("GET /unit-verify/:id/title-deed — 404 after approve", () => {
    it("returns 404 when the verification has been approved (titleDeedKey cleared from record)", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
        parkingLots: null,
      }); // id=1

      // Approve the verification — this should clear titleDeedKey on the record
      await request(app)
        .post("/api/unit-verify/1/approve")
        .send(OWNER_APPROVAL)
        .expect(200);

      // After approval the key must be gone from the DB record
      const [stored] = stores.unitVerifications.findAll({ type: "eq", col: "id", val: 1 });
      expect(stored.titleDeedKey).toBeNull();

      // Consequently, GET title-deed must return 404 (not a signed URL for a deleted file)
      const res = await request(app)
        .get("/api/unit-verify/1/title-deed")
        .expect(404);

      expect(res.body.error).toMatch(/no title deed/i);
    });
  });

  // ── 6. GET /unit-verify/:id/title-deed returns 404 after rejection ─────────

  describe("GET /unit-verify/:id/title-deed — 404 after reject", () => {
    it("returns 404 when the verification has been rejected (titleDeedKey cleared from record)", async () => {
      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
      }); // id=1

      // Reject the verification — this should clear titleDeedKey on the record
      await request(app)
        .post("/api/unit-verify/1/reject")
        .send({ note: "Unclear document" })
        .expect(200);

      // After rejection the key must be gone from the DB record
      const [stored] = stores.unitVerifications.findAll({ type: "eq", col: "id", val: 1 });
      expect(stored.titleDeedKey).toBeNull();

      // Consequently, GET title-deed must return 404
      const res = await request(app)
        .get("/api/unit-verify/1/title-deed")
        .expect(404);

      expect(res.body.error).toMatch(/no title deed/i);
    });
  });

  // ── 7. Duplicate pending submission is blocked with 409 ──────────────────

  describe("POST /unit-verify/owner — duplicate pending owner_manual blocked", () => {
    it("returns 409 when a pending owner_manual record already exists for the same user + unit", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedRegistry("NID-NOMATCH-999"); // no registry match → manual path
      seedUnit({ verifiedOwnerId: null });

      // First submission — should succeed
      const first = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-RESIDENT-001",
          mobile: "+966501234567",
          gender: "male",
          titleDeedNumber: "1234567890123456",
        })
        .expect(200);

      expect(first.body.result).toBe("pending_manual_review");
      const firstVerificationId: number = first.body.verificationId;

      // Second submission — same user, same unit, still pending → 409
      const second = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-RESIDENT-001",
          mobile: "+966501234567",
          gender: "male",
          titleDeedNumber: "1234567890123456",
        })
        .expect(409);

      expect(second.body.error).toMatch(/active unit verification request/i);
      expect(second.body.errorAr).toBe("لديك بالفعل طلب تحقق نشط للوحدة. يُرجى انتظار اكتماله قبل تقديم طلب آخر.");
      // The conflict must not reveal the unit or verification ID of the
      // claimant's existing request.
      expect(second.body).not.toHaveProperty("verificationId");

      // Confirm no second record was created
      const all = stores.unitVerifications.findAll({ type: "eq", col: "userId", val: 1 });
      expect(all).toHaveLength(1);
    });

    it("allows a fresh submission after the existing pending record has been resolved (approved/rejected)", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedRegistry("NID-NOMATCH-999");
      seedUnit({ verifiedOwnerId: null });

      // Seed a resolved (rejected) record so the guard does not trigger
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 1,   // the seeded resident
        unitId: 1,
        status: "rejected",
        nationalId: "NID-RESIDENT-001",
        titleDeedKey: null,
      });

      // New submission while existing record is rejected → should create a fresh pending record
      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({
          building: "B1",
          unitNumber: "101",
          nationalId: "NID-RESIDENT-001",
          mobile: "+966501234567",
        gender: "male",
          titleDeedNumber: "1234567890123456",
        })
        .expect(200);

      expect(res.body.result).toBe("pending_manual_review");
      // Two records total: the old rejected one + the new pending one
      const all = stores.unitVerifications.findAll({ type: "eq", col: "userId", val: 1 });
      expect(all).toHaveLength(2);
    });

    it("concurrent submissions from one user to different units: exactly one succeeds and the other returns a bilingual 409", async () => {
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;

      const bodyA = { building: "B1", unitNumber: "101", nationalId: "NID-RESIDENT-001", mobile: "+966501234567", gender: "male", titleDeedNumber: "1234567890123456" };
      const bodyB = { building: "B1", unitNumber: "102", nationalId: "NID-RESIDENT-001", mobile: "+966501234567", gender: "male", titleDeedNumber: "1234567890123456" };

      // Fire both requests before awaiting either. The route locks the claimant
      // row, so after the first request writes its pending claim, the second
      // re-checks under that same lock and must return 409.
      const [res1, res2] = await Promise.all([
        request(app).post("/api/unit-verify/owner").send(bodyA),
        request(app).post("/api/unit-verify/owner").send(bodyB),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const okRes  = res1.status === 200 ? res1 : res2;
      const errRes = res1.status === 409 ? res1 : res2;

      expect(okRes.body.result).toBe("pending_manual_review");
      expect(errRes.body.error).toBe(
        "You already have an active unit verification request. Please wait for it to be completed before submitting another request.",
      );
      expect(errRes.body.errorAr).toBe(
        "لديك بالفعل طلب تحقق نشط للوحدة. يُرجى انتظار اكتماله قبل تقديم طلب آخر.",
      );
      expect(errRes.body).not.toHaveProperty("verificationId");

      // Exactly one active claim exists for the claimant, regardless of unit.
      const all = stores.unitVerifications.findAll({ type: "eq", col: "type", val: "owner_manual" });
      expect(all).toHaveLength(1);
    });

    it("returns 409 via DB constraint path when insert throws 23505 (race safety net)", async () => {
      // This test exercises the catch(err.code === '23505') branch in the route —
      // the path taken when two requests slip past the application-level check
      // simultaneously and the DB partial unique index rejects the second insert.
      seedResident();
      mockAuthState.userId = CLERK_RESIDENT;
      seedRegistry("NID-NOMATCH-999");
      seedUnit({ verifiedOwnerId: null });

      // Build the 23505 error object that PostgreSQL would surface
      const uniqueViolation = Object.assign(
        new Error("duplicate key value violates unique constraint"),
        { code: "23505" },
      );

      // Mock db.insert to: (1) actually store the row (so the recovery select succeeds)
      // then (2) throw 23505 — simulating our insert losing a concurrent race.
      vi.spyOn(mockDb as { insert: any }, "insert").mockImplementationOnce((_table: unknown) => ({
        values: (data: unknown) => ({
          onConflictDoNothing: () => Object.assign(Promise.reject(uniqueViolation), {
            returning: () => Promise.reject(uniqueViolation),
          }),
          returning: () => {
            // Persist the row so the recovery select can find it
            stores.unitVerifications.insert(data as Record<string, unknown>);
            return Promise.reject(uniqueViolation);
          },
        }),
      }) as unknown as typeof mockDb.insert);

      const res = await request(app)
        .post("/api/unit-verify/owner")
        .send({ building: "B1", unitNumber: "101", nationalId: "NID-RESIDENT-001", mobile: "+966501234567", gender: "male", titleDeedNumber: "1234567890123456" })
        .expect(409);

      expect(res.body.error).toMatch(/active unit verification request/i);
      expect(res.body.errorAr).toBe("لديك بالفعل طلب تحقق نشط للوحدة. يُرجى انتظار اكتماله قبل تقديم طلب آخر.");
      expect(res.body).not.toHaveProperty("verificationId");
    });
  });

  // ── 8. Fire-and-forget resilience — approve/reject still 200 if delete throws

  describe("deleteObjectEntity fire-and-forget — approve/reject succeeds even if delete throws", () => {
    it("approve still returns 200 when deleteObjectEntity rejects", async () => {
      mockDeleteObjectEntity.mockRejectedValueOnce(new Error("Storage unavailable"));

      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });
      seedResidentIdPhoto();

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
        parkingLots: null,
      }); // id=1

      const res = await request(app)
        .post("/api/unit-verify/1/approve")
        .send(OWNER_APPROVAL)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const [verification] = stores.unitVerifications.findAll({ type: "eq", col: "id", val: 1 });
      expect(verification).toMatchObject({
        status: "approved",
        documentDecision: "approved",
        titleDeedKey: TITLE_DEED_KEY,
      });
      const [retry] = stores.unitVerificationDocumentCleanupRetries.findAll();
      expect(retry).toMatchObject({
        verificationId: 1,
        documentKind: "title_deed",
        objectKey: TITLE_DEED_KEY,
        attempts: 1,
      });
      expect(retry.processedAt).toBeUndefined();

      const retryRun = await request(app)
        .post("/api/unit-verify/document-cleanup-retries/run")
        .send({})
        .expect(200);
      expect(retryRun.body).toMatchObject({ completed: 1, failed: 0 });
      const [afterRetry] = stores.unitVerifications.findAll({ type: "eq", col: "id", val: 1 });
       // B4 lifecycle evidence: all four durable post-retry facts must hold.
       expect(afterRetry.titleDeedKey).toBeNull();
       expect(afterRetry.titleDeedDeletedAt).toBeInstanceOf(Date);
       expect(afterRetry.documentDecision).toBe("approved");
       const [processedRetry] = stores.unitVerificationDocumentCleanupRetries.findAll();
       expect(processedRetry.processedAt).toBeInstanceOf(Date);
      const [resident] = stores.residents.findAll({ type: "eq", col: "idPhotoKey", val: RESIDENT_ID_PHOTO_KEY });
      expect(resident.idPhotoKey).toBe(RESIDENT_ID_PHOTO_KEY);
      expect(mockDeleteObjectEntity).not.toHaveBeenCalledWith(RESIDENT_ID_PHOTO_KEY);
    });

    it("never deletes a resident ID photo when approving or rejecting a verification document", async () => {
      seedAdmin();
      seedTargetUser();
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });
      seedResidentIdPhoto();
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-APPROVE",
        titleDeedKey: TITLE_DEED_KEY,
      });

      await request(app).post("/api/unit-verify/1/approve").send(OWNER_APPROVAL).expect(200);
      const [afterApproval] = stores.residents.findAll({ type: "eq", col: "idPhotoKey", val: RESIDENT_ID_PHOTO_KEY });
      expect(afterApproval.idPhotoKey).toBe(RESIDENT_ID_PHOTO_KEY);
      expect(mockDeleteObjectEntity).not.toHaveBeenCalledWith(RESIDENT_ID_PHOTO_KEY);

      resetMockDb();
      mockDeleteObjectEntity.mockClear();
      seedAdmin();
      seedTargetUser();
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });
      seedResidentIdPhoto();
      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-REJECT",
        titleDeedKey: TITLE_DEED_KEY,
      });

      await request(app).post("/api/unit-verify/1/reject").send({ note: "Synthetic evidence" }).expect(200);
      const [afterRejection] = stores.residents.findAll({ type: "eq", col: "idPhotoKey", val: RESIDENT_ID_PHOTO_KEY });
      expect(afterRejection.idPhotoKey).toBe(RESIDENT_ID_PHOTO_KEY);
      expect(mockDeleteObjectEntity).not.toHaveBeenCalledWith(RESIDENT_ID_PHOTO_KEY);
    });

    it("reject still returns 200 when deleteObjectEntity rejects", async () => {
      mockDeleteObjectEntity.mockRejectedValueOnce(new Error("Storage unavailable"));

      seedAdmin();           // id=1
      seedTargetUser();      // id=2
      mockAuthState.userId = CLERK_ADMIN;
      seedUnit({ verifiedOwnerId: null });

      stores.unitVerifications.insert({
        type: "owner_manual",
        userId: 2,
        unitId: 1,
        status: "pending",
        nationalId: "NID-001",
        titleDeedKey: TITLE_DEED_KEY,
      }); // id=1

      const res = await request(app)
        .post("/api/unit-verify/1/reject")
        .send({ note: "Unclear" })
        .expect(200);

      expect(res.body.ok).toBe(true);
    });
  });
});

describe("Owner-manual approval concurrency — one approved claim per resident", () => {
  beforeEach(() => {
    resetMockDb();
    mockDeleteObjectEntity.mockClear();
  });

  it("approves one concurrent claim and cleanly refuses the other", async () => {
    seedAdmin();      // id=1
    seedTargetUser(); // id=2
    mockAuthState.userId = CLERK_ADMIN;
    seedUnit({ building: "B1", unitNumber: "101" }); // id=1
    seedUnit({ building: "B1", unitNumber: "102" }); // id=2

    stores.unitVerifications.insert({
      type: "owner_manual",
      userId: 2,
      unitId: 1,
      status: "pending",
      nationalId: "NID-001",
      titleDeedKey: null,
    });
    stores.unitVerifications.insert({
      type: "owner_manual",
      userId: 2,
      unitId: 2,
      status: "pending",
      nationalId: "NID-001",
      titleDeedKey: null,
    });

    const results = await Promise.all([
      request(app).post("/api/unit-verify/1/approve").send(OWNER_APPROVAL),
      request(app).post("/api/unit-verify/2/approve").send(OWNER_APPROVAL),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.message)
      .toMatch(/already has an approved unit claim/i);
    const claims = stores.unitVerifications.findAll();
    expect(claims.filter((claim) => claim.status === "approved")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "pending")).toHaveLength(1);
  });
});
