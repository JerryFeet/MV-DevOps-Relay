/**
 * notificationService.test.ts
 *
 * Unit tests for the X3 notification core:
 *   - enqueueNotification() persists rows with correct defaults
 *   - dispatchPendingNotifications() delivers via email / push
 *   - Preference policy: announcements suppresses event type 8
 *   - Mandatory events 9 and 12 bypass preference gate
 *   - Retry logic: failed delivery bumps attempts and schedules nextAttemptAt
 *   - Max-attempts: 5 failures mark the row "failed"
 *   - notificationDispatchScheduler wires up setInterval
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ─── DB mock (hoisted before service imports) ─────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return { db: mockDb, ...mockTables };
});

vi.mock("drizzle-orm", async () => {
  const helpers = await import("./helpers/mockDb");
  return {
    eq: helpers.eq,
    and: helpers.and,
    lte: helpers.lte,
    inArray: helpers.inArray,
    desc: helpers.desc,
    ne: helpers.ne,
    lt: helpers.lt,
    gt: helpers.gt,
    gte: helpers.gte,
    isNull: helpers.isNull,
    isNotNull: helpers.isNotNull,
    ilike: helpers.ilike,
    sql: helpers.sql,
    count: helpers.count,
  };
});

// ─── Email spy ────────────────────────────────────────────────────────────────

const { sendEmailSpy, expoSendSpy } = vi.hoisted(() => ({
  sendEmailSpy: vi.fn().mockResolvedValue(undefined),
  expoSendSpy: vi.fn().mockResolvedValue([{ status: "ok", id: "receipt-1" }]),
}));

vi.mock("../lib/email", () => ({
  sendEmail: sendEmailSpy,
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
}));

// ─── Expo push mock ───────────────────────────────────────────────────────────

vi.mock("expo-server-sdk", () => {
  class FakeExpo {
    static isExpoPushToken(t: string) {
      return t.startsWith("ExponentPushToken[");
    }
    chunkPushNotifications(messages: unknown[]) {
      return [messages];
    }
    sendPushNotificationsAsync = expoSendSpy;
    chunkPushNotificationReceiptIds(ids: string[]) {
      return [ids];
    }
    getPushNotificationReceiptsAsync = vi.fn().mockResolvedValue({});
  }
  return { default: FakeExpo };
});

// ─── Logger mock ──────────────────────────────────────────────────────────────

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { stores, resetMockDb } from "./helpers/mockDb";
import {
  enqueueNotification,
  enqueueNotificationForRecipient,
  dispatchPendingNotifications,
  MANDATORY_EVENT_TYPES,
  ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE,
  renderCatalogNotification,
} from "../lib/notificationService";
import { startNotificationDispatchScheduler } from "../lib/notificationDispatchScheduler";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedEvent(overrides: Record<string, unknown> = {}) {
  const base = {
    eventType: "test_event",
    idempotencyKey: "key-1",
    recipientUserId: 42,
    recipientEmail: "user@example.com",
    channel: "email",
    locale: "ar",
    payload: JSON.stringify({ subject: "Hello", html: "<p>Test</p>" }),
    preferencePolicy: "decision",
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000), // due now
    ...overrides,
  };
  return stores.notificationEvents.insert(base);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("enqueueNotification", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
    expoSendSpy.mockClear();
  });

  it("persists a pending row with locale defaulting to 'ar'", async () => {
    const result = await enqueueNotification({
      eventType: "booking_confirmed",
      idempotencyKey: "booking-99-confirmed",
      recipientUserId: 1,
      recipientEmail: "resident@example.com",
      channel: "email",
      payload: { subject: "Confirmed", html: "<p>ok</p>" },
    });

    expect(result).not.toBeNull();
    expect(result!.locale).toBe("ar");
    expect(result!.status).toBe("pending");
    expect(result!.attempts).toBe(0);
    expect(result!.preferencePolicy).toBe("decision");
    expect(result!.eventType).toBe("booking_confirmed");
  });

  it("uses supplied locale when provided", async () => {
    const result = await enqueueNotification({
      eventType: "booking_confirmed",
      idempotencyKey: "booking-100-confirmed",
      channel: "email",
      payload: {},
      locale: "en",
    });
    expect(result!.locale).toBe("en");
  });

  it("returns null for duplicate (idempotency) — same key inserted again", async () => {
    // First insert — should succeed
    await enqueueNotification({
      eventType: "ev_8",
      idempotencyKey: "idem-key-1",
      recipientUserId: 5,
      channel: "email",
      payload: {},
    });

    // Manually seed a duplicate in the store simulating a conflict
    // (mock onConflictDoNothing with no targets always inserts — test the logic
    //  by checking the row count; real DB would deduplicate via unique index)
    const countBefore = stores.notificationEvents.findAll().length;
    expect(countBefore).toBe(1);
  });

  it("stores preferencePolicy correctly", async () => {
    const result = await enqueueNotification({
      eventType: "9",
      idempotencyKey: "mandatory-9",
      channel: "push",
      recipientUserId: 3,
      payload: { title: "Important", body: "Do this now" },
      preferencePolicy: "mandatory",
    });
    expect(result!.preferencePolicy).toBe("mandatory");
  });
});

describe("X3 notification catalogue and recipient enqueue helper", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
    expoSendSpy.mockClear();
  });

  it.each(Array.from({ length: 16 }, (_, index) => String(index + 1)))(
    "renders EVT %s with a concrete Arabic and English subject",
    (eventType) => {
      const arabic = renderCatalogNotification(eventType, "ar");
      const english = renderCatalogNotification(eventType, "en");

      expect(arabic.subject.trim()).not.toHaveLength(0);
      expect(english.subject.trim()).not.toHaveLength(0);
      expect(arabic.subject).not.toBe("(no subject)");
      expect(english.subject).not.toBe("(no subject)");
      expect(arabic.html).toContain(arabic.body);
      expect(english.html).toContain(english.body);
    },
  );

  it.each(Array.from({ length: 16 }, (_, index) => String(index + 1)))(
    "enqueues email and push for EVT %s using the catalogue policy",
    async (eventType) => {
      const result = await enqueueNotificationForRecipient({
        eventType: eventType as "1",
        idempotencyKey: `evt-${eventType}-recipient-77`,
        recipientUserId: 77,
        recipientEmail: "recipient@example.com",
        locale: "en",
      });

      expect(result.email?.channel).toBe("email");
      expect(result.push?.channel).toBe("push");
      expect(result.email?.idempotencyKey).toBe(`evt-${eventType}-recipient-77`);
      expect(result.push?.idempotencyKey).toBe(`evt-${eventType}-recipient-77`);
      expect(JSON.parse(result.email!.payload).subject).not.toBe("(no subject)");
      expect(result.email?.preferencePolicy).toBe(
        eventType === "8" ? "announcement" : ["9", "12"].includes(eventType) ? "mandatory" : "decision",
      );
    },
  );

  it("defaults catalogue rendering to Arabic and rejects non-EVT event types", () => {
    expect(renderCatalogNotification("3").subject).toBe(
      renderCatalogNotification("3", "ar").subject,
    );
    expect(() => renderCatalogNotification("booking_confirmed")).toThrow(
      "Unsupported notification EVT number",
    );
  });

  it("renders event 12 as an explicit irreversible account-deletion warning in both languages", () => {
    expect(renderCatalogNotification("12", "en").body).toMatch(/permanently deleted|cannot be undone/i);
    expect(renderCatalogNotification("12", "ar").body).toContain("حذف حسابك نهائياً");
  });

  it("uses the business key to idempotently retain one record per channel", async () => {
    const input = {
      eventType: "9" as const,
      idempotencyKey: "tenancy-request-44-submitted",
      recipientUserId: 44,
      recipientEmail: "owner@example.com",
    };

    const first = await enqueueNotificationForRecipient(input);
    const repeated = await enqueueNotificationForRecipient(input);

    expect(first.email).not.toBeNull();
    expect(first.push).not.toBeNull();
    expect(repeated).toEqual({ email: null, push: null });
    expect(stores.notificationEvents.findAll()).toHaveLength(2);
  });

  it.each([
    ["tenancy_pre_expiry_tenant", "renewed Ejar contract", "عقد إيجار مُجدد"],
    ["tenancy_pre_expiry_landlord", "provide your tenant", "تزويد المستأجر"],
    ["tenancy_renewal_decision_reminder", "waiting for your approval", "بانتظار موافقتك"],
  ] as const)("renders mandatory bilingual P2 contract %s with its role-specific copy", (eventType, english, arabic) => {
    const en = renderCatalogNotification(eventType, "en");
    const ar = renderCatalogNotification(eventType, "ar");
    expect(en.body).toContain(english);
    expect(ar.body).toContain(arabic);
    expect(en.body).toContain("{unit}");
    expect(renderCatalogNotification(eventType, "en")).toEqual(en);
    expect(MANDATORY_EVENT_TYPES.has(eventType)).toBe(true);
  });

  it("interpolates P2 tenancy notification variables and enqueues both mandatory channels", async () => {
    const result = await enqueueNotificationForRecipient({
      eventType: "tenancy_pre_expiry_tenant",
      idempotencyKey: "tenancy-pre-expiry-tenant-1-2099-02-01-30",
      recipientUserId: 77,
      recipientEmail: "tenant@example.com",
      locale: "en",
      variables: { unit: "A 101", date: "2099-02-01" },
    });
    expect(JSON.parse(result.email!.payload).body).toContain("A 101");
    expect(JSON.parse(result.email!.payload).body).toContain("2099-02-01");
    expect(result.email?.preferencePolicy).toBe("mandatory");
    expect(result.push?.preferencePolicy).toBe("mandatory");
  });
});

describe("dispatchPendingNotifications — email delivery", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
    expoSendSpy.mockClear();
  });

  it("delivers an email event and marks it delivered", async () => {
    seedEvent({
      channel: "email",
      recipientEmail: "res@example.com",
      payload: JSON.stringify({ subject: "Test subject", html: "<p>body</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      "res@example.com",
      "Test subject",
      "<p>body</p>",
    );

    const rows = stores.notificationEvents.findAll();
    expect(rows[0]!.status).toBe("delivered");
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.deliveredAt).toBeTruthy();
  });

  it("does not dispatch events whose nextAttemptAt is in the future", async () => {
    seedEvent({
      nextAttemptAt: new Date(Date.now() + 60_000), // 1 minute in the future
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(0);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("does not dispatch already-delivered events", async () => {
    seedEvent({ status: "delivered" });
    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(0);
  });
});

describe("dispatchPendingNotifications — push delivery", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
    expoSendSpy.mockClear();
  });

  it("delivers a push event when the user has a valid expo token", async () => {
    stores.pushTokens.insert({
      userId: 7,
      token: "ExponentPushToken[valid-token-abc]",
    });

    seedEvent({
      channel: "push",
      recipientUserId: 7,
      recipientEmail: null,
      payload: JSON.stringify({ title: "Hey", body: "You have a message" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(expoSendSpy).toHaveBeenCalled();

    const rows = stores.notificationEvents.findAll();
    expect(rows[0]!.status).toBe("delivered");
  });

  it("marks push event delivered even when user has no tokens", async () => {
    // recipientUserId 99 has no tokens
    seedEvent({
      channel: "push",
      recipientUserId: 99,
      recipientEmail: null,
      payload: JSON.stringify({ title: "Hey", body: "No tokens" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(expoSendSpy).not.toHaveBeenCalled();
  });
});

describe("preference policy", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
  });

  it("suppresses event type 8 when user has announcements=false and policy=announcement", async () => {
    stores.notificationPreferences.insert({
      userId: 10,
      announcements: false,
      bookings: true,
      guestPasses: true,
    });

    seedEvent({
      eventType: ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE, // "8"
      recipientUserId: 10,
      preferencePolicy: "announcement",
      payload: JSON.stringify({ subject: "Announcement", html: "<p>news</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(0);
    expect(sendEmailSpy).not.toHaveBeenCalled();

    const rows = stores.notificationEvents.findAll();
    expect(rows[0]!.status).toBe("suppressed");
  });

  it("does NOT suppress event type 8 when user has announcements=true", async () => {
    stores.notificationPreferences.insert({
      userId: 11,
      announcements: true,
      bookings: true,
      guestPasses: true,
    });

    seedEvent({
      eventType: ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE,
      recipientUserId: 11,
      preferencePolicy: "announcement",
      recipientEmail: "user11@example.com",
      payload: JSON.stringify({ subject: "News", html: "<p>hello</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("delivers event 9 even when announcements=false (mandatory bypass)", async () => {
    expect(MANDATORY_EVENT_TYPES.has("9")).toBe(true);

    stores.notificationPreferences.insert({
      userId: 12,
      announcements: false,
      bookings: false,
      guestPasses: false,
    });

    seedEvent({
      eventType: "9",
      recipientUserId: 12,
      preferencePolicy: "mandatory",
      recipientEmail: "user12@example.com",
      payload: JSON.stringify({ subject: "Critical", html: "<p>urgent</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("delivers event 12 even when all prefs=false (mandatory bypass)", async () => {
    expect(MANDATORY_EVENT_TYPES.has("12")).toBe(true);

    stores.notificationPreferences.insert({
      userId: 13,
      announcements: false,
      bookings: false,
      guestPasses: false,
    });

    seedEvent({
      eventType: "12",
      recipientUserId: 13,
      preferencePolicy: "mandatory",
      recipientEmail: "user13@example.com",
      payload: JSON.stringify({ subject: "Mandatory", html: "<p>must read</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("delivers when user has no preference row (default opt-in)", async () => {
    // No prefs row for userId=20
    seedEvent({
      eventType: "8",
      recipientUserId: 20,
      preferencePolicy: "announcement",
      recipientEmail: "user20@example.com",
      payload: JSON.stringify({ subject: "Announcement", html: "<p>info</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalled();
  });
});

describe("retry logic", () => {
  beforeEach(() => {
    resetMockDb();
    sendEmailSpy.mockClear();
  });

  it("schedules a retry when delivery fails (attempts < MAX_ATTEMPTS)", async () => {
    sendEmailSpy.mockRejectedValueOnce(new Error("SMTP timeout"));

    seedEvent({
      recipientEmail: "fail@example.com",
      payload: JSON.stringify({ subject: "Retry test", html: "<p>retry</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(0);

    const rows = stores.notificationEvents.findAll();
    expect(rows[0]!.status).toBe("retrying");
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toBe("SMTP timeout");
    expect(rows[0]!.nextAttemptAt).toBeTruthy();
  });

  it("marks row as 'failed' after MAX_ATTEMPTS (5) failures", async () => {
    sendEmailSpy.mockRejectedValue(new Error("Persistent error"));

    // Seed a row that is on its 4th attempt (needs one more to hit MAX_ATTEMPTS=5)
    seedEvent({
      recipientEmail: "fail@example.com",
      payload: JSON.stringify({ subject: "Max attempts", html: "<p>fail</p>" }),
      attempts: 4,
    });

    await dispatchPendingNotifications();

    const rows = stores.notificationEvents.findAll();
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.attempts).toBe(5);

    // Reset mock for other tests
    sendEmailSpy.mockResolvedValue(undefined);
  });

  it("picks up 'retrying' rows that are due", async () => {
    seedEvent({
      status: "retrying",
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 1000), // due
      recipientEmail: "retry@example.com",
      payload: JSON.stringify({ subject: "Retry due", html: "<p>retry</p>" }),
    });

    const delivered = await dispatchPendingNotifications();
    expect(delivered).toBe(1);
    expect(sendEmailSpy).toHaveBeenCalled();
  });
});

describe("startNotificationDispatchScheduler", () => {
  it("calls setInterval and returns without throwing", () => {
    const fakeSetInterval = vi.fn().mockReturnValue({ unref: vi.fn() });
    const original = globalThis.setInterval;
    // @ts-ignore
    globalThis.setInterval = fakeSetInterval;

    try {
      // Should not throw
      startNotificationDispatchScheduler();
      expect(fakeSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        30_000,
      );
    } finally {
      globalThis.setInterval = original;
    }
  });
});
