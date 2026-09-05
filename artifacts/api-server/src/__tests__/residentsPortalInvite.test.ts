/**
 * Server-side tests: single-slot household portal invitation flow.
 *
 * Rules under test:
 *   1. POST /api/residents with hasPortalAccess=true → email + adult + verified
 *      caller + linked unit required; creates a single-use tokenised invitation
 *      (returned as invitationUrl) and sends the Clerk email.
 *   2. One slot per unit: a pending or accepted invitation blocks new grants (409).
 *   3. POST /api/residents/:id/invite reissues a fresh token (revoking the old
 *      pending one); 409 once accepted.
 *   4. DELETE /api/residents/:id/invite revokes the slot; unlinks an accepted
 *      member's portal account.
 *   5. GET /api/invitations/validate — public token validation (used / revoked /
 *      expired / not found).
 *   6. POST /api/users/me/sync consumes a matching pending invitation exactly
 *      once: links unit, sets verified_household_member, marks resident linked.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

// ─── Module mocks (hoisted before any imports that touch them) ────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
    const { eq, and, or, desc, ne, lt, gt, gte, inArray, count, sql } = await import(
    "./helpers/mockDb"
  );
    return { eq, and, or, desc, ne, lt, gt, gte, inArray, count, sql };
});

const createInvitationMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: mockAuthState.userId });
      next();
    },
    getAuth: (_req: any) => ({ userId: mockAuthState.userId }),
    clerkClient: {
      invitations: {
        createInvitation: (...args: unknown[]) => createInvitationMock(...args),
      },
      users: {
        getUser: (...args: unknown[]) => getUserMock(...args),
      },
    },
  };
});

/** Make Clerk report the given verified email for whoever syncs next. */
function setClerkVerifiedEmail(email: string) {
  getUserMock.mockResolvedValue({
    emailAddresses: [{ emailAddress: email, verification: { status: "verified" } }],
  });
}

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

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

const { default: app } = await import("../app");
const { consumeHouseholdInvitation } = await import("../routes/users");

// ─── Clerk user IDs ───────────────────────────────────────────────────────────

const CLERK_OWNER = "clerk-inv-owner";
const CLERK_OTHER_OWNER = "clerk-inv-other-owner";
const CLERK_ADMIN = "clerk-inv-admin";
const CLERK_NEW_MEMBER = "clerk-inv-new-member";

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);
const UNIT_201_ID = 1;
const UNIT_202_ID = 2;
const UNIT_203_ID = 3;
const UNIT_201_REFERENCE = "A 201";
const UNIT_203_REFERENCE = "A 203";

function seedAll() {
  resetMockDb();
  createInvitationMock.mockReset();
  createInvitationMock.mockResolvedValue({ id: "inv_1" });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ emailAddresses: [] });

  // Unit IDs are the canonical linkage; display references include the building.
  stores.units.insert({ building: "A", unitNumber: "201", occupantType: "owner_occupied" }); // id=1
  stores.units.insert({ building: "A", unitNumber: "202", occupantType: "owner_occupied" }); // id=2
  stores.units.insert({ building: "A", unitNumber: "203", occupantType: "owner_occupied" }); // id=3

  stores.users.insert({
    clerkId: CLERK_OWNER, email: "inv-owner@test.com", role: "owner",
    status: "active", firstName: "Dana", lastName: "Al-Harbi",
    verificationStatus: "verified_owner", unitNumber: "201", unitId: UNIT_201_ID,
  }); // id=1
  stores.users.insert({
    clerkId: CLERK_OTHER_OWNER, email: "inv-other@test.com", role: "owner",
    status: "active", firstName: "Omar", lastName: "Saleh",
    verificationStatus: "verified_owner", unitNumber: "202", unitId: UNIT_202_ID,
  }); // id=2
  stores.users.insert({
    clerkId: CLERK_ADMIN, email: "inv-admin@test.com", role: "admin",
    status: "active", firstName: "Admin", lastName: "User",
    verificationStatus: "unverified", unitNumber: null, unitId: null,
  }); // id=3

  // Adult family member with portal access + email (registered by owner id=1, on unit 201)
  stores.residents.insert({
    type: "family", firstName: "Sara", lastName: "Al-Harbi",
    email: "sara@test.com", phone: null, unitNumber: "201", unitId: UNIT_201_ID,
    relationship: "Spouse", idNumber: null, dateOfBirth: "1990-01-01",
    hasPortalAccess: true, registeredById: 1, status: "active",
    linkedUserId: null,
  }); // id=1

  // Adult family member WITHOUT portal access, no email (on unit 201)
  stores.residents.insert({
    type: "family", firstName: "Khalid", lastName: "Al-Harbi",
    email: null, phone: null, unitNumber: "201", unitId: UNIT_201_ID,
    relationship: "Sibling", idNumber: null, dateOfBirth: "1995-01-01",
    hasPortalAccess: false, registeredById: 1, status: "active",
    linkedUserId: null,
  }); // id=2
}

