import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { db } from "@workspace/db";
import {
  usersTable, unitsTable, unitVerificationsTable,
  residentsTable, parkingLotsTable, dataMigrationCorrectionsTable, vehiclesTable, unitMasterDataAuditTable,
  unitVerificationOwnerIdAttemptsTable, unitVerificationDocumentCleanupRetriesTable,
} from "@workspace/db";
import { eq, and, inArray, ne, lt, isNotNull, isNull, count, sql, desc } from "drizzle-orm";
import { sendAdminAlert } from "../lib/email";
import { ObjectStorageService } from "../lib/objectStorage";
import { canonicalizePhone } from "../lib/phoneCanonical";
import { enqueueBothNotificationChannels } from "../lib/notificationProducer";
import {
  EVT,
  unitVerificationDecisionKey,
  tenancyRequestSubmittedKey,
  tenancyRequestApprovedKey,
  tenancyRequestDecisionKey,
} from "../lib/notificationWiring";
import { ensureTenancyLifecycle } from "../lib/tenancyLifecycle";
import { VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE } from "../lib/advisoryLockNamespaces";
import { createHouseholdResident, loadLockedOccupancy, OccupancyError, setApprovedUnitOccupancy, updateResidentOccupancy } from "../lib/occupancy";

const titleDeedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard limit
  fileFilter(_req, file, cb) {
    const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG`));
  },
});

const router = Router();
const objectStorageService = new ObjectStorageService();
const OWNER_ID_CHECK_LIMIT = 5;
const OWNER_ID_CHECK_WINDOW_MS = 60_000;
const OWNER_ID_ATTEMPT_RETENTION_MS = OWNER_ID_CHECK_WINDOW_MS * 5;
const OWNER_ID_ATTEMPT_PURGE_INTERVAL_MS = OWNER_ID_CHECK_WINDOW_MS;
const SYSTEM_COMMON_UNIT_KEY = "HOACOMMON";
let lastOwnerIdAttemptPurgeAt = 0;

class ApprovalHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function normaliseUnitPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
}

/**
 * Validates a parkingLots API input array.
 * Each entry must be an object with nonblank building, nonblank lotNumber, and boolean isInside.
 * Returns an error message string if invalid, or null if valid (or if lots is absent/empty).
 */
function validateParkingLotsInput(parkingLots: unknown): string | null {
  if (parkingLots === undefined || parkingLots === null) return null;
  if (!Array.isArray(parkingLots)) return "parkingLots must be an array";
  for (let i = 0; i < parkingLots.length; i++) {
    const lot = parkingLots[i];
    if (!lot || typeof lot !== "object" || Array.isArray(lot)) {
      return `parkingLots[${i}] must be an object`;
    }
    const l = lot as Record<string, unknown>;
    if (typeof l.building !== "string" || l.building.trim() === "") {
      return `parkingLots[${i}].building must be a nonblank string`;
    }
    if (typeof l.lotNumber !== "string" || l.lotNumber.trim() === "") {
      return `parkingLots[${i}].lotNumber must be a nonblank string`;
    }
    if (typeof l.isInside !== "boolean") {
      return `parkingLots[${i}].isInside must be a boolean`;
    }
  }
  return null;
}

function normaliseUnitInput(building: unknown, unitNumber: unknown): { building: string; unitNumber: string; key: string } {
  const normalisedBuilding = normaliseUnitPart(building);
  const normalisedUnitNumber = normaliseUnitPart(unitNumber);
  return {
    building: normalisedBuilding,
    unitNumber: normalisedUnitNumber,
    key: `${normalisedBuilding}${normalisedUnitNumber}`,
  };
}

function isValidPastDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value < new Date().toISOString().slice(0, 10);
}

function isReservedSystemUnit(parts: { key: string }): boolean {
  return parts.key === SYSTEM_COMMON_UNIT_KEY;
}

function isStaffRole(role: string | null): boolean {
  return role === "admin" || role === "guard";
}

/** SG12 is intentionally a record-only, two-value field. */
function isValidGender(value: unknown): value is "male" | "female" {
  return value === "male" || value === "female";
}

const OWNER_MANUAL_APPROVAL_BASES = [
  "mullak_verified",
  "title_deed_reviewed",
  "known_to_board",
  "other",
] as const;
const TENANT_REQUEST_APPROVAL_BASES = [
  "ejar_contract_verified",
  "tenant_known_to_me",
  "other",
] as const;

/**
 * SG11 approval bases are validated at the application boundary only until the
 * verification-record schema is extended. Do not persist these values yet.
 */
function validateApprovalBases(type: string, body: unknown): string | null {
  const payload = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const bases = payload.approvalBases;
  const allowed = type === "owner_manual"
    ? OWNER_MANUAL_APPROVAL_BASES
    : type === "tenant_request"
      ? TENANT_REQUEST_APPROVAL_BASES
      : null;

  if (!allowed) return "This verification type cannot be approved.";
  if (!Array.isArray(bases) || bases.length === 0 || bases.some((basis) => typeof basis !== "string")) {
    return "At least one approval basis is required.";
  }
  if (bases.some((basis) => !(allowed as readonly string[]).includes(basis))) {
    return "One or more approval bases are not valid for this verification type.";
  }
  if (bases.includes("other") && (typeof payload.otherText !== "string" || !payload.otherText.trim())) {
    return "Please provide a nonblank description for the Other approval basis.";
  }
  return null;
}

function saudiCalendarDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isValidPrivateDocumentKey(value: unknown, namespace: "title-deeds" | "ejar"): value is string {
  return typeof value === "string" && value.startsWith(`/objects/${namespace}/`);
}

function documentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Consumes a T7 attempt in a transaction. The existing-row path uses a row lock;
 * the absent-row path relies on the composite primary key then re-reads the
 * winner, preventing parallel requests from bypassing the limit.
 */
export async function consumeOwnerIdCheckAttempt(userId: number, unitKey: string): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();
    let [attempt] = await tx.select().from(unitVerificationOwnerIdAttemptsTable)
      .where(and(
        eq(unitVerificationOwnerIdAttemptsTable.userId, userId),
        eq(unitVerificationOwnerIdAttemptsTable.unitKey, unitKey),
      ))
      .for("update");

    if (!attempt) {
      const inserted = await tx.insert(unitVerificationOwnerIdAttemptsTable).values({
        userId,
        unitKey,
        windowStartedAt: now,
        attemptCount: 1,
      }).onConflictDoNothing({
        target: [
          unitVerificationOwnerIdAttemptsTable.userId,
          unitVerificationOwnerIdAttemptsTable.unitKey,
        ],
        where: isNotNull(unitVerificationOwnerIdAttemptsTable.userId),
      }).returning();
      if (inserted[0]) return 1;
      [attempt] = await tx.select().from(unitVerificationOwnerIdAttemptsTable)
        .where(and(
          eq(unitVerificationOwnerIdAttemptsTable.userId, userId),
          eq(unitVerificationOwnerIdAttemptsTable.unitKey, unitKey),
        ))
        .for("update");
    }

    if (!attempt || attempt.windowStartedAt.getTime() <= now.getTime() - OWNER_ID_CHECK_WINDOW_MS) {
      await tx.update(unitVerificationOwnerIdAttemptsTable).set({
        windowStartedAt: now,
        attemptCount: 1,
      }).where(and(
        eq(unitVerificationOwnerIdAttemptsTable.userId, userId),
        eq(unitVerificationOwnerIdAttemptsTable.unitKey, unitKey),
      ));
      return 1;
    }

    const count = attempt.attemptCount + 1;
    await tx.update(unitVerificationOwnerIdAttemptsTable).set({ attemptCount: count })
      .where(and(
        eq(unitVerificationOwnerIdAttemptsTable.userId, userId),
        eq(unitVerificationOwnerIdAttemptsTable.unitKey, unitKey),
      ));
    return count;
  });
}

/**
 * Keep the fixed-window rate-limit table bounded. This is deliberately
 * best-effort: an unavailable cleanup must never weaken request throttling.
 */
export function purgeExpiredOwnerIdAttempts(now = Date.now()): void {
  if (now - lastOwnerIdAttemptPurgeAt < OWNER_ID_ATTEMPT_PURGE_INTERVAL_MS) return;
  lastOwnerIdAttemptPurgeAt = now;
  db.delete(unitVerificationOwnerIdAttemptsTable)
    .where(lt(
      unitVerificationOwnerIdAttemptsTable.windowStartedAt,
      new Date(now - OWNER_ID_ATTEMPT_RETENTION_MS),
    ))
    .catch(() => {});
}

async function queueOrCompleteDocumentCleanup(
  verificationId: number,
  kind: "title_deed" | "ejar",
  objectKey: string | null,
): Promise<void> {
  if (!objectKey) return;
  const keyColumn = kind === "title_deed" ? "titleDeedKey" : "ejarDocumentKey";
  const deletedColumn = kind === "title_deed" ? "titleDeedDeletedAt" : "ejarDeletedAt";
  try {
    const strictStorage = objectStorageService as ObjectStorageService & {
      deleteObjectEntityStrict?: (path: string) => Promise<void>;
    };
    if (strictStorage.deleteObjectEntityStrict) {
      await strictStorage.deleteObjectEntityStrict(objectKey);
    } else {
      // Legacy test doubles and existing consumers only expose the non-fatal method.
      await objectStorageService.deleteObjectEntity(objectKey);
    }
    await db.update(unitVerificationsTable).set({
      [keyColumn]: null,
      [deletedColumn]: new Date(),
    }).where(eq(unitVerificationsTable.id, verificationId));
  } catch (error) {
    await db.insert(unitVerificationDocumentCleanupRetriesTable).values({
      verificationId,
      documentKind: kind,
      objectKey,
      attempts: 1,
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Document delete failed",
    }).onConflictDoNothing({
      target: [
        unitVerificationDocumentCleanupRetriesTable.verificationId,
        unitVerificationDocumentCleanupRetriesTable.documentKind,
      ],
    });
  }
}

async function disposeVerificationDocuments(
  verification: typeof unitVerificationsTable.$inferSelect,
  decision: "approved" | "rejected" | "cancelled",
  decidedById: number,
): Promise<void> {
  await db.update(unitVerificationsTable).set({
    documentDecision: decision,
    documentDecidedById: decidedById,
    documentDecidedAt: new Date(),
  }).where(eq(unitVerificationsTable.id, verification.id));
  await Promise.all([
    queueOrCompleteDocumentCleanup(verification.id, "title_deed", verification.titleDeedKey),
    queueOrCompleteDocumentCleanup(verification.id, "ejar", verification.ejarDocumentKey),
  ]);
}

type UnitQueryExecutor = Pick<typeof db, "select" | "insert">;

async function getOrCreateUnitInTransaction(
  database: UnitQueryExecutor,
  parts: { building: string; unitNumber: string; key: string },
  unitType?: string | null,
  sizeSqm?: string | null,
  titleReference?: string | null,
) {
  const [existing] = await database.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, parts.key));
  if (existing) return existing;

  const [created] = await database.insert(unitsTable).values({
    building: parts.building,
    unitNumber: parts.unitNumber,
    unitType: unitType ?? undefined,
    sizeSqm: sizeSqm ?? undefined,
    titleReference: titleReference ?? undefined,
  }).onConflictDoNothing({ target: unitsTable.normalisedUnitNumber }).returning();
  if (created) return created;

  // READ COMMITTED gives the losing transaction a fresh snapshot on this
  // statement. This bounded retry handles a concurrent winner that committed
  // after the insert statement but before the first re-read.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 10 : 25));
    const [winner] = await database.select().from(unitsTable)
      .where(eq(unitsTable.normalisedUnitNumber, parts.key));
    if (winner) return winner;
  }

  throw new Error("UNIT_CLAIM_CONFLICT_RETRY_EXHAUSTED");
}

async function getOrCreateUnit(
  database: typeof db,
  parts: { building: string; unitNumber: string; key: string },
  unitType?: string | null,
  sizeSqm?: string | null,
  titleReference?: string | null,
) {
  return database.transaction((tx) =>
    getOrCreateUnitInTransaction(tx, parts, unitType, sizeSqm, titleReference),
  );
}

const ACTIVE_CLAIM_CONFLICT = {
  error: "You already have an active unit verification request. Please wait for it to be completed before submitting another request.",
  errorAr: "لديك بالفعل طلب تحقق نشط للوحدة. يُرجى انتظار اكتماله قبل تقديم طلب آخر.",
} as const;

/**
 * Strip ownerNationalId from a unit object before returning to non-admin callers.
 * B9: ownerNationalId must never be exposed to tenant responses.
 */
function stripOwnerNationalId<T extends Record<string, unknown>>(unit: T): Omit<T, "ownerNationalId"> {
  const { ownerNationalId: _omit, ...rest } = unit;
  return rest as Omit<T, "ownerNationalId">;
}

// ── GET /units — admin: all units; resident: their own unit ──────────────────
router.get("/units", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  if (caller.role === "admin") {
    const units = await db.select().from(unitsTable).where(eq(unitsTable.isSystem, false));
    return res.json(units);
  }

  if (!caller.unitId) {
    return res.json(null);
  }
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, caller.unitId));
  res.json(unit ? stripOwnerNationalId(unit) : null);
});

// ── POST /units — admin only: create a unit ──────────────────────────────────
router.post("/units", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { building, unitNumber, floor, unitType, sizeSqm, titleReference } = req.body;
  const [unit] = await db.insert(unitsTable).values({
    building, unitNumber, floor, unitType, sizeSqm, titleReference,
  }).returning();
  res.status(201).json(unit);
});

// ── GET /units/:id ───────────────────────────────────────────────────────────
router.get("/units/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, Number(req.params.id)));
  if (!unit) return res.status(404).json({ error: "Not found" });
  if (unit.isSystem) return res.status(404).json({ error: "Not found" });

  // Residents can only view their own unit
  if (caller.role !== "admin" && caller.unitId !== unit.id) return res.status(403).json({ error: "Forbidden" });
  // Never expose ownerNationalId to non-admin callers (B9)
  res.json(caller.role === "admin" ? unit : stripOwnerNationalId(unit));
});

// ── PATCH /units/:id ─────────────────────────────────────────────────────────
router.patch("/units/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, Number(req.params.id)));
  if (!unit) return res.status(404).json({ error: "Not found" });
  if (unit.isSystem) return res.status(403).json({ error: "System units cannot be edited." });
  const occupancyField = Object.keys(req.body ?? {}).find((key) => [
    "occupantType", "verifiedOwnerId", "verifiedTenantId", "preApprovedClaimId", "isSystem",
  ].includes(key));
  if (occupancyField) {
    return res.status(400).json({ error: `OCCUPANCY_FIELD_DIRECT_EDIT_FORBIDDEN: ${occupancyField}` });
  }

  // Residents can only edit their own unit's non-registry fields
  if (caller.role !== "admin" && caller.unitId !== unit.id) return res.status(403).json({ error: "Forbidden" });

  const { emergencyContact, emergencyPhone, preferredContact, mailingAddress, notes,
          building, unitNumber } = req.body;
  if (caller.role === "admin") {
    const prohibited = Object.keys(req.body ?? {}).find((key) => !["building", "unitNumber"].includes(key));
    if (prohibited) return res.status(403).json({ error: `UNIT_MASTER_FIELD_NOT_EDITABLE: ${prohibited}` });
  }

  // Canonicalize emergencyPhone (optional)
  let canonicalEmergencyPhone: string | null | undefined = emergencyPhone;
  if (emergencyPhone !== undefined) {
    const epResult = canonicalizePhone(emergencyPhone);
    if (!epResult.ok) {
      return res.status(422).json({ error: epResult.error });
    }
    canonicalEmergencyPhone = epResult.e164;
  }

  const updateData: Record<string, unknown> = caller.role === "admin" ? {} : {
    emergencyContact,
    emergencyPhone: emergencyPhone !== undefined ? (canonicalEmergencyPhone ?? undefined) : undefined,
    preferredContact,
    mailingAddress,
    notes,
  };
  if (caller.role !== "admin") {
    const [updated] = await db.update(unitsTable).set(updateData).where(eq(unitsTable.id, unit.id)).returning();
    return res.json(updated);
  }
  const requestedBuilding = building === undefined ? undefined : normaliseUnitPart(building);
  const requestedUnitNumber = unitNumber === undefined ? undefined : normaliseUnitPart(unitNumber);
  if ((requestedBuilding !== undefined && !requestedBuilding) || (requestedUnitNumber !== undefined && !requestedUnitNumber)) {
    return res.status(400).json({ error: "building and unitNumber must be nonblank strings" });
  }
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE}, ${unit.id})`);
      const [lockedUnit] = await tx.select().from(unitsTable).where(eq(unitsTable.id, unit.id));
      if (!lockedUnit || lockedUnit.isSystem) throw new Error("UNIT_NOT_FOUND_AFTER_LOCK");
      // Omitted values deliberately come from the locked row, not the
      // pre-lock authorization read, so a concurrent correction cannot be
      // silently overwritten with stale master data.
      const nextBuilding = requestedBuilding ?? lockedUnit.building;
      const nextUnitNumber = requestedUnitNumber ?? lockedUnit.unitNumber;
      const [result] = await tx.update(unitsTable).set({
        ...updateData, building: nextBuilding, unitNumber: nextUnitNumber,
      }).where(eq(unitsTable.id, unit.id)).returning();
      if (!result) throw new Error("UNIT_NOT_FOUND_AFTER_LOCK");
      for (const field of ["building", "unitNumber"] as const) {
        if (result[field] !== lockedUnit[field]) await tx.insert(unitMasterDataAuditTable).values({
          unitId: unit.id, actorUserId: caller.id, action: "unit_reference_corrected", field,
          oldValue: lockedUnit[field], newValue: result[field],
        });
      }
      return result;
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "UNIT_REFERENCE_ALREADY_EXISTS" });
    req.log.warn({ err: error, unitId: unit.id }, "Unit reference correction failed");
    return res.status(500).json({
      error: "UNIT_CORRECTION_FAILED",
      message: "The unit correction could not be completed. Please try again or contact support.",
    });
  }
});

