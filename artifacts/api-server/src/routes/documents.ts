import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import {
  db,
  usersTable,
  documentsTable,
  documentFoldersTable,
  DOCUMENT_DOWNLOAD_MODES,
  DOCUMENT_VISIBILITIES,
  type DocumentDownloadMode,
  type DocumentVisibility,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";
import multer from "multer";
import mammoth from "mammoth";

const router = Router();
const objectStorage = new ObjectStorageService();

const DOC_ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const VISIBILITY_RANK: Record<DocumentVisibility, number> = {
  all_portal_users: 0,
  verified_owners: 1,
  admin_only: 2,
};

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, DOC_ALLOWED_MIMES.includes(file.mimetype));
  },
});

type Caller = typeof usersTable.$inferSelect;
type DocumentRow = typeof documentsTable.$inferSelect;
type FolderRow = typeof documentFoldersTable.$inferSelect;

function isVisibility(value: unknown): value is DocumentVisibility {
  return typeof value === "string" && (DOCUMENT_VISIBILITIES as readonly string[]).includes(value);
}

function isDownloadMode(value: unknown): value is DocumentDownloadMode {
  return typeof value === "string" && (DOCUMENT_DOWNLOAD_MODES as readonly string[]).includes(value);
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function effectiveVisibility(document: DocumentRow, folder: FolderRow): DocumentVisibility {
  const explicit = isVisibility(document.visibility) ? document.visibility : folder.defaultVisibility as DocumentVisibility;
  const floor = folder.defaultVisibility as DocumentVisibility;
  return VISIBILITY_RANK[explicit] >= VISIBILITY_RANK[floor] ? explicit : floor;
}

function canReadDocument(caller: Caller, document: DocumentRow, folder: FolderRow): boolean {
  // Migration triage is deliberately admin-only, including legacy resident
  // uploads that retain compatibility access in their original folder.
  if (caller.role !== "admin" && (!folder.isActive || folder.isTriage)) return false;

  // Legacy resident uploads retain owner-only access while the HOA library is
  // made read-only. No new non-admin documents can be created after Stage 4b.
  if (document.category === "resident_personal") {
    return caller.role === "admin" || document.uploadedById === caller.id;
  }

  if (caller.role === "admin") return true;

  const visibility = effectiveVisibility(document, folder);
  if (visibility === "all_portal_users") return true;
  return visibility === "verified_owners" && caller.verificationStatus === "verified_owner";
}

function folderResponse(folder: FolderRow, documentCount: number, cascadedDocuments?: number) {
  return {
    id: folder.id,
    name: folder.name,
    nameAr: folder.nameAr,
    defaultVisibility: folder.defaultVisibility,
    defaultDownloadMode: folder.defaultDownloadMode,
    sortOrder: folder.sortOrder,
    isActive: folder.isActive,
    isTriage: folder.isTriage,
    documentCount,
    ...(cascadedDocuments !== undefined && cascadedDocuments > 0 ? { cascadedDocuments } : {}),
  };
}

function documentResponse(document: DocumentRow, folder: FolderRow, caller: Caller, documentCount = 0) {
  const visibility = effectiveVisibility(document, folder);
  const isViewOnly = document.downloadMode === "view_only" && caller.role !== "admin";
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    visibility,
    downloadMode: document.downloadMode,
    canDownload: !isViewOnly,
    folder: folderResponse(folder, documentCount),
  };
}

async function getCaller(req: any): Promise<Caller | null> {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return caller ?? null;
}

async function getDocumentAndFolder(id: number): Promise<{ document: DocumentRow; folder: FolderRow } | null> {
  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!document || document.isArchived) return null;
  const [folder] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, document.folderId));
  return folder ? { document, folder } : null;
}

function validateDocumentPlacement(
  folder: FolderRow,
  visibility: unknown,
  downloadMode: unknown,
): { visibility: DocumentVisibility; downloadMode: DocumentDownloadMode } | { error: string } {
  const resolvedVisibility = visibility === undefined
    ? folder.defaultVisibility as DocumentVisibility
    : visibility;
  const resolvedDownloadMode = downloadMode === undefined
    ? folder.defaultDownloadMode as DocumentDownloadMode
    : downloadMode;

  if (!isVisibility(resolvedVisibility)) return { error: "Invalid document visibility." };
  if (!isDownloadMode(resolvedDownloadMode)) return { error: "Invalid document download mode." };
  if (VISIBILITY_RANK[resolvedVisibility] < VISIBILITY_RANK[folder.defaultVisibility as DocumentVisibility]) {
    return { error: "Document visibility cannot be less restrictive than its folder." };
  }
  return { visibility: resolvedVisibility, downloadMode: resolvedDownloadMode };
}

