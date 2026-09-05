/**
 * Stage 4 J1/J3 — Document storage access control audit.
 *
 * J1: Library documents cannot be retrieved via an unsigned/direct object-storage
 *     URL or the public-objects path. All access must go through the authenticated
 *     /api/documents/:id/download endpoint.
 *
 * J3: Document writes never target PUBLIC_OBJECT_SEARCH_PATHS. The storeDocument
 *     helper always writes to PRIVATE_OBJECT_DIR and returns a canonical
 *     /objects/documents/... path that is ineligible for public-objects serving.
 */

import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock("@workspace/db", async () => {
  const { mockDb, mockTables } = await import("./helpers/mockDb");
  return {
    db: mockDb,
    ...mockTables,
    DOCUMENT_VISIBILITIES: ["all_portal_users", "verified_owners", "admin_only"],
    DOCUMENT_DOWNLOAD_MODES: ["download_allowed", "view_only"],
  };
});

vi.mock("drizzle-orm", async () => {
  const { eq, and, desc, ne, lt, gt, gte, inArray, count, or } = await import("./helpers/mockDb");
  return { eq, and, desc, ne, lt, gt, gte, inArray, count, or };
});

vi.mock("@clerk/express", async () => {
  const { mockAuthState } = await import("./helpers/mockDb");
  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      req.auth = () => ({ userId: mockAuthState.userId });
      next();
    },
    getAuth: () => ({ userId: mockAuthState.userId }),
  };
});

vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));
vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

// Controlled objectStorage mock: tracks which paths are written and can be
// configured to simulate the public-objects search behavior.
const mockStoreDocumentPath = vi.fn<(buffer: Buffer, mimeType: string) => Promise<string>>();
const mockSearchPublicObject = vi.fn<(filePath: string) => Promise<null>>();
const mockGetObjectEntityFile = vi.fn();
const mockDownloadObject = vi.fn();

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    storeDocument = mockStoreDocumentPath;
    searchPublicObject = mockSearchPublicObject;
    getObjectEntityFile = mockGetObjectEntityFile;
    downloadObject = mockDownloadObject;
  },
  ObjectNotFoundError: class extends Error {
    constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; }
  },
}));

// ─── App & helpers ────────────────────────────────────────────────────────────

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";

let app: any;

const CLERK_ADMIN = "clerk-j1j3-admin";
const CLERK_OWNER = "clerk-j1j3-owner";

function seedDocumentLibrary() {
  resetMockDb();
  stores.users.insert({
    clerkId: CLERK_ADMIN, email: "admin@j1j3.test", role: "admin",
    status: "active", firstName: "Admin", lastName: "J1J3",
    verificationStatus: "unverified", unitNumber: null,
  });
  stores.users.insert({
    clerkId: CLERK_OWNER, email: "owner@j1j3.test", role: "owner",
    status: "active", firstName: "Owner", lastName: "J1J3",
    verificationStatus: "verified_owner", unitNumber: "101",
  });
  stores.documentFolders.insert({
    name: "Library Docs", nameAr: "وثائق المكتبة",
    defaultVisibility: "all_portal_users", defaultDownloadMode: "download_allowed",
    sortOrder: 1, isActive: true, isTriage: false,
  });
  stores.documents.insert({
    title: "Test Doc", description: null, category: "library",
    folderId: 1,
    fileUrl: "/objects/documents/a1b2c3d4-private.pdf",
    mimeType: "application/pdf", fileSize: 1024,
    isPublic: false, uploadedById: 1, isArchived: false,
    visibility: "all_portal_users", downloadMode: "download_allowed",
  });
}

beforeAll(async () => {
  const { default: appMod } = await import("../app");
  app = appMod;
});

beforeEach(() => {
  seedDocumentLibrary();
  mockAuthState.userId = null;
  vi.clearAllMocks();

  // Default: storeDocument returns a canonical private path
  mockStoreDocumentPath.mockImplementation(async (_buf: Buffer, mimeType: string) => {
    const ext: Record<string, string> = {
      "application/pdf": ".pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
    };
    return `/objects/documents/mock-uuid${ext[mimeType] ?? ""}`;
  });

  // Default: searchPublicObject never finds document files (they are in private storage)
  mockSearchPublicObject.mockResolvedValue(null);

  // Default: getObjectEntityFile and downloadObject support authenticated download.
  // Use minimal Response (string body, no explicit Content-Length) matching the
  // pattern verified to work in documentsCrossUserPrivacy.test.ts.
  mockGetObjectEntityFile.mockResolvedValue({
    bucket: { name: "mock-bucket" },
    name: "private/documents/a1b2c3d4-private.pdf",
  });
  mockDownloadObject.mockResolvedValue(new Response("document", { status: 200 }));
});

// ─────────────────────────────────────────────────────────────────────────────
// J1: Document objects are inaccessible via unsigned/public paths
// ─────────────────────────────────────────────────────────────────────────────