router.get("/units/:unitId/history", requireApiAuth, async (req, res) => {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.auth().userId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const unitId = Number(req.params.unitId);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!unit || unit.isSystem) return res.status(404).json({ error: "Not found" });
  res.json(await db.select().from(unitMasterDataAuditTable)
    .where(eq(unitMasterDataAuditTable.unitId, unitId)).orderBy(desc(unitMasterDataAuditTable.createdAt)));
});

// ── Private tenancy-document uploads — server-side, 10 MB, PDF/JPG/PNG ────────
function tenancyDocumentUploadRoute(kind: "title_deed" | "ejar") {
  const endpoint = kind === "title_deed" ? "/unit-verify/title-deed-upload" : "/unit-verify/ejar-upload";
  router.post(
    endpoint,
  requireApiAuth,
  (req, res, next) => {
    titleDeedUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File exceeds the 10 MB limit." });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    const clerkId = req.auth().userId!;
    const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
    if (!caller) return res.status(403).json({ error: "Forbidden" });

    if (!req.file) return res.status(400).json({ error: "No file provided." });

     const objectPath = kind === "title_deed"
       ? await objectStorageService.storeTitleDeed(req.file.buffer, req.file.mimetype)
       : await objectStorageService.storeEjarDocument(req.file.buffer, req.file.mimetype);
     res.json({
       objectPath,
       originalFilename: req.file.originalname,
       contentHash: documentHash(req.file.buffer),
     });
  },
  );
}