function requireAdmin(caller: Caller | null, res: any): caller is Caller {
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// Admin authorization runs before Multer so non-admin callers cannot allocate
// upload memory with a crafted multipart request.
router.post(
  "/documents/upload",
  requireApiAuth,
  async (req: any, res, next) => {
    const caller = await getCaller(req);
    if (!requireAdmin(caller, res)) return;
    req.caller = caller;
    next();
  },
  (req, res, next) => {
    docUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File exceeds the 20 MB limit." });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: any, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided." });
      return;
    }
    try {
      const objectPath = await objectStorage.storeDocument(req.file.buffer, req.file.mimetype);
      res.json({
        objectPath,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        name: req.file.originalname,
      });
    } catch (err: any) {
      req.log?.error({ err }, "Document upload failed");
      res.status(400).json({ error: err.message ?? "Upload failed" });
    }
  },
);

router.get("/document-folders", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!caller) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [folders, documents] = await Promise.all([
    db.select().from(documentFoldersTable),
    db.select().from(documentsTable),
  ]);

  const response = folders
    .map((folder) => {
      const visibleCount = documents.filter((document) =>
        !document.isArchived
        && document.folderId === folder.id
        && canReadDocument(caller, document, folder),
      ).length;
      return folderResponse(
        folder,
        caller.role === "admin"
          ? documents.filter((document) => !document.isArchived && document.folderId === folder.id).length
          : visibleCount,
      );
    })
    .filter((folder) => caller.role === "admin" || (folder.isActive && !folder.isTriage && folder.documentCount > 0))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  res.json(response);
});

router.post("/document-folders", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const { name, nameAr, defaultVisibility, defaultDownloadMode, sortOrder } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof nameAr !== "string" || !nameAr.trim()) {
    res.status(400).json({ error: "Both folder names are required." });
    return;
  }
  if (!isVisibility(defaultVisibility) || !isDownloadMode(defaultDownloadMode)) {
    res.status(400).json({ error: "A valid visibility and download default are required." });
    return;
  }
  const [folder] = await db.insert(documentFoldersTable).values({
    name: name.trim(),
    nameAr: nameAr.trim(),
    defaultVisibility,
    defaultDownloadMode,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
  }).returning();
  res.status(201).json(folderResponse(folder, 0));
});

router.patch("/document-folders/:id", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid folder ID." });
    return;
  }
  const [folder] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, id));
  if (!folder) {
    res.status(404).json({ error: "Folder not found." });
    return;
  }

  const { name, nameAr, defaultVisibility, defaultDownloadMode, sortOrder, isActive } = req.body ?? {};
  const requestedVisibility: DocumentVisibility | undefined = defaultVisibility === undefined
    ? undefined
    : isVisibility(defaultVisibility)
      ? defaultVisibility
      : undefined;
  if (defaultVisibility !== undefined && requestedVisibility === undefined) {
    res.status(400).json({ error: "Invalid folder visibility." });
    return;
  }
  if (defaultDownloadMode !== undefined && !isDownloadMode(defaultDownloadMode)) {
    res.status(400).json({ error: "Invalid folder download mode." });
    return;
  }
  // Determine which document visibilities fall below the requested floor so
  // they can be cascaded up in the same transaction (decision 60, 2026-08-20).
  // Loosening a folder never touches individual document overrides.
  const isTightening =
    requestedVisibility !== undefined
    && VISIBILITY_RANK[requestedVisibility] > VISIBILITY_RANK[folder.defaultVisibility as DocumentVisibility];
  const belowFloor: DocumentVisibility[] = isTightening
    ? (DOCUMENT_VISIBILITIES as readonly DocumentVisibility[]).filter(
        (v) => VISIBILITY_RANK[v] < VISIBILITY_RANK[requestedVisibility],
      )
    : [];

  const [updated, cascadedCount] = await db.transaction(async (tx) => {
    const [updatedFolder] = await tx.update(documentFoldersTable).set({
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
      ...(typeof nameAr === "string" && nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
      ...(requestedVisibility !== undefined ? { defaultVisibility: requestedVisibility } : {}),
      ...(defaultDownloadMode !== undefined ? { defaultDownloadMode } : {}),
      ...(Number.isInteger(sortOrder) ? { sortOrder } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    }).where(eq(documentFoldersTable.id, id)).returning();

    let cascaded = 0;
    if (belowFloor.length > 0) {
      const rows = await tx.update(documentsTable)
        .set({ visibility: requestedVisibility })
        .where(and(eq(documentsTable.folderId, id), inArray(documentsTable.visibility, belowFloor)))
        .returning();
      cascaded = rows.length;
    }
    return [updatedFolder, cascaded] as const;
  });

  const updatedDocuments = await db.select().from(documentsTable).where(eq(documentsTable.folderId, id));
  res.json(folderResponse(
    updated,
    updatedDocuments.filter((document) => !document.isArchived).length,
    cascadedCount,
  ));
});

