import { expect, test } from "@playwright/test";

/**
 * Go-Live Workbook — Section E admin console and safe G1/G2 dry run.
 *
 * This walkthrough is intentionally read-only apart from the server's
 * non-mutating release-plan preview request. It never invokes approval,
 * rejection, notification, upload, booking, renewal cancellation, or release
 * execution controls. Where the shared environment has no safely identifiable
 * seeded record, the relevant check is explicitly skipped rather than using an
 * API check or an untrusted row.
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

async function openAdminDashboard(page: import("@playwright/test").Page) {
  await page.goto("/portal/admin");
  await expect(page).toHaveURL(/\/portal\/admin/);
  await expect(
    page.getByRole("heading", { name: "Admin Dashboard", exact: true }),
  ).toBeVisible();
}

test.describe("Go-Live Workbook Section E — admin console (read-only)", () => {
  test("E1 evidence — current admin dashboard identity is recorded for the report", async ({
    page,
  }, testInfo) => {
    await openAdminDashboard(page);
    await expect(
      page.getByRole("heading", { name: /needs your attention/i }),
    ).toBeVisible();
    // This deliberately records the current screen rather than claiming the
    // workbook expectation. The live UI shows the real fixture name plus
    // "unverified", not the required "Administrator Account" label.
    await expect(page.getByText("E2E Admin", { exact: true })).toBeVisible();
    await expect(page.getByText("unverified", { exact: true })).toBeVisible();
    await expect(page.getByText("Administrator Account", { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "E01-01-admin-identity-observed.png");
  });

  test("E2 — every visible attention queue exposes a numeric count and label", async ({
    page,
  }, testInfo) => {
    await openAdminDashboard(page);
    const attention = page
      .getByRole("heading", { name: /needs your attention/i })
      .locator("xpath=ancestor::section");
    await expect(attention).toBeVisible();

    for (const label of [
      "Owner verifications",
      "Permits",
      "Waha applications",
      "Waha replacements",
      "Ownership changes",
      "Tenancy releases",
      "Communications",
    ]) {
      const queue = attention.getByText(label, { exact: true }).locator("..");
      await expect(queue).toBeVisible();
      await expect(queue.locator("p").first()).toHaveText(/^\d+$/);
    }

    await capture(page, testInfo, "E02-01-attention-queues.png");
  });

  test("E4 — admin dashboard deliberately has no tenancy-approval queue", async ({
    page,
  }, testInfo) => {
    await openAdminDashboard(page);
    await expect(
      page.getByRole("heading", { name: /needs your attention/i }),
    ).toBeVisible();
    await expect(page.getByText(/tenancy approval/i)).toHaveCount(0);
    await capture(page, testInfo, "E04-01-no-tenancy-approval-queue.png");
  });

  // Manual reason: the current portal route registry contains no Unit Registry
  // screen, so browser evidence would require an API assertion, which this
  // walkthrough expressly does not use.
  test.skip("E6 — HOA COMMON does not appear in the Unit Registry", async () => {});
  test.skip("E7 — Unit Registry record displays names, mobiles, IDs, parking and resident counts", async () => {});

  test("E13/G1/G2 — safe seeded tenancy release preview reports planned destruction and paid impact", async ({
    page,
  }, testInfo) => {
    await openAdminDashboard(page);
    const panel = page.getByRole("heading", { name: /tenancy releases/i }).locator("xpath=ancestor::section");
    await expect(panel).toBeVisible();

    const previews = panel.getByRole("button", { name: /preview terminal release/i });
    const previewCount = await previews.count();
    let safePreview: import("@playwright/test").Locator | undefined;
    for (let index = 0; index < previewCount; index += 1) {
      const candidate = previews.nth(index);
      const caseText = await candidate.evaluate((button) => {
        let element: HTMLElement | null = button.parentElement;
        while (element) {
          if (
            element.classList.contains("space-y-3") &&
            element.classList.contains("border-slate-200")
          ) {
            return element.innerText;
          }
          element = element.parentElement;
        }
        return "";
      });
      if (/\b(e2e|fixture|test)\b/i.test(caseText)) {
        safePreview = candidate;
        break;
      }
    }
    if (!safePreview) {
      test.skip(
        true,
        "Manual data required: no safely identifiable seeded E2E tenancy-release case is visible; untrusted cases are never previewed.",
      );
      return;
    }

    await safePreview.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: /review terminal release plan/i }),
    ).toBeVisible();
    await expect(dialog.getByText(/exact server-owned release-engine plan/i)).toBeVisible();
    await expect(dialog.locator("div.grid.grid-cols-2 > div")).not.toHaveCount(0);
    await expect(dialog.getByText(/paid future day pass impact/i)).toBeVisible();
    await expect(dialog.getByText(/paid future pass\(es\).*SAR/i)).toBeVisible();
    await capture(page, testInfo, "G01-01-release-plan-preview.png");

    // G2 is deliberately limited to the rendered dry-run plan. Do not locate,
    // inspect, or click the irreversible confirmation control.
    await expect(dialog.locator("div.rounded-md.border").first()).toBeVisible();
    await capture(page, testInfo, "G02-01-release-plan-impact.png");
  });

  // E15 external email/push delivery is intentionally manual and is not
  // represented as a completed automated check.
});