tenancyDocumentUploadRoute("title_deed");
tenancyDocumentUploadRoute("ejar");

// ── POST /unit-verify/check-owner — T7 non-disclosing owner-ID match ─────────
router.post("/unit-verify/check-owner", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  if (isStaffRole(caller.role)) {
    return res.status(403).json({ error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });
  }

  const { building, unitNumber, ownerNationalId } = req.body;
  const unitParts = normaliseUnitInput(building, unitNumber);
  if (!unitParts.building || !unitParts.unitNumber || typeof ownerNationalId !== "string" || !ownerNationalId.trim()) {
    return res.status(400).json({ error: "building, unitNumber, and ownerNationalId are required" });
  }
  if (isReservedSystemUnit(unitParts)) return res.json({ match: false });

  purgeExpiredOwnerIdAttempts();
  const count = await consumeOwnerIdCheckAttempt(caller.id, unitParts.key);
  if (count > OWNER_ID_CHECK_LIMIT) {
    return res.status(429).json({ error: "Too many owner-ID checks. Please wait one minute before trying again." });
  }

  // Matching is deliberately a boolean only. A missing unit, missing owner, and
  // mismatched ID all resolve to the same response to avoid an existence oracle.
  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitParts.key));
  const match = Boolean(
    unit?.verifiedOwnerId
    && unit.ownerNationalId
    && unit.ownerNationalId.trim() === ownerNationalId.trim(),
  );
  res.json({ match });
});