/** Seed the pending invitation matching resident id=1 in canonical unit A 201. */
function seedPendingInvite(overrides: Record<string, unknown> = {}) {
  return stores.householdInvitations.insert({
    unitId: UNIT_201_ID, unitNumber: UNIT_201_REFERENCE, invitedEmail: "sara@test.com",
    token: "tok-sara-1", createdByUserId: 1, residentId: 1,
    status: "pending", usedAt: null, expiresAt: FUTURE,
    ...overrides,
  });
}

const CANONICAL_PORTAL_BASE_URL = "https://community-hub-portal.replit.app/hoa-portal";

beforeAll(() => {
  process.env.PORTAL_BASE_URL = CANONICAL_PORTAL_BASE_URL;
  seedAll();
});
beforeEach(() => {
  process.env.PORTAL_BASE_URL = CANONICAL_PORTAL_BASE_URL;
  seedAll();
});

const basePayload = {
  type: "family", firstName: "New", lastName: "Member",
  relationship: "Spouse", dateOfBirth: "1992-05-05",
  nationality: "Saudi", idNumber: "NID-NEW-MEMBER",
  phone: "+966500000099",
  gender: "female",
};

// ─── POST /api/residents ──────────────────────────────────────────────────────

describe("POST /api/residents — portal access invitation", () => {
  it("rejects resident registration without a mobile number", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const { phone: _phone, ...withoutPhone } = basePayload;
    const res = await request(app).post("/api/residents").send(withoutPhone);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/mobile number is required/i);
  });

  it("registers a resident without collecting or returning a photo key", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents").send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("idPhotoKey");
    expect(stores.residents.findAll().slice(-1)[0]).not.toHaveProperty("idPhotoKey");
  });

  it("rejects a resident registration without a National ID / Iqama", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const { idNumber: _idNumber, ...withoutIdNumber } = basePayload;
    const res = await request(app).post("/api/residents").send(withoutIdNumber);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/idNumber/);
  });

  it("persists the guardian identifier flag only for an under-18 resident", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents").send({
      ...basePayload,
      firstName: "Minor",
      dateOfBirth: "2015-05-05",
      idNumberIsGuardian: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.idNumberIsGuardian).toBe(true);
    expect(stores.residents.findAll().slice(-1)[0].idNumberIsGuardian).toBe(true);
  });

  it.each([undefined, "other"])("rejects resident registration with gender %j", async (gender) => {
    mockAuthState.userId = CLERK_OWNER;
    const { gender: _gender, ...withoutGender } = basePayload;
    const res = await request(app).post("/api/residents").send(
      gender === undefined ? withoutGender : { ...basePayload, gender },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("gender is required and must be either male or female");
  });

  it("returns 422 when hasPortalAccess=true and no email", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("EMAIL_REQUIRED_FOR_PORTAL_ACCESS");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("creates a tokenised invitation and sends the Clerk email", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "new@test.com" });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(true);
    const token = stores.householdInvitations.findAll()[0].token;
    const expectedUrl = `${CANONICAL_PORTAL_BASE_URL}/sign-up?invite=${token}`;
    expect(res.body.invitationUrl).toBe(expectedUrl);
    expect(createInvitationMock).toHaveBeenCalledTimes(1);
    expect(createInvitationMock.mock.calls[0][0]).toMatchObject({
      emailAddress: "new@test.com",
      redirectUrl: expectedUrl,
    });
    const invites = stores.householdInvitations.findAll();
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      unitId: UNIT_201_ID,
      unitNumber: UNIT_201_REFERENCE,
      status: "pending",
      invitedEmail: "new@test.com",
    });
  });

  it("fails before creating an invitation when PORTAL_BASE_URL is unset", async () => {
    delete process.env.PORTAL_BASE_URL;
    mockAuthState.userId = CLERK_OWNER;

    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "new@test.com" });

    expect(res.status).toBe(500);
    expect(createInvitationMock).not.toHaveBeenCalled();
    expect(stores.householdInvitations.findAll()).toHaveLength(0);
  });

  it("returns 409 when the unit already has a pending invitation", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "second@test.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVITATION_SLOT_TAKEN");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the unit already has an accepted invitation", async () => {
    seedPendingInvite({ status: "accepted", usedAt: new Date() });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "second@test.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVITATION_SLOT_TAKEN");
  });

  it("does not invite when hasPortalAccess=false", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: false, email: "no-invite@test.com" });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(false);
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 422 when hasPortalAccess=true for a minor", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, dateOfBirth: "2015-01-01", hasPortalAccess: true, email: "kid@test.com" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("ADULT_REQUIRED_FOR_PORTAL_ACCESS");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 403 when an unverified caller tries to grant portal access", async () => {
    stores.users.insert({
      clerkId: "clerk-inv-unverified", email: "unv@test.com", role: "owner",
      status: "active", firstName: "Unv", lastName: "User",
      verificationStatus: "unverified", unitNumber: "203", unitId: UNIT_203_ID,
    });
    mockAuthState.userId = "clerk-inv-unverified";
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "x@test.com" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PORTAL_ACCESS_GRANT_FORBIDDEN");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 422 when the caller has no linked unit", async () => {
    stores.users.insert({
      clerkId: "clerk-inv-nounit", email: "nounit@test.com", role: "owner",
      status: "active", firstName: "No", lastName: "Unit",
      verificationStatus: "verified_owner", unitNumber: null, unitId: null,
    });
    mockAuthState.userId = "clerk-inv-nounit";
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "x@test.com" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("NO_UNIT_LINKED");
  });

  it("still creates resident + invitation when the Clerk email fails (copy link remains)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    createInvitationMock.mockRejectedValueOnce(new Error("clerk down"));
    const res = await request(app).post("/api/residents")
      .send({ ...basePayload, hasPortalAccess: true, email: "fail@test.com" });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(false);
    expect(res.body.invitationUrl).toMatch(/\?invite=/);
    expect(stores.householdInvitations.findAll()).toHaveLength(1);
  });
});