router.delete("/document-folders/:id", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid folder ID." });
    return;
  }
  const documents = await db.select().from(documentsTable).where(eq(documentsTable.folderId, id));
  if (documents.length > 0) {
    res.status(409).json({ error: "Folders containing documents must be archived, not deleted." });
    return;
  }
  const [folder] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, id));
  if (!folder) {
    res.status(404).json({ error: "Folder not found." });
    return;
  }
  await db.delete(documentFoldersTable).where(eq(documentFoldersTable.id, id));
  res.status(204).send();
});

router.get("/documents", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!caller) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [documents, folders] = await Promise.all([
    db.select().from(documentsTable),
    db.select().from(documentFoldersTable),
  ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const documentCountByFolder = new Map(
    folders.map((folder) => [
      folder.id,
      documents.filter((document) => !document.isArchived && document.folderId === folder.id).length,
    ]),
  );
  const response = documents
    .filter((document) => !document.isArchived)
    .map((document) => ({ document, folder: folderById.get(document.folderId) }))
    .filter((record): record is { document: DocumentRow; folder: FolderRow } => Boolean(record.folder))
    .filter(({ document, folder }) => canReadDocument(caller, document, folder))
    .sort((a, b) => b.document.createdAt.getTime() - a.document.createdAt.getTime())
    .map(({ document, folder }) => documentResponse(document, folder, caller, documentCountByFolder.get(folder.id) ?? 0));
  res.json(response);
});

router.post("/documents", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const { title, description, folderId, fileUrl, mimeType, fileSize, visibility, downloadMode } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || !Number.isInteger(folderId) || typeof fileUrl !== "string") {
    res.status(400).json({ error: "title, folderId, and an uploaded file are required." });
    return;
  }
  if (!fileUrl.startsWith("/objects/documents/")) {
    res.status(400).json({ error: "Documents must use an admin-uploaded private storage file." });
    return;
  }
  const [folder] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, folderId));
  if (!folder || !folder.isActive) {
    res.status(400).json({ error: "Select an active document folder." });
    return;
  }
  const placement = validateDocumentPlacement(folder, visibility, downloadMode);
  if ("error" in placement) {
    res.status(400).json(placement);
    return;
  }
  const [document] = await db.insert(documentsTable).values({
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    category: "library",
    folderId,
    fileUrl,
    mimeType: typeof mimeType === "string" ? mimeType : null,
    fileSize: Number.isInteger(fileSize) ? fileSize : null,
    isPublic: false,
    uploadedById: caller.id,
    visibility: placement.visibility,
    downloadMode: placement.downloadMode,
  }).returning();
  res.status(201).json(documentResponse(document, folder, caller));
});

router.get("/documents/:id", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  const id = parseId(req.params.id);
  if (!caller) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!id) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }
  const record = await getDocumentAndFolder(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canReadDocument(caller, record.document, record.folder)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(documentResponse(record.document, record.folder, caller));
});

router.patch("/documents/:id", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }
  const record = await getDocumentAndFolder(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { title, description, folderId, visibility, downloadMode } = req.body ?? {};
  const targetFolderId = Number.isInteger(folderId) ? folderId : record.document.folderId;
  const [targetFolder] = await db.select().from(documentFoldersTable).where(eq(documentFoldersTable.id, targetFolderId));
  if (!targetFolder || !targetFolder.isActive) {
    res.status(400).json({ error: "Select an active document folder." });
    return;
  }
  const placement = validateDocumentPlacement(
    targetFolder,
    visibility === undefined ? record.document.visibility : visibility,
    downloadMode === undefined ? record.document.downloadMode : downloadMode,
  );
  if ("error" in placement) {
    res.status(400).json(placement);
    return;
  }

  const [updated] = await db.update(documentsTable).set({
    ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
    ...(description === null || typeof description === "string" ? { description: description?.trim() || null } : {}),
    folderId: targetFolder.id,
    visibility: placement.visibility,
    downloadMode: placement.downloadMode,
  }).where(eq(documentsTable.id, id)).returning();
  res.json(documentResponse(updated, targetFolder, caller));
});

