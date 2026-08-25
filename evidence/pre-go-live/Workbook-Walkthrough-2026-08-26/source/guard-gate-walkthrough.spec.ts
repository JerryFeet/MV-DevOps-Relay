/**
 * Live SG1/SG5 UAT: a real Clerk-authenticated guard operates the actual
 * portal and API against development fixtures. Credential strings are entered
 * manually; a physical camera scan is not represented as automated evidence.
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  seedGateWalkthroughFixtures,
  type GateWalkthroughFixture,
} from "./helpers/db";

test.setTimeout(120_000);

async function scanCredential(page: Page, code: string) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/security/gate/scan?code=") &&
      response.request().method() === "GET",
  );
  const input = page.getByPlaceholder(/scan or enter a madain village credential/i);
  await input.fill(code);
  await input.press("Enter");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

async function enterPermitLookup(
  page: Page,
  expectedEndpoint: string,
  unitNumber: string,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(expectedEndpoint) &&
      response.request().method() === "GET",
  );
  const input = page.getByPlaceholder(/unit number, e\.g\. a101/i);
  await input.fill(unitNumber);
  await input.press("Enter");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

async function captureGateEvidence(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
  return path;
}

test.describe("Guard gate walkthrough — real Clerk session and live API", () => {
  // The flow intentionally invalidates its Clerk session, so repeating the same
  // browser context would not be an independent retry.
  test.describe.configure({ retries: 0 });

  let fixture: GateWalkthroughFixture;

  test.beforeAll(async () => {
    fixture = await seedGateWalkthroughFixtures();
  });

  test("a signed-in guard sees all five positive decisions and signs out after 15 minutes idle", async ({
    page,
  }, testInfo) => {
    // This installs only a controllable browser clock. The idle timer belongs to
    // the mounted production PortalLayout, while the auth session and API calls
    // remain real.
    await page.clock.install();
    await page.goto("/portal/security-gate");
    await expect(page).toHaveURL(/\/portal\/security-gate/, { timeout: 20_000 });
    await expect(page.getByTestId("gate-active-session")).toContainText("E2E Guard");
    await expect(page.getByRole("heading", { name: "Security Gate" })).toBeVisible();

    await page.getByRole("button", { name: /scan credential/i }).click();
    await expect(page.getByText(/camera access denied or unavailable/i)).toBeVisible();
    await captureGateEvidence(page, testInfo, "00-camera-unavailable-in-headless-uat");

    const guestScan = await scanCredential(page, fixture.guestPassToken);
    expect(guestScan).toMatchObject({
      credentialType: "guest",
      valid: true,
      guestName: fixture.guestName,
      unitNumber: fixture.unitNumber,
      vehiclePlate: "E2E-GUEST-01",
    });
    await expect(page.locator("main")).toContainText(fixture.guestName);
    await expect(page.locator("main")).toContainText(fixture.unitNumber);
    await expect(page.getByRole("button", { name: /guest entered/i })).toBeVisible();
    await captureGateEvidence(page, testInfo, "01-guest-pass-approved");

    await page.getByRole("button", { name: /scan next/i }).click();
    const dayPassScan = await scanCredential(page, fixture.dayPassBarcode);
    expect(dayPassScan).toMatchObject({
      credentialType: "daypass",
      valid: true,
      paid: true,
      guestCount: 3,
      unitNumber: fixture.unitNumber,
      vehiclePlate: "E2E-DAY-42",
    });
    await expect(page.locator("main")).toContainText("Paid");
    await expect(page.locator("main")).toContainText("Yes");
    await expect(page.locator("main")).toContainText("E2E-DAY-42");
    await captureGateEvidence(page, testInfo, "02-paid-guest-day-pass-approved");

    await page.getByRole("button", { name: /scan next/i }).click();
    const wahaScan = await scanCredential(page, fixture.wahaPassNumber);
    expect(wahaScan).toMatchObject({
      credentialType: "waha",
      valid: true,
      holderName: fixture.residentName,
      unitNumber: fixture.unitNumber,
    });
    await expect(page.locator("main")).toContainText(fixture.residentName);
    await expect(page.locator("main")).toContainText(fixture.unitNumber);
    await captureGateEvidence(page, testInfo, "03-waha-credential-approved");

    await page.getByRole("button", { name: "Residents" }).click();
    await page.getByRole("button", { name: /national id/i }).click();
    const residentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/gate/residents?nationalId=") &&
        response.request().method() === "GET",
    );
    const nationalIdInput = page.getByPlaceholder(/enter national id/i);
    await nationalIdInput.fill(fixture.residentNationalId);
    await nationalIdInput.press("Enter");
    const residentResponse = await residentResponsePromise;
    expect(residentResponse.status()).toBe(200);
    const residentPayload = await residentResponse.json() as Array<Record<string, unknown>>;
    expect(residentPayload).toEqual(expect.arrayContaining([
      expect.objectContaining({
        firstName: "Gate",
        lastName: "Fixture Resident",
        unitNumber: fixture.unitNumber,
        role: "owner",
      }),
    ]));
    expect(JSON.stringify(residentPayload)).not.toContain(fixture.residentNationalId);
    expect(JSON.stringify(residentPayload)).not.toContain(fixture.residentEmail);
    await expect(page.locator("main")).toContainText(fixture.residentName);
    await expect(page.locator("main")).toContainText(fixture.unitNumber);
    await captureGateEvidence(page, testInfo, "04-national-id-resident-result");

    await page.getByRole("button", { name: "Permits" }).click();
    const moveIn = await enterPermitLookup(page, "/api/gate/move-in-status?", fixture.unitNumber);
    expect(moveIn).toMatchObject({ allowed: true, status: "APPROVED_MOVE_IN_PERMIT" });
    await expect(page.locator("main")).toContainText("APPROVED MOVE-IN PERMIT");
    await captureGateEvidence(page, testInfo, "05-move-in-permit-approved");

    await page.getByRole("button", { name: /move-?out/i }).click();
    const moveOut = await enterPermitLookup(page, "/api/gate/move-out-status?", fixture.unitNumber);
    expect(moveOut).toMatchObject({ allowed: true, status: "APPROVED_MOVE_OUT_PERMIT" });
    await expect(page.locator("main")).toContainText("APPROVED MOVE-OUT PERMIT");
    await captureGateEvidence(page, testInfo, "06-move-out-permit-approved");

    await page.getByRole("button", { name: "Renovation" }).click();
    const renovation = await enterPermitLookup(page, "/api/gate/renovation-status?", fixture.unitNumber);
    expect(renovation).toMatchObject({
      allowed: true,
      status: "APPROVED_RENOVATION_PERMIT",
      contractorName: fixture.contractorName,
      contractorMobile: fixture.contractorMobile,
    });
    await expect(page.locator("main")).toContainText("APPROVED RENOVATION PERMIT");
    await expect(page.locator("main")).toContainText(fixture.contractorName);
    await expect(page.locator("main")).toContainText(fixture.contractorMobile);
    await captureGateEvidence(page, testInfo, "07-renovation-permit-approved");

    await page.clock.fastForward(15 * 60 * 1000);
    await expect(page).toHaveURL(/\/sign-in\?redirect_url=/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/portal\/security-gate/);
    await captureGateEvidence(page, testInfo, "08-guard-signed-out-after-idle-timeout");
  });
});