// ─── PATCH /api/residents/:id ─────────────────────────────────────────────────

describe("staff role exclusion — verified status alone must not grant invitation power", () => {
  function seedVerifiedStaff(role: string, clerkId: string) {
    stores.users.insert({
      clerkId, email: `${role}@test.com`, role,
      status: "active", firstName: "Staff", lastName: "Member",
      // Staff account that (mis)carries a verified owner status + unit link.
      verificationStatus: "verified_owner", unitNumber: "203", unitId: UNIT_203_ID,
    });
  }

  it("POST /residents: supervisor with verified_owner status gets 403 for portal grant", async () => {
    seedVerifiedStaff("supervisor", "clerk-verified-sup");
    mockAuthState.userId = "clerk-verified-sup";
    const res = await request(app).post("/api/residents").send({
      ...basePayload, email: "target@test.com", hasPortalAccess: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PORTAL_ACCESS_GRANT_FORBIDDEN");
    expect(stores.householdInvitations.findAll()).toHaveLength(0);
  });

  it("PATCH /residents/:id: guard with verified_owner status gets 403 for portal grant", async () => {
    seedVerifiedStaff("guard", "clerk-verified-guard");
    mockAuthState.userId = "clerk-verified-guard";
    const res = await request(app).patch("/api/residents/2").send({
      hasPortalAccess: true, email: "khalid@test.com",
    });
    expect(res.status).toBe(403);
    expect(stores.householdInvitations.findAll()).toHaveLength(0);
  });

  it("reissue/list: a supervisor who registered the resident still never sees the raw URL", async () => {
    seedVerifiedStaff("supervisor", "clerk-sup-registrar"); // user id=4
    // Resident registered by the supervisor, already portal-enabled with a pending invite.
    stores.residents.insert({
      type: "family", firstName: "Reg", lastName: "ByStaff",
      email: "reg@test.com", phone: null, unitNumber: "203", unitId: UNIT_203_ID,
      relationship: "Spouse", idNumber: null, dateOfBirth: "1990-01-01",
      hasPortalAccess: true, registeredById: 4, status: "active",
      linkedUserId: null,
    }); // id=3
    stores.householdInvitations.insert({
      unitId: UNIT_203_ID, unitNumber: UNIT_203_REFERENCE, invitedEmail: "reg@test.com",
      token: "tok-staff-reg", createdByUserId: 4, residentId: 3,
      status: "pending", usedAt: null, expiresAt: FUTURE,
    });
    mockAuthState.userId = "clerk-sup-registrar";
    const reissue = await request(app).post("/api/residents/3/invite");
    expect(reissue.status).toBe(404);
    const list = await request(app).get("/api/residents");
    expect(JSON.stringify(list.body)).not.toContain("tok-staff-reg");
  });
});

describe("admin invitation power", () => {
  it("admin can grant portal access via PATCH, resolving the unit from the resident", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).patch("/api/residents/2").send({
      hasPortalAccess: true, email: "khalid@test.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.invitationUrl).toContain("invite=");
    const invite = stores.householdInvitations.findAll()[0];
    expect(invite.status).toBe("pending");
    expect(invite).toMatchObject({ unitId: UNIT_201_ID, unitNumber: UNIT_201_REFERENCE });
  });
});

describe("PATCH disable revokes the slot", () => {
  it("setting hasPortalAccess=false revokes the pending invitation (token no longer consumable)", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/1").send({ hasPortalAccess: false });
    expect(res.status).toBe(200);
    expect(stores.householdInvitations.findAll()[0].status).toBe("revoked");
    const validate = await request(app).get("/api/invitations/validate?token=tok-sara-1");
    expect(validate.body.valid).toBe(false);
  });

  it("setting hasPortalAccess=false unlinks an accepted member's account", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });

    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/1").send({ hasPortalAccess: false });
    expect(res.status).toBe(200);
    const member = stores.users.findAll().find((u: any) => u.clerkId === CLERK_NEW_MEMBER)!;
    expect(member.unitId).toBeNull();
    expect(member.verificationStatus).toBe("unverified");
    const resident = stores.residents.findAll().find((r: any) => r.id === 1)!;
    expect(resident.hasPortalAccess).toBe(false);
    expect(resident.linkedUserId).toBeNull();
  });
});

