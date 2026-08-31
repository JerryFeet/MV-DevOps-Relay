import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hoaSettingsTable = pgTable("hoa_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHoaSettingSchema = createInsertSchema(hoaSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHoaSetting = z.infer<typeof insertHoaSettingSchema>;
export type HoaSetting = typeof hoaSettingsTable.$inferSelect;
