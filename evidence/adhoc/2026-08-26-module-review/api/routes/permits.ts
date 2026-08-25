import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import { usersTable, permitsTable } from "@workspace/db";
import { eq, and, desc, count, inArray, ne } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { APPROVER_ROLES } from "../lib/roles";
import { sendAdminAlert } from "../lib/email";
import { sendPushToUsers } from "../lib/pushNotifications";
import { enqueueNotification } from "../lib/notificationService";
import { EVT, permitDecisionKey } from "../lib/notificationWiring";
import { executeMoveOutPermitRelease } from "../lib/tenancyLifecycle";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** E.164 phone number regex: + followed by 7–15 digits */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Validate that a renovation scope value is one of the five allowed categories
 * or an array of them (stored as JSON). Returns an error string or null.
 */
const VALID_RENOVATION_SCOPES = new Set([
  "exterior_affecting",
  "major_plumbing_electrical",
  "structural_modifications",
  "major_interior_upgrades",
  "flooring",
]);

function validateRenovationScope(raw: unknown): { error: string } | { value: string } {
  if (!raw || (Array.isArray(raw) && raw.length === 0) || raw === "") {
    return { error: "renovationScope is required for renovation permits" };
  }
  let scopes: string[];
  if (Array.isArray(raw)) {
    scopes = raw;
  } else if (typeof raw === "string") {
    // Try to parse as JSON array; fall back to treating as single value
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        scopes = parsed;
      } else {
        scopes = [raw];
      }
    } catch {
      scopes = [raw];
    }
  } else {
    return { error: "renovationScope must be a non-empty array of scope categories" };
  }

  if (scopes.length === 0) {
    return { error: "renovationScope must include at least one category" };
  }
  for (const s of scopes) {
    if (!VALID_RENOVATION_SCOPES.has(s)) {
      return {
        error: `Invalid renovation scope: "${s}". Must be one of: ${[...VALID_RENOVATION_SCOPES].join(", ")}`,
      };
    }
  }
  // Store as JSON array string
  return { value: JSON.stringify(scopes) };
}

async function enrichPermits(permits: typeof permitsTable.$inferSelect[]) {
  if (!permits.length) return [];
  const userIds = [...new Set(
    permits.map((permit) => permit.userId).filter((id): id is number => id !== null),
  )];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  return permits.map((permit) => ({
    ...permit,
    requester: permit.userId === null ? null : userMap[permit.userId] ?? null,
  }));
}

// ── GET /permits ───────────────────────────────────────────────────────────────
router.get("/permits", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const { type, status } = req.query as Record<string, string>;
  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);

  // G1: additional_vehicle records are retained for history but never appear
  // in resident or admin active permit lists.
  const isApprover = APPROVER_ROLES.includes(caller.role);
  const where = and(
    isApprover ? undefined : eq(permitsTable.userId, caller.id),
    ne(permitsTable.type, "additional_vehicle"),
    type ? eq(permitsTable.type, type as any) : undefined,
    status ? eq(permitsTable.status, status as any) : undefined,
  );

  const [{ total }] = await db.select({ total: count() }).from(permitsTable).where(where);
  const permits = await db.select().from(permitsTable)
    .where(where)
    .orderBy(desc(permitsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(paginatedResponse(await enrichPermits(permits), Number(total), page, limit));
});

