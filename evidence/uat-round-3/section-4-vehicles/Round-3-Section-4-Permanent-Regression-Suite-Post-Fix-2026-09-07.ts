import { expect, test, type Page } from "@playwright/test";
import {
  ensureRound3VehicleFixture,
  prepareRound3VehicleUnverifiedUser,
} from "./helpers/db";

const EMAIL =
  process.env.E2E_ROUND3_VEHICLE_EMAIL ??
  "e2e-round3-vehicles+clerk_test@example.com";

async function openVehicleDialog(page: Page) {
  await page.goto("/portal/vehicles");
  await page.getByRole("button", { name: /register vehicle/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillVehicle(
  page: Page,
  values: { make: string; model: string; plate: string; lotId: number },
) {
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Toyota").fill(values.make);
  await dialog.getByPlaceholder("Camry").fill(values.model);
  await dialog.getByPlaceholder("ABC-1234").fill(values.plate);
  await dialog.getByTestId("vehicle-parking-lot").selectOption(String(values.lotId));
}

test.describe("Round 3 Section 4 — vehicles and owner parking", () => {
  test.use({ storageState: "./e2e/.auth/round3-vehicles.json" });

  test("4a — owner-workflow legacy parking is selectable with lot number and type", async ({ page }, testInfo) => {
    const fixture = await ensureRound3VehicleFixture(
      EMAIL,
      testInfo.titlePath.join(" "),
      testInfo.workerIndex,
      testInfo.retry,
      "legacy",
    );
    const dialog = await openVehicleDialog(page);
    const options = await dialog.getByTestId("vehicle-parking-lot").locator("option").allTextContents();
    await testInfo.attach("section4-legacy-owner-parking-options.json", {
      body: JSON.stringify({ fixture, options }, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("section4-legacy-owner-parking-options.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    expect(options.some((option) =>
      option.includes(fixture.lotNumber) && /underground/i.test(option)
    )).toBe(true);
  });

  test("4b — vehicle registration has no Istimara field", async ({ page }, testInfo) => {
    await ensureRound3VehicleFixture(
      EMAIL,
      testInfo.titlePath.join(" "),
      testInfo.workerIndex,
      testInfo.retry,
      "normalized",
    );
    const dialog = await openVehicleDialog(page);
    await testInfo.attach("section4-istimara-field.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expect(dialog.getByText(/istimara/i)).toHaveCount(0);
  });

  test("4c — clicking outside preserves the vehicle dialog and entered values", async ({ page }, testInfo) => {
    await ensureRound3VehicleFixture(
      EMAIL,
      testInfo.titlePath.join(" "),
      testInfo.workerIndex,
      testInfo.retry,
      "normalized",
    );
    const dialog = await openVehicleDialog(page);
    const make = dialog.getByPlaceholder("Toyota");
    await make.fill("OutsideClickMustPersist");
    await page.mouse.click(5, 5);
    await testInfo.attach("section4-outside-click-dialog.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expect(dialog).toBeVisible();
    await expect(make).toHaveValue("OutsideClickMustPersist");
  });

  test("4d — two vehicles may share one owner-registered lot and display its type", async ({ page }, testInfo) => {
    const fixture = await ensureRound3VehicleFixture(
      EMAIL,
      testInfo.titlePath.join(" "),
      testInfo.workerIndex,
      testInfo.retry,
      "normalized",
    );
    if (!fixture.lotId) throw new Error("normalized vehicle fixture has no parking lot id");

    await openVehicleDialog(page);
    await fillVehicle(page, {
      make: "Round3",
      model: "Primary",
      plate: `R3V-${testInfo.workerIndex}-${testInfo.retry}-A`,
      lotId: fixture.lotId,
    });
    const firstResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/vehicles",
    );
    await page.getByRole("dialog").getByRole("button", { name: /register vehicle/i }).click();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status()).toBe(201);
    const currentVehicleCard = page.locator("div.rounded-xl").filter({
      hasText: `R3V-${testInfo.workerIndex}-${testInfo.retry}-A`,
    }).first();
    await expect(currentVehicleCard).toContainText(fixture.lotNumber);
    await expect(currentVehicleCard).toContainText(/underground/i);

    await page.getByRole("button", { name: /register vehicle/i }).click();
    await fillVehicle(page, {
      make: "Round3",
      model: "Rental",
      plate: `R3V-${testInfo.workerIndex}-${testInfo.retry}-B`,
      lotId: fixture.lotId,
    });
    await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({
      name: "round3-rental-registration.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% Round 3 vehicle fixture\n"),
    });
    await expect(page.getByText(/document attached|round3-rental-registration/i)).toBeVisible();

    const secondResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/vehicles",
    );
    await page.getByRole("dialog").getByRole("button", { name: /submit request/i }).click();
    const secondResponse = await secondResponsePromise;
    const secondBody = await secondResponse.json();
    await testInfo.attach("section4-second-vehicle-response.json", {
      body: JSON.stringify({ fixture, status: secondResponse.status(), body: secondBody }, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("section4-second-vehicle-result.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    expect(secondResponse.status()).toBe(201);
    expect(secondBody.error).not.toBe("PARKING_ENTITLEMENT_EXCEEDED");
  });

  test("4e — owner registration requires an explicit parking decision", async ({ page }, testInfo) => {
    await prepareRound3VehicleUnverifiedUser(EMAIL);
    await page.goto("/portal/unit-verification");
    await page.getByRole("button", { name: /^owner\b/i }).click();
    await testInfo.attach("section4-owner-parking-decision.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expect(page.getByText(/no parking lot/i)).toBeVisible();
  });

  test("4f — tenant registration does not ask the tenant to declare parking", async ({ page }, testInfo) => {
    await prepareRound3VehicleUnverifiedUser(EMAIL);
    await page.goto("/portal/unit-verification");
    await page.getByRole("button", { name: /tenant/i }).click();
    await testInfo.attach("section4-tenant-no-parking-declaration.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expect(page.getByText(/parking lot/i)).toHaveCount(0);
  });
});