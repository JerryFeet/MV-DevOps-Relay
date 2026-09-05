import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const route = (name: string) => readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), "utf8");
const lib = (name: string) => readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const OCCUPANCY_UNIT_FIELDS = [
  "occupantType", "verifiedOwnerId", "verifiedTenantId", "preApprovedClaimId", "isSystem",
];
const OCCUPANCY_UNIT_SQL_FIELDS = [
  "occupant_type", "verified_owner_id", "verified_tenant_id", "pre_approved_claim_id", "is_system",
];
const SAFE_UNIT_MASTER_FIELDS = new Set([
  "building", "unitNumber", "floor", "unitType", "sizeSqm", "titleReference",
  "emergencyContact", "emergencyPhone", "preferredContact", "mailingAddress", "notes",
]);
const canonicalOccupancyPath = join(sourceRoot, "lib", "occupancy.ts");

function productionSources(directory: string): Array<{ path: string; source: string }> {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return productionSources(path);
    if (!path.endsWith(".ts") || path === canonicalOccupancyPath) return [];
    return [{ path: relative(sourceRoot, path), source: readFileSync(path, "utf8") }];
  });
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function tableAliases(source: string, table: "unitsTable" | "residentsTable"): string[] {
  const aliases = new Set<string>([table]);
  for (const match of source.matchAll(new RegExp(`\\b(?:const|let)\\s+(\\w+)\\s*=\\s*${table}\\b`, "g"))) aliases.add(match[1]!);
  for (const match of source.matchAll(new RegExp(`\\b${table}\\s+as\\s+(\\w+)\\b`, "g"))) aliases.add(match[1]!);
  for (const match of source.matchAll(new RegExp(`\\{\\s*${table}\\s*:\\s*(\\w+)\\s*\\}`, "g"))) aliases.add(match[1]!);
  return [...aliases];
}

function declaredExpression(source: string, identifier: string): string | null {
  const declaration = new RegExp(`\\b(?:const|let)\\s+${identifier}(?:\\s*:[^=;]+)?\\s*=`, "g").exec(source);
  if (!declaration) return null;
  const start = declaration.index + declaration[0].length;
  const end = source.indexOf(";", start);
  return end < 0 ? null : source.slice(start, end);
}

