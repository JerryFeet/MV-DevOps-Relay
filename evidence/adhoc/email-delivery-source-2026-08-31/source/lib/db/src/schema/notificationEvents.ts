import { pgTable, text, serial, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

export const notificationEventsTable = pgTable("notification_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  recipientUserId: integer("recipient_user_id"),
  recipientEmail: text("recipient_email"),
  channel: text("channel").notNull(),
  locale: text("locale").notNull().default("ar"),
  payload: text("payload").notNull(),
  preferencePolicy: text("preference_policy").notNull().default("decision"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("notification_events_delivery_unique").on(t.eventType, t.idempotencyKey, t.recipientUserId, t.channel),
  index("idx_notification_events_due").on(t.status, t.nextAttemptAt),
]);

export type NotificationEvent = typeof notificationEventsTable.$inferSelect;