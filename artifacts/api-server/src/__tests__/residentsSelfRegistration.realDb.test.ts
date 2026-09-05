/**
 * Opt-in proof against a disposable PostgreSQL database with the complete
 * schema (including migration 0053) already installed.  It deliberately mocks
 * Clerk authentication only; every persistence operation, including requests
 * through app.ts, uses @workspace/db's real pool.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, pool, residentsTable, unitsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { updateResidentOccupancy } from "../lib/occupancy";

const auth = { clerkId: "" };
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: any, _res: any, next: any) => {
    req.auth = () => ({ userId: auth.clerkId });
    next();
  },
  getAuth: () => ({ userId: auth.clerkId }),
  clerkClient: { users: { getUser: vi.fn(), createInvitation: vi.fn() }, invitations: { createInvitation: vi.fn() } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_real_db" }));

const enabled = process.env.RUN_REAL_DB_OCCUPANCY_TESTS === "1";
const suite = enabled ? describe : describe.skip;
const prefix = `itocc${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const fixtureIds = { users: [] as number[], units: [] as number[] };
const { default: app } = await import("../app");

async function createUser(role: "owner" | "tenant", verificationStatus: "verified_owner" | "verified_tenant", suffix: string) {
  const [user] = await db.insert(usersTable).values({
    clerkId: `${prefix}-${suffix}`, email: `${prefix}-${suffix}@example.test`,
    firstName: "Real", lastName: "Occupant", role, status: "active", verificationStatus,
    phone: "+966500000001",
  }).returning();
  fixtureIds.users.push(user.id);
  return user;
}

async function seedOccupied(track: "owner" | "tenant", suffix: string) {
  const incumbent = await createUser(track, track === "owner" ? "verified_owner" : "verified_tenant", `incumbent-${suffix}`);
  const contender = await createUser(track === "owner" ? "tenant" : "owner", track === "owner" ? "verified_tenant" : "verified_owner", `contender-${suffix}`);
  return db.transaction(async (tx) => {
    const [unit] = await tx.insert(unitsTable).values({
      building: prefix.toUpperCase(), unitNumber: suffix, occupantType: "vacant",
    }).returning();
    fixtureIds.units.push(unit.id);
    await tx.update(usersTable).set({ unitId: unit.id, unitNumber: `${unit.building} ${unit.unitNumber}` }).where(eq(usersTable.id, incumbent.id));
    // Deferred migration-0053 invariant permits this normal compound move-in.
    await tx.update(unitsTable).set(track === "owner"
      ? { verifiedOwnerId: incumbent.id, occupantType: "owner_occupied" }
      : { verifiedTenantId: incumbent.id, occupantType: "tenant_occupied" })
      .where(eq(unitsTable.id, unit.id));
    await tx.insert(residentsTable).values({
      type: track, firstName: "Real", lastName: "Occupant", unitNumber: `${unit.building} ${unit.unitNumber}`,
      unitId: unit.id, relationship: track === "owner" ? "Owner" : "Primary Tenant",
      linkedUserId: incumbent.id, registeredById: incumbent.id, status: "active", isPrimary: true, hasPortalAccess: true,
    });
    await tx.update(usersTable).set({ unitId: unit.id, unitNumber: `${unit.building} ${unit.unitNumber}` }).where(eq(usersTable.id, contender.id));
    return { unit, contender };
  });
}

beforeAll(() => {
  if (enabled && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when RUN_REAL_DB_OCCUPANCY_TESTS=1");
});

afterAll(async () => {
  if (!enabled) return;
  // Keep the deferred cross-table invariant true at COMMIT as well as deleting
  // in FK order. Every predicate is restricted to this random test prefix.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE units SET occupant_type = 'vacant', verified_owner_id = NULL, verified_tenant_id = NULL WHERE building = $1",
      [prefix.toUpperCase()],
    );
    await client.query("DELETE FROM residents WHERE unit_number LIKE $1", [`${prefix.toUpperCase()}%`]);
    await client.query("DELETE FROM units WHERE building = $1", [prefix.toUpperCase()]);
    await client.query("DELETE FROM users WHERE clerk_id LIKE $1", [`${prefix}-%`]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

suite("POST /api/residents/self real PostgreSQL occupancy boundary", () => {
  it("rejects a verified tenant at an owner-occupied unit without creating a tenant resident", async () => {
    const { unit, contender } = await seedOccupied("owner", "101");
    auth.clerkId = contender.clerkId;
    const response = await request(app).post("/api/residents/self");
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("OCCUPANCY_CONFLICT");
    const rows = await pool.query("SELECT id FROM residents WHERE unit_id = $1 AND type = 'tenant' AND status = 'active'", [unit.id]);
    expect(rows.rowCount).toBe(0);
  });

  it("rejects a verified owner at a tenant-occupied unit without creating an owner resident", async () => {
    const { unit, contender } = await seedOccupied("tenant", "102");
    auth.clerkId = contender.clerkId;
    const response = await request(app).post("/api/residents/self");
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("OCCUPANCY_CONFLICT");
    const rows = await pool.query("SELECT id FROM residents WHERE unit_id = $1 AND type = 'owner' AND status = 'active'", [unit.id]);
    expect(rows.rowCount).toBe(0);
  });

  it("rejects raw SQL contradictory tracks in both directions and permits a deferred repair", async () => {
    const { unit, contender } = await seedOccupied("owner", "103");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO residents (type, first_name, last_name, unit_number, unit_id, status) VALUES ('tenant','Bad','Track',$1,$2,'active')", [`${unit.building} ${unit.unitNumber}`, unit.id]);
      await expect(client.query("COMMIT")).rejects.toMatchObject({ code: "23514", constraint: "occupancy_track_consistency" });
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("UPDATE residents SET status = 'inactive' WHERE unit_id = $1 AND type = 'owner'", [unit.id]);
      await client.query("UPDATE units SET occupant_type = 'tenant_occupied', verified_tenant_id = $2 WHERE id = $1", [unit.id, contender.id]);
      await client.query("INSERT INTO residents (type, first_name, last_name, unit_number, unit_id, linked_user_id, status, is_primary) VALUES ('tenant','Good','Track',$1,$2,$3,'active',true)", [`${unit.building} ${unit.unitNumber}`, unit.id, contender.id]);
      await expect(client.query("COMMIT")).resolves.toBeDefined();

      await client.query("BEGIN");
      await client.query("UPDATE units SET occupant_type = 'owner_occupied' WHERE id = $1", [unit.id]);
      await expect(client.query("COMMIT")).rejects.toMatchObject({ code: "23514", constraint: "occupancy_track_consistency" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rejects occupied unit INSERTs without residents and a cross-unit opposing move", async () => {
    const client = await pool.connect();
    try {
      for (const track of ["owner_occupied", "tenant_occupied"]) {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO units (building, unit_number, occupant_type) VALUES ($1, $2, $3)",
          [prefix.toUpperCase(), `raw-${track}`, track],
        );
        await expect(client.query("COMMIT")).rejects.toMatchObject({
          code: "23514", constraint: "occupancy_track_consistency",
        });
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }

    const source = await seedOccupied("owner", "104");
    const destination = await seedOccupied("tenant", "105");
    const [resident] = await db.select().from(residentsTable)
      .where(eq(residentsTable.linkedUserId, source.contender.id));
    // source.contender is not the incumbent, so resolve the active source row.
    const rows = await pool.query<{ id: number }>(
      "SELECT id FROM residents WHERE unit_id = $1 AND type = 'owner' AND status = 'active'",
      [source.unit.id],
    );
    expect(resident).toBeUndefined();
    await expect(db.transaction((tx) =>
      updateResidentOccupancy(tx, rows.rows[0]!.id, { unitId: destination.unit.id })))
      .rejects.toMatchObject({ code: "OCCUPANCY_CONFLICT" });
    const unchanged = await pool.query("SELECT unit_id FROM residents WHERE id = $1", [rows.rows[0]!.id]);
    expect(unchanged.rows[0]?.unit_id).toBe(source.unit.id);
  });
});