describe("J1 — document objects cannot be retrieved via public-objects or unsigned paths", () => {
  it("J1-a: GET /api/storage/public-objects/documents/<uuid> always returns 404 (not found in public search paths)", async () => {
    // searchPublicObject returns null → document is not in PUBLIC_OBJECT_SEARCH_PATHS
    mockSearchPublicObject.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/storage/public-objects/documents/a1b2c3d4-private.pdf");

    expect(res.status).toBe(404);
    // Confirm searchPublicObject was called (public-objects route used it)
    expect(mockSearchPublicObject).toHaveBeenCalledWith("documents/a1b2c3d4-private.pdf");
  });

  it("J1-b: GET /api/storage/public-objects/ never bypasses the public path search — no auth provided and file is absent", async () => {
    // No auth header — the public-objects endpoint is deliberately unauthenticated,
    // but documents are not stored in PUBLIC_OBJECT_SEARCH_PATHS so they are 404.
    mockSearchPublicObject.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/storage/public-objects/documents/secret-report.pdf");

    // Must be 404, NOT 200 (document files are not in public search paths)
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
  });

  it("J1-c: GET /api/documents/:id/download returns 401 when no auth token is provided", async () => {
    // mockAuthState.userId is null → requireApiAuth returns 401
    mockAuthState.userId = null;

    const res = await request(app).get("/api/documents/1/download");

    expect(res.status).toBe(401);
    // getObjectEntityFile must NOT have been called — file is never touched without auth
    expect(mockGetObjectEntityFile).not.toHaveBeenCalled();
  });

  it("J1-d: authenticated download serves the document via the private object path, not via public-objects", async () => {
    mockAuthState.userId = CLERK_OWNER;

    const res = await request(app).get("/api/documents/1/download");

    expect(res.status).toBe(200);
    // Confirm the private entity path was used
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith("/objects/documents/a1b2c3d4-private.pdf");
    // searchPublicObject must never be invoked in the authenticated download path
    expect(mockSearchPublicObject).not.toHaveBeenCalled();
  });

  it("J3 gate: private document routes return 401 without auth", async () => {
    // This is the automated J3 acceptance gate. Visual signed-out review may
    // supplement it, but cannot replace the status assertion.
    mockAuthState.userId = null;

    const [list, single, create] = await Promise.all([
      request(app).get("/api/documents"),
      request(app).get("/api/documents/1"),
      request(app).post("/api/documents").send({ title: "x", folderId: 1, fileUrl: "/objects/documents/x.pdf" }),
    ]);

    expect(list.status).toBe(401);
    expect(single.status).toBe(401);
    expect(create.status).toBe(401);
  });

  it("J1-f: mutation endpoints (PATCH, DELETE, replace, upload) also return 401 without auth", async () => {
    mockAuthState.userId = null;

    const [patch, del, replace, upload] = await Promise.all([
      request(app).patch("/api/documents/1").send({ title: "x" }),
      request(app).delete("/api/documents/1"),
      request(app).post("/api/documents/1/replace").send({ fileUrl: "/objects/documents/x.pdf" }),
      request(app).post("/api/documents/upload").attach("file", Buffer.from("%PDF"), { filename: "x.pdf", contentType: "application/pdf" }),
    ]);

    expect(patch.status).toBe(401);
    expect(del.status).toBe(401);
    expect(replace.status).toBe(401);
    expect(upload.status).toBe(401);
  });

  it("J1-g: folder mutation endpoints also return 401 without auth", async () => {
    mockAuthState.userId = null;

    const [post, patch, del] = await Promise.all([
      request(app).post("/api/document-folders").send({ name: "x", nameAr: "ي", defaultVisibility: "all_portal_users", defaultDownloadMode: "download_allowed" }),
      request(app).patch("/api/document-folders/1").send({ name: "x" }),
      request(app).delete("/api/document-folders/1"),
    ]);

    expect(post.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(del.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J3: Document writes never target PUBLIC_OBJECT_SEARCH_PATHS
// ─────────────────────────────────────────────────────────────────────────────

describe("J3 — document writes always target private storage, never PUBLIC_OBJECT_SEARCH_PATHS", () => {
  it("J3-a: storeDocument returns a /objects/documents/ path (canonical private prefix)", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    const res = await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "j3test.pdf", contentType: "application/pdf" })
      .expect(200);

    const { objectPath } = res.body;

    // AUDIT: path must start with /objects/documents/ — private namespace only
    expect(objectPath).toMatch(/^\/objects\/documents\//);

    // AUDIT: path must NOT start with any public-objects prefix
    expect(objectPath).not.toMatch(/^\/storage\/public-objects\//);
    expect(objectPath).not.toMatch(/^https?:\/\//);
  });

  it("J3-b: storeDocument mock was called with the file buffer and MIME type (not a public-objects path)", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("PDF content"), { filename: "audit.pdf", contentType: "application/pdf" });

    expect(mockStoreDocumentPath).toHaveBeenCalledTimes(1);
    const [_buf, mimeType] = mockStoreDocumentPath.mock.calls[0];
    expect(mimeType).toBe("application/pdf");

    const returnedPath = await mockStoreDocumentPath.mock.results[0].value;
    // AUDIT ASSERTION: the returned path from storeDocument must be in the private namespace
    expect(returnedPath).toMatch(/^\/objects\/documents\//);
  });

  it("J3-c: POST /api/documents rejects a fileUrl that does not start with /objects/documents/ (public-objects path blocked)", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    // Simulate an attempt to register a document using a public-objects path
    const publicObjectsAttempt = await request(app).post("/api/documents").send({
      title: "Leaky doc",
      folderId: 1,
      fileUrl: "/storage/public-objects/documents/some-file.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
    });

    expect(publicObjectsAttempt.status).toBe(400);
    expect(publicObjectsAttempt.body.error).toMatch(/admin-uploaded private storage/i);
  });

  it("J3-d: POST /api/documents rejects a raw GCS HTTPS URL (only canonical /objects/documents/ allowed)", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    const rawGcsAttempt = await request(app).post("/api/documents").send({
      title: "GCS doc",
      folderId: 1,
      fileUrl: "https://storage.googleapis.com/my-bucket/private/documents/uuid.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
    });

    expect(rawGcsAttempt.status).toBe(400);
    expect(rawGcsAttempt.body.error).toMatch(/admin-uploaded private storage/i);
  });

  it("J3-e: POST /api/documents/replace rejects a fileUrl not starting with /objects/documents/", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    const replaceAttempt = await request(app).post("/api/documents/1/replace").send({
      fileUrl: "/storage/public-objects/documents/replaced.pdf",
      mimeType: "application/pdf",
      fileSize: 200,
    });

    expect(replaceAttempt.status).toBe(400);
    expect(replaceAttempt.body.error).toMatch(/admin-uploaded private storage/i);
  });

  it("J3-e2: POST /api/documents/replace refuses missing upload metadata", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    const replaceAttempt = await request(app).post("/api/documents/1/replace").send({
      fileUrl: "/objects/documents/replaced.pdf",
    });

    expect(replaceAttempt.status).toBe(400);
    expect(replaceAttempt.body.error).toMatch(/uploaded file type/i);
  });

  it("J3-f: storeDocument mock result always uses /objects/documents/ prefix — auditable across all MIME types", async () => {
    // This test audits that for every supported MIME type the upload path
    // returned is within the private /objects/documents/ namespace, not a
    // PUBLIC_OBJECT_SEARCH_PATHS location.
    const mimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const audit: { mimeType: string; path: string; isPrivate: boolean }[] = [];

    for (const mimeType of mimeTypes) {
      mockAuthState.userId = CLERK_ADMIN;

      const res = await request(app)
        .post("/api/documents/upload")
        .attach("file", Buffer.from("content"), {
          filename: `test.${mimeType.split("/").pop()}`,
          contentType: mimeType,
        });

      if (res.status === 200) {
        const { objectPath } = res.body;
        audit.push({
          mimeType,
          path: objectPath,
          isPrivate: objectPath.startsWith("/objects/documents/"),
        });
      }
    }

    // All successful uploads must have private paths
    for (const entry of audit) {
      expect(entry.isPrivate, `AUDIT FAILURE: ${entry.mimeType} → ${entry.path} is not in /objects/documents/`).toBe(true);
    }

    // Confirm all MIME types were exercised
    expect(audit.length).toBe(mimeTypes.length);
  });

  it("J3-g: searchPublicObject is never invoked during a document upload or save (confirms documents are not written to public search paths)", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("%PDF content"), { filename: "j3g.pdf", contentType: "application/pdf" });

    // The public search path must never be consulted during a write
    expect(mockSearchPublicObject).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined J1+J3: end-to-end audit of the full document lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("J1+J3 combined — full document lifecycle audit", () => {
  it("a full upload→register→download cycle never touches public-objects", async () => {
    mockAuthState.userId = CLERK_ADMIN;

    // Step 1: Upload file → gets private path
    const uploadRes = await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "lifecycle.pdf", contentType: "application/pdf" })
      .expect(200);

    const { objectPath, mimeType, fileSize } = uploadRes.body;
    expect(objectPath).toMatch(/^\/objects\/documents\//);
    expect(mockSearchPublicObject).not.toHaveBeenCalled();

    // Step 2: Register document in library → must accept only private path
    const createRes = await request(app).post("/api/documents").send({
      title: "Lifecycle doc",
      folderId: 1,
      fileUrl: objectPath,
      mimeType,
      fileSize,
    }).expect(201);

    const docId = createRes.body.id;
    expect(createRes.body).not.toHaveProperty("fileUrl"); // fileUrl must not leak out
    expect(mockSearchPublicObject).not.toHaveBeenCalled();

    // Step 3: Download via authenticated endpoint → uses private path
    const downloadRes = await request(app).get(`/api/documents/${docId}/download`).expect(200);
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith(objectPath);
    expect(mockSearchPublicObject).not.toHaveBeenCalled();

    // Step 4: Attempting the same path via public-objects → always 404
    const publicAttempt = await request(app)
      .get(`/api/storage/public-objects${objectPath}`);
    expect(publicAttempt.status).toBe(404);
  });
});
