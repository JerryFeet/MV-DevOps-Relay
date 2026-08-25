import { expect, test } from "@playwright/test";

/**
 * Go-Live Workbook — Section B (resident checks)
 *
 * This is deliberately read-only: it uses the verified-resident Clerk storage
 * state produced by verified-resident.setup.ts, which also seeds an active Waha
 * Pass.  It does not submit forms, upload files, delete records, or create a
 * booking.  Every inspected UI screen is retained as a numbered full-page
 * screenshot in the Playwright test output.
 */

async function capture(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  filename: string,
) {
  const path = testInfo.outputPath(filename);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(filename, { path, contentType: "image/png" });
}

test.describe("Go-Live Workbook Section B — verified resident", () => {
  test("B3 — Waha Pass is presented as a facility-access credential", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/waha-pass");
    await expect(page.getByRole("heading", { name: /my waha pass/i })).toBeVisible();
    await expect(
      page.getByText("Madain Village resident facility-access credential", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/gate access/i)).toHaveCount(0);
    await capture(page, testInfo, "B03-01-waha-facility-access.png");
  });

  // Manual reason: this fixture is intentionally already a verified owner, so
  // its unit-verification page renders the verified state rather than the owner
  // form where the exact parking checkbox wording is displayed. Re-opening that
  // form would require changing verification data, which this walkthrough must
  // not mutate.
  test.skip("B4 — owner verification form labels parking exactly “Underground Parking”", async () => {});

  test("B5 — household member phone selector defaults to Saudi Arabia", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/residents");
    const addMember = page.getByRole("button", { name: /add member/i });
    await expect(addMember).toBeVisible();
    await addMember.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const country = dialog.getByLabel("Country code");
    await expect(country).toHaveValue("SA");
    await expect(country.locator("option:checked")).toContainText("+966");
    await expect(dialog.getByLabel(/saudi arabia/i)).toBeVisible();
    await capture(page, testInfo, "B05-01-saudi-phone-selector.png");
  });

  test("B6 — Documents deliberately exposes no resident folder or file management controls", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/documents");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: /document/i }).first()).toBeVisible();

    // A resident may view/download published documents, but cannot manage them.
    await expect(main.getByRole("button", { name: /add folder/i })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /add document/i })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /upload/i })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /delete|remove/i })).toHaveCount(0);
    await expect(main.locator('input[type="file"]')).toHaveCount(0);
    await capture(page, testInfo, "B06-01-documents-read-only.png");
  });

  test("B8 — Maintenance is absent from resident navigation and resolves to the portal 404", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal");
    await expect(page.getByText("MADAIN Village", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /maintenance/i })).toHaveCount(0);
    await capture(page, testInfo, "B08-01-resident-navigation-no-maintenance.png");

    await page.goto("/portal/maintenance");
    await expect(page.getByText(/404|not found/i).first()).toBeVisible();
    await expect(page.getByText(/maintenance/i)).toHaveCount(0);
    await capture(page, testInfo, "B08-02-maintenance-route-404.png");
  });

  test("B9 — Dalil opens with its introductory no-personal-data disclosure", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal");
    await page.getByRole("button", { name: "Dalil" }).click();
    await expect(page.getByText("Dalil", { exact: true }).last()).toBeVisible();
    await expect(
      page.getByText(/I don't have access to your personal information/i),
    ).toBeVisible();
    await capture(page, testInfo, "B09-01-dalil-intro-no-personal-data.png");
  });

  test("B12 — facility calendar and slots display only when seeded availability is visible", async ({
    page,
  }, testInfo) => {
    await page.goto("/portal/facilities");
    const facility = page.locator("button").filter({ has: page.locator("h3") }).first();
    const facilityVisible = await facility
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!facilityVisible) {
      test.skip(true, "Manual check required: no seeded facility card was visible.");
    }

    await facility.click();
    const datePicker = page.getByTestId("date-picker-trigger");
    await expect(datePicker).toBeVisible();
    // The initial date uses the resident calendar's dd MMM yyyy convention.
    await expect(datePicker).toContainText(/^\d{2}\s[A-Z][a-z]{2}\s\d{4}$/);
    await datePicker.click();
    await expect(page.locator('[role="grid"]')).toBeVisible();
    // Dates before today are disabled; the grid exposes the booking boundary.
    const disabledDates = page.locator('[role="gridcell"] button[disabled]');
    await expect(disabledDates.first()).toBeVisible();
    await capture(page, testInfo, "B12-01-calendar-boundary-and-date-format.png");

    const availability = page.getByRole("button", { name: /view available times/i });
    await expect(availability).toBeVisible();
    await availability.click();
    const slot = page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}:\d{2}/ }).first();
    const slotVisible = await slot
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!slotVisible) {
      test.skip(true, "Manual check required: seeded facility has no visible available time slot.");
    }
    await expect(slot).toContainText(/^\d{1,2}:\d{2}/);
    await capture(page, testInfo, "B12-02-available-slot-display.png");
  });
});