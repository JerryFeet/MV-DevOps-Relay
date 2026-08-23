import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import { usersTable, residentsTable, householdInvitationsTable, permitsTable, unitsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { canonicalizePhone } from "../lib/phoneCanonical";

const router = Router();

function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "guard";
}

function optionalTrimmedName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type SyncDbClient = typeof db;

type SyncProvisioningInput = {
  clerkId: string;
  email: unknown;
  firstName: unknown;
  lastName: unknown;
};

/**
 * Atomically provision the app-user row for a signed-in Clerk identity.
 *
 * The unique clerk_id constraint is the concurrency boundary: every first
 * sign-in uses one INSERT … ON CONFLICT … DO UPDATE … RETURNING statement
 * instead of a read-then-insert race. The conflict action deliberately leaves
 * suspended rows untouched, then callers must evaluate the returned status
 * before they do any further work or return the user to the portal.
 */
export async function provisionUserForSync(
  dbClient: SyncDbClient,
  { clerkId, email, firstName, lastName }: SyncProvisioningInput,
) {
  const incomingEmail = typeof email === "string" ? email : "";
  const incomingFirstName = optionalTrimmedName(firstName);
  const incomingLastName = optionalTrimmedName(lastName);

  const [resolvedUser] = await dbClient
    .insert(usersTable)
    .values({
      clerkId,
      email: incomingEmail,
      firstName: incomingFirstName,
      lastName: incomingLastName,
      role: "tenant",
      status: "pending",
      verificationStatus: "unverified",
    })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      // A suspension is authoritative. The statement returns the existing
      // suspended row without changing its profile or status, so the caller
      // can fail closed after the atomic conflict resolution below.
      set: {
        email: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.email}
          ELSE excluded.email
        END`,
        firstName: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.firstName}
          WHEN NULLIF(BTRIM(${usersTable.firstName}), '') IS NULL THEN excluded.first_name
          ELSE ${usersTable.firstName}
        END`,
        lastName: sql`CASE
          WHEN ${usersTable.status} = 'suspended' THEN ${usersTable.lastName}
          WHEN NULLIF(BTRIM(${usersTable.lastName}), '') IS NULL THEN excluded.last_name
          ELSE ${usersTable.lastName}
        END`,
      },
    })
    .returning();

  if (!resolvedUser) {
    throw new Error("Unable to resolve user during profile synchronization");
  }

  // This check intentionally happens AFTER the upsert. Checking before it
  // would reintroduce a race where a concurrent first sync could insert or
  // overwrite a row between the read and the write.
  if (resolvedUser.status === "suspended") {
    return { user: resolvedUser, suspended: true as const };
  }

  return { user: resolvedUser, suspended: false as const };
}

/**
 * Consume a household invitation token (single-use).
 *
 * Security model:
 * - The caller must present the raw invitation TOKEN (from the invite URL);
 *   an email address alone is never sufficient.
 * - The invitation's invitedEmail must match one of the caller's VERIFIED
 *   email addresses as reported by Clerk (server-side lookup — the request
 *   body is not trusted for this check).
 * - Consumption + ALL linkage writes (invitation → accepted, resident link,
 *   user unit linkage) happen in ONE transaction that row-locks the
 *   invitation (`SELECT ... FOR UPDATE`). A concurrent revoke also locks the
 *   invitation row before acting, so either it waits for this transaction to
 *   commit (and then sees the accepted state + linked user to fully unlink),
 *   or it commits first (and this consume finds the row no longer pending
 *   and links nothing). No interleaving can leave a revoked invitation with
 *   a still-linked user.
 */
