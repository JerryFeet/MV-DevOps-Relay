import { expect, test } from "@playwright/test";

const BUILDINGS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "CA", "CB", "CD", "CE"];
const APARTMENTS = Array.from({ length: 34 }, (_, index) => String(index + 1));

async function capture(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  filename: string,
) {
  const path = testInfo.outputPath(filename);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(filename, { path, contentType: "image/png" });
}

async function toggleArabic(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /عربي — Arabic|English — EN/ }).first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

async function expectNativeUnitSelectors(
  page: import("@playwright/test").Page,
  building: import("@playwright/test").Locator,
  apartment: import("@playwright/test").Locator,
) {
  await expect(building.locator("input, textarea")).toHaveCount(0);
  await expect(apartment.locator("input, textarea")).toHaveCount(0);

  const buildingValues = await building.locator("option").evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean),
  );
  const apartmentValues = await apartment.locator("option").evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(buildingValues).toEqual(BUILDINGS);
  expect(apartmentValues).toEqual(APARTMENTS);
  expect(buildingValues).not.toContain("CC");
  expect(buildingValues).not.toContain("HOA");
  expect(apartmentValues.every(value => /^[0-9]+$/.test(value))).toBe(true);
  expect(buildingValues.every(value => /^[A-Z]+$/.test(value))).toBe(true);
  await expect(page.getByText("HOA COMMON", { exact: true })).toHaveCount(0);
}

async function expectUnitReferenceSelect(
  page: import("@playwright/test").Page,
  select: import("@playwright/test").Locator,
) {
  const values = await select.locator("option").evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values).toHaveLength(30 * 34);
  expect(values[0]).toBe("A1");
  expect(values.at(-1)).toBe("CE34");
  expect(values).not.toContain("CC1");
  expect(values).not.toContain("HOA COMMON");
  expect(values.every(value => /^[A-Z]+[0-9]+$/.test(value))).toBe(true);
  await expect(page.getByText("HOA COMMON", { exact: true })).toHaveCount(0);
}

async function expectGatePicker(page: import("@playwright/test").Page, input: import("@playwright/test").Locator) {
  await expect(input).toHaveAttribute("list", "gate-unit-options");
  await expect(input).not.toHaveAttribute("type", "number");
  await input.fill("CC1");
  await expect(input.locator("xpath=../../button")).toBeDisabled();
  await input.fill("HOA COMMON");
  await expect(input.locator("xpath=../../button")).toBeDisabled();
  await input.fill("CE34");
  await expect(input.locator("xpath=../../button")).toBeEnabled();

  const options = await page.locator("#gate-unit-options option").evaluateAll(optionNodes =>
    optionNodes.map(option => (option as HTMLOptionElement).value),
  );
  expect(options.every(value => /^[A-Z]+[0-9]+$/.test(value))).toBe(true);
  expect(options).not.toContain("CC1");
  expect(options).not.toContain("HOA COMMON");
}