describe("GET /api/residents — raw invite URL exposure", () => {
  it("includes the invitation URL for the registrar", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).get("/api/residents");
    const sara = res.body.data.find((r: any) => r.id === 1);
    expect(sara.invitation.status).toBe("pending");
    expect(sara.invitation.invitationUrl).toContain("tok-sara-1");
  });

  it("includes the invitation URL for an admin", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).get("/api/residents");
    const sara = res.body.data.find((r: any) => r.id === 1);
    expect(sara.invitation.invitationUrl).toContain("tok-sara-1");
  });

  it("supervisor sees own residents only after X6 — invite URL never exposed", async () => {
    seedPendingInvite();
    stores.users.insert({
      clerkId: "clerk-inv-supervisor2", email: "sup2@test.com", role: "supervisor",
      status: "active", firstName: "Sup", lastName: "Ervisor",
      verificationStatus: "unverified", unitNumber: null, unitId: null,
    });
    mockAuthState.userId = "clerk-inv-supervisor2";
    const res = await request(app).get("/api/residents");
    // supervisor no longer in STAFF_ROLES → own-only scoping → empty list (200); invite token never exposed
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("tok-sara-1");
  });
});

describe("PATCH /api/residents/:id — granting portal access later", () => {
  it("returns 422 when flipping hasPortalAccess on with no email on file", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/2")
      .send({ hasPortalAccess: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("EMAIL_REQUIRED_FOR_PORTAL_ACCESS");
  });

  it("creates the invitation when flipping hasPortalAccess on with email", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/2")
      .send({ hasPortalAccess: true, email: "khalid@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.invitationSent).toBe(true);
    expect(res.body.invitationUrl).toMatch(/\?invite=/);
    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: "khalid@test.com" }),
    );
  });

  it("returns 409 when the unit slot is already taken", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/2")
      .send({ hasPortalAccess: true, email: "khalid@test.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVITATION_SLOT_TAKEN");
  });

  it("does not re-invite when hasPortalAccess was already true", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).patch("/api/residents/1")
      .send({ hasPortalAccess: true, phone: "+966500000009" });
    expect(res.status).toBe(200);
    expect(res.body.invitationSent).toBe(false);
    expect(createInvitationMock).not.toHaveBeenCalled();
  });
});