export async function consumeHouseholdInvitation(userId: number, clerkId: string, token: string | undefined | null) {
  if (!token || typeof token !== "string") return null;

  // Cheap pre-read (no lock) so obviously-invalid tokens skip the Clerk call.
  const [preview] = await db.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.token, token));
  if (!preview || preview.status !== "pending") return null;
  if (preview.expiresAt && new Date(preview.expiresAt) < new Date()) return null;

  // Server-side verified-email check against Clerk — never trust the body.
  // Done OUTSIDE the transaction so no row lock is held across a network call.
  let clerkEmails: string[] = [];
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    clerkEmails = (clerkUser.emailAddresses ?? [])
      .filter((e: { verification?: { status?: string } | null }) =>
        e.verification?.status === "verified")
      .map((e: { emailAddress: string }) => e.emailAddress.toLowerCase());
  } catch {
    return null;
  }
  if (!clerkEmails.includes(preview.invitedEmail.toLowerCase())) return null;

  return db.transaction(async (tx) => {
    // Staff accounts are deliberately not residents. Lock their row before
    // consuming the token so an invitation can never create a staff linkage.
    const [recipient] = await tx.select().from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    // This is deliberately checked while the recipient row is locked. A
    // suspension that lands after the initial provisioning upsert must not be
    // reversed by the invitation linkage's status:"active" update.
    if (!recipient || isStaffRole(recipient.role) || recipient.status === "suspended") return null;

    // Lock the invitation row; re-verify its state under the lock.
    const [invitation] = await tx.select().from(householdInvitationsTable)
      .where(eq(householdInvitationsTable.token, token))
      .for("update");
    if (!invitation || invitation.status !== "pending") return null;
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) return null;

    const consumed = await tx.update(householdInvitationsTable)
      .set({ status: "accepted", usedAt: new Date() })
      .where(and(
        eq(householdInvitationsTable.id, invitation.id),
        eq(householdInvitationsTable.status, "pending"),
      ))
      .returning();
    if (!consumed || consumed.length === 0) return null;

    if (invitation.residentId) {
      await tx.update(residentsTable)
        .set({ linkedUserId: userId, hasPortalAccess: true })
        .where(eq(residentsTable.id, invitation.residentId));
    }

    const linkage = {
      unitId: invitation.unitId,
      unitNumber: invitation.unitNumber,
      verificationStatus: "verified_household_member" as const,
      status: "active" as const,
    };
    // The user's unit linkage commits atomically with the invitation state.
    await tx.update(usersTable).set(linkage).where(eq(usersTable.id, userId));
    return linkage;
  });
}

router.get("/users/me", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.status === "suspended") {
    return res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
  }
  res.json(user);
});

router.put("/users/me", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const { firstName, middleName, lastName, phone, unitNumber } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (isStaffRole(existing.role) && unitNumber !== undefined && unitNumber !== null) {
    return res.status(403).json({ error: "STAFF_UNIT_LINKAGE_FORBIDDEN" });
  }

  const phoneResult = canonicalizePhone(phone);
  if (!phoneResult.ok) {
    return res.status(422).json({ error: phoneResult.error });
  }

  const [user] = await db
    .update(usersTable)
    .set({
      firstName,
      middleName,
      lastName,
      phone: phoneResult.e164 ?? undefined,
      phoneNormalized: phoneResult.e164 ?? undefined,
      unitNumber,
    })
    .where(eq(usersTable.clerkId, clerkId))
    .returning();
  res.json(user);
});

// ── PATCH /users/me/name — required profile-completion gate ──────────────────
router.patch("/users/me/name", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const firstName = optionalTrimmedName(req.body?.firstName);
  const lastName = optionalTrimmedName(req.body?.lastName);
  const middleName = optionalTrimmedName(req.body?.middleName);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "firstName and lastName are required" });
  }

  const [user] = await db.update(usersTable)
    .set({ firstName, middleName, lastName })
    .where(eq(usersTable.clerkId, clerkId))
    .returning();
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

router.post("/users/me/sync", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const { email, firstName, lastName, inviteToken } = req.body;
  const resolved = await provisionUserForSync(db, { clerkId, email, firstName, lastName });
  if (resolved.suspended) {
    res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
    return;
  }

  // Auto-link a pending household invitation, but never overwrite an existing
  // unit linkage or a stronger verification status. Concurrent sync calls may
  // both reach this branch; the invitation transaction serializes consumption.
  if (
    !isStaffRole(resolved.user.role)
    && !resolved.user.unitId
    && resolved.user.verificationStatus !== "verified_owner"
    && resolved.user.verificationStatus !== "verified_tenant"
  ) {
    await consumeHouseholdInvitation(resolved.user.id, clerkId, inviteToken);
  }

  // Re-read after invitation consumption so every concurrent caller receives
  // the canonical linked row rather than a stale pre-link snapshot.
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resolved.user.id));
  if (!user) {
    throw new Error("Resolved user disappeared after profile synchronization");
  }
  if (user.status === "suspended") {
    res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact the HOA." });
    return;
  }
  res.json(user);
});