// ── POST /unit-verify/owner — Step 2A: owner tries to auto-match ─────────────
router.post("/unit-verify/owner", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [authenticatedCaller] = await db.select().from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (!authenticatedCaller) return res.status(403).json({ error: "Forbidden" });
  if (isStaffRole(authenticatedCaller.role)) {
    return res.status(403).json({ error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });
  }
  const {
    building, unitNumber, nationalId,
    firstName, middleName, lastName, mobile, gender,
    parkingLots, titleDeedKey, titleDeedOriginalFilename, titleDeedContentHash,
  } = req.body;
  const unitParts = normaliseUnitInput(building, unitNumber);
  if (!unitParts.building || !unitParts.unitNumber || !nationalId) {
    return res.status(400).json({ error: "building, unitNumber, nationalId are required" });
  }
  if (!isValidGender(gender)) {
    return res.status(400).json({ error: "gender is required and must be either male or female" });
  }
  if (isReservedSystemUnit(unitParts)) {
    return res.status(403).json({ error: "SYSTEM_UNIT_RESERVED" });
  }
  // B2: title deed is mandatory for owner verification
  if (!isValidPrivateDocumentKey(titleDeedKey, "title-deeds")) {
    return res.status(400).json({ error: "titleDeedKey is required and must reference a valid uploaded title deed." });
  }
  // B3: mobile is mandatory for owner verification
  if (typeof mobile !== "string" || !mobile.trim()) {
    return res.status(400).json({ error: "mobile is required" });
  }

  // Canonicalize mobile (mandatory)
  const ownerMobileResult = canonicalizePhone(mobile);
  if (!ownerMobileResult.ok) {
    return res.status(422).json({ error: ownerMobileResult.error });
  }
  const canonicalOwnerMobile = ownerMobileResult.e164;

  // Validate parking lots structure: must be absent, or array of {building, lotNumber, isInside}
  const parkingLotsError = validateParkingLotsInput(parkingLots);
  if (parkingLotsError) {
    return res.status(400).json({ error: parkingLotsError });
  }

  let outcome:
    | { kind: "forbidden" }
    | { kind: "staff_forbidden" }
    | { kind: "conflict" }
    | { kind: "unit_has_owner"; unit: Record<string, unknown> }
    | {
      kind: "pending";
      caller: { firstName: string | null; lastName: string | null; email: string };
      unit: Record<string, unknown>;
      verificationId: number;
    };

  try {
    outcome = await db.transaction(async (tx) => {
      // The claimant row serializes all of this user's claim submissions.
      // The active-claim check and verification insert must remain in this same
      // transaction; a pre-insert read outside the lock would race under load.
      const [caller] = await tx.select().from(usersTable)
        .where(eq(usersTable.clerkId, clerkId))
        .for("update");
      if (!caller) return { kind: "forbidden" as const };
      if (isStaffRole(caller.role)) return { kind: "staff_forbidden" as const };

      const [activeClaim] = await tx.select().from(unitVerificationsTable)
        .where(and(
          eq(unitVerificationsTable.userId, caller.id),
          eq(unitVerificationsTable.type, "owner_manual"),
          inArray(unitVerificationsTable.status, ["pending", "approved"]),
        ));
      if (activeClaim) return { kind: "conflict" as const };

      const unit = await getOrCreateUnitInTransaction(tx, unitParts);

      // ── If unit already has a verified owner, surface for Path B claim flow ──
      if (unit.verifiedOwnerId) {
        return { kind: "unit_has_owner" as const, unit };
      }

      const parkingLotsJson = Array.isArray(parkingLots) && parkingLots.length > 0
        ? JSON.stringify(parkingLots)
        : undefined;
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // The approved-user database index remains the last-line backstop if an
      // external writer bypasses this route or a future flow changes the lock.
      const [verification] = await tx.insert(unitVerificationsTable).values({
        type: "owner_manual",
        userId: caller.id,
        unitId: unit.id,
        nationalId,
        status: "pending",
        expiresAt,
        firstName: firstName ?? null,
        middleName: middleName ?? null,
        lastName: lastName ?? null,
        mobile: canonicalOwnerMobile ?? null,
        gender,
        parkingLots: parkingLotsJson ?? null,
        titleDeedKey: titleDeedKey ?? null,
        titleDeedOriginalFilename: typeof titleDeedOriginalFilename === "string"
          ? titleDeedOriginalFilename.slice(0, 255) : null,
        titleDeedContentHash: typeof titleDeedContentHash === "string"
          ? titleDeedContentHash.slice(0, 128) : null,
      }).returning();

      await tx.update(usersTable).set({
        unitNumber: `${unitParts.building} ${unitParts.unitNumber}`,
        nationalId,
        verificationStatus: "pending_manual",
      }).where(eq(usersTable.clerkId, clerkId));

      return {
        kind: "pending" as const,
        caller,
        unit,
        verificationId: verification.id,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNIT_CLAIM_CONFLICT_RETRY_EXHAUSTED") {
      return res.status(409).json(ACTIVE_CLAIM_CONFLICT);
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return res.status(409).json(ACTIVE_CLAIM_CONFLICT);
    }
    throw error;
  }

  if (outcome.kind === "forbidden") return res.status(403).json({ error: "Forbidden" });
  if (outcome.kind === "staff_forbidden") {
    return res.status(403).json({ error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });
  }
  if (outcome.kind === "conflict") {
    return res.status(409).json(ACTIVE_CLAIM_CONFLICT);
  }
  if (outcome.kind === "unit_has_owner") return res.json({ result: "unit_has_owner", unit: outcome.unit });

  const callerName = `${outcome.caller.firstName ?? ""} ${outcome.caller.lastName ?? ""}`.trim() || outcome.caller.email;
  sendAdminAlert(
    `[Action Required] Owner Verification — Manual Review Required`,
    `<h2>Unit Owner Verification Needs Manual Review</h2>
     <p><strong>Resident:</strong> ${callerName}</p>
      <p><strong>Unit:</strong> ${unitParts.building} ${unitParts.unitNumber}</p>
     <p><strong>National ID:</strong> ${nationalId}</p>
     ${titleDeedKey ? `<p><strong>Title Deed:</strong> Uploaded (${titleDeedKey})</p>` : ""}
     <p>This ownership claim requires manual review. Please approve or reject it in the admin portal.</p>`,
  ).catch(() => {});

  res.json({ result: "pending_manual_review", verificationId: outcome.verificationId, unit: outcome.unit });
});

// ── POST /unit-verify/tenant — Step 2B: tenant requests linkage ──────────────
router.post("/unit-verify/tenant", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  if (isStaffRole(caller.role)) {
    return res.status(403).json({ error: "STAFF_RESIDENT_CLAIM_FORBIDDEN" });
  }

  const {
    building, unitNumber, nationalId, ownerNationalId, ejarReference, ejarDocumentKey,
    ejarOriginalFilename, ejarContentHash, leaseStartDate, leaseEndDate,
    firstName, middleName, lastName, mobile, dateOfBirth, nationality, parkingLots, gender,
  } = req.body;
  const unitParts = normaliseUnitInput(building, unitNumber);
  if (!unitParts.building || !unitParts.unitNumber) return res.status(400).json({ error: "building and unitNumber are required" });
  if (isReservedSystemUnit(unitParts)) {
    return res.status(403).json({ error: "SYSTEM_UNIT_RESERVED" });
  }
  if (
    typeof firstName !== "string" || !firstName.trim()
    || typeof lastName !== "string" || !lastName.trim()
    || typeof nationalId !== "string" || !nationalId.trim()
    || typeof ownerNationalId !== "string" || !ownerNationalId.trim()
    || typeof mobile !== "string" || !mobile.trim()
    || !isValidPastDate(dateOfBirth)
    || typeof nationality !== "string" || !nationality.trim()
    || typeof ejarReference !== "string" || !ejarReference.trim()
    || !isValidPrivateDocumentKey(ejarDocumentKey, "ejar")
    || typeof leaseStartDate !== "string" || typeof leaseEndDate !== "string"
    || !isValidGender(gender)
  ) {
    return res.status(400).json({
      error: "Tenant name, National ID, gender, mobile, date of birth, nationality, owner National ID, Ejar reference/document, and lease dates are required.",
    });
  }
  if (leaseEndDate < leaseStartDate) {
    return res.status(400).json({ error: "Lease end date cannot be earlier than lease start date." });
  }
  if (leaseEndDate <= saudiCalendarDate()) {
    return res.status(400).json({ error: "Lease end date must be after today." });
  }

  // Canonicalize mobile (optional)
  const tenantMobileResult = canonicalizePhone(mobile);
  if (!tenantMobileResult.ok) {
    return res.status(422).json({ error: tenantMobileResult.error });
  }
  const canonicalTenantMobile = tenantMobileResult.e164;

  // Unit must exist and have a verified owner
  const [unit] = await db.select().from(unitsTable)
    .where(eq(unitsTable.normalisedUnitNumber, unitParts.key));

  if (!unit || !unit.verifiedOwnerId) {
    return res.status(422).json({
      error: "This unit does not yet have a registered owner. The owner must register and verify the unit before a tenancy can be recorded. Please contact your landlord, or the HOA if you need assistance.",
      errorAr: "لا يوجد مالك مسجل لهذه الوحدة حتى الآن. يجب على المالك تسجيل الوحدة وتوثيقها قبل تسجيل عقد الإيجار. يرجى التواصل مع المؤجر، أو مع الجمعية للمساعدة.",
    });
  }
  const normalizeNationalId = (value: string) => value.replace(/\s|-/g, "").toUpperCase();
  const storedOwnerNationalId = unit.ownerNationalId;
  if (!storedOwnerNationalId || normalizeNationalId(ownerNationalId) !== normalizeNationalId(storedOwnerNationalId)) {
    // Deliberately give the same response for a missing stored ID, a bad ID, or
    // an unknown unit relationship. This endpoint must never be an ID-oracle.
    return res.status(400).json({ error: "The owner and unit details could not be verified." });
  }

  // Check no active tenant already
  if (unit.verifiedTenantId) {
    return res.status(409).json({ error: "This unit already has an active verified tenant." });
  }

  // Validate parking lots structure: must be absent, or array of {building, lotNumber, isInside}
  const tenantParkingError = validateParkingLotsInput(parkingLots);
  if (tenantParkingError) {
    return res.status(400).json({ error: tenantParkingError });
  }

  // Validate submitted parking lots against the unit's registered lots.
  // Prefer normalized parking_lots rows; fall back to legacy units.parkingLots JSON
  // only while no normalized rows exist for this unit.
  if (Array.isArray(parkingLots) && parkingLots.length > 0) {
    const makeKey = (b: string, n: string) =>
      `${b.trim().toLowerCase()}|${n.trim().toLowerCase()}`;

    const normalizedRows = await db.select().from(parkingLotsTable)
      .where(and(eq(parkingLotsTable.unitId, unit.id), eq(parkingLotsTable.active, true)));

    let registeredKeys: Set<string>;
    if (normalizedRows.length > 0) {
      registeredKeys = new Set(normalizedRows.map(r => makeKey(r.building, r.lotNumber)));
    } else {
      let legacyLots: { building: string; lotNumber: string }[] = [];
      if (unit.parkingLots) {
        try { legacyLots = JSON.parse(unit.parkingLots); } catch {}
      }
      registeredKeys = new Set(legacyLots.map(l => makeKey(l.building ?? "", l.lotNumber ?? "")));
    }

    const invalid = (parkingLots as { building: string; lotNumber: string }[]).find(
      l => !registeredKeys.has(makeKey(l.building ?? "", l.lotNumber ?? ""))
    );
    if (invalid) {
      return res.status(400).json({
        error: `Parking lot ${invalid.lotNumber ?? "?"} is not registered to this unit.`,
      });
    }
  }

  const parkingLotsJson = Array.isArray(parkingLots) && parkingLots.length > 0
    ? JSON.stringify(parkingLots)
    : undefined;

  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days
  let verification;
  try {
    [verification] = await db.insert(unitVerificationsTable).values({
      type: "tenant_request",
      userId: caller.id,
      unitId: unit.id,
      nationalId,
      ejarReference,
      status: "pending",
      expiresAt,
      firstName: firstName ?? null,
      middleName: middleName ?? null,
      lastName: lastName ?? null,
      mobile: canonicalTenantMobile ?? null,
      dateOfBirth,
      nationality: nationality.trim(),
      gender,
      ownerNationalId: ownerNationalId.trim(),
      ejarDocumentKey,
      ejarOriginalFilename: typeof ejarOriginalFilename === "string" ? ejarOriginalFilename.slice(0, 255) : null,
      ejarContentHash: typeof ejarContentHash === "string" ? ejarContentHash.slice(0, 128) : null,
      leaseStartDate,
      leaseEndDate,
      parkingLots: parkingLotsJson ?? null,
    }).returning();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      return res.status(409).json({ error: "A pending or approved tenant claim already exists for this unit." });
    }
    throw error;
  }

  await db.update(usersTable).set({
    unitNumber: `${unitParts.building} ${unitParts.unitNumber}`,
    nationalId,
    verificationStatus: "pending_owner_approval",
  }).where(eq(usersTable.clerkId, clerkId));

  const tenantName = `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email;
  const unitLabel = `${unitParts.building} ${unitParts.unitNumber}`;

  // Notify admin
  sendAdminAlert(
    `[Action Required] Tenant Linkage Request — Unit ${unitLabel}`,
    `<h2>New Tenant Linkage Request</h2>
     <p><strong>Tenant:</strong> ${tenantName}</p>
     <p><strong>Unit:</strong> ${unitLabel}</p>
     <p><strong>Ejar Reference:</strong> ${ejarReference}</p>
     <p>This request awaits the unit owner's approval. You may also review as admin.</p>`,
  ).catch(() => {});

  const [ownerUser] = await db.select().from(usersTable).where(eq(usersTable.id, unit.verifiedOwnerId));
  // Row 9 — tenancy_request_submitted (mandatory: owner must see this regardless of prefs)
  if (ownerUser) {
    enqueueBothNotificationChannels({
      eventType: EVT.TENANCY_REQUEST_SUBMITTED,
      idempotencyKey: tenancyRequestSubmittedKey(verification.id),
      recipientUserId: ownerUser.id,
      recipientEmail: ownerUser.email ?? null,
      payload: {
        title: "📋 New Tenant Request",
        subject: `New tenant request for Unit ${unitLabel}`,
        body: `${tenantName} has requested tenancy for unit ${unitLabel}. Tenant mobile: ${mobile}. Your approval is required.`,
        html: `<p><strong>${tenantName}</strong> has requested tenancy for unit <strong>${unitLabel}</strong>.</p><p>Tenant mobile: ${mobile}</p><p>Your approval is required.</p>`,
        data: { screen: "unit-verify", verificationId: verification.id },
      },
      preferencePolicy: "mandatory",
    }).catch(() => {});
  }

  res.json({ result: "pending_owner_approval", verificationId: verification.id });
});

