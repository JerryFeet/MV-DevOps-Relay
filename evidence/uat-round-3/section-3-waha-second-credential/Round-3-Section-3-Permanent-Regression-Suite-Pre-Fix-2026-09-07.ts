import { expect, test } from "@playwright/test";
import { ensureRound3WahaSecondCredentialFixture, rotateVerifiedResidentE2eFixture } from "./helpers/db";

const VERIFIED_EMAIL = process.env.E2E_VERIFIED_RESIDENT_EMAIL ?? "e2e-verified-resident+clerk_test@example.com";
const WAHA_EMAIL = process.env.E2E_ROUND3_WAHA_EMAIL ?? "e2e-round3-waha+clerk_test@example.com";

test.describe("Round 3 Section 3 — Waha application/unit and Credential 2 regressions", () => {
  test.use({ storageState: "./e2e/.auth/verified-resident.json" });
  test.beforeEach(async ({}, testInfo) => {
    await rotateVerifiedResidentE2eFixture(VERIFIED_EMAIL, testInfo.titlePath.join(" "), testInfo.workerIndex, testInfo.retry);
  });

  test("3a — browser /mine is scoped to the current rotated unit", async ({ page }, testInfo) => {
    const meResponse = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/users/me");
    const mineResponse = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/waha-pass/mine");
    await page.goto("/portal/waha-pass");
    const me = await (await meResponse).json();
    const mine = await (await mineResponse).json();
    await testInfo.attach("section3-mine-and-current-user.json", { body: JSON.stringify({ me, mine }, null, 2), contentType: "application/json" });
    await testInfo.attach("section3-mine-current-unit.png", { body: await page.screenshot(), contentType: "image/png" });
    expect(mine).not.toBeNull();
    expect(mine.unitId).toBe(me.unitId);
  });
});

test.describe("Round 3 Section 3 — Credential 2 adult portal-access options", () => {
  test.use({ storageState: "./e2e/.auth/round3-waha-second-credential.json" });
  test.beforeEach(async () => {
    await ensureRound3WahaSecondCredentialFixture(WAHA_EMAIL);
  });

  test("3b — Assign Credential 2 omits the marked under-18 portal resident", async ({ page }, testInfo) => {
    const fixture = await ensureRound3WahaSecondCredentialFixture(WAHA_EMAIL);
    await page.goto("/portal/waha-pass");
    const button = page.getByRole("button", { name: /^assign$/i });
    await expect(button).toBeVisible();
    await button.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const optionLabels = await dialog.locator("select option").allTextContents();
    await testInfo.attach("section3-credential2-options.json", { body: JSON.stringify({ fixture, optionLabels }, null, 2), contentType: "application/json" });
    await testInfo.attach("section3-credential2-options.png", { body: await page.screenshot(), contentType: "image/png" });
    expect(optionLabels).not.toContain(fixture.underageResidentName);
  });
});