// ─── POST /api/residents/:id/invite ──────────────────────────────────────────

describe("POST /api/residents/:id/invite — reissue invitation", () => {
  it("reissues a fresh token and revokes the previous pending one", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(200);
    expect(res.body.invitationSent).toBe(true);
    expect(res.body.invitationUrl).toMatch(/\?invite=/);
    expect(res.body.invitationUrl).not.toContain("tok-sara-1");
    const invites = stores.householdInvitations.findAll();
    expect(invites.filter((i: any) => i.status === "pending")).toHaveLength(1);
    expect(invites.find((i: any) => i.token === "tok-sara-1")!.status).toBe("revoked");
  });

  it("returns 409 when the invitation was already accepted", async () => {
    seedPendingInvite({ status: "accepted", usedAt: new Date() });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVITATION_ALREADY_ACCEPTED");
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the member has no portal access", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/residents/2/invite");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("NO_PORTAL_ACCESS");
  });

  it("returns 404 for a non-staff caller who did not register the member", async () => {
    mockAuthState.userId = CLERK_OTHER_OWNER;
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(404);
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a supervisor (staff must not obtain the raw invite URL)", async () => {
    stores.users.insert({
      clerkId: "clerk-inv-supervisor", email: "sup@test.com", role: "supervisor",
      status: "active", firstName: "Sup", lastName: "Ervisor",
      verificationStatus: "unverified", unitNumber: null, unitId: null,
    });
    mockAuthState.userId = "clerk-inv-supervisor";
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(404);
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("allows an admin to reissue using the registrar's unit", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(200);
    expect(res.body.invitationSent).toBe(true);
    expect(stores.householdInvitations.findAll()[0]).toMatchObject({
      unitId: UNIT_201_ID,
      unitNumber: UNIT_201_REFERENCE,
    });
  });

  it("returns ok with invitationSent=false when the Clerk email fails (link still usable)", async () => {
    mockAuthState.userId = CLERK_OWNER;
    createInvitationMock.mockRejectedValueOnce(new Error("clerk down"));
    const res = await request(app).post("/api/residents/1/invite");
    expect(res.status).toBe(200);
    expect(res.body.invitationSent).toBe(false);
    expect(res.body.invitationUrl).toMatch(/\?invite=/);
  });
});

// ─── DELETE /api/residents/:id/invite ─────────────────────────────────────────