// ── GET /unit-verify/pending-tenant-requests — owner sees requests for their unit ──
router.get("/unit-verify/pending-tenant-requests", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  if (!caller.unitId) return res.json([]);

  // Only return tenant requests for this owner's unit
  const requests = await db.select().from(unitVerificationsTable)
    .where(and(
      eq(unitVerificationsTable.unitId, caller.unitId),
      eq(unitVerificationsTable.type, "tenant_request"),
      eq(unitVerificationsTable.status, "pending"),
    ));

  // Batch-fetch user info to avoid N+1 queries
  const userIds = requests
    .map((request) => request.userId)
    .filter((id): id is number => id !== null);
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, nationalId: usersTable.nationalId })
        .from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const enriched = requests.map(({ ownerNationalId: _ownerNationalId, ...request }) => {
    const requester = request.userId === null ? null : userMap[request.userId] ?? null;
    return {
      ...request,
      // Approval must show the identity submitted on the Ejar verification,
      // not a potentially different profile name.
      requester: requester
        ? {
          ...requester,
          firstName: request.firstName ?? requester.firstName,
          lastName: request.lastName ?? requester.lastName,
        }
        : null,
    };
  });

  res.json(enriched);
});

// ── GET /unit-verify/mine/pending — requester cancellation target ─────────────
router.get("/unit-verify/mine/pending", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [verification] = await db.select().from(unitVerificationsTable).where(and(
    eq(unitVerificationsTable.userId, caller.id),
    eq(unitVerificationsTable.status, "pending"),
  ));
  if (!verification) return res.json(null);
  const { ownerNationalId: _ownerNationalId, ...safeVerification } = verification;
  res.json(safeVerification);
});

// ── GET /unit-verify/:id/title-deed — admin: presigned GET URL for uploaded title deed ──
router.get("/unit-verify/:id/title-deed", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const [verification] = await db.select().from(unitVerificationsTable).where(eq(unitVerificationsTable.id, Number(req.params.id)));
  if (!verification) return res.status(404).json({ error: "Not found" });
  if (!verification.titleDeedKey) return res.status(404).json({ error: "No title deed on file for this verification" });

  try {
    const url = await objectStorageService.getTitleDeedViewURL(verification.titleDeedKey);
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Could not generate title deed link" });
  }
});

// ── GET /unit-verify/:id/ejar — tenant document for its owner or admin ────────
router.get("/unit-verify/:id/ejar", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [verification] = await db.select().from(unitVerificationsTable)
    .where(eq(unitVerificationsTable.id, Number(req.params.id)));
  if (!verification?.ejarDocumentKey) return res.status(404).json({ error: "No Ejar document on file" });
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, verification.unitId));
  const isVerifiedOwner = caller.role !== "admin" && unit?.verifiedOwnerId === caller.id;
  if (caller.role !== "admin" && !isVerifiedOwner) return res.status(403).json({ error: "Forbidden" });
  try {
    res.json({ url: await objectStorageService.getTitleDeedViewURL(verification.ejarDocumentKey) });
  } catch {
    res.status(500).json({ error: "Could not generate Ejar document link" });
  }
});

// ── POST /unit-verify/:id/approve — owner approves tenant; admin approves manual ──
router.post("/unit-verify/:id/approve", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  // This is deliberately only an access-control preflight. It prevents an
  // unauthorized caller from learning occupancy state; the authoritative
  // authorization and every state transition are rechecked after locking.
  const [lookup] = await db.select({
    unitId: unitVerificationsTable.unitId,
    type: unitVerificationsTable.type,
  }).from(unitVerificationsTable)
    .where(eq(unitVerificationsTable.id, Number(req.params.id)));
  if (!lookup?.unitId) return res.status(404).json({ error: "Not found" });
  const [preflightCaller] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
  }).from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!preflightCaller) return res.status(403).json({ error: "Forbidden" });
  if (lookup.type !== "tenant_request") {
    if (preflightCaller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  } else if (preflightCaller.role !== "admin") {
    const [preflightUnit] = await db.select({ verifiedOwnerId: unitsTable.verifiedOwnerId })
      .from(unitsTable).where(eq(unitsTable.id, lookup.unitId));
    if (preflightUnit?.verifiedOwnerId !== preflightCaller.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  let snapshot: {
    verification: typeof unitVerificationsTable.$inferSelect;
    caller: typeof usersTable.$inferSelect;
    targetUser: typeof usersTable.$inferSelect;
    unit: typeof unitsTable.$inferSelect;
    mobile: string | null;
  };
  try {
    snapshot = await db.transaction(async (tx) => {
      // Canonical lock order: advisory + unit + residents before verification,
      // applicant, and reviewer. Never follow a stale verification to another unit.
      const occupancy = await loadLockedOccupancy(tx, lookup.unitId);
      const [verification] = await tx.select().from(unitVerificationsTable)
        .where(eq(unitVerificationsTable.id, Number(req.params.id))).for("update");
      if (!verification || verification.unitId !== lookup.unitId) throw new ApprovalHttpError(404, "Not found");
      const [targetUser] = verification.userId == null ? [] : await tx.select().from(usersTable)
        .where(eq(usersTable.id, verification.userId)).for("update");
      const [lockedCaller] = await tx.select().from(usersTable)
        .where(eq(usersTable.clerkId, clerkId)).for("update");
      if (!lockedCaller) throw new OccupancyError("FORBIDDEN", "Forbidden");
      if (verification.status !== "pending") throw new OccupancyError("OCCUPANCY_CONFLICT", "Only a pending verification can be approved.");
      if (!targetUser) throw new ApprovalHttpError(404, "Target user not found");

      const isTenant = verification.type === "tenant_request";
      const isOwnerApproving = lockedCaller.role !== "admin"
        && occupancy.unit.verifiedOwnerId === lockedCaller.id && isTenant;
      if (!isOwnerApproving && lockedCaller.role !== "admin") throw new OccupancyError("FORBIDDEN", "Forbidden");
      if (lockedCaller.role === "admin" && isTenant) throw new OccupancyError("FORBIDDEN", "Tenant linkage requests must be approved by the unit owner, not admin.");
      const approvalBasesError = validateApprovalBases(verification.type, req.body);
      if (approvalBasesError) throw new ApprovalHttpError(400, approvalBasesError);

      const mobileResult = canonicalizePhone(verification.mobile);
      if (isTenant && (!mobileResult.ok || !mobileResult.e164)) {
        throw new ApprovalHttpError(422, "RESIDENT_MOBILE_REQUIRED");
      }
      const mobile = mobileResult.ok ? mobileResult.e164 : null;
      const [oldClaim] = await tx.select().from(unitVerificationsTable).where(and(
        eq(unitVerificationsTable.userId, targetUser.id), eq(unitVerificationsTable.status, "approved"),
      )).for("update");
      if (oldClaim && oldClaim.id !== verification.id) throw new OccupancyError("OCCUPANCY_CONFLICT", "This resident already has an approved unit claim.");

      // The unit row and all its residents are locked above. Both persisted
      // occupancy fields and resident state participate in the symmetric gate:
      // an owner_occupied row without a legacy resident stub still blocks tenant.
      if ((isTenant && (occupancy.ownerActive || occupancy.unit.occupantType === "owner_occupied"))
        || (!isTenant && (occupancy.tenantActive || occupancy.unit.occupantType === "tenant_occupied"))) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "The opposite household must complete move-out before activation.");
      }
      if (isTenant && (occupancy.unit.verifiedTenantId != null || occupancy.active.some((row: any) =>
        row.type === "family" || (row.type === "owner" && row.linkedUserId !== occupancy.unit.verifiedOwnerId)))) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "Owner household move-out is required before tenant approval.");
      }
      const primaryResidents = occupancy.active.filter((row: any) => row.isPrimary);
      if (primaryResidents.length > 1 || (occupancy.primary && occupancy.primary.linkedUserId !== targetUser.id)) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "A primary resident already occupies this unit.");
      }
      // Do not silently repair a concurrent/legacy active household elsewhere.
      const activeStubs = await tx.select().from(residentsTable).where(and(
        eq(residentsTable.linkedUserId, targetUser.id), eq(residentsTable.status, "active"),
      ));
      if (activeStubs.some((stub) => stub.unitId !== occupancy.unit.id)) {
        throw new OccupancyError("OCCUPANCY_CONFLICT", "The applicant has an active resident record at another unit.");
      }

      const [approved] = await tx.update(unitVerificationsTable).set({
        status: "approved", reviewedById: lockedCaller.id, reviewNote: req.body.note,
        approvalBases: JSON.stringify(req.body.approvalBases),
        approvalOtherText: req.body.approvalBases.includes("other") ? req.body.otherText.trim() : null,
      }).where(and(eq(unitVerificationsTable.id, verification.id), eq(unitVerificationsTable.status, "pending"))).returning();
      if (!approved) throw new OccupancyError("OCCUPANCY_CONFLICT", "This verification was decided by another reviewer.");

      const unitLabel = `${occupancy.unit.building} ${occupancy.unit.unitNumber}`;
      const updatedUnit = await setApprovedUnitOccupancy(tx, {
        unitId: occupancy.unit.id,
        track: isTenant ? "tenant" : "owner",
        userId: targetUser.id,
        ownerFields: !isTenant ? {
          ...(verification.parkingLots ? { parkingLots: verification.parkingLots } : {}),
          ...(verification.nationalId ? { ownerNationalId: verification.nationalId } : {}),
        } : undefined,
      });
      await tx.update(usersTable).set({
        unitId: updatedUnit.id, unitNumber: unitLabel, role: isTenant ? "tenant" : "owner",
        status: "active", verificationStatus: isTenant ? "verified_tenant" : "verified_owner",
        ...(mobile ? { phone: mobile, phoneNormalized: mobile } : {}),
      }).where(eq(usersTable.id, targetUser.id));

      if (isTenant) {
        const existing = occupancy.residents.find((row: any) => row.linkedUserId === targetUser.id && row.type === "tenant");
        const residentData = { isPrimary: true, hasPortalAccess: true, phone: mobile!, phoneNormalized: mobile!,
          dateOfBirth: verification.dateOfBirth, nationality: verification.nationality, status: "active" } satisfies Partial<typeof residentsTable.$inferInsert>;
        if (existing) await updateResidentOccupancy(tx, existing.id, residentData);
        else await createHouseholdResident(tx, { type: "tenant", firstName: targetUser.firstName ?? "", lastName: targetUser.lastName ?? "",
          email: targetUser.email ?? null, unitNumber: unitLabel, unitId: updatedUnit.id, relationship: "Primary Tenant",
          idNumber: targetUser.nationalId ?? null, gender: verification.gender, linkedUserId: targetUser.id,
          registeredById: targetUser.id, ...residentData } as any);
        if (verification.leaseStartDate && verification.leaseEndDate) await ensureTenancyLifecycle(approved, targetUser.id, updatedUnit.id, tx);
      } else if ("session" in tx) {
        // The database occupancy invariant requires every occupied owner track
        // to have its canonical active primary in the same approval transaction.
        const existing = occupancy.residents.find((row: any) => row.linkedUserId === targetUser.id && row.type === "owner");
        const residentData = {
          isPrimary: true, hasPortalAccess: true, status: "active" as const,
          phone: mobile, phoneNormalized: mobile,
        };
        if (existing) await updateResidentOccupancy(tx, existing.id, residentData);
        else await createHouseholdResident(tx, {
          type: "owner", firstName: targetUser.firstName ?? "", lastName: targetUser.lastName ?? "",
          email: targetUser.email ?? null, unitNumber: unitLabel, unitId: updatedUnit.id,
          relationship: "Owner", idNumber: verification.nationalId ?? targetUser.nationalId ?? null,
          gender: verification.gender, linkedUserId: targetUser.id, registeredById: targetUser.id,
          ...residentData,
        } as any);
      }
      return { verification: approved, caller: lockedCaller, targetUser, unit: updatedUnit, mobile };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "This resident already has an approved unit claim." });
    }
    if (error instanceof ApprovalHttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof OccupancyError) {
      const status = error.code === "FORBIDDEN" ? 403 : 409;
      return res.status(status).json({ error: error.message === "RESIDENT_MOBILE_REQUIRED" ? error.message : error.code, message: error.message });
    }
    throw error;
  }

  // Durable activation is committed. Disposal and notification are intentionally
  // best effort and cannot roll back a correct occupancy transition.
  void disposeVerificationDocuments(snapshot.verification, "approved", snapshot.caller.id).catch(() => {});
  const unitLabel = `${snapshot.unit.building} ${snapshot.unit.unitNumber}`;
  if (snapshot.verification.type === "tenant_request") {
    enqueueBothNotificationChannels({
      eventType: EVT.TENANCY_REQUEST_APPROVED,
      idempotencyKey: tenancyRequestApprovedKey(snapshot.verification.id),
      recipientUserId: snapshot.targetUser.id, recipientEmail: snapshot.targetUser.email ?? null,
      payload: {
        title: "✅ Tenancy Approved",
        subject: `Tenancy approved for unit ${unitLabel}`,
        body: `Your tenancy for unit ${unitLabel} has been approved. Welcome to Madain Village!`,
        html: `<p>Your tenancy for unit <strong>${unitLabel}</strong> has been approved. Welcome to Madain Village!</p>`,
        data: { screen: "profile" },
      },
      preferencePolicy: "mandatory",
    }).catch(() => {});

  } else {
    enqueueBothNotificationChannels({
      eventType: EVT.UNIT_VERIFICATION_DECISION,
      idempotencyKey: unitVerificationDecisionKey(snapshot.verification.id, "approved"),
      recipientUserId: snapshot.targetUser.id, recipientEmail: snapshot.targetUser.email ?? null,
      payload: {
        title: "✅ Ownership Verified",
        subject: `Ownership verified for unit ${unitLabel}`,
        body: `Your ownership of unit ${unitLabel} has been verified. Welcome to Madain Village!`,
        html: `<p>Your ownership of unit <strong>${unitLabel}</strong> has been verified. Welcome to Madain Village!</p>`,
        data: { screen: "profile" },
      },
      preferencePolicy: "mandatory",
    }).catch(() => {});

  }
  res.json({ ok: true });
});