router.get("/users", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { role, status, search, all } = req.query as Record<string, string>;

  const allRows = await db.select().from(usersTable);

  const searchLc = search?.toLowerCase().trim() ?? "";
  const filtered = allRows.filter(u =>
    (!role || u.role === role) &&
    (!status || u.status === status) &&
    (!searchLc || [u.firstName, u.lastName, u.email].some(f => f?.toLowerCase().includes(searchLc)))
  );

  // ?all=true — return every matching row as a flat array (no pagination cap).
  // Used by internal lookups (e.g. Waha Pass actor names) that need the full set.
  if (all === "true") {
    return res.json(filtered);
  }

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  res.json(paginatedResponse(paginated, total, page, limit));
});

router.get("/users/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.patch("/users/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { role, status, unitNumber } = req.body;
  if (role === "admin") {
    return res.status(403).json({
      error: "ADMIN_ROLE_RESTRICTED",
      message: "The Admin role cannot be assigned through the portal. Contact the system administrator directly.",
    });
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!target) return res.status(404).json({ error: "User not found" });
  const nextRole = role ?? target.role;
  if (isStaffRole(nextRole) && target.unitId !== null) {
    return res.status(422).json({
      error: "STAFF_UNIT_LINKAGE_FORBIDDEN",
      message: "An account linked to a unit cannot be assigned a staff role.",
    });
  }
  if (isStaffRole(nextRole) && unitNumber !== undefined && unitNumber !== null) {
    return res.status(422).json({ error: "STAFF_UNIT_LINKAGE_FORBIDDEN" });
  }
  const [user] = await db
    .update(usersTable)
    .set({ role, status, unitNumber: isStaffRole(nextRole) ? null : unitNumber })
    .where(eq(usersTable.id, Number(req.params.id)))
    .returning();
  res.json(user);
});

// ─── GET /gate/residents?name= — guard/admin: look up residents by name ──────
router.get("/gate/residents", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !["admin", "guard"].includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name } = req.query as Record<string, string>;
  if (!name?.trim() || name.trim().length < 2) return res.json([]);

  const nameLc = name.toLowerCase().trim();
  const allRows = await db.select().from(usersTable);
  const matched = allRows
    .filter(u =>
      ["owner", "tenant"].includes(u.role ?? "") &&
      [
        `${u.firstName ?? ""} ${u.lastName ?? ""}`,
        u.firstName ?? "",
        u.lastName ?? "",
      ].some(f => f.toLowerCase().includes(nameLc))
    )
    .slice(0, 20)
    .map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      unitNumber: u.unitNumber,
      role: u.role,
    }));

  res.json(matched);
});

// ─── GET /gate/move-out-status?unitNumber= — guard/admin permit check ─────────
router.get("/gate/move-out-status", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || !["admin", "guard"].includes(caller.role ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rawUnit = typeof req.query.unitNumber === "string" ? req.query.unitNumber : "";
  const unitKey = rawUnit.trim().toUpperCase().replace(/\s+/g, "");
  if (!unitKey) return res.status(400).json({ error: "unitNumber is required" });

  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitKey));
  const moveOutPermits = await db.select().from(permitsTable)
    .where(eq(permitsTable.type, "move_out"));
  const permit = moveOutPermits.find((candidate) => {
    const candidateKey = (candidate.unitNumber ?? "").trim().toUpperCase().replace(/\s+/g, "");
    return (unit ? candidate.unitId === unit.id : candidateKey === unitKey)
      && ["approved", "approved_with_conditions"].includes(candidate.status);
  });
  const [requester] = permit?.userId != null
    ? await db.select().from(usersTable).where(eq(usersTable.id, permit.userId))
    : [null];

  res.json({
    allowed: Boolean(permit),
    status: permit ? "APPROVED_MOVE_OUT_PERMIT" : "NO_APPROVED_MOVE_OUT_PERMIT",
    unitNumber: rawUnit.trim(),
    requestedStartDate: permit?.requestedStartDate ?? null,
    requestedEndDate: permit?.requestedEndDate ?? null,
    coveredPerson: requester ? [requester.firstName, requester.lastName].filter(Boolean).join(" ") || null : null,
  });
});

export default router;
