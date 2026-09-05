import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const verification = readFileSync(resolve(process.cwd(), "src/pages/portal/unit-verification.tsx"), "utf-8");
const vehicles = readFileSync(resolve(process.cwd(), "src/pages/portal/vehicles.tsx"), "utf-8");

describe("current verification and vehicle contracts", () => {
  it("uses a 16-digit Mullak number rather than an owner deed upload", () => {
    expect(verification).toContain("titleDeedNumber");
    expect(verification).toContain("/^[0-9]{16}$/");
    expect(verification).not.toContain("title-deed-upload");
  });

  it("does not collect tenant nationality or parking declarations", () => {
    expect(verification).not.toContain("tenantForm.nationality");
    expect(verification).not.toContain("tenantForm.parkingLots");
  });

  it("uses only the caller's generated parking-lot endpoint for vehicle choices", () => {
    expect(vehicles).toContain("useListMyVehicleParkingLots");
    expect(vehicles).toContain("parkingLotId");
    expect(vehicles).toContain('data-testid="vehicle-parking-lot"');
  });
});