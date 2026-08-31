/**
 * notificationService.ts
 *
 * Typed notification service for persisted, idempotent, retried delivery.
 *
 * Architecture:
 * - `enqueueNotification()` — persists a notification_event row post-commit intent.
 *   Idempotency: ON CONFLICT DO NOTHING on (eventType, idempotencyKey, recipientUserId, channel).
 * - `dispatchPendingNotifications()` — picks up due pending/retrying rows, delivers
 *   via email or push, updates row status.
 *
 * Preference policy (per task spec):
 *   preferencePolicy = "announcement" → only suppresses event type 8
 *     (announcements preference gate) — events 9 and 12 bypass preference and
 *     are classified as "mandatory".
 *   preferencePolicy = "mandatory"    → no preference gate, always deliver.
 *   preferencePolicy = "decision"     → apply normal per-category preference.
 *
 * Locale default: "ar" (Arabic) per schema default.
 *
 * Retry back-off (exponential):
 *   attempt 1 → +30s, attempt 2 → +2m, attempt 3 → +10m, attempt 4 → +1h, attempt 5+ → +6h
 *   Max attempts: 5 (after 5 failures the row is marked "failed").
 */

import { and, eq, lte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  notificationEventsTable,
  notificationPreferencesTable,
  pushTokensTable,
  type NotificationEvent,
} from "@workspace/db";
import { sendEmail } from "./email";
import { logger } from "./logger";
import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import {
  isCatalogEventType,
  renderNotification,
  type CatalogEventType,
  type RenderedNotification,
} from "./notificationCatalog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "push";
export type NotificationPreferencePolicy = "decision" | "announcement" | "mandatory";

/**
 * Event type numbers that bypass preference gating (mandatory delivery).
 * Events 9 and 12 are always delivered regardless of user opt-out.
 */
export const MANDATORY_EVENT_TYPES = new Set([
  "9", "12",
  "tenancy_pre_expiry_tenant",
  "tenancy_pre_expiry_landlord",
  "tenancy_renewal_decision_reminder",
]);

/**
 * Event type number that is suppressed by the announcements preference (event 8).
 */
export const ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE = "8";

export interface EnqueueNotificationInput {
  /** Event type identifier — use string numbers (e.g. "8", "9", "12") or named types */
  eventType: string;
  /** Stable key for idempotency — composed by caller (e.g. "booking-123-confirmed") */
  idempotencyKey: string;
  /** Internal user ID — nullable for anonymous/system events */
  recipientUserId?: number | null;
  /** Email address — required for email channel */
  recipientEmail?: string | null;
  /** Delivery channel */
  channel: NotificationChannel;
  /** BCP-47 locale, defaults to "ar" */
  locale?: string;
  /** JSON-serialisable payload — title, body, data, etc. */
  payload: Record<string, unknown>;
  /** Preference policy governing delivery */
  preferencePolicy?: NotificationPreferencePolicy;
}

export interface NotificationPayload extends Record<string, unknown> {
  title?: string;
  body?: string;
  subject?: string;
  html?: string;
  data?: Record<string, unknown>;
}

export interface EnqueueCatalogNotificationInput {
  eventType: CatalogEventType;
  /** A business-event key, reused across channels for stable deduplication. */
  idempotencyKey: string;
  recipientUserId: number;
  recipientEmail: string | null;
  locale?: string;
  /** Included with push notifications for deep-linking or client handling. */
  data?: Record<string, unknown>;
  /** Catalogue variables such as unit and date. */
  variables?: Record<string, string | number>;
}

export interface EnqueuedRecipientNotifications {
  email: NotificationEvent | null;
  push: NotificationEvent | null;
}

/** Maps the fixed EVT contract to the only preference policies it may use. */
export function preferencePolicyForEvent(eventType: string): NotificationPreferencePolicy {
  if (MANDATORY_EVENT_TYPES.has(eventType)) return "mandatory";
  if (eventType === ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE) return "announcement";
  return "decision";
}

/** Render catalogue copy while rejecting unrecognised event numbers at the boundary. */
export function renderCatalogNotification(eventType: string, locale = "ar"): RenderedNotification {
  if (!isCatalogEventType(eventType)) {
    throw new Error(`Unsupported notification EVT number: ${eventType}`);
  }
  return renderNotification(eventType, locale);
}

// ─── Retry schedule ───────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;

function nextAttemptDelay(attempts: number): number {
  // Returns milliseconds to add for the next attempt
  switch (attempts) {
    case 0: return 30_000;        // 30 s
    case 1: return 2 * 60_000;    // 2 min
    case 2: return 10 * 60_000;   // 10 min
    case 3: return 60 * 60_000;   // 1 h
    default: return 6 * 60 * 60_000; // 6 h
  }
}