// ── POST /unit-verify/:id/reject ─────────────────────────────────────────────
router.post("/unit-verify/:id/reject", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });

  const [verification] = await db.select().from(unitVerificationsTable).where(eq(unitVerificationsTable.id, Number(req.params.id)));
  if (!verification) return res.status(404).json({ error: "Not found" });

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, verification.unitId));
  const isOwnerRejecting = caller.role !== "admin" && unit?.verifiedOwnerId === caller.id && verification.type === "tenant_request";
  if (!isOwnerRejecting && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  // Admin cannot reject tenant_request — must come from unit owner
  if (caller.role === "admin" && verification.type === "tenant_request") {
    return res.status(403).json({ error: "Tenant linkage requests must be declined by the unit owner, not admin." });
  }

  const reviewNote = req.body.note;
  if (verification.status !== "pending") {
    return res.status(409).json({ error: "Only a pending verification can be rejected." });
  }
  if (verification.userId === null) {
    return res.status(409).json({ error: "The verification applicant account has ended." });
  }
  await db.update(unitVerificationsTable).set({
    status: "rejected",
    reviewedById: caller.id,
    reviewNote,
  }).where(eq(unitVerificationsTable.id, verification.id));
  await db.update(usersTable).set({ verificationStatus: "unverified" }).where(eq(usersTable.id, verification.userId));

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, verification.userId));
  const targetName = targetUser ? `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""}`.trim() || "Resident" : "Resident";
  const unitLabel = unit ? `${unit.building} ${unit.unitNumber}` : "your unit";

  await disposeVerificationDocuments(verification, "rejected", caller.id);

  // Row 11 / Row 1 — tenancy_request_decision or unit_verification_decision (rejected)
  if (targetUser) {
    const isTenanct = verification.type === "tenant_request";
    enqueueBothNotificationChannels({
      eventType: isTenanct ? EVT.TENANCY_REQUEST_DECISION : EVT.UNIT_VERIFICATION_DECISION,
      idempotencyKey: isTenanct
        ? tenancyRequestDecisionKey(verification.id, "rejected")
        : unitVerificationDecisionKey(verification.id, "rejected"),
      recipientUserId: targetUser.id,
      recipientEmail: targetUser.email ?? null,
      payload: {
        title: isTenanct ? "❌ Tenant Request Declined" : "❌ Verification Not Approved",
        subject: isTenanct ? `Tenant request declined for unit ${unitLabel}` : `Verification not approved for unit ${unitLabel}`,
        body: isTenanct
          ? `Your tenant access request for unit ${unitLabel} was declined.${reviewNote ? ` Reason: ${reviewNote}.` : ""}`
          : `Your ownership verification for unit ${unitLabel} was not approved.${reviewNote ? ` Reason: ${reviewNote}.` : ""}`,
        html: `<p>${isTenanct ? `Your tenant access request for unit <strong>${unitLabel}</strong> was declined.` : `Your ownership verification for unit <strong>${unitLabel}</strong> was not approved.`}${reviewNote ? ` Reason: ${reviewNote}.` : ""}</p>`,
        data: { screen: "profile" },
      },
      preferencePolicy: "decision",
    }).catch(() => {});
  }

  res.json({ ok: true });
});

// ── POST /unit-verify/:id/cancel — audited admin-only cancellation ─────────────
router.post("/unit-verify/:id/cancel", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller) return res.status(403).json({ error: "Forbidden" });
  const [verification] = await db.select().from(unitVerificationsTable)
    .where(eq(unitVerificationsTable.id, Number(req.params.id)));
  if (!verification) return res.status(404).json({ error: "Not found" });
  if (verification.status !== "pending") {
    return res.status(409).json({ error: "Only a pending verification can be cancelled." });
  }
  if (verification.userId === null) {
    return res.status(409).json({ error: "The verification applicant account has ended." });
  }

  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (caller.role !== "admin") return res.status(403).json({ error: "Only an administrator can cancel a verification request." });
  if (!reason) {
    return res.status(400).json({ error: "An admin cancellation reason is required." });
  }

  await db.update(unitVerificationsTable).set({
    status: "cancelled",
    cancelledById: caller.id,
    cancelledAt: new Date(),
    cancellationReason: reason || null,
  }).where(eq(unitVerificationsTable.id, verification.id));
  await db.update(usersTable).set({ verificationStatus: "unverified" })
    .where(eq(usersTable.id, verification.userId));
  await disposeVerificationDocuments(verification, "cancelled", caller.id);

  if (verification.type === "tenant_request") {
    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, verification.unitId));
    const [tenant] = await db.select().from(usersTable).where(eq(usersTable.id, verification.userId));
    const [owner] = unit?.verifiedOwnerId
      ? await db.select().from(usersTable).where(eq(usersTable.id, unit.verifiedOwnerId))
      : [undefined];
    const unitLabel = unit ? `${unit.building} ${unit.unitNumber}` : "the requested unit";
    // Row 11 — tenancy_request_decision (cancelled by admin)
    for (const recipient of [tenant, owner]) {
      if (recipient) enqueueBothNotificationChannels({
        eventType: EVT.TENANCY_REQUEST_DECISION,
        idempotencyKey: tenancyRequestDecisionKey(verification.id, "cancelled"),
        recipientUserId: recipient.id,
        recipientEmail: recipient.email ?? null,
        payload: {
          title: "❌ Tenant Request Cancelled",
          subject: `Tenant request cancelled for unit ${unitLabel}`,
          body: `The tenant access request for unit ${unitLabel} was cancelled by the HOA. Reason: ${reason}.`,
          html: `<p>The tenant access request for unit <strong>${unitLabel}</strong> was cancelled by the HOA. Reason: ${reason}.</p>`,
          data: { screen: "profile" },
        },
        preferencePolicy: "decision",
      }).catch(() => {});
    }
  }
  res.json({ ok: true, status: "cancelled" });
});

