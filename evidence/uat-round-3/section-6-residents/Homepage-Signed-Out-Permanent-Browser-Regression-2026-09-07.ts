import { expect, test } from "@playwright/test";

test("signed-out launch page sends no authenticated announcement or Dalil requests", async ({ page }) => {
  const forbiddenRequests: string[] = [];
  const unauthorizedResponses: string[] = [];

  page.on("request", request => {
    const url = request.url();
    if (url.includes("/api/ai/chat") || url.includes("/api/announcements")) {
      forbiddenRequests.push(url);
    }
  });
  page.on("response", response => {
    if (response.status() === 401) unauthorizedResponses.push(response.url());
  });

  await page.goto("/");
  await expect(page.getByText("MADAIN Village", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1_000);

  expect(forbiddenRequests).toEqual([]);
  expect(unauthorizedResponses).toEqual([]);
});