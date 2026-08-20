# Stage 4b document-library schema source

This source snapshot is limited to the Stage 4b library model and intentionally contains no database rows, private object paths, or credentials.

```ts
export const DOCUMENT_VISIBILITIES = [
  "all_portal_users",
  "verified_owners",
  "admin_only",
] as const;

export const DOCUMENT_DOWNLOAD_MODES = [
  "download_allowed",
  "view_only",
] as const;

export const documentFoldersTable = pgTable("document_folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  defaultVisibility: text("default_visibility").notNull().default("all_portal_users"),
  defaultDownloadMode: text("default_download_mode").notNull().default("download_allowed"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isTriage: boolean("is_triage").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  isPublic: boolean("is_public").notNull().default(false),
  uploadedById: integer("uploaded_by_id").notNull(),
  folderId: integer("folder_id").references(() => documentFoldersTable.id).notNull(),
  visibility: text("visibility").notNull().default("all_portal_users"),
  downloadMode: text("download_mode").notNull().default("download_allowed"),
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedById: integer("archived_by_id"),
  replacedById: integer("replaced_by_id"),
  replacementReason: text("replacement_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```