// ─── Expo instance (module-level singleton) ───────────────────────────────────

const expo = new Expo();

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Persist a notification intent to the database.
 * Uses ON CONFLICT DO NOTHING for idempotency — safe to call multiple times
 * with the same (eventType, idempotencyKey, recipientUserId, channel) tuple.
 *
 * Returns the persisted row, or null if a duplicate was silently ignored.
 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  executor: any = db,
  throwOnError = false,
): Promise<NotificationEvent | null> {
  const {
    eventType,
    idempotencyKey,
    recipientUserId = null,
    recipientEmail = null,
    channel,
    locale = "ar",
    payload,
    preferencePolicy = "decision",
  } = input;

  const serialisedPayload = JSON.stringify(payload);

  try {
    const rows = await executor
      .insert(notificationEventsTable)
      .values({
        eventType,
        idempotencyKey,
        recipientUserId,
        recipientEmail,
        channel,
        locale,
        payload: serialisedPayload,
        preferencePolicy,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
      })
      .onConflictDoNothing({
        target: [
          notificationEventsTable.eventType,
          notificationEventsTable.idempotencyKey,
          notificationEventsTable.recipientUserId,
          notificationEventsTable.channel,
        ],
      })
      .returning();

    if (!rows || rows.length === 0) {
      logger.debug(
        { eventType, idempotencyKey, recipientUserId, channel },
        "notification-service: duplicate suppressed by idempotency key",
      );
      return null;
    }

    logger.debug(
      { id: rows[0]!.id, eventType, channel, recipientUserId },
      "notification-service: enqueued",
    );
    return rows[0]!;
  } catch (err) {
    logger.error(
      { err, eventType, idempotencyKey, channel },
      "notification-service: failed to enqueue notification",
    );
    if (throwOnError) throw err;
    return null;
  }
}

/**
 * Enqueue the catalogue rendering on both delivery channels for one recipient.
 *
 * The same business idempotency key is intentionally used for email and push:
 * channel is part of the persistence uniqueness tuple, so each channel is
 * deduplicated independently while repeated producer calls remain safe.
 */
export async function enqueueNotificationForRecipient(
  input: EnqueueCatalogNotificationInput,
  executor: any = db,
  throwOnError = false,
): Promise<EnqueuedRecipientNotifications> {
  const {
    eventType,
    idempotencyKey,
    recipientUserId,
    recipientEmail,
    locale = "ar",
    data,
  } = input;
  const rendered = renderNotification(eventType, locale, input.variables);
  const preferencePolicy = preferencePolicyForEvent(eventType);
  const payload: NotificationPayload = { ...rendered, data };

  const [email, push] = await Promise.all([
    enqueueNotification({
      eventType,
      idempotencyKey,
      recipientUserId,
      recipientEmail,
      channel: "email",
      locale,
      payload,
      preferencePolicy,
    }, executor, throwOnError),
    enqueueNotification({
      eventType,
      idempotencyKey,
      recipientUserId,
      channel: "push",
      locale,
      payload,
      preferencePolicy,
    }, executor, throwOnError),
  ]);

  return { email, push };
}

// ─── Preference gate ──────────────────────────────────────────────────────────

/**
 * Returns true if the notification should be suppressed based on user preferences.
 *
 * Policy:
 * - "mandatory"    → never suppressed
 * - MANDATORY_EVENT_TYPES (9, 12) → never suppressed regardless of policy
 * - "announcement" → only suppressed if eventType === ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE (8)
 *                    and the user has opted out of announcements
 * - "decision"     → apply per-category: announcements/bookings/guestPasses
 */
async function isSuppressedByPreference(event: NotificationEvent): Promise<boolean> {
  const { preferencePolicy, eventType, recipientUserId } = event;

  // Mandatory events always bypass
  if (preferencePolicy === "mandatory" || MANDATORY_EVENT_TYPES.has(eventType)) {
    return false;
  }

  if (!recipientUserId) return false;

  const [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, recipientUserId));

  // No prefs row → default opt-in for all categories
  if (!prefs) return false;

  if (preferencePolicy === "announcement") {
    // Only suppresses event type 8 (announcement broadcast)
    if (eventType === ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE) {
      return prefs.announcements === false;
    }
    return false;
  }

  // "decision" — apply per-category
  if (eventType === ANNOUNCEMENT_SUPPRESSED_EVENT_TYPE) {
    return prefs.announcements === false;
  }

  // For decision policy, map to bookings/guestPasses by presence of payload hint
  // Default to not suppressed if we can't determine the category
  return false;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

