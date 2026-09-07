import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureRound3ResidentsFixture } from "./helpers/db";

const EMAIL = process.env.E2E_VERIFIED_RESIDENT_EMAIL ?? "e2e-verified-resident+clerk_test@example.com";

async function captureSection6Evidence(locator: Locator, fileName: string) {
  const outputDir = process.env.E2E_SECTION6_EVIDENCE_DIR;
  if (!outputDir) return;
  mkdirSync(outputDir, { recursive: true });
  await locator.screenshot({ path: resolve(outputDir, fileName) });
}

async function openResidentDialog(page: Page) {
  await page.goto("/portal/residents");
  await page.getByRole("button", { name: /add member/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillResident(page: Page, name: string, dateOfBirth: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("resident-relationship").selectOption({ label: "Child" });
  await dialog.getByTestId("resident-first-name").fill(name);
  await dialog.getByTestId("resident-last-name").fill("SectionSix");
  await dialog.getByTestId("resident-gender").selectOption("male");
  await dialog.getByTestId("resident-date-of-birth").fill(dateOfBirth);
  await dialog.getByTestId("resident-id-number").fill(`R3-${name}-ID`);
  await dialog.getByTestId("resident-phone-input").fill("512345678");
}

test.describe("Round 3 Section 6 — residents", () => {
  test.use({ storageState: "./e2e/.auth/verified-resident.json" });

  test("6a — guardian checkbox fills the registered primary occupant identifier", async ({ page }, testInfo) => {
    const fixture = await ensureRound3ResidentsFixture(EMAIL, testInfo.titlePath.join(" "), testInfo.workerIndex, testInfo.retry);
    const dialog = await openResidentDialog(page);
    await fillResident(page, "GuardianChild", "2015-05-05");
    const identifier = dialog.getByTestId("resident-id-number");
    await dialog.getByTestId("resident-guardian-id").check();
    await expect(identifier).toHaveValue(fixture.primaryIdentifier);
    await captureSection6Evidence(dialog, "Section-6-Post-Fix-6a-Guardian-ID-Autofill-2026-09-07.png");
    await testInfo.attach("section6-guardian-autofill.png", { body: await dialog.screenshot(), contentType: "image/png" });
  });

  test("6b — fifth resident remains visible as pending verification and has no delete control", async ({ page }, testInfo) => {
    await ensureRound3ResidentsFixture(EMAIL, testInfo.titlePath.join(" "), testInfo.workerIndex, testInfo.retry);
    const dialog = await openResidentDialog(page);
    await fillResident(page, "PendingFifth", "2010-05-05");
    await expect(dialog.getByText("The number of residents you add requires HOA review.")).toBeVisible();
    await dialog.getByTestId("resident-extra-reason").fill("Additional dependent");
    await dialog.getByTestId("resident-proof-warning").check();
    const responsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/residents",
    );
    await dialog.getByRole("button", { name: /add to household/i }).click();
    expect((await responsePromise).status()).toBe(201);
    const pendingCard = page.locator("div.rounded-xl").filter({ hasText: "PendingFifth SectionSix" }).first();
    await expect(pendingCard).toContainText(/pending verification/i);
    await expect(pendingCard.getByRole("button", { name: /delete|remove/i })).toHaveCount(0);
    await expect(page.getByText("Request Submitted", { exact: true })).toBeHidden({ timeout: 10_000 });
    await captureSection6Evidence(pendingCard, "Section-6-Post-Fix-6b-Pending-Resident-Visible-No-Delete-2026-09-07.png");
    await testInfo.attach("section6-pending-resident-visible.png", { body: await pendingCard.screenshot(), contentType: "image/png" });
  });
});