test.describe("UAT workbook evidence — P1 unit selectors", () => {
  test("P1-R1/P1-R2 — resident tenant verification uses canonical selectors in English and Arabic", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/unit-verification");
    await page.getByRole("button", { name: /^Tenant\b/i }).click();
    await expect(page.getByRole("heading", { name: /tenant/i }).first()).toBeVisible();

    const building = page.locator("select").filter({ has: page.locator("option[value='CA']") });
    const apartment = page.locator("select").filter({ has: page.locator("option[value='34']") });
    await expectNativeUnitSelectors(page, building, apartment);
    await capture(page, testInfo, "p1-tenant-verification-en.png");

    await toggleArabic(page);
    await expectNativeUnitSelectors(page, building, apartment);
    await capture(page, testInfo, "p1-tenant-verification-ar.png");
  });

  test("P1-O1 — owner form source remains selector-backed (deliberate refusal)", async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: "refusal",
      description: "The free-text Arabic unit value و١٤ is deliberately refused by the selector contract.",
    });
    await page.goto("/portal/unit-verification");
    await page.getByRole("button", { name: /^Owner\b/i }).click();
    const building = page.locator("select").filter({ has: page.locator("option[value='CA']") });
    const apartment = page.locator("select").filter({ has: page.locator("option[value='34']") });
    await expectNativeUnitSelectors(page, building, apartment);
    await expect(page.locator("input").evaluateAll(inputs =>
      inputs.some(input => /unit|building|apartment/i.test(`${input.getAttribute("name")} ${input.getAttribute("placeholder")}`)),
    )).resolves.toBe(false);
    await capture(page, testInfo, "p1-owner-refusal-source-backed.png");
  });

  test("P1-G1/P1-G2 — guard resident and permit searches reject non-canonical input", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/security-gate");
    await expect(page.getByRole("heading", { name: "Security Gate", exact: true })).toBeVisible();

    await page.getByRole("button", { name: /residents|السكان/i }).click();
    await page.getByRole("button", { name: /^Unit$|^الوحدة$/i }).click();
    const residentInput = page.locator('input[list="gate-unit-options"]').first();
    await expectGatePicker(page, residentInput);
    await capture(page, testInfo, "p1-gate-resident-picker-en.png");

    await page.getByRole("button", { name: /permits|التصاريح/i }).click();
    const permitInput = page.locator('input[list="gate-unit-options"]').first();
    await expectGatePicker(page, permitInput);

    await toggleArabic(page);
    await expectGatePicker(page, page.locator('input[list="gate-unit-options"]').first());
    await capture(page, testInfo, "p1-gate-picker-ar.png");
  });

  test("P1-A1/A2/A3 — admin unit selectors exclude HOA COMMON in all operational filters", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/unit-registry");
    await expect(page.getByRole("heading", { name: "Unit Registry", exact: true })).toBeVisible();
    const registrySelect = page.locator("select").first();
    await expectUnitReferenceSelect(page, registrySelect);

    await page.goto("/portal/admin/historical-records");
    await expect(page.getByRole("heading", { name: /Historical Records|السجلات التاريخية/i })).toBeVisible();
    const unitTrigger = page
      .locator("label")
      .filter({ hasText: /^Unit Number$|^رقم الوحدة$/ })
      .locator("..")
      .locator('button[role="combobox"]');
    await unitTrigger.click();
    const historicalOptions = await page.locator('[role="option"]').evaluateAll(options =>
      options.map(option => option.textContent?.trim() ?? "").filter(Boolean),
    );
    expect(historicalOptions).toContain("A1");
    expect(historicalOptions).not.toContain("CC1");
    expect(historicalOptions).not.toContain("HOA COMMON");
    expect(historicalOptions.filter(value => /^[A-Z]+[0-9]+$/.test(value))).toHaveLength(30 * 34);
    await page.keyboard.press("Escape");

    await page.goto("/portal/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard", exact: true })).toBeVisible();
    const wahaSectionToggle = page.getByRole("button", { name: /Waha Pass \(|بطاقة واحة \(/i });
    await expect(wahaSectionToggle).toBeVisible();
    await wahaSectionToggle.click();
    const wahaHeading = page.getByText(/Unit View|عرض الوحدة/i).first();
    await expect(wahaHeading).toBeVisible();
    const wahaSelect = wahaHeading.locator("xpath=..").locator("select");
    await expectUnitReferenceSelect(page, wahaSelect);
    await capture(page, testInfo, "p1-admin-unit-filters-en.png");
  });
});

test.describe("UAT workbook evidence — P4 homepage map", () => {
  test("P4-R1 — Madain Village map remains centered at desktop and 390px", async ({ page }, testInfo) => {
    await page.goto("/");
    const map = page.getByTitle("MADAIN Village location");
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("src", /q=24\.8271875,46\.7808125/);
    await expect(map).toHaveAttribute("src", /[?&]z=17(?:&|$)/);

    const desktopBox = await map.boundingBox();
    const desktopViewport = page.viewportSize();
    expect(desktopBox).not.toBeNull();
    expect(Math.abs(
      (desktopBox?.x ?? 0) + (desktopBox?.width ?? 0) / 2 - (desktopViewport?.width ?? 0) / 2,
    )).toBeLessThan(8);
    await capture(page, testInfo, "p4-home-map-desktop.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const mobileMap = page.getByTitle("MADAIN Village location");
    await expect(mobileMap).toBeVisible();
    const mobileBox = await mobileMap.boundingBox();
    expect(mobileBox).not.toBeNull();
    expect(Math.abs((mobileBox?.x ?? 0) + (mobileBox?.width ?? 0) / 2 - 195)).toBeLessThan(8);
    await capture(page, testInfo, "p4-home-map-390.png");

    await page.setViewportSize({ width: 844, height: 844 });
    const resizedBox = await page.getByTitle("MADAIN Village location").boundingBox();
    expect(resizedBox).not.toBeNull();
    expect(Math.abs((resizedBox?.x ?? 0) + (resizedBox?.width ?? 0) / 2 - 422)).toBeLessThan(8);
    await capture(page, testInfo, "p4-home-map-resized.png");
  });

  test("P4-R2 — unsupported legacy map coordinate is deliberately refused", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTitle("MADAIN Village location")).not.toHaveAttribute(
      "src",
      /24\.774265,46\.738586/,
    );
  });
});