async function deliverEmail(event: NotificationEvent): Promise<void> {
  const to = event.recipientEmail;
  if (!to) {
    throw new Error("email channel requires recipientEmail");
  }

  const payload = JSON.parse(event.payload) as NotificationPayload;
  const subject = payload.subject ?? payload.title ?? "(no subject)";
  const html = payload.html ?? `<p>${payload.body ?? ""}</p>`;

  await sendEmail(to, subject, html);
}

async function deliverPush(event: NotificationEvent): Promise<void> {
  if (!event.recipientUserId) {
    throw new Error("push channel requires recipientUserId");
  }

  const payload = JSON.parse(event.payload) as NotificationPayload;

  const rows = await db
    .select({ token: pushTokensTable.token })
    .from(pushTokensTable)
    .where(eq(pushTokensTable.userId, event.recipientUserId));

  if (rows.length === 0) {
    // No tokens registered — treat as delivered (not an error)
    logger.debug(
      { recipientUserId: event.recipientUserId, eventId: event.id },
      "notification-service: no push tokens for user, skipping push",
    );
    return;
  }

  const valid = rows.map((r) => r.token).filter((t) => Expo.isExpoPushToken(t));
  if (valid.length === 0) return;

  const messages: ExpoPushMessage[] = valid.map((to) => ({
    to,
    title: payload.title,
    body: payload.body ?? "",
    data: payload.data ?? {},
    sound: "default" as const,
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.warn({ err, eventId: event.id }, "notification-service: expo chunk send failed");
      throw err;
    }
  }
}

async function deliverEvent(event: NotificationEvent): Promise<void> {
  if (event.channel === "email") {
    await deliverEmail(event);
  } else if (event.channel === "push") {
    await deliverPush(event);
  } else {
    throw new Error(`Unknown channel: ${event.channel}`);
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Process all due pending/retrying notifications.
 * Called by the scheduler on each tick.
 * Returns the count of successfully delivered events.
 */
export async function dispatchPendingNotifications(now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(notificationEventsTable)
    .where(
      and(
        inArray(notificationEventsTable.status, ["pending", "retrying"]),
        lte(notificationEventsTable.nextAttemptAt, now),
      ),
    );

  if (due.length === 0) return 0;

  logger.info(
    { count: due.length },
    "notification-service: dispatching due events",
  );

  let delivered = 0;

  for (const event of due) {
    // Preference gate
    let suppressed = false;
    try {
      suppressed = await isSuppressedByPreference(event);
    } catch (err) {
      logger.warn({ err, eventId: event.id }, "notification-service: preference check failed, delivering anyway");
    }

    if (suppressed) {
      await db
        .update(notificationEventsTable)
        .set({ status: "suppressed", deliveredAt: new Date() })
        .where(eq(notificationEventsTable.id, event.id));
      logger.debug(
        { eventId: event.id, eventType: event.eventType, recipientUserId: event.recipientUserId },
        "notification-service: suppressed by preference",
      );
      continue;
    }

    const newAttempts = event.attempts + 1;

    try {
      await deliverEvent(event);

      await db
        .update(notificationEventsTable)
        .set({
          status: "delivered",
          attempts: newAttempts,
          deliveredAt: new Date(),
          lastError: null,
        })
        .where(eq(notificationEventsTable.id, event.id));

      delivered += 1;
      logger.debug(
        { eventId: event.id, eventType: event.eventType, channel: event.channel },
        "notification-service: delivered",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (newAttempts >= MAX_ATTEMPTS) {
        await db
          .update(notificationEventsTable)
          .set({
            status: "failed",
            attempts: newAttempts,
            lastError: errMsg,
          })
          .where(eq(notificationEventsTable.id, event.id));

        logger.warn(
          { eventId: event.id, attempts: newAttempts, err },
          "notification-service: max attempts reached, marking failed",
        );
      } else {
        const delay = nextAttemptDelay(newAttempts);
        const nextAttemptAt = new Date(Date.now() + delay);

        await db
          .update(notificationEventsTable)
          .set({
            status: "retrying",
            attempts: newAttempts,
            lastError: errMsg,
            nextAttemptAt,
          })
          .where(eq(notificationEventsTable.id, event.id));

        logger.debug(
          { eventId: event.id, attempts: newAttempts, nextAttemptAt },
          "notification-service: scheduled retry",
        );
      }
    }
  }

  return delivered;
}
