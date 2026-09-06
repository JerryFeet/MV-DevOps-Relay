import { expect, test, type Locator, type Page } from "@playwright/test";
import { deleteBookingById } from "./helpers/db";

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
type Booking = { id: number };

type BookingScreen = {
  facility: Facility;
  availability: Availability;
  slotButtons: Locator;
};

const facilityCards = (page: Page) =>
  page.locator("button").filter({ has: page.locator("h3") });
const slotButtons = (page: Page) =>
  page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}:\d{2}/ });

function isZeroPriced(facility: Facility) {
  return facility.pricingModel === "flat"
    ? Number(facility.flatFeeAmount) === 0
    : Number(facility.pricePerHour) === 0;
}

async function riyadhDate(page: Page, daysAhead: number) {
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

async function selectRiyadhDate(page: Page, daysAhead: number) {
  const date = await riyadhDate(page, daysAhead);
  const trigger = page.getByTestId("date-picker-trigger").first();

  // Step 2 is initialized with the portal's current date. React Day Picker
  // clears a single-mode selection when its already-selected day is clicked,
  // so today's UI value is already the correct Riyadh date and must not be
  // clicked again.
  if ((await trigger.textContent())?.trim() === date.triggerValue) {
    // Open the real picker to prove the UI date control is usable, then close
    // it without reselecting its current single-mode value.
    await trigger.click();
    await expect(page.locator('[role="grid"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toContainText(date.triggerValue);
    return date;
  }

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

/**
 * Constructs the booking scenario only through the resident portal: it opens a
 * named active facility (or the first active facility), chooses a Riyadh date
 * and duration, then captures the actual availability response after the UI
 * submits "View available times".
 */
async function openBookingScreen(
  page: Page,
  options: { daysAhead: number; facility?: Facility; preferZeroPrice?: boolean },
): Promise<BookingScreen> {
  const facilitiesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/facilities";
  });
  await page.goto("/portal/facilities");
  const facilities = await (await facilitiesResponse).json() as Facility[];
  const active = facilities.filter((facility) => facility.isActive);
  const facility = options.facility
    ?? active.find(isZeroPriced)
    ?? (options.preferZeroPrice ? active.find(isZeroPriced) : undefined)
    ?? active[0];
  if (!facility) throw new Error("The portal did not expose an active facility.");

  const card = facilityCards(page).filter({ has: page.getByRole("heading", { name: facility.name, exact: true }) });
  await expect(card).toBeVisible();
  const date = await riyadhDate(page, options.daysAhead);
  const availabilityResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname === `/api/facilities/${facility.id}/availability`
      && url.searchParams.get("date") === date.value;
  });
  await card.click();
  await selectRiyadhDate(page, options.daysAhead);

  const duration = page.locator("button").filter({ hasText: /^\d+\s*(hr|hrs|min)/i }).first();
  if (await duration.isVisible().catch(() => false)) await duration.click();

  await page.getByRole("button", { name: /view available times/i }).click();
  const availability = await (await availabilityResponse).json() as Availability;
  await expect(page.locator("h2").filter({ hasText: facility.name })).toBeVisible();
  return { facility, availability, slotButtons: slotButtons(page) };
}

async function chooseSlot(screen: BookingScreen, slot: Slot) {
  const index = screen.availability.slots
    .filter((candidate) => candidate.available)
    .findIndex((candidate) => candidate.startISO === slot.startISO);
  expect(index, "selected slot must be in the captured availability response").toBeGreaterThanOrEqual(0);
  await screen.slotButtons.nth(index).click();
}

async function confirmBooking(page: Page): Promise<number> {
  await page.getByRole("button", { name: /review & confirm/i }).click();
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bookings",
  );
  await page.getByRole("button", { name: /confirm booking|confirm & pay/i }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const booking = await response.json() as Booking;
  expect(booking.id).toEqual(expect.any(Number));
  return booking.id;
}