describe("DELETE /api/residents/:id/invite — revoke the slot", () => {
  it("revokes a pending invitation and clears portal access", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).delete("/api/residents/1/invite");
    expect(res.status).toBe(200);
    expect(stores.householdInvitations.findAll()[0].status).toBe("revoked");
    expect(stores.residents.findAll().find((r: any) => r.id === 1)!.hasPortalAccess).toBe(false);
  });

  it("unlinks the member's portal account when revoking an accepted invitation", async () => {
    stores.users.insert({
      clerkId: CLERK_NEW_MEMBER, email: "sara@test.com", role: "tenant",
      status: "active", firstName: "Sara", lastName: "Al-Harbi",
      verificationStatus: "verified_household_member", unitNumber: "201", unitId: UNIT_201_ID,
    }); // id=4
    const saraRow = stores.residents.findAll().find((r: any) => r.id === 1)! as any;
    saraRow.linkedUserId = 4;
    seedPendingInvite({ status: "accepted", usedAt: new Date() });
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).delete("/api/residents/1/invite");
    expect(res.status).toBe(200);
    const linkedUser = stores.users.findAll().find((u: any) => u.clerkId === CLERK_NEW_MEMBER)!;
    expect(linkedUser.unitId).toBeNull();
    expect(linkedUser.verificationStatus).toBe("unverified");
    expect(stores.residents.findAll().find((r: any) => r.id === 1)!.linkedUserId).toBeNull();
  });

  it("returns 409 when there is no active invitation", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).delete("/api/residents/1/invite");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("NO_ACTIVE_INVITATION");
  });

  it("returns 404 for a non-admin caller who did not register the member", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OTHER_OWNER;
    const res = await request(app).delete("/api/residents/1/invite");
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/invitations/validate ────────────────────────────────────────────

describe("GET /api/invitations/validate — public token check", () => {
  it("returns valid with email + unit for a pending unexpired token", async () => {
    seedPendingInvite();
    const res = await request(app).get("/api/invitations/validate?token=tok-sara-1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      valid: true,
      email: "sara@test.com",
      unitNumber: UNIT_201_REFERENCE,
    });
  });

  it("flags a used token", async () => {
    seedPendingInvite({ status: "accepted", usedAt: new Date() });
    const res = await request(app).get("/api/invitations/validate?token=tok-sara-1");
    expect(res.body).toMatchObject({ valid: false, reason: "used" });
  });

  it("flags a revoked token", async () => {
    seedPendingInvite({ status: "revoked" });
    const res = await request(app).get("/api/invitations/validate?token=tok-sara-1");
    expect(res.body).toMatchObject({ valid: false, reason: "revoked" });
  });

  it("flags an expired token", async () => {
    seedPendingInvite({ expiresAt: PAST });
    const res = await request(app).get("/api/invitations/validate?token=tok-sara-1");
    expect(res.body).toMatchObject({ valid: false, reason: "expired" });
  });

  it("flags an unknown token", async () => {
    const res = await request(app).get("/api/invitations/validate?token=nope");
    expect(res.body).toMatchObject({ valid: false, reason: "not_found" });
  });

  it("400s when the token is missing", async () => {
    const res = await request(app).get("/api/invitations/validate");
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/users/me/sync — auto-link on sign-up ──────────────────────────

describe("POST /api/users/me/sync — invitation consumption", () => {
  it("links a new user presenting the token with a matching Clerk-verified email", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "Al-Harbi", inviteToken: "tok-sara-1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      unitId: UNIT_201_ID, unitNumber: UNIT_201_REFERENCE,
      verificationStatus: "verified_household_member", status: "active",
    });
    const invite = stores.householdInvitations.findAll()[0];
    expect(invite.status).toBe("accepted");
    expect(invite.usedAt).toBeTruthy();
    expect(stores.residents.findAll().find((r: any) => r.id === 1)!.linkedUserId).toBe(res.body.id);
  });

  it("does not link without a token, even when the email matches (spoofing guard)", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("does not link when the caller's Clerk-verified email differs from the invited email", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("attacker@test.com");
    mockAuthState.userId = "clerk-attacker";
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Imposter", lastName: "X", inviteToken: "tok-sara-1" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(res.body.verificationStatus).not.toBe("verified_household_member");
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("is single-use: a second sync with the same token is not linked", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    mockAuthState.userId = "clerk-second-signup";
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Imposter", lastName: "X", inviteToken: "tok-sara-1" });
    expect(res.status).toBe(200);
    expect(res.body.unitId ?? null).toBeNull();
    expect(res.body.verificationStatus).not.toBe("verified_household_member");
  });

  it("does not link when the matching Clerk email is unverified (null verification)", async () => {
    seedPendingInvite();
    getUserMock.mockResolvedValue({
      emailAddresses: [{ emailAddress: "sara@test.com", verification: null }],
    });
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("does not link when the matching Clerk email verification status is not 'verified'", async () => {
    seedPendingInvite();
    getUserMock.mockResolvedValue({
      emailAddresses: [{ emailAddress: "sara@test.com", verification: { status: "unverified" } }],
    });
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("consume-vs-revoke: after a committed consume, revoke fully unlinks the user", async () => {
    seedPendingInvite();
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const sync = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    expect(sync.body.verificationStatus).toBe("verified_household_member");

    mockAuthState.userId = CLERK_OWNER;
    const revoke = await request(app).delete("/api/residents/1/invite");
    expect(revoke.status).toBe(200);

    // Final state: no linked user, no portal access, no unit linkage.
    expect(stores.householdInvitations.findAll()[0].status).toBe("revoked");
    const member = stores.users.findAll().find((u: any) => u.clerkId === CLERK_NEW_MEMBER)!;
    expect(member.unitId).toBeNull();
    expect(member.unitNumber).toBeNull();
    expect(member.verificationStatus).toBe("unverified");
    const resident = stores.residents.findAll().find((r: any) => r.id === 1)!;
    expect(resident.hasPortalAccess).toBe(false);
    expect(resident.linkedUserId).toBeNull();
  });

  it("consume-vs-revoke: after a committed revoke, the token can no longer link", async () => {
    seedPendingInvite();
    mockAuthState.userId = CLERK_OWNER;
    await request(app).delete("/api/residents/1/invite");

    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(res.body.verificationStatus).not.toBe("verified_household_member");
    expect(stores.householdInvitations.findAll()[0].status).toBe("revoked");
  });

  it("does not link an expired invitation", async () => {
    seedPendingInvite({ expiresAt: PAST });
    setClerkVerifiedEmail("sara@test.com");
    mockAuthState.userId = CLERK_NEW_MEMBER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "sara@test.com", firstName: "Sara", lastName: "A", inviteToken: "tok-sara-1" });
    expect(res.body.unitId ?? null).toBeNull();
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("never downgrades a verified owner syncing with a valid token", async () => {
    seedPendingInvite({ invitedEmail: "inv-owner@test.com" });
    setClerkVerifiedEmail("inv-owner@test.com");
    mockAuthState.userId = CLERK_OWNER;
    const res = await request(app).post("/api/users/me/sync")
      .send({ email: "inv-owner@test.com", firstName: "Dana", lastName: "Al-Harbi", inviteToken: "tok-sara-1" });
    expect(res.body.verificationStatus).toBe("verified_owner");
    expect(stores.householdInvitations.findAll()[0].status).toBe("pending");
  });

  it("refuses a suspension that arrives after provisioning but before invitation linkage", async () => {
    const suspendedUser = stores.users.insert({
      clerkId: "clerk-inv-suspended-after-upsert",
      email: "suspended-invite@test.com",
      role: "tenant",
      status: "suspended",
      firstName: "Suspended",
      lastName: "Resident",
      verificationStatus: "unverified",
      unitId: null,
      unitNumber: null,
    });
    stores.householdInvitations.insert({
      residentId: null,
      unitId: UNIT_201_ID,
      unitNumber: UNIT_201_REFERENCE,
      invitedEmail: "suspended-invite@test.com",
      token: "suspended-after-upsert-token",
      status: "pending",
      expiresAt: FUTURE,
      usedAt: null,
    });
    setClerkVerifiedEmail("suspended-invite@test.com");

    const linkage = await consumeHouseholdInvitation(
      suspendedUser.id as number,
      "clerk-inv-suspended-after-upsert",
      "suspended-after-upsert-token",
    );

    expect(linkage).toBeNull();
    expect(stores.users.findAll().find((row) => row.id === suspendedUser.id)).toEqual(
      expect.objectContaining({ status: "suspended", unitId: null }),
    );
    expect(stores.householdInvitations.findAll().find((row) => row.token === "suspended-after-upsert-token")).toEqual(
      expect.objectContaining({ status: "pending", usedAt: null }),
    );
  });
});