// ── GET /unit-verify/pending — admin: all pending verifications ───────────────
router.get("/unit-verify/pending", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const verifications = await db.select().from(unitVerificationsTable).where(eq(unitVerificationsTable.status, "pending"));

  // Batch-fetch users and units to avoid N+1 queries
  const verUserIds = verifications
    .map((verification) => verification.userId)
    .filter((id): id is number => id !== null);
  const verUnitIds = verifications.map(v => v.unitId);
  const [verUsers, verUnits] = await Promise.all([
    verUserIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, verUserIds)) : Promise.resolve([]),
    verUnitIds.length > 0 ? db.select().from(unitsTable).where(inArray(unitsTable.id, verUnitIds)) : Promise.resolve([]),
  ]);
  const verUserMap = Object.fromEntries(verUsers.map(u => [u.id, u]));
  const verUnitMap = Object.fromEntries(verUnits.map(u => [u.id, u]));
  const enriched = verifications.map(({ ownerNationalId: _ownerNationalId, ...verification }) => ({
    ...verification,
    requester: verification.userId === null ? null : verUserMap[verification.userId] ?? null,
    // Admin has oversight of the request, not the owner's National ID.
    unit: verUnitMap[verification.unitId] ? stripOwnerNationalId(verUnitMap[verification.unitId]!) : null,
  }));
  res.json(enriched);
});

// ── GET /unit-verify/history — admin: approved verification basis history ─────
router.get("/unit-verify/history", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const verifications = await db.select().from(unitVerificationsTable)
    .where(eq(unitVerificationsTable.status, "approved"));

  const verUserIds = verifications
    .map((verification) => verification.userId)
    .filter((id): id is number => id !== null);
  const verUnitIds = verifications.map((verification) => verification.unitId);
  const [verUsers, verUnits] = await Promise.all([
    verUserIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, verUserIds)) : Promise.resolve([]),
    verUnitIds.length > 0 ? db.select().from(unitsTable).where(inArray(unitsTable.id, verUnitIds)) : Promise.resolve([]),
  ]);
  const verUserMap = Object.fromEntries(verUsers.map((user) => [user.id, user]));
  const verUnitMap = Object.fromEntries(verUnits.map((unit) => [unit.id, unit]));
  const enriched = verifications.map(({ ownerNationalId: _ownerNationalId, ...verification }) => ({
    ...verification,
    requester: verification.userId === null ? null : verUserMap[verification.userId] ?? null,
    unit: verUnitMap[verification.unitId] ? stripOwnerNationalId(verUnitMap[verification.unitId]!) : null,
  }));

  res.json(enriched);
});

// ── POST /unit-verify/tenant-transition/run — T10 routed-count evidence ───────
router.post("/unit-verify/tenant-transition/run", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const pending = await db.select().from(unitVerificationsTable).where(and(
    eq(unitVerificationsTable.type, "tenant_request"),
    eq(unitVerificationsTable.status, "pending"),
  ));
  let ownerRouted = 0;
  let adminRouted = 0;

  for (const verification of pending) {
    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, verification.unitId));
    const routedTo = unit?.verifiedOwnerId ? "owner" : "admin";
    await db.update(unitVerificationsTable).set({
      routedTo,
      routedAt: new Date(),
    }).where(eq(unitVerificationsTable.id, verification.id));

    if (routedTo === "owner" && unit?.verifiedOwnerId) {
      ownerRouted += 1;
      const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, unit.verifiedOwnerId));
      if (owner) enqueueBothNotificationChannels({
        eventType: EVT.TENANCY_REQUEST_SUBMITTED,
        idempotencyKey: tenancyRequestSubmittedKey(verification.id),
        recipientUserId: owner.id,
        recipientEmail: owner.email ?? null,
        payload: {
          title: "Tenant request requires your decision",
          subject: `Tenant request for Unit ${unit.building} ${unit.unitNumber}`,
          body: `A pending tenant request for unit ${unit.building} ${unit.unitNumber} is waiting for your approval.`,
          html: `<p>A pending tenant request for unit <strong>${unit.building} ${unit.unitNumber}</strong> is waiting for your approval.</p>`,
          data: { screen: "unit-verify", verificationId: verification.id },
        },
        preferencePolicy: "mandatory",
      }).catch(() => {});
    } else {
      adminRouted += 1;
      sendAdminAlert(
        `[Reconciliation Required] Tenant request ${verification.id}`,
        `<p>Tenant request ${verification.id} has no verified unit owner and remains under admin oversight.</p>`,
      ).catch(() => {});
    }
  }

  // This equality is intentionally returned as durable UAT evidence. No
  // transition report is successful unless every pending row was routed once.
  const pendingBefore = pending.length;
  const reconciled = pendingBefore === ownerRouted + adminRouted;
  res.json({ pendingBefore, ownerRouted, adminRouted, reconciled });
});

// ── POST /unit-verify/document-cleanup-retries/run — idempotent admin retry ───
router.post("/unit-verify/document-cleanup-retries/run", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const pendingRetries = (await db.select().from(unitVerificationDocumentCleanupRetriesTable))
    .filter((retry) => retry.processedAt == null);
  let completed = 0;
  let failed = 0;
  for (const retry of pendingRetries) {
    try {
      const strictStorage = objectStorageService as ObjectStorageService & {
        deleteObjectEntityStrict?: (path: string) => Promise<void>;
      };
      if (strictStorage.deleteObjectEntityStrict) await strictStorage.deleteObjectEntityStrict(retry.objectKey);
      else await objectStorageService.deleteObjectEntity(retry.objectKey);
      const keyColumn = retry.documentKind === "title_deed" ? "titleDeedKey" : "ejarDocumentKey";
      const deletedColumn = retry.documentKind === "title_deed" ? "titleDeedDeletedAt" : "ejarDeletedAt";
      await db.update(unitVerificationsTable).set({
        [keyColumn]: null,
        [deletedColumn]: new Date(),
      }).where(eq(unitVerificationsTable.id, retry.verificationId));
      await db.update(unitVerificationDocumentCleanupRetriesTable).set({
        processedAt: new Date(),
        attempts: retry.attempts + 1,
      }).where(eq(unitVerificationDocumentCleanupRetriesTable.id, retry.id));
      completed += 1;
    } catch (error) {
      await db.update(unitVerificationDocumentCleanupRetriesTable).set({
        attempts: retry.attempts + 1,
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Document delete failed",
      }).where(eq(unitVerificationDocumentCleanupRetriesTable.id, retry.id));
      failed += 1;
    }
  }
  res.json({ completed, failed });
});

// ── Admin: normalized parking lots CRUD ──────────────────────────────────────

async function assertResultingParkingCapacity(
  tx: Pick<typeof db, "select">,
  unitId: number,
  proposedLots: Array<{ active: boolean; parkingType: "underground" | "surface" }>,
) {
  const vehicles = await tx.select({
    isBasementParking: vehiclesTable.isBasementParking,
  }).from(vehiclesTable).where(and(eq(vehiclesTable.unitId, unitId), ne(vehiclesTable.status, "inactive")));
  for (const [parkingType, isBasementParking] of [["underground", true], ["surface", false]] as const) {
    const vehiclesCount = vehicles.filter((vehicle) => vehicle.isBasementParking === isBasementParking).length;
    const entitlement = proposedLots.filter((lot) => lot.active && lot.parkingType === parkingType).length;
    if (vehiclesCount > entitlement) {
      const error: any = new Error("PARKING_ENTITLEMENT_OVERALLOCATED");
      error.parkingType = parkingType;
      error.vehiclesCount = vehiclesCount;
      error.entitlement = entitlement;
      throw error;
    }
  }
}

function parkingOverallocated(res: any, error: any): boolean {
  if (error?.message !== "PARKING_ENTITLEMENT_OVERALLOCATED") return false;
  const vehiclesCount = Number(error.vehiclesCount);
  const entitlement = Number(error.entitlement);
  const parkingType = error.parkingType === "underground" ? "underground" : "surface";
  res.status(409).json({
    error: "PARKING_ENTITLEMENT_OVERALLOCATED",
    message: `This correction cannot be completed because ${vehiclesCount} registered ${parkingType} vehicle${vehiclesCount === 1 ? "" : "s"} would exceed the resulting entitlement of ${entitlement}.`,
    parkingType,
    vehiclesCount,
    entitlement,
  });
  return true;
}

