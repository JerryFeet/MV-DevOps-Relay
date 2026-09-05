import { db, unitsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/**
 * The Unit Registry is the sole source of a user-visible unit identity.
 * `users.unitNumber` is retained for compatibility only and must never be
 * presented as an address: it lacks the building component and can be stale.
 */
export const UNKNOWN_UNIT_REFERENCE = "—";

export function formatUnitReference(
  unit: { building: string | null; unitNumber: string | null } | null | undefined,
): string {
  if (!unit?.building || !unit.unitNumber) return UNKNOWN_UNIT_REFERENCE;
  return `${unit.building} ${unit.unitNumber}`;
}

export async function canonicalUnitReference(unitId: number | null | undefined): Promise<string> {
  if (!unitId) return UNKNOWN_UNIT_REFERENCE;
  const [unit] = await db.select({
    building: unitsTable.building,
    unitNumber: unitsTable.unitNumber,
  }).from(unitsTable).where(eq(unitsTable.id, unitId));
  return formatUnitReference(unit);
}

export async function canonicalUnitReferenceMap(unitIds: Iterable<number | null | undefined>) {
  const ids = [...new Set([...unitIds].filter((id): id is number => typeof id === "number"))];
  if (!ids.length) return new Map<number, string>();
  const units = await db.select({
    id: unitsTable.id,
    building: unitsTable.building,
    unitNumber: unitsTable.unitNumber,
  }).from(unitsTable).where(inArray(unitsTable.id, ids));
  return new Map(units.map((unit) => [unit.id, formatUnitReference(unit)]));
}