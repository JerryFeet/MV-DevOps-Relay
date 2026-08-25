import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for the HOA Portal.
 *
 * The portal (Vite) and API (Express) are already started by Replit workflows;
 * no webServer block is needed — Playwright connects directly to the proxy at
 * localhost:80. Set PLAYWRIGHT_BASE_URL to override (e.g. in CI pointing to a
 * staging host).
 *
 * Clerk auth is handled by @clerk/testing/playwright, which generates short-lived
 * testing tokens backed by CLERK_SECRET_KEY.  Test users (E2E_RESIDENT_EMAIL and
 * E2E_ADMIN_EMAIL) are auto-provisioned in Clerk via the global setup if they do
 * not yet exist.
 *
 * Browser executable:
 *   In the Replit sandbox the downloaded headless shell lacks system libs.
 *   Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to the system chromium from Nix:
 *     export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium)
 *   The e2e validation command sets this automatically via $(which chromium).
 *
 * Manual run (after workflows are running):
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium) pnpm run e2e
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global.setup.ts",

  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "resident-setup",
      testMatch: "**/auth.setup.ts",
    },
    {
      name: "admin-setup",
      testMatch: "**/admin.auth.setup.ts",
    },
    {
      name: "guard-setup",
      testMatch: "**/guard.auth.setup.ts",
    },
    // Produces .auth/verified-resident.json with verification_status=verified_owner
    // seeded in the HOA DB, so dialog-open tests pass for the verified-resident path.
    {
      name: "verified-resident-setup",
      testMatch: "**/verified-resident.setup.ts",
    },
    // Read-only Go-Live Workbook Section B resident walkthrough.  This uses the
    // verified owner's saved Clerk session and its seeded active Waha Pass.
    {
      name: "workbook-resident",
      dependencies: ["verified-resident-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/verified-resident.json",
      },
      testMatch: ["**/workbook-resident-walkthrough.spec.ts"],
    },
    // Read-only Go-Live Workbook Section E and safe G1/G2 admin walkthrough.
    // It uses the Clerk-authenticated admin state and never shares tests with
    // the broader admin project, whose specs may intentionally mutate fixtures.
    {
      name: "workbook-admin",
      dependencies: ["admin-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/admin.json",
      },
      testMatch: ["**/workbook-admin-walkthrough.spec.ts"],
    },
    // Dedicated setup for the mobile-sidebar spec; creates an isolated session
    // so the sign-out test never invalidates the shared resident.json state.
    {
      name: "mobile-sidebar-setup",
      testMatch: "**/mobile-sidebar-resident.setup.ts",
    },
    {
      name: "resident",
      dependencies: ["resident-setup", "verified-resident-setup", "admin-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/resident.json",
      },
      testMatch: [
        "**/announcements.spec.ts",
        "**/facilities.spec.ts",
        "**/guests.spec.ts",
        "**/vehicles.spec.ts",
        "**/communications.spec.ts",
        "**/documents.spec.ts",
        "**/admin-access-guard.spec.ts",
        "**/key-contacts-drawer.spec.ts",
        "**/resident-role-redirect.spec.ts",
        "**/owner-admin-redirect.spec.ts",
      ],
    },
    // Mobile-sidebar runs in isolation with its own session so sign-out cannot
    // affect resident.json or any other resident-project tests.
    {
      name: "mobile-sidebar",
      dependencies: ["mobile-sidebar-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/mobile-sidebar-resident.json",
      },
      testMatch: ["**/mobile-sidebar.spec.ts"],
    },
    {
      name: "admin",
      dependencies: ["admin-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/admin.json",
      },
      testMatch: [
        "**/admin.spec.ts",
        "**/documents-admin.spec.ts",
        "**/key-contacts-round-trip.spec.ts",
        "**/admin-role-redirect.spec.ts",
      ],
    },
    {
      name: "guard",
      dependencies: ["guard-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/guard.json",
      },
      testMatch: ["**/guard-gate-walkthrough.spec.ts"],
    },
  ],
});
