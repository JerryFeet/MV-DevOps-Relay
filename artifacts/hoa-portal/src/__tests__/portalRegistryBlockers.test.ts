import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { t } from "@/lib/translations";

const admin = readFileSync(resolve(process.cwd(), "src/pages/portal/admin.tsx"), "utf-8");
const registry = readFileSync(resolve(process.cwd(), "src/pages/portal/unitRegistry.tsx"), "utf-8");

describe("admin owner-claim review blockers", () => {
  it("does not offer the obsolete deed-review basis for new approvals", () => {
    const options = admin.slice(admin.indexOf("const basisOptions"), admin.indexOf("function toggleBasis"));
    expect(options).not.toContain("title_deed_reviewed");
  });

  it("limits the Mullak verification message to a numeric current claim and labels legacy documents", () => {
    expect(admin).toContain('/^[0-9]{16}$/.test(v.titleDeedNumber ?? "")');
    expect(admin).toContain("deed_number_verified_against_mullak");
    expect(admin).toContain("adm_view_historical_title_deed");
  });

  it.each(["en", "ar"] as const)("has clear %s labels for current and historical claim evidence", (lang) => {
    expect(t(lang, "deed_number_verified_against_mullak")).toBeTruthy();
    expect(t(lang, "adm_view_historical_title_deed")).toBeTruthy();
    expect(t(lang, "adm_account_submitted_owner_name")).toBeTruthy();
  });
});

describe("unit registry access and parking labels", () => {
  it("renders resident access badges and the backend vehicle parking fields", () => {
    expect(registry).toContain("portalAccess: boolean");
    expect(registry).toContain("hasActiveWahaCredential: boolean");
    expect(registry).toContain("parkingLotNumber: string | null");
    expect(registry).toContain('parkingType: "underground" | "surface" | null');
    expect(registry).toContain("v.parkingLotNumber ??");
    expect(registry).toContain('v.parkingType === "underground"');
    expect(registry).not.toContain("parkingLotType");
  });

  it.each(["en", "ar"] as const)("has complete %s resident and parking labels", (lang) => {
    [
      "unit_reg_portal_access",
      "unit_reg_no_portal_access",
      "unit_reg_active_waha_credential",
      "unit_reg_no_active_waha_credential",
      "unit_reg_assigned_parking_lot",
      "unit_reg_parking_underground",
      "unit_reg_parking_surface",
    ].forEach((key) => expect(t(lang, key)).toBeTruthy());
  });
});