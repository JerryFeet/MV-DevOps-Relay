/**
 * End-to-end integration tests for the Change of Ownership flow.
 *
 * Covers:
 *  - Path A happy path: verified owner creates event → admin approves →
 *    outgoing owner deleted, unit cleared
 *  - Stage 6C Path B: claimant files claim → admin executes the shared owner
 *    release → the claimant subsequently uses ordinary B7 manual verification
 *  - Stage 6C O5: no claimant slot, pre-approved status, or admin finalize path
 *  - Auth guards: non-admin cannot reach admin-only endpoints
 *
 * All database access is through the in-memory mockDb; no real PostgreSQL
 * connection is needed.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return {
    db: mockDb,
    ...mockTables,
  };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, desc, ilike, inArray, isNotNull, isNull, ne, gt, gte, or, sql } = await import("./helpers/mockDb");
  return { eq, and, desc, ilike, inArray, isNotNull, isNull, ne, gt, gte, or, sql };
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
  default: () => (req: any, _res: any, next: any) => {
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  },
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

vi.mock("../lib/email", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getOwnershipChangeProofUploadURL = vi.fn().mockResolvedValue("https://example.com/upload");
    normalizeObjectEntityPath = vi.fn().mockReturnValue("objects/path/doc.pdf");
  },
}));

vi.mock("../lib/ownershipChangeScheduler", () => ({
  OWNERSHIP_CHANGE_OVERDUE_DAYS: 14,
  overdueCutoff: vi.fn(),
  runOwnershipChangeExpiry: vi.fn().mockResolvedValue(undefined),
  startOwnershipChangeScheduler: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_CLERK    = "clerk-coo-admin";
const OWNER_CLERK    = "clerk-coo-owner";
const CLAIMANT_CLERK = "clerk-coo-claimant";
const OTHER_CLERK    = "clerk-coo-other";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedBase() {
  // Admin
  stores.users.insert({
    clerkId: ADMIN_CLERK,
    email: "admin@hoa.com",
    role: "admin",
    status: "active",
    firstName: "Admin",
    lastName: "User",
    verificationStatus: "unverified",
  }); // id=1

  // Verified owner (Path A initiator / outgoing owner for Path B)
  stores.users.insert({
    clerkId: OWNER_CLERK,
    email: "owner@hoa.com",
    role: "owner",
    status: "active",
    firstName: "Alice",
    lastName: "Owner",
    verificationStatus: "verified_owner",
    unitId: 1,
    unitNumber: "A 101",
    nationalId: "NID-OWNER",
  }); // id=2

  // Claimant (new owner in Path B)
  stores.users.insert({
    clerkId: CLAIMANT_CLERK,
    email: "claimant@hoa.com",
    role: "owner",
    status: "active",
    firstName: "Jane",
    lastName: "Doe",
    verificationStatus: "unverified",
    nationalId: null,
  }); // id=3

  // Unrelated resident for auth guard tests
  stores.users.insert({
    clerkId: OTHER_CLERK,
    email: "other@hoa.com",
    role: "owner",
    status: "active",
    firstName: "Other",
    lastName: "User",
    verificationStatus: "unverified",
  }); // id=4

  // Unit owned by Alice
  stores.units.insert({
    building: "A",
    unitNumber: "101",
    verifiedOwnerId: 2,
    occupantType: "owner_occupied",
    preApprovedClaimId: null,
  }); // id=1
}

// ─── Path A: verified owner initiates transfer ────────────────────────────────

describe("Path A — owner initiates transfer", () => {
  beforeAll(() => {
    resetMockDb();
    seedBase();
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("POST /api/ownership-changes — unverified user is rejected (403)", async () => {
    mockAuthState.userId = OTHER_CLERK;
    const res = await request(app).post("/api/ownership-changes").send({ notes: "test" });
    expect(res.status).toBe(403);
  });

  it("X8: admin cannot use the owner-only Path A initiation endpoint", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).post("/api/ownership-changes").send({ notes: "staff attempt" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Staff accounts/);
  });

  it("POST /api/ownership-changes — verified owner creates pending Path A event (201)", async () => {
    mockAuthState.userId = OWNER_CLERK;
    const res = await request(app)
      .post("/api/ownership-changes")
      .send({ notes: "Selling the unit" });
    expect(res.status).toBe(201);
    expect(res.body.initiationType).toBe("path_a");
    expect(res.body.status).toBe("pending");
    expect(res.body.outgoingOwnerName).toBe("Alice Owner");
    expect(res.body.unitId).toBe(1);
  });

  it("Event is retrievable via GET /api/ownership-changes (admin only)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).get("/api/ownership-changes");
    expect(res.status).toBe(200);
    const events = res.body as any[];
    expect(events.some((e: any) => e.initiationType === "path_a")).toBe(true);
  });

  it("GET /api/ownership-changes — non-admin gets 403", async () => {
    mockAuthState.userId = OWNER_CLERK;
    const res = await request(app).get("/api/ownership-changes");
    expect(res.status).toBe(403);
  });
});

describe("F11 — system unit ownership-claim boundary", () => {
  beforeEach(() => {
    resetMockDb();
    seedBase();
    stores.units.updateFirst({ type: "eq", col: "id", val: 1 }, {
      building: "HOA",
      unitNumber: "COMMON",
      isSystem: true,
    });
  });

  it("refuses a Path B ownership claim against the HOA COMMON system unit", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app).post("/api/ownership-changes/claim").send({
      building: "HOA",
      unitNumber: "COMMON",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-CLAIMANT",
    });
    expect(res).toMatchObject({ status: 403, body: { error: "SYSTEM_UNIT_RESERVED" } });
  });
});

// ─── Path A: admin approves → outgoing owner deleted, unit cleared ────────────

describe("Path A — admin approval: outgoing owner deleted, unit cleared", () => {
  let eventId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Pre-seed a pending Path A event (outgoingOwnerId=2 = Alice)
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_a",
      outgoingOwnerId: 2,
      outgoingOwnerName: "Alice Owner",
      outgoingOwnerEmail: "owner@hoa.com",
      outgoingOwnerNationalId: "NID-OWNER",
      status: "pending",
    });
    eventId = ev.id as number;
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH /api/ownership-changes/:id/review — non-admin gets 403", async () => {
    mockAuthState.userId = OWNER_CLERK;
    const res = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "approved" });
    expect(res.status).toBe(403);
  });

  it("PATCH /api/ownership-changes/:id/review — admin approves Path A through the shared release engine", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "approved", note: "Verified documents" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(stores.releaseOperations.findAll()).toHaveLength(1);
    expect(stores.users.findAll({ type: "eq", col: "id", val: 2 })).toHaveLength(0);
  });

  it("After Path A approval: unit.verifiedOwnerId is null", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.verifiedOwnerId).toBeNull();
  });

  it("After Path A approval: unit.preApprovedClaimId is null (no Path B slot)", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.preApprovedClaimId).toBeNull();
  });

  it("After Path A approval: event.outgoingOwnerId is null (GDPR anonymized)", () => {
    const [ev] = stores.ownershipChangeEvents.findAll({ type: "eq", col: "id", val: eventId });
    expect(ev.outgoingOwnerId).toBeNull();
  });

  it("Admin cannot approve the same event again (409 — already reviewed)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "approved" });
    expect(res.status).toBe(409);
  });
});

// ─── Path A: admin rejects ────────────────────────────────────────────────────

describe("Path A — admin rejects: event status → rejected, owner not deleted", () => {
  let eventId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_a",
      outgoingOwnerId: 2,
      outgoingOwnerName: "Alice Owner",
      outgoingOwnerEmail: "owner@hoa.com",
      status: "pending",
    });
    eventId = ev.id as number;
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH /api/ownership-changes/:id/review with action=rejected → 200, status=rejected", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "rejected", note: "Insufficient evidence" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("After Path A rejection: no terminal release operation was created", () => {
    expect(stores.releaseOperations.findAll()).toHaveLength(0);
  });

  it("After Path A rejection: unit.verifiedOwnerId still set (owner not removed)", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.verifiedOwnerId).toBe(2);
  });
});

// ─── Path B: claimant files claim ────────────────────────────────────────────

describe("Path B — claimant files ownership claim", () => {
  beforeAll(() => {
    resetMockDb();
    seedBase();
  });

  beforeEach(() => {
    mockAuthState.userId = null;
    // Each credential mismatch is an independent submission attempt. Reset the
    // prior pending claim so the second case reaches credential evaluation
    // rather than the per-unit pending-claim uniqueness guard.
    stores.unitVerifications.reset();
  });

  it("POST /api/ownership-changes/claim — missing required fields returns 400", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app)
      .post("/api/ownership-changes/claim")
      .send({ building: "A", unitNumber: "101" }); // missing newOwnerName, newOwnerNationalId
    expect(res.status).toBe(400);
  });

  it("POST /api/ownership-changes/claim — unit not found returns 404", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app)
      .post("/api/ownership-changes/claim")
      .send({ building: "Z", unitNumber: "999", newOwnerName: "Jane Doe", newOwnerNationalId: "NID-JANE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/ownership-changes/claim — valid claim creates pending Path B event (201)", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app)
      .post("/api/ownership-changes/claim")
      .send({
        building: "A",
        unitNumber: "101",
        newOwnerName: "Jane Doe",
        newOwnerNationalId: "NID-JANE",
        outgoingOwnerName: "Alice Owner",
        outgoingOwnerNationalId: "NID-OWNER",
        notes: "Title deed attached",
      });
    expect(res.status).toBe(201);
    expect(res.body.initiationType).toBe("path_b");
    expect(res.body.status).toBe("pending");
    expect(res.body.newOwnerName).toBe("Jane Doe");
    expect(res.body.newOwnerNationalId).toBe("NID-JANE");
  });
});

// ─── Stage 6C Path B: approval releases outgoing owner; no claimant slot ─────

describe("Stage 6C O3/O5 — Path B approval releases the owner without pre-approving an incoming owner", () => {
  let eventId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Pre-seed a pending Path B event
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      outgoingOwnerId: 2,
      outgoingOwnerName: "Alice Owner",
      outgoingOwnerEmail: "owner@hoa.com",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      status: "pending",
    });
    eventId = ev.id as number;
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH /api/ownership-changes/:id/review approved → 200, executes the engine and leaves no claimant slot", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(stores.releaseOperations.findAll()).toHaveLength(1);
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.verifiedOwnerId).toBeNull();
    expect(unit.preApprovedClaimId).toBeNull();
    const [event] = stores.ownershipChangeEvents.findAll({ type: "eq", col: "id", val: eventId });
    expect(event.newOwnerUserId ?? null).toBeNull();
  });
});

describe("Stage 6C O5 — incoming owner continues through ordinary B7 after Path B release", () => {
  let eventId: number;

  beforeEach(() => {
    resetMockDb();
    seedBase();

    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      outgoingOwnerId: 2,
      outgoingOwnerName: "Alice Owner",
      outgoingOwnerEmail: "owner@hoa.com",
      status: "pending",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });
    eventId = ev.id as number;

    // A B7 manual verification remains the only incoming-owner path.
    stores.unitRegistry.insert({
      building: "A",
      unitNumber: "101",
      ownerNationalId: "NID-REGISTRY-DIFFERENT",
      ownerName: "Registry Owner",
      isMatched: false,
    });
  });

  it("does not use a name/NID fast-track; it creates the ordinary B7 manual-review request", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const reviewed = await request(app)
      .patch(`/api/ownership-changes/${eventId}/review`)
      .send({ action: "approved" });
    expect(reviewed.status).toBe(200);

    mockAuthState.userId = CLAIMANT_CLERK;
    const verification = await request(app)
      .post("/api/unit-verify/owner")
      .send({ building: "A", unitNumber: "101", nationalId: "NID-JANE", mobile: "+966501234567", gender: "female", titleDeedNumber: "1234567890123456" });
    expect(verification.status).toBe(200);
    expect(verification.body.result).toBe("pending_manual_review");
    expect(verification.body.result).not.toBe("pre_approved");

    const [claimant] = stores.users.findAll({ type: "eq", col: "clerkId", val: CLAIMANT_CLERK });
    expect(claimant.verificationStatus).toBe("pending_manual");
    expect(claimant.unitId ?? null).toBeNull();
    const [ev] = stores.ownershipChangeEvents.findAll({ type: "eq", col: "id", val: eventId });
    expect(ev.newOwnerUserId ?? null).toBeNull();
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.verifiedOwnerId).toBeNull();
    expect(unit.preApprovedClaimId).toBeNull();
  });
});

// The legacy fast-track suite records retired behavior only. It is intentionally
// skipped so no active test continues to authorize claimant-slot promotion.

describe.skip("Archived Stage 6C legacy: Path B pre-approved fast-track", () => {
  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Unit with preApprovedClaimId
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { verifiedOwnerId: null, occupantType: "vacant", preApprovedClaimId: null },
    );

    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });

    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { preApprovedClaimId: ev.id },
    );

    // Registry with a different NID so no auto-approve either
    stores.unitRegistry.insert({
      building: "A",
      unitNumber: "101",
      ownerNationalId: "NID-REGISTRY-DIFFERENT",
      ownerName: "Registry Owner",
      isMatched: false,
    });
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("POST /unit-verify/owner — wrong NID does NOT return pre_approved", async () => {
    stores.unitVerifications.reset();
    mockAuthState.userId = CLAIMANT_CLERK; // name=Jane Doe, NID wrong
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({ building: "A", unitNumber: "101", nationalId: "NID-WRONG", mobile: "+966501234567", gender: "female", titleDeedNumber: "1234567890123456" });
    expect(res.status).toBe(200);
    expect(res.body.result).not.toBe("pre_approved");
  });

  it("POST /unit-verify/owner — wrong name does NOT return pre_approved (even with correct NID)", async () => {
    stores.unitVerifications.reset();
    // Temporarily use a user whose name does not match the event
    mockAuthState.userId = OTHER_CLERK; // name=Other User, not Jane Doe
    const res = await request(app)
      .post("/api/unit-verify/owner")
      .send({ building: "A", unitNumber: "101", nationalId: "NID-JANE", mobile: "+966501234567", gender: "male", titleDeedNumber: "1234567890123456" });
    expect(res.status).toBe(200);
    expect(res.body.result).not.toBe("pre_approved");
  });
});

// ─── Admin finalize: pre_approved claimant → verified_owner ───────────────────

describe.skip("Archived Stage 6C legacy: admin finalizes a pre-approved claimant", () => {
  let eventId: number;
  let claimantId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Claimant is already in pre_approved state (fast-track already fired)
    stores.users.updateFirst(
      { type: "eq", col: "clerkId", val: CLAIMANT_CLERK },
      {
        verificationStatus: "pre_approved",
        unitId: 1,
        unitNumber: "A 101",
        nationalId: "NID-JANE",
      },
    );
    const [claimant] = stores.users.findAll({ type: "eq", col: "clerkId", val: CLAIMANT_CLERK });
    claimantId = claimant.id as number;

    // Unit: no owner, preApprovedClaimId will point to the event
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { verifiedOwnerId: null, occupantType: "vacant" },
    );

    // Approved Path B event with claimant linked
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: claimantId,
    });
    eventId = ev.id as number;

    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { preApprovedClaimId: eventId },
    );
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH /api/ownership-changes/:id/finalize — non-admin gets 403", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/finalize`);
    expect(res.status).toBe(403);
  });

  it("PATCH /api/ownership-changes/:id/finalize — admin finalizes successfully (200)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/finalize`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("After finalize: event.status = completed", () => {
    const [ev] = stores.ownershipChangeEvents.findAll({ type: "eq", col: "id", val: eventId });
    expect(ev.status).toBe("completed");
  });

  it("After finalize: claimant.verificationStatus = verified_owner", () => {
    const [claimant] = stores.users.findAll({ type: "eq", col: "id", val: claimantId });
    expect(claimant.verificationStatus).toBe("verified_owner");
  });

  it("After finalize: unit.verifiedOwnerId = claimant id", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.verifiedOwnerId).toBe(claimantId);
  });

  it("After finalize: unit.preApprovedClaimId is null", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.preApprovedClaimId).toBeNull();
  });

  it("Finalize guard: cannot finalize an already-completed event (409)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/finalize`);
    expect(res.status).toBe(409);
  });
});

// ─── Admin finalize guards ────────────────────────────────────────────────────

describe.skip("Archived Stage 6C legacy: finalize state guards", () => {
  beforeAll(() => {
    resetMockDb();
    seedBase();
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("Finalize returns 409 when event is still pending (not approved)", async () => {
    // Insert a pending event
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "pending",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${ev.id}/finalize`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/approved status/i);
  });

  it("Finalize returns 409 when no claimant has registered (newOwnerUserId=null)", async () => {
    // Insert an approved event with no claimant
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${ev.id}/finalize`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/pre-approved claimant/i);
  });

  it("Finalize returns 409 when claimant exists but is not in pre_approved state", async () => {
    // Claimant (id=3) is in unverified state
    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: 3, // claimant user (verificationStatus=unverified)
    });
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${ev.id}/finalize`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/pre_approved/i);
  });
});

// ─── Admin cancel-pre-approval ────────────────────────────────────────────────

describe.skip("Archived Stage 6C legacy: cancel claimant slot before registration", () => {
  let eventId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Unit in pre-approved state but no claimant yet
    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { verifiedOwnerId: null, occupantType: "vacant" },
    );

    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });
    eventId = ev.id as number;
    stores.units.updateFirst({ type: "eq", col: "id", val: 1 }, { preApprovedClaimId: eventId });
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH cancel-pre-approval — non-admin gets 403", async () => {
    mockAuthState.userId = CLAIMANT_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/cancel-pre-approval`);
    expect(res.status).toBe(403);
  });

  it("PATCH cancel-pre-approval (no claimant) → event.status=rejected (200)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/cancel-pre-approval`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("After cancel: unit.preApprovedClaimId is null", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.preApprovedClaimId).toBeNull();
  });

  it("Cancel guard: cannot cancel a non-approved event (409)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/cancel-pre-approval`);
    expect(res.status).toBe(409);
  });
});

describe.skip("Archived Stage 6C legacy: cancel claimant slot after registration", () => {
  let eventId: number;
  let claimantId: number;

  beforeAll(() => {
    resetMockDb();
    seedBase();

    // Claimant is already in pre_approved state
    stores.users.updateFirst(
      { type: "eq", col: "clerkId", val: CLAIMANT_CLERK },
      {
        verificationStatus: "pre_approved",
        unitId: 1,
        unitNumber: "A 101",
        nationalId: "NID-JANE",
        role: "owner",
        status: "active",
      },
    );
    const [claimant] = stores.users.findAll({ type: "eq", col: "clerkId", val: CLAIMANT_CLERK });
    claimantId = claimant.id as number;

    stores.units.updateFirst(
      { type: "eq", col: "id", val: 1 },
      { verifiedOwnerId: null, occupantType: "vacant" },
    );

    const ev = stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: claimantId,
    });
    eventId = ev.id as number;
    stores.units.updateFirst({ type: "eq", col: "id", val: 1 }, { preApprovedClaimId: eventId });
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("PATCH cancel-pre-approval (with claimant) → event.status=rejected (200)", async () => {
    mockAuthState.userId = ADMIN_CLERK;
    const res = await request(app).patch(`/api/ownership-changes/${eventId}/cancel-pre-approval`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("After cancel with claimant: claimant.verificationStatus reverted to unverified", () => {
    const [claimant] = stores.users.findAll({ type: "eq", col: "id", val: claimantId });
    expect(claimant.verificationStatus).toBe("unverified");
  });

  it("After cancel with claimant: claimant.unitId reverted to null", () => {
    const [claimant] = stores.users.findAll({ type: "eq", col: "id", val: claimantId });
    expect(claimant.unitId).toBeNull();
  });

  it("After cancel with claimant: unit.preApprovedClaimId is null", () => {
    const [unit] = stores.units.findAll({ type: "eq", col: "id", val: 1 });
    expect(unit.preApprovedClaimId).toBeNull();
  });

  it("After cancel with claimant: event.newOwnerUserId is null (PII cleared)", () => {
    const [ev] = stores.ownershipChangeEvents.findAll({ type: "eq", col: "id", val: eventId });
    expect(ev.newOwnerUserId).toBeNull();
  });
});

// ─── Auth guards summary ──────────────────────────────────────────────────────

describe("Auth guards — unauthenticated requests rejected", () => {
  beforeAll(() => {
    resetMockDb();
    seedBase();
    // Seed a dummy event
    stores.ownershipChangeEvents.insert({
      unitId: 1,
      unitNumber: "A 101",
      initiationType: "path_b",
      status: "approved",
      newOwnerName: "Jane Doe",
      newOwnerNationalId: "NID-JANE",
      newOwnerUserId: null,
    });
  });

  beforeEach(() => {
    mockAuthState.userId = null;
  });

  it("POST /api/ownership-changes without auth → 401 or 403", async () => {
    const res = await request(app).post("/api/ownership-changes").send({});
    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/ownership-changes/claim without auth → 401 or 403", async () => {
    const res = await request(app).post("/api/ownership-changes/claim").send({});
    expect([401, 403]).toContain(res.status);
  });

  it("GET /api/ownership-changes without auth → 401 or 403", async () => {
    const res = await request(app).get("/api/ownership-changes");
    expect([401, 403]).toContain(res.status);
  });

  it("PATCH /api/ownership-changes/1/review without auth → 401 or 403", async () => {
    const res = await request(app).patch("/api/ownership-changes/1/review").send({ action: "approved" });
    expect([401, 403]).toContain(res.status);
  });

  it("PATCH /api/ownership-changes/1/finalize is retired and returns 404", async () => {
    const res = await request(app).patch("/api/ownership-changes/1/finalize");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/ownership-changes/1/cancel-pre-approval is retired and returns 404", async () => {
    const res = await request(app).patch("/api/ownership-changes/1/cancel-pre-approval");
    expect(res.status).toBe(404);
  });
});