// ── POST /permits ──────────────────────────────────────────────────────────────
router.post("/permits", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.verificationStatus === "unverified") {
    return res.status(403).json({ error: "Unit verification required before submitting permits" });
  }

  const {
    permitType, description, requestedStartDate, requestedEndDate,
    moveType, movingCompanyName, movingCompanyContact, elevatorSlot,
    renovationScope, contractorName, contractorContact,
    workingHoursRequested, commonAreaImpact, commonAreaImpactDetails,
    vehicleMake, vehicleModel, vehiclePlate, vehicleColor,
  } = req.body;

  if (!permitType) return res.status(400).json({ error: "permitType is required" });

  // additional_vehicle is no longer an accepted submission type
  if (permitType === "additional_vehicle") {
    return res.status(400).json({ error: "Additional vehicle requests are no longer accepted via this endpoint." });
  }

  if (
    requestedStartDate &&
    requestedEndDate &&
    requestedEndDate < requestedStartDate
  ) {
    return res.status(400).json({ error: "End date cannot be earlier than start date" });
  }

  const isApprover = APPROVER_ROLES.includes(caller.role);

  if (permitType === "renovation" && !(caller.role === "owner" && caller.verificationStatus === "verified_owner") && caller.role !== "admin") {
    return res.status(403).json({ error: "Renovation permits require owner verification" });
  }

  // ── Renovation field validation ───────────────────────────────────────────
  if (permitType === "renovation") {
    // renovationScope: mandatory multi-select
    const scopeResult = validateRenovationScope(renovationScope);
    if ("error" in scopeResult) {
      return res.status(400).json({ error: scopeResult.error, field: "renovationScope" });
    }

    // contractorName: mandatory
    if (!contractorName || !String(contractorName).trim()) {
      return res.status(400).json({ error: "contractorName is required for renovation permits", field: "contractorName" });
    }

    // contractorContact: mandatory E.164
    if (!contractorContact || !String(contractorContact).trim()) {
      return res.status(400).json({ error: "contractorContact is required for renovation permits", field: "contractorContact" });
    }
    if (!E164_REGEX.test(String(contractorContact).trim())) {
      return res.status(400).json({
        error: "contractorContact must be a valid E.164 phone number (e.g. +966501234567)",
        field: "contractorContact",
      });
    }

    // workingHoursRequested: mandatory
    if (!workingHoursRequested || !String(workingHoursRequested).trim()) {
      return res.status(400).json({ error: "workingHoursRequested is required for renovation permits", field: "workingHoursRequested" });
    }

    // description: mandatory for renovation
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: "description is required for renovation permits", field: "description" });
    }

    // requestedStartDate: mandatory
    if (!requestedStartDate) {
      return res.status(400).json({ error: "requestedStartDate is required for renovation permits", field: "requestedStartDate" });
    }

    // requestedEndDate: mandatory
    if (!requestedEndDate) {
      return res.status(400).json({ error: "requestedEndDate is required for renovation permits", field: "requestedEndDate" });
    }

    if (typeof commonAreaImpact !== "boolean") {
      return res.status(400).json({ error: "Please state whether the work affects a common area", field: "commonAreaImpact" });
    }
    if (commonAreaImpact && (!commonAreaImpactDetails || !String(commonAreaImpactDetails).trim())) {
      return res.status(400).json({ error: "commonAreaImpactDetails is required when common-area impact is selected", field: "commonAreaImpactDetails" });
    }
  }

  // Duplicate guard
  if (!APPROVER_ROLES.includes(caller.role)) {
    const TERMINAL_STATUSES = new Set(["rejected", "completed", "deposit_refunded", "deposit_forfeited"]);
    const existingPermits = await db
      .select()
      .from(permitsTable)
      .where(and(eq(permitsTable.userId, caller.id), eq(permitsTable.type, permitType)));
    const duplicate = existingPermits.find(
      p =>
        p.requestedStartDate === requestedStartDate &&
        p.requestedEndDate === requestedEndDate &&
        !TERMINAL_STATUSES.has(p.status),
    );
    if (duplicate) {
      return res.status(409).json({ error: "A permit of this type for the same date range is already pending" });
    }
  }

  // Resolve renovationScope to its stored JSON form for renovation permits
  let resolvedRenovationScope: string | undefined;
  if (permitType === "renovation") {
    const scopeResult = validateRenovationScope(renovationScope);
    if ("error" in scopeResult) {
      return res.status(400).json({ error: scopeResult.error, field: "renovationScope" });
    }
    resolvedRenovationScope = scopeResult.value;
  }

  const [permit] = await db.insert(permitsTable).values({
    userId: caller.id,
    unitId: caller.unitId ?? undefined,
    unitNumber: caller.unitNumber ?? undefined,
    type: permitType,
    description: description ?? "",
    requestedStartDate,
    requestedEndDate,
    status: "submitted",
    moveType,
    movingCompanyName,
    movingCompanyContact,
    elevatorSlot,
    renovationScope: resolvedRenovationScope,
    contractorName,
    // contractorLicense intentionally omitted — not collected on new submissions
    contractorContact,
    workingHoursRequested,
    commonAreaImpact: commonAreaImpact ?? false,
    commonAreaImpactDetails,
    vehicleMake,
    vehicleModel,
    vehiclePlate,
    vehicleColor,
    // Payment fields are not set on submission — fees are managed externally
  }).returning();

  const [enriched] = await enrichPermits([permit]);

  const PERMIT_TYPE_LABELS: Record<string, string> = {
    move_in: "Move-In Permit",
    move_out: "Move-Out Permit",
    renovation: "Renovation Permit",
  };
  const residentName = `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email;
  const unitLabel = permit.unitNumber ? ` — Unit ${permit.unitNumber}` : "";
  const typeLabel = PERMIT_TYPE_LABELS[permitType] ?? permitType;
  if (!isApprover) {
    sendAdminAlert(
      `[Action Required] New ${typeLabel}${unitLabel}`,
      `<h2>New ${typeLabel} Submitted</h2>
       <p><strong>Resident:</strong> ${residentName}</p>
       <p><strong>Unit:</strong> ${permit.unitNumber ?? "—"}</p>
       <p><strong>Start date:</strong> ${permit.requestedStartDate ?? "—"}</p>
       <p><strong>End date:</strong> ${permit.requestedEndDate ?? "—"}</p>
       <p><strong>Description:</strong> ${permit.description || "—"}</p>`,
    ).catch(() => {});
  }

  res.status(201).json(enriched);
});

// ── GET /permits/:id ───────────────────────────────────────────────────────────
router.get("/permits/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [permit] = await db.select().from(permitsTable).where(eq(permitsTable.id, Number(req.params.id)));
  if (!permit) return res.status(404).json({ error: "Not found" });
  if (!APPROVER_ROLES.includes(caller.role) && permit.userId !== caller.id) return res.status(404).json({ error: "Not found" });
  const [enriched] = await enrichPermits([permit]);
  res.json(enriched);
});

/**
 * Allowed permit status transitions. Any target status not listed for a given
 * source status is rejected with 409. Statuses absent from this map (or mapped
 * to an empty array) are fully terminal — no further transitions are permitted.
 *
 * deposit_refunded / deposit_forfeited are kept as terminal states so historical
 * permits are not broken, but they are no longer reachable from completed.
 * The `completed` state is now itself terminal for new permits.
 */
const PERMIT_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted:                ["under_review", "rejected"],
  under_review:             ["approved", "approved_with_conditions", "rejected"],
  approved:                 ["in_progress", "completed"],
  approved_with_conditions: ["in_progress", "completed"],
  in_progress:              ["completed"],
  completed:                [],
  rejected:                 [],
  deposit_refunded:         [],
  deposit_forfeited:        [],
  draft:                    [],
};

// ── PATCH /permits/:id/status ─────────────────────────────────────────────────
router.patch("/permits/:id/status", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(404).json({ error: "Not found" });

  const [existing] = await db.select().from(permitsTable).where(eq(permitsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { status, reviewNote, conditions } = req.body;

  const VALID_PERMIT_STATUSES = new Set(Object.keys(PERMIT_ALLOWED_TRANSITIONS));
  if (status !== undefined && !VALID_PERMIT_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid permit status: "${status}". Must be one of: ${[...VALID_PERMIT_STATUSES].join(", ")}` });
  }

  if (status) {
    const allowed = PERMIT_ALLOWED_TRANSITIONS[existing.status] ?? [];
    if (allowed.length === 0) {
      return res.status(409).json({ error: `Permit is already in a terminal state: ${existing.status}` });
    }
    if (!allowed.includes(status)) {
      return res.status(409).json({ error: `Invalid transition: ${existing.status} → ${status}` });
    }
    if (status === "approved_with_conditions") {
      const effectiveConditions = (conditions !== undefined && conditions !== null)
        ? String(conditions).trim()
        : String(existing.conditions ?? "").trim();
      if (!effectiveConditions) {
        return res.status(400).json({ error: "conditions is required when status is approved_with_conditions" });
      }
    }
  }

  const CONDITIONS_ONLY_STATUS = "approved_with_conditions";
  if (conditions !== undefined && conditions !== null && conditions !== "") {
    const resolvedStatus = status ?? existing.status;
    if (resolvedStatus !== CONDITIONS_ONLY_STATUS) {
      return res.status(400).json({
        error: `conditions can only be set when status is "${CONDITIONS_ONLY_STATUS}"`,
      });
    }
  }

  const CONDITIONS_LOCKED_STATUSES = new Set([
    "in_progress", "completed", "deposit_refunded", "deposit_forfeited",
  ]);
  if (conditions === null && existing.conditions) {
    const resolvedStatus = status ?? existing.status;
    if (CONDITIONS_LOCKED_STATUSES.has(resolvedStatus)) {
      return res.status(400).json({
        error: `conditions cannot be cleared once the permit is ${resolvedStatus}`,
      });
    }
  }

  const [permit] = await db
    .update(permitsTable)
    .set({
      ...(status && { status }),
      ...(reviewNote !== undefined && { reviewNote }),
      ...(conditions !== undefined && conditions !== "" && { conditions }),
      reviewedById: caller.id,
    })
    // The earlier read validates the requested transition; this expected-state
    // predicate is what prevents a second administrator from winning the same
    // decision after that read.
    .where(and(
      eq(permitsTable.id, Number(req.params.id)),
      eq(permitsTable.status, existing.status),
    ))
    .returning();

  if (!permit) return res.status(409).json({ error: "Permit was changed by another administrator. Refresh and try again." });
  const [enriched] = await enrichPermits([permit]);

  if (status) {
    const PERMIT_PUSH_LABELS: Record<string, { title: string; body: (type: string, note?: string | null) => string }> = {
      approved:                 { title: "✅ Permit Approved",                   body: (t, n) => `Your ${t} has been approved.${n ? ` Note: ${n}` : ""}` },
      approved_with_conditions: { title: "✅ Permit Approved (with Conditions)",  body: (t, n) => `Your ${t} has been approved with conditions.${n ? ` ${n}` : ""}` },
      rejected:                 { title: "❌ Permit Rejected",                   body: (t, n) => `Your ${t} has been rejected.${n ? ` Reason: ${n}` : ""}` },
      in_progress:              { title: "🔨 Permit Work Started",               body: (t)    => `Your ${t} is now in progress.` },
      completed:                { title: "✅ Permit Completed",                  body: (t)    => `Your ${t} has been completed.` },
    };
    const pushDef = PERMIT_PUSH_LABELS[status];
    if (pushDef && permit.userId !== null) {
      const PERMIT_TYPE_LABELS: Record<string, string> = {
        move_in: "Move-In Permit", move_out: "Move-Out Permit",
        renovation: "Renovation Permit",
      };
      const typeLabel = PERMIT_TYPE_LABELS[permit.type] ?? permit.type;
      sendPushToUsers([permit.userId], {
        title: pushDef.title,
        body: pushDef.body(typeLabel, reviewNote ?? null),
        data: { screen: "permits", id: permit.id },
      }, "bookings").catch(() => {});

      // Row 2 — permit_decision (approved / rejected / completed status changes)
      const DECISION_STATUSES = new Set(["approved", "approved_with_conditions", "rejected", "completed"]);
      if (DECISION_STATUSES.has(status)) {
        enqueueNotification({
          eventType: EVT.PERMIT_DECISION,
          idempotencyKey: permitDecisionKey(permit.id, status),
          recipientUserId: permit.userId,
          channel: "push",
          payload: {
            title: pushDef.title,
            body: pushDef.body(typeLabel, reviewNote ?? null),
            data: { screen: "permits", id: permit.id },
          },
          preferencePolicy: "decision",
        }).catch(() => {});
      }
    }
  }

  // T13: an approved move-out is a lifecycle trigger, never a second cascade.
  // The shared release engine owns revocation, future-booking cancellation,
  // linkage removal, and identity deletion queueing.
  if (status === "completed" && permit.type === "move_out" && permit.userId !== null) {
    try {
      await executeMoveOutPermitRelease(permit.userId, caller.id, permit.id);
    } catch (error) {
      return res.status(409).json({
        error: error instanceof Error
          ? error.message
          : "The move-out permit could not complete the tenancy release.",
      });
    }
  }

  res.json(enriched);
});

export default router;
