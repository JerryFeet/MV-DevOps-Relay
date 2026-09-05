/**
 * Release mutation boundary contract.
 *
 * Terminal account release is intentionally centralized in releaseSubject.
 * This source-level gate complements behavioral tests: a future direct user
 * deletion or a second move-out cascade must fail review before it can become
 * an untested fourth bypass.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC_ROOT = existsSync(resolve(process.cwd(), "src"))
  ? resolve(process.cwd(), "src")
  : resolve(process.cwd(), "artifacts/api-server/src");
const EXTERNAL_IDENTITY_DELETION_ADAPTER = "lib/externalIdentityDeletionJobs.ts";
const OCCUPANCY_AUTHORITY = "lib/occupancy.ts";
const RELEASE_ENGINE = "lib/releaseSubject.ts";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory() && entry.name === "__tests__") return [];
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

function assertReleaseBoundary(filename: string, source: string): void {
  const hasDirectUserDelete = /(?:db|tx)\.delete\(usersTable\)/.test(source);
  const hasClerkUserDelete = /clerkClient\.users\.deleteUser\(/.test(source);
  const hasDirectMoveOut = /residentsTable[\s\S]{0,180}status:\s*["']moved_out["']/.test(source);

  if (
    (filename !== RELEASE_ENGINE && hasDirectUserDelete)
    || (filename !== OCCUPANCY_AUTHORITY && hasDirectMoveOut)
    || (filename !== RELEASE_ENGINE
      && filename !== EXTERNAL_IDENTITY_DELETION_ADAPTER
      && hasClerkUserDelete)
  ) {
    throw new Error(`Terminal release mutation outside release engine: ${filename}`);
  }
}

describe("terminal release mutation boundary", () => {
  it("allows terminal account deletion only in releaseSubject and occupancy mutations only in occupancy.ts", () => {
    for (const file of sourceFiles(SRC_ROOT)) {
      const filename = relative(SRC_ROOT, file).replaceAll("\\", "/");
      assertReleaseBoundary(filename, readFileSync(file, "utf8"));
    }
  });

  it("requires releaseSubject to orchestrate terminal occupancy through the shared authority", () => {
    const releaseSubject = readFileSync(resolve(SRC_ROOT, RELEASE_ENGINE), "utf8");
    expect(releaseSubject).toMatch(/from ["']\.\/occupancy["']/);
    for (const api of [
      "beginHouseholdRelease",
      "moveOutHouseholdResidents",
      "applyUnitReleaseOccupancy",
      "clearResidentOccupancyLinkage",
      "clearResidentRegistration",
    ]) {
      expect(releaseSubject).toContain(api);
    }
    expect(releaseSubject).not.toMatch(/(?:db|tx)\.update\(residentsTable\)\.set\(\{[\s\S]{0,180}(?:status:\s*["']moved_out["']|linkedUserId:|registeredById:)/);
    expect(releaseSubject).not.toMatch(/(?:db|tx)\.update\(unitsTable\)\.set\(\{[\s\S]{0,180}(?:occupantType:|verifiedOwnerId:|verifiedTenantId:|preApprovedClaimId:)/);
  });

  it("rejects a synthetic new route that attempts a direct account deletion", () => {
    expect(() => assertReleaseBoundary(
      "routes/future-release.ts",
      "await db.delete(usersTable).where(eq(usersTable.id, subjectUserId));",
    )).toThrow("Terminal release mutation outside release engine");
  });

  it("rejects a synthetic direct move-out outside occupancy.ts", () => {
    expect(() => assertReleaseBoundary(
      "routes/future-release.ts",
      "await tx.update(residentsTable).set({ status: 'moved_out' });",
    )).toThrow("Terminal release mutation outside release engine");
  });

  it("rejects the retired legacy deletion helper and ownership-route import", () => {
    expect(existsSync(resolve(SRC_ROOT, "lib/deleteUserAccount.ts"))).toBe(false);
    const ownershipRoute = readFileSync(resolve(SRC_ROOT, "routes/ownershipChanges.ts"), "utf8");
    expect(ownershipRoute).not.toContain("deleteUserAccount");
    expect(ownershipRoute).toContain("releaseSubject");
  });

  it("documents the only external-deletion adapter as a durable release-job worker", () => {
    const worker = readFileSync(resolve(SRC_ROOT, EXTERNAL_IDENTITY_DELETION_ADAPTER), "utf8");
    expect(worker).toContain("externalIdentityDeletionJobsTable");
    expect(worker).toContain("operationId");
    expect(worker).toContain("clerkClient.users.deleteUser(job.clerkId)");
  });
});