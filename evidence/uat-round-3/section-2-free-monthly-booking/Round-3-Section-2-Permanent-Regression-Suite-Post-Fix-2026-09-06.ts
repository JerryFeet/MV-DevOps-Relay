import { expect, test, type Page } from "@playwright/test";
import { rotateVerifiedResidentE2eFixture } from "./helpers/db";

const VERIFIED_RESIDENT_EMAIL =
  process.env.E2E_VERIFIED_RESIDENT_EMAIL ??
  "e2e-verified-resident+clerk_test@example.com";

type Facility = {
  id: number;
  name: string;
  isActive: boolean;
  pricePerHour: string;
  pricingModel: string;
  flatFeeAmount: string | null;
  minDurationMinutes: number;
};
type Slot = { hour: number; startISO: string; available: boolean };
type Availability = { durationMinutes: number; slots: Slot[] };
type Allowance = {
  available: boolean;
  eligibleForBooking: boolean;
  claim: { bookingId: number } | null;
};
type CreatedBooking = {
  id: number;
  status: string;
  paymentStatus: string;
  paymentExemptionReason: string | null;
  totalAmount: string | number;
};

const facilityCards = (page: Page) =>
  page.locator("button").filter({ has: page.locator("h3") });
const enabledSlotButtons = (page: Page) =>
  page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}:\d{2}/ });

function isZeroPriced(facility: Facility) {
  return facility.pricingModel === "flat"
    ? Number(facility.flatFeeAmount) === 0
    : Number(facility.pricePerHour) === 0;
}

async function riyadhFutureDate(page: Page, daysAhead: number) {
  return page.evaluate((days) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)!.value;
    const riyadhToday = new Date(
      Number(part("year")),
      Number(part("month")) - 1,
      Number(part("day")),
    );
    const target = new Date(riyadhToday);
    target.setDate(target.getDate() + days);
    const browserToday = new Date();
    return {
      value: [target.getFullYear(), String(target.getMonth() + 1).padStart(2, "0"), String(target.getDate()).padStart(2, "0")].join("-"),
      calendarValue: target.toLocaleDateString(),
      triggerValue: `${String(target.getDate()).padStart(2, "0")} ${target.toLocaleString("en-US", { month: "short" })} ${target.getFullYear()}`,
      monthsToNavigate:
        (target.getFullYear() - browserToday.getFullYear()) * 12 +
        target.getMonth() - browserToday.getMonth(),
    };
  }, daysAhead);
}

async function selectRiyadhFutureDate(page: Page, daysAhead: number) {
  const date = await riyadhFutureDate(page, daysAhead);
  const trigger = page.getByTestId("date-picker-trigger").first();
  await trigger.click();
  await expect(page.locator('[role="grid"]')).toBeVisible();
  for (let i = 0; i < date.monthsToNavigate; i += 1) {
    await page.getByRole("button", { name: /next month/i }).first().click();
  }
  await page.locator(
    `[role="gridcell"] button[data-day="${date.calendarValue}"]:not([disabled])`,
  ).click();
  await expect(trigger).toContainText(date.triggerValue);
  return date;
}

function monthlyAllowanceResponse(response: { url(): string; request(): { method(): string } }) {
  const url = new URL(response.url());
  return response.request().method() === "GET"
    && url.pathname === "/api/bookings/monthly-allowance";
}

test.describe("Round 3 Section 2 — zero-price monthly allowance regression", () => {
  test.use({ storageState: "./e2e/.auth/verified-resident.json" });
  test.beforeEach(async ({}, testInfo) => {
    await rotateVerifiedResidentE2eFixture(
      VERIFIED_RESIDENT_EMAIL,
      testInfo.titlePath.join(" "),
      testInfo.workerIndex,
      testInfo.retry,
    );
  });

  test("a zero-priced facility booking consumes the monthly allowance", async ({ page }) => {
    const paymentRequests: string[] = [];
    const recordPaymentRequest = (request: { method(): string; url(): string }) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/payments/create") {
        paymentRequests.push(request.url());
      }
    };
    page.on("request", recordPaymentRequest);

    try {
      const facilitiesResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "GET" && url.pathname === "/api/facilities";
      });
      const initialAllowanceResponse = page.waitForResponse(monthlyAllowanceResponse);
      await page.goto("/portal/facilities");

      const facilities = await (await facilitiesResponse).json() as Facility[];
      const facility = facilities.filter((candidate) => candidate.isActive).find(isZeroPriced);
      expect(facility, "an active facility with a production-semantics zero price is required").toBeTruthy();

      const initialAllowance = await (await initialAllowanceResponse).json() as Allowance;
      expect(initialAllowance).toMatchObject({
        available: true,
        claim: null,
        eligibleForBooking: true,
      });
      await expect(page.getByText(
        "Your monthly free facility booking is available and will be automatically applied to your next eligible booking.",
        { exact: true },
      )).toBeVisible();

      const card = facilityCards(page).filter({
        has: page.getByRole("heading", { name: facility!.name, exact: true }),
      });
      await expect(card).toBeVisible();

      const date = await riyadhFutureDate(page, 4);
      await card.click();
      const availabilityResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "GET"
          && url.pathname === `/api/facilities/${facility!.id}/availability`
          && url.searchParams.get("date") === date.value;
      });
      await selectRiyadhFutureDate(page, 4);
      const availability = await (await availabilityResponse).json() as Availability;
      expect(availability.durationMinutes).toBe(facility!.minDurationMinutes);

      await page.getByRole("button", { name: /view available times/i }).click();
      const slot = availability.slots.find((candidate) => candidate.available);
      expect(slot, "a future enabled slot from the live availability response is required").toBeTruthy();
      const enabledIndex = availability.slots
        .filter((candidate) => candidate.available)
        .findIndex((candidate) => candidate.startISO === slot!.startISO);
      expect(enabledIndex).toBeGreaterThanOrEqual(0);
      await enabledSlotButtons(page).nth(enabledIndex).click();

      await page.getByRole("button", { name: /review & confirm/i }).click();
      const refreshedAllowanceResponse = page.waitForResponse(monthlyAllowanceResponse);
      const bookingResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bookings",
      );
      await page.getByRole("button", { name: /confirm booking|confirm & pay/i }).click();
      const response = await bookingResponse;
      expect(response.status()).toBe(201);
      const booking = await response.json() as CreatedBooking;
      expect(booking.id).toEqual(expect.any(Number));
      const createdBookingId = booking.id;
      expect(booking).toMatchObject({
        status: "confirmed",
        paymentStatus: "not_required",
        paymentExemptionReason: "zero_price_facility",
      });
      expect(Number(booking.totalAmount)).toBe(0);

      // resetWizard runs after the successful mutation has made its payment
      // decision, so this proves the zero-price path did not open checkout.
      await expect(page.getByRole("heading", { name: /select a facility/i })).toBeVisible();
      expect(paymentRequests).toEqual([]);

      const refreshedAllowance = await (await refreshedAllowanceResponse).json() as Allowance;
      expect(refreshedAllowance).toMatchObject({
        available: false,
        eligibleForBooking: true,
        claim: { bookingId: createdBookingId },
      });
      await expect(page.getByText(
        "You have already used your free booking for this month.",
        { exact: true },
      )).toBeVisible();
    } finally {
      page.off("request", recordPaymentRequest);
    }
  });
});