function parkingCorrectionFailed(res: any, req: any, error: unknown): void {
  req.log.warn({ err: error }, "Parking correction failed");
  res.status(500).json({
    error: "PARKING_CORRECTION_FAILED",
    message: "The parking correction could not be completed. Please try again or contact support.",
  });
}

// ── GET /units/:unitId/parking-lots — admin: list normalized lots for a unit ──
router.get("/units/:unitId/parking-lots", requireApiAuth, async (req, res): Promise<void> => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const unitId = Number(req.params.unitId);
  const [registryUnit] = await db.select({ isSystem: unitsTable.isSystem }).from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!registryUnit || registryUnit.isSystem) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const lots = await db.select().from(parkingLotsTable).where(eq(parkingLotsTable.unitId, unitId));
  res.json(lots.map(l => ({
    ...l,
    label: `${l.building} ${l.lotNumber}`,
  })));
});

// ── POST /units/:unitId/parking-lots — admin: add a normalized lot ────────────
router.post("/units/:unitId/parking-lots", requireApiAuth, async (req, res): Promise<void> => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const unitId = Number(req.params.unitId);
  const [registryUnit] = await db.select({ isSystem: unitsTable.isSystem }).from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!registryUnit || registryUnit.isSystem) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { building, lotNumber, parkingType, active, source, sourceReference } = req.body;

  if (typeof building !== "string" || building.trim() === "") {
    res.status(400).json({ error: "building must be a nonblank string" });
    return;
  }
  if (typeof lotNumber !== "string" || lotNumber.trim() === "") {
    res.status(400).json({ error: "lotNumber must be a nonblank string" });
    return;
  }
  if (parkingType !== "underground" && parkingType !== "surface") {
    res.status(400).json({ error: "parkingType must be 'underground' or 'surface'" });
    return;
  }

  let lot;
  try {
    [lot] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE}, ${unitId})`);
      const [created] = await tx.insert(parkingLotsTable).values({
        unitId,
        building: building.trim(),
        lotNumber: lotNumber.trim(),
        parkingType,
        active: active !== false,
        source: source ?? "stage2",
        sourceReference: sourceReference ?? null,
      }).returning();
      await tx.insert(unitMasterDataAuditTable).values({
        unitId, actorUserId: caller.id, action: "parking_lot_added", field: "parking_lot",
        oldValue: null, newValue: { id: created.id, building: created.building, lotNumber: created.lotNumber, parkingType: created.parkingType, active: created.active },
      });
      return [created];
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      res.status(409).json({ error: "A parking lot with this building and lot number already exists for this unit." });
      return;
    }
    if (parkingOverallocated(res, error)) return;
    parkingCorrectionFailed(res, req, error);
    return;
  }

  res.status(201).json({ ...lot, label: `${lot.building} ${lot.lotNumber}` });
});

// ── PATCH /units/:unitId/parking-lots/:lotId — admin: update a lot ───────────
router.patch("/units/:unitId/parking-lots/:lotId", requireApiAuth, async (req, res): Promise<void> => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const unitId = Number(req.params.unitId);
  const lotId = Number(req.params.lotId);
  const [registryUnit] = await db.select({ isSystem: unitsTable.isSystem }).from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!registryUnit || registryUnit.isSystem) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [existing] = await db.select().from(parkingLotsTable)
    .where(and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId)));
  if (!existing) {
    res.status(404).json({ error: "Parking lot not found" });
    return;
  }

  const { building, lotNumber, parkingType, active, source, sourceReference } = req.body;

  if (building !== undefined && (typeof building !== "string" || building.trim() === "")) {
    res.status(400).json({ error: "building must be a nonblank string" });
    return;
  }
  if (lotNumber !== undefined && (typeof lotNumber !== "string" || lotNumber.trim() === "")) {
    res.status(400).json({ error: "lotNumber must be a nonblank string" });
    return;
  }
  if (parkingType !== undefined && parkingType !== "underground" && parkingType !== "surface") {
    res.status(400).json({ error: "parkingType must be 'underground' or 'surface'" });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (building !== undefined) patch.building = building.trim();
  if (lotNumber !== undefined) patch.lotNumber = lotNumber.trim();
  if (parkingType !== undefined) patch.parkingType = parkingType;
  if (active !== undefined) patch.active = active;
  if (source !== undefined) patch.source = source;
  if (sourceReference !== undefined) patch.sourceReference = sourceReference;

  let updated;
  try {
    [updated] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE}, ${unitId})`);
      const [lockedExisting] = await tx.select().from(parkingLotsTable)
        .where(and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId)));
      if (!lockedExisting) throw new Error("PARKING_LOT_NOT_FOUND_AFTER_LOCK");
      const lots = await tx.select().from(parkingLotsTable).where(eq(parkingLotsTable.unitId, unitId));
      const proposed = lots.map((lot) => lot.id === lockedExisting.id
        ? { active: (patch.active ?? lot.active) as boolean, parkingType: (patch.parkingType ?? lot.parkingType) as "underground" | "surface" }
        : { active: lot.active, parkingType: lot.parkingType });
      await assertResultingParkingCapacity(tx, unitId, proposed);
      const [result] = await tx.update(parkingLotsTable).set(patch).where(
        and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId))
      ).returning();
      if (!result) throw new Error("PARKING_LOT_NOT_FOUND_AFTER_LOCK");
      for (const field of ["building", "lotNumber", "parkingType", "active", "source", "sourceReference"]) {
        if ((result as any)[field] !== (lockedExisting as any)[field]) await tx.insert(unitMasterDataAuditTable).values({
          unitId, actorUserId: caller.id, action: "parking_lot_updated", field,
          oldValue: (lockedExisting as any)[field] ?? null, newValue: (result as any)[field] ?? null,
        });
      }
      return [result];
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      res.status(409).json({ error: "A parking lot with this building and lot number already exists for this unit." });
      return;
    }
    if (parkingOverallocated(res, error)) return;
    parkingCorrectionFailed(res, req, error);
    return;
  }

  if (!updated) {
    res.status(404).json({ error: "Parking lot not found" });
    return;
  }

  res.json({ ...updated, label: `${updated.building} ${updated.lotNumber}` });
});

// ── DELETE /units/:unitId/parking-lots/:lotId — admin: remove a lot ───────────
router.delete("/units/:unitId/parking-lots/:lotId", requireApiAuth, async (req, res): Promise<void> => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const unitId = Number(req.params.unitId);
  const lotId = Number(req.params.lotId);
  const [registryUnit] = await db.select({ isSystem: unitsTable.isSystem }).from(unitsTable).where(eq(unitsTable.id, unitId));
  if (!registryUnit || registryUnit.isSystem) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [existing] = await db.select().from(parkingLotsTable)
    .where(and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId)));
  if (!existing) {
    res.status(404).json({ error: "Parking lot not found" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${VEHICLE_PARKING_ENTITLEMENT_LOCK_NAMESPACE}, ${unitId})`);
      const [lockedExisting] = await tx.select().from(parkingLotsTable)
        .where(and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId)));
      if (!lockedExisting) throw new Error("PARKING_LOT_NOT_FOUND_AFTER_LOCK");
      const lots = await tx.select().from(parkingLotsTable).where(eq(parkingLotsTable.unitId, unitId));
      await assertResultingParkingCapacity(tx, unitId, lots.filter((lot) => lot.id !== lotId).map((lot) => ({
        active: lot.active, parkingType: lot.parkingType,
      })));
      const [deleted] = await tx.delete(parkingLotsTable).where(
        and(eq(parkingLotsTable.id, lotId), eq(parkingLotsTable.unitId, unitId))
      ).returning();
      if (!deleted) throw new Error("PARKING_LOT_NOT_FOUND_AFTER_LOCK");
      await tx.insert(unitMasterDataAuditTable).values({
        unitId, actorUserId: caller.id, action: "parking_lot_deleted", field: "parking_lot",
        oldValue: { id: lockedExisting.id, building: lockedExisting.building, lotNumber: lockedExisting.lotNumber, parkingType: lockedExisting.parkingType, active: lockedExisting.active }, newValue: null,
      });
    });
  } catch (error) {
    if (parkingOverallocated(res, error)) return;
    parkingCorrectionFailed(res, req, error);
    return;
  }

  res.status(204).send();
});

// ── GET /data-migration-corrections — admin: open correction records ──────────
router.get("/data-migration-corrections", requireApiAuth, async (req, res): Promise<void> => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Only return open corrections; expose safe fields only (no rawPayload with PII risk)
  const corrections = await db.select().from(dataMigrationCorrectionsTable)
    .where(eq(dataMigrationCorrectionsTable.status, "open"));

  res.json(corrections.map(c => ({
    id: c.id,
    entityType: c.entityType,
    sourceReference: c.sourceReference,
    issueCode: c.issueCode,
    details: c.details,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  })));
});

export default router;