function payloadIsSafe(source: string, payload: string, seen = new Set<string>()): boolean {
  const trimmed = payload.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    if (seen.has(trimmed)) return false;
    seen.add(trimmed);
    const expression = declaredExpression(source, trimmed);
    return expression !== null && payloadIsSafe(source, expression, seen);
  }
  const fields = [...trimmed.matchAll(/(?:^|[,{])\s*(?:["']?)([A-Za-z_$][\w$]*)(?:["']?)\s*:/g)]
    .map((match) => match[1]!);
  fields.push(...[...trimmed.matchAll(/(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)]
    .map((match) => match[1]!));
  const spreads = [...trimmed.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!);
  if (fields.length === 0 && spreads.length === 0 && !/\{\s*\}/.test(trimmed)) return false;
  if (fields.some((field) => !SAFE_UNIT_MASTER_FIELDS.has(field))) return false;
  return spreads.every((spread) => {
    const expression = declaredExpression(source, spread);
    return expression !== null && payloadIsSafe(source, expression, new Set(seen));
  });
}

export function occupancyBypasses(source: string): string[] {
  const failures: string[] = [];
  const residentAliases = tableAliases(source, "residentsTable")
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (new RegExp(`(?:update|insert|delete)\\s*\\(\\s*(?:${residentAliases})\\s*\\)`, "s").test(source)) {
    failures.push("direct residentsTable mutation");
  }
  const aliases = tableAliases(source, "unitsTable").map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const mutation = new RegExp(`\\b(?:update|insert)\\s*\\(\\s*(?:${aliases})\\s*\\)[\\s\\S]*?\\.(?:set|values)\\s*\\(`, "g");
  for (const match of source.matchAll(mutation)) {
    const open = match.index! + match[0].length - 1;
    const close = matchingParen(source, open);
    const payload = close < 0 ? "" : source.slice(open + 1, close);
    if (!payloadIsSafe(source, payload)) {
      failures.push("direct unitsTable occupancy or unproven mutation");
    }
  }
  if (/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?residents\b/i.test(source)) {
    failures.push("raw SQL residents/units mutation");
  }
  for (const statement of source.matchAll(/\b(?:UPDATE|INSERT\s+INTO)\s+(?:public\.)?units\b[\s\S]*?(?:`|;)/gi)) {
    if (OCCUPANCY_UNIT_SQL_FIELDS.some((field) => new RegExp(`\\b${field}\\b`, "i").test(statement[0]))) {
      failures.push("raw SQL sensitive units mutation");
    }
  }
  return failures;
}

describe("occupancy write boundary", () => {
  it("keeps resident and unit occupancy writes in occupancy.ts wrappers", () => {
    const residents = route("residents");
    const users = route("users");
    const units = route("units");

    // These route modules may query the tables, but status/portal/linkage and
    // unit occupant fields must not be written with an ad-hoc table builder.
    expect(residents).not.toMatch(/(?:update|insert)\(residentsTable\)/);
    expect(users).not.toMatch(/(?:update|insert)\(residentsTable\)/);
    expect(units).not.toMatch(/(?:update|insert)\(residentsTable\)/);
    expect(units).not.toMatch(/update\(unitsTable\)\.set\([^)]*occupantType/s);

    expect(residents).toContain("assertActivationAllowed");
    expect(residents).toContain("updateResidentOccupancy");
    expect(users).toContain("consumeInvitationLinkage");
    expect(units).toContain("setApprovedUnitOccupancy");
    expect(units).toContain("OCCUPANCY_FIELD_DIRECT_EDIT_FORBIDDEN");

    const releaseSubject = lib("releaseSubject");
    expect(releaseSubject).not.toMatch(/update\(residentsTable\)\.set\(\{\s*(?:status|linkedUserId|registeredById)/s);
    expect(releaseSubject).not.toMatch(/update\(unitsTable\)\.set\([^)]*(?:occupantType|verifiedOwnerId|verifiedTenantId|preApprovedClaimId)/s);
    expect(releaseSubject).toContain("moveOutHouseholdResidents");
    expect(releaseSubject).toContain("applyUnitReleaseOccupancy");
    expect(releaseSubject).toContain("clearResidentOccupancyLinkage");
    expect(releaseSubject).toContain("clearResidentRegistration");
  });

  it("recursively rejects bypasses in every production route and library", () => {
    const files = [
      ...productionSources(join(sourceRoot, "routes")),
      ...productionSources(join(sourceRoot, "lib")),
    ];
    const failures = files.flatMap((file) =>
      occupancyBypasses(file.source).map((failure) => `${file.path}: ${failure}`));
    expect(failures).toEqual([]);
  });

  it("detects synthetic ORM and raw-SQL bypass attempts", () => {
    expect(occupancyBypasses("await tx.update ( residentsTable ).set({ status: 'active' })")).toContain("direct residentsTable mutation");
    expect(occupancyBypasses("await tx.delete(residentsTable).where(x)")).toContain("direct residentsTable mutation");
    expect(occupancyBypasses("db.update(unitsTable).set({ verifiedTenantId: 7 })")).toContain("direct unitsTable occupancy or unproven mutation");
    expect(occupancyBypasses("db.update(unitsTable).set({ ['occupantType']: next })")).toContain("direct unitsTable occupancy or unproven mutation");
    expect(occupancyBypasses("db.insert(unitsTable).values({ building: 'A', unitNumber: '1', occupantType: 'owner_occupied' })")).toContain("direct unitsTable occupancy or unproven mutation");
    expect(occupancyBypasses("const patch = getPayload(); db.update(unitsTable).set(patch)")).toContain("direct unitsTable occupancy or unproven mutation");
    expect(occupancyBypasses("sql`UPDATE public.units SET occupant_type = 'vacant'`")).toContain("raw SQL sensitive units mutation");
    expect(occupancyBypasses("sql`INSERT INTO units (building, unit_number, occupant_type) VALUES ('A','1','owner_occupied')`")).toContain("raw SQL sensitive units mutation");
    expect(occupancyBypasses("sql`INSERT INTO residents (status) VALUES ('active')`")).toContain("raw SQL residents/units mutation");
    expect(occupancyBypasses("db.update(unitsTable).set({ building, unitNumber })")).toEqual([]);
    expect(occupancyBypasses("const patch = { emergencyContact: value, notes: text }; db.update(unitsTable).set(patch)")).toEqual([]);
    expect(occupancyBypasses("db.insert(unitsTable).values({ building: 'A', unitNumber: '1', floor: '2' })")).toEqual([]);
    expect(occupancyBypasses("sql`UPDATE units SET building = 'A', unit_number = '1' WHERE id = 1`")).toEqual([]);
  });

  it("does not exempt misleading occupancy-like filenames", () => {
    const misleadingPath = join(sourceRoot, "lib", "foo-occupancy.ts");
    expect(misleadingPath).not.toBe(canonicalOccupancyPath);
    expect(occupancyBypasses("tx.update(residentsTable).set({ status: 'active' })")).not.toEqual([]);
  });

  it("requires sorted multi-unit locking and explicit cross-unit refusal", () => {
    const occupancy = readFileSync(new URL("../lib/occupancy.ts", import.meta.url), "utf8");
    expect(occupancy).toMatch(/new Set\(\[found\.unitId, destinationUnitId\][\s\S]*?\.sort\(\(a, b\) => a - b\)/);
    expect(occupancy).toMatch(/for \(const unitId of unitIds\) states\.set\(unitId, await loadLockedOccupancy/);
    expect(occupancy).toContain("Active or primary residents cannot be moved directly between units.");
  });

  it("requires unit-scoped entitlement routes to use the shared occupancy authority", () => {
    const waha = route("wahaPasses");
    const vehicles = route("vehicles");
    const bookings = route("bookings");

    for (const source of [waha, vehicles, bookings]) {
      expect(source).toMatch(/from ["']\.\.\/lib\/occupancy["']/);
      expect(source).toContain("assertActiveOccupantEligibility");
    }

    // Profile flags alone are not occupancy truth. The shared assertion takes
    // the canonical unit lock and validates the active linked resident.
    expect(waha).not.toContain("function isVerified");
    expect(vehicles).not.toMatch(/const isVerified\s*=/);
    expect(bookings).toMatch(/assertActiveOccupantEligibility\(tx, caller\.id\)/);
    expect(vehicles).toMatch(/assertActiveOccupantEligibility\(tx, caller\.id\)/);
    // Both application and credential-issue/approval paths must recheck.
    expect((waha.match(/assertActiveOccupantEligibility\(tx,/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});