router.post("/documents/:id/replace", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }
  const record = await getDocumentAndFolder(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { title, description, fileUrl, mimeType, fileSize, visibility, downloadMode, replacementReason } = req.body ?? {};
  if (typeof fileUrl !== "string" || !fileUrl.startsWith("/objects/documents/")) {
    res.status(400).json({ error: "Replacement requires an admin-uploaded private storage file." });
    return;
  }
  if (typeof mimeType !== "string" || !DOC_ALLOWED_MIMES.includes(mimeType)) {
    res.status(400).json({ error: "Replacement requires a supported uploaded file type." });
    return;
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    res.status(400).json({ error: "Replacement requires a valid uploaded file size." });
    return;
  }
  const placement = validateDocumentPlacement(
    record.folder,
    visibility === undefined ? record.document.visibility : visibility,
    downloadMode === undefined ? record.document.downloadMode : downloadMode,
  );
  if ("error" in placement) {
    res.status(400).json(placement);
    return;
  }

  const replacement = await db.transaction(async (tx) => {
    const [created] = await tx.insert(documentsTable).values({
      title: typeof title === "string" && title.trim() ? title.trim() : record.document.title,
      description: description === null || typeof description === "string" ? description?.trim() || null : record.document.description,
      category: "library",
      folderId: record.document.folderId,
      fileUrl,
      mimeType,
      fileSize,
      isPublic: false,
      uploadedById: caller.id,
      visibility: placement.visibility,
      downloadMode: placement.downloadMode,
    }).returning();
    await tx.update(documentsTable).set({
      isArchived: true,
      archivedAt: new Date(),
      archivedById: caller.id,
      replacedById: created.id,
      replacementReason: typeof replacementReason === "string" && replacementReason.trim()
        ? replacementReason.trim()
        : null,
    }).where(eq(documentsTable.id, record.document.id));
    return created;
  });
  res.status(201).json(documentResponse(replacement, record.folder, caller));
});

router.get("/documents/:id/download", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  const id = parseId(req.params.id);
  if (!caller) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!id) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }
  const record = await getDocumentAndFolder(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canReadDocument(caller, record.document, record.folder)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!record.document.fileUrl.startsWith("/objects/")) {
    // Legacy external URLs are never redirected; admin must re-upload them to
    // private storage before exposing them through the library.
    res.status(410).json({ error: "This legacy document must be re-uploaded by an administrator." });
    return;
  }

  try {
    const file = await objectStorage.getObjectEntityFile(record.document.fileUrl);
    const viewOnly = record.document.downloadMode === "view_only" && caller.role !== "admin";
    const isDocx = record.document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // The generic object response performs metadata and ACL lookups before it
    // streams. For authenticated view-only DOCX, authorization and MIME are
    // already established above, so fetch the private object once and convert
    // it immediately. This keeps the response inside the artifact proxy's
    // request window.
    if (viewOnly && isDocx) {
      const [buffer] = await file.download();
      const converted = await mammoth.convertToHtml({ buffer });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.document.title)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${record.document.title.replace(/[<>&"]/g, "")}</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172033}img{max-width:100%}@media print{body{display:none!important}}</style></head><body>${converted.value}</body></html>`);
      return;
    }

    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (record.document.mimeType) res.setHeader("Content-Type", record.document.mimeType);

    res.setHeader("Content-Disposition", `${viewOnly ? "inline" : "attachment"}; filename="${encodeURIComponent(record.document.title)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (viewOnly) {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }

    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      // A database document row can outlive its private object (for example,
      // after an interrupted storage cleanup). Do not turn that into a blank
      // iframe or a misleading generic server failure.
      res.status(404).json({ error: "DOCUMENT_OBJECT_NOT_FOUND", message: "Document file is no longer available." });
      return;
    }
    req.log.error({ err }, "Error serving document file");
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

router.delete("/documents/:id", requireApiAuth, async (req: any, res): Promise<void> => {
  const caller = await getCaller(req);
  if (!requireAdmin(caller, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid document ID." });
    return;
  }
  const record = await getDocumentAndFolder(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.update(documentsTable).set({
    isArchived: true,
    archivedAt: new Date(),
    archivedById: caller.id,
  }).where(eq(documentsTable.id, id));
  res.status(204).send();
});

export default router;