test.describe("Round 3 Section 1 — booking time and active-booking regressions", () => {
  test.use({ storageState: "./e2e/.auth/verified-resident.json" });

  test("1a — today's UI availability never renders an elapsed slot", async ({ page }) => {
    const screen = await openBookingScreen(page, { daysAhead: 0 });
    const browserNow = await page.evaluate(() => new Date().toISOString());
    const enabledSlots = screen.availability.slots.filter((slot) => slot.available);
    await expect(screen.slotButtons).toHaveCount(enabledSlots.length);
    const enabledStartIsos = enabledSlots.map((slot) => slot.startISO);
    expect(
      enabledStartIsos.every((startISO) => startISO > browserNow),
      `enabled slots must start after browser now (${browserNow}): ${enabledStartIsos.join(", ")}`,
    ).toBe(true);
  });

  test("1b — POST booking with an elapsed start is rejected", async ({ page }) => {
    let unexpectedlyCreatedId: number | null = null;
    try {
      const screen = await openBookingScreen(page, { daysAhead: 4 });
      const source = screen.availability.slots.find((slot) => slot.available);
      expect(source, "a future UI-selectable slot is required").toBeTruthy();
      await chooseSlot(screen, source!);
      await page.getByRole("button", { name: /review & confirm/i }).click();

      const pastStart = new Date(
        new Date(source!.startISO).getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await page.route("**/api/bookings", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const body = route.request().postDataJSON();
        await route.continue({
          postData: JSON.stringify({ ...body, startTime: pastStart }),
        });
      });

      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST"
          && new URL(response.url()).pathname === "/api/bookings",
      );
      await page.getByRole("button", { name: /confirm booking|confirm & pay/i }).click();
      const response = await responsePromise;
      const body = await response.json();
      unexpectedlyCreatedId = typeof body?.id === "number" ? body.id : null;
      expect(response.status()).toBe(400);
      expect(body).toMatchObject({ error: "BOOKING_START_TIME_PASSED" });
      await expect(
        page.locator('[data-component-name="ToastDescription"]').filter({
          hasText: "BOOKING_START_TIME_PASSED",
        }),
      ).toBeVisible();
    } finally {
      if (unexpectedlyCreatedId !== null) await deleteBookingById(unexpectedlyCreatedId).catch(() => {});
    }
  });

  test("1c — a rejected cancellation remains visible instead of closing silently", async ({ page }) => {
    let createdBookingId: number | null = null;
    try {
      const screen = await openBookingScreen(page, { daysAhead: 4 });
      const future = screen.availability.slots.find((slot) => slot.available);
      expect(future, "a future UI-selectable slot is required").toBeTruthy();
      await chooseSlot(screen, future!);
      createdBookingId = await confirmBooking(page);

      await page.goto("/portal/facilities");
      await page.getByRole("button", { name: /my bookings/i }).click();
      const card = page.getByTestId(`booking-card-${createdBookingId}`);
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /cancel booking/i }).click();
      const dialog = page.getByRole("dialog");
      const rejection = "Cannot cancel a booking whose end time has already passed";
      await page.route(`**/api/bookings/${createdBookingId}/cancel`, async (route) => {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: rejection }),
        });
      });
      const cancelResponse = page.waitForResponse((response) =>
        response.request().method() === "POST"
          && new URL(response.url()).pathname === `/api/bookings/${createdBookingId}/cancel`,
      );
      await dialog.getByRole("button", { name: /cancel booking/i }).click();
      const response = await cancelResponse;
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.error).toBe(rejection);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(rejection);
    } finally {
      if (createdBookingId !== null) await deleteBookingById(createdBookingId).catch(() => {});
    }
  });

  test("F12 — the UI exposes the active unit/facility rule on a second future booking", async ({ page }) => {
    const createdIds: number[] = [];
    try {
      const first = await openBookingScreen(page, { daysAhead: 4, preferZeroPrice: true });
      const firstSlot = first.availability.slots.find((slot) => slot.available);
      expect(firstSlot, "a future available slot is required").toBeTruthy();
      await chooseSlot(first, firstSlot!);
      createdIds.push(await confirmBooking(page));

      const second = await openBookingScreen(page, { daysAhead: 4, facility: first.facility });
      const secondSlot = second.availability.slots.find((slot) => slot.available);
      expect(secondSlot, "a second UI-selectable future slot is required").toBeTruthy();
      await chooseSlot(second, secondSlot!);
      await page.getByRole("button", { name: /review & confirm/i }).click();
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bookings",
      );
      await page.getByRole("button", { name: /confirm booking|confirm & pay/i }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(409);
      await expect(
        page.locator('[data-component-name="ToastDescription"]').filter({
          hasText: "ACTIVE_UNIT_FACILITY_BOOKING_EXISTS",
        }),
      ).toBeVisible();
    } finally {
      await Promise.all(createdIds.map((id) => deleteBookingById(id).catch(() => {})));
    }
  });
});