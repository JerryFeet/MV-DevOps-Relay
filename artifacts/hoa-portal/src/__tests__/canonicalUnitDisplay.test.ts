import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("canonical portal unit display", () => {
  it("routes current-user unit displays through the shared canonical helper", () => {
    for (const path of [
      "src/components/PortalLayout.tsx",
      "src/pages/portal/change-of-ownership.tsx",
      "src/pages/portal/unit-verification.tsx",
      "src/pages/portal/vehicles.tsx",
      "src/pages/portal/SecurityGate.tsx",
      "src/pages/portal/dashboard.tsx",
      "src/pages/portal/guests.tsx",
      "src/pages/portal/portal-help.tsx",
      "src/pages/portal/HistoricalRecords.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain("displayUnitReference");
    }
  });

  it("uses the canonical helper at each reviewed unit display surface", () => {
    const reviewedDisplays: Record<string, string[]> = {
      "src/pages/portal/SecurityGate.tsx": [
        "displayUnitReference(result.unitNumber)",
        "displayUnitReference(plateResult.unitNumber)",
      ],
      "src/pages/portal/dashboard.tsx": ["displayUnitReference(user?.unitNumber)"],
      "src/pages/portal/guests.tsx": [
        "displayUnitReference(guest.residentUnit)",
        "displayUnitReference(g.residentUnit)",
        "displayUnitReference(user?.unitNumber)",
      ],
      "src/pages/portal/portal-help.tsx": ["displayUnitReference(user?.unitNumber)"],
      "src/pages/portal/HistoricalRecords.tsx": ["displayUnitReference(r.unitNumber)"],
    };

    for (const [path, displays] of Object.entries(reviewedDisplays)) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      for (const display of displays) {
        expect(source).toContain(display);
      }
    }
  });
});