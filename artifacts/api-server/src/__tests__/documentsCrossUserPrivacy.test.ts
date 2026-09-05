/**
 * Stage 4b document-library authorization matrix.
 * The assertions deliberately exercise list, metadata, file retrieval, guessed
 * IDs, mutation endpoints, folder floors, and archived replacement rows.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

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
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }),
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityFile = vi.fn().mockResolvedValue({});
    downloadObject = vi.fn().mockResolvedValue(new Response("document", { status: 200 }));
  },
}));

import request from "supertest";
import { mockAuthState, stores, resetMockDb } from "./helpers/mockDb";
const { default: app } = await import("../app");

const CLERK_OWNER = "clerk-document-owner";
const CLERK_TENANT = "clerk-document-tenant";
const CLERK_ADMIN = "clerk-document-admin";

function seedDocumentLibrary() {
  resetMockDb();
  stores.users.insert({ clerkId: CLERK_OWNER, email: "owner@example.test", role: "owner", status: "active", firstName: "Owner", lastName: "One", verificationStatus: "verified_owner", unitNumber: "101" });
  stores.users.insert({ clerkId: CLERK_TENANT, email: "tenant@example.test", role: "tenant", status: "active", firstName: "Tenant", lastName: "Two", verificationStatus: "verified_tenant", unitNumber: "102" });
  stores.users.insert({ clerkId: CLERK_ADMIN, email: "admin@example.test", role: "admin", status: "active", firstName: "Admin", lastName: "Three", verificationStatus: "unverified", unitNumber: null });

  stores.documentFolders.insert({ name: "Rules and Regulations", nameAr: "الأنظمة واللوائح", defaultVisibility: "all_portal_users", defaultDownloadMode: "download_allowed", sortOrder: 10, isActive: true, isTriage: false });
  stores.documentFolders.insert({ name: "Invoices", nameAr: "الفواتير", defaultVisibility: "verified_owners", defaultDownloadMode: "download_allowed", sortOrder: 20, isActive: true, isTriage: false });
  stores.documentFolders.insert({ name: "Internal drafts", nameAr: "مسودات داخلية", defaultVisibility: "admin_only", defaultDownloadMode: "view_only", sortOrder: 30, isActive: true, isTriage: false });
  stores.documentFolders.insert({ name: "Empty Notices", nameAr: "إشعارات فارغة", defaultVisibility: "all_portal_users", defaultDownloadMode: "download_allowed", sortOrder: 40, isActive: true, isTriage: false });
  stores.documentFolders.insert({ name: "Legacy triage", nameAr: "فرز السجلات القديمة", defaultVisibility: "admin_only", defaultDownloadMode: "view_only", sortOrder: 50, isActive: true, isTriage: true });

  const base = { description: null, category: "library", fileUrl: "/objects/documents/test.pdf", mimeType: "application/pdf", fileSize: 100, isPublic: false, uploadedById: 3, isArchived: false, downloadMode: "download_allowed" };
  stores.documents.insert({ ...base, title: "Rules", folderId: 1, visibility: "all_portal_users" }); // 1
  stores.documents.insert({ ...base, title: "Owner Invoice", folderId: 2, visibility: "verified_owners" }); // 2
  stores.documents.insert({ ...base, title: "Admin Draft", folderId: 1, visibility: "admin_only", downloadMode: "view_only" }); // 3
  stores.documents.insert({ ...base, title: "Archived Rules", folderId: 1, visibility: "all_portal_users", isArchived: true, archivedAt: new Date(), archivedById: 3 }); // 4
  stores.documents.insert({ ...base, title: "Legacy external", folderId: 1, visibility: "all_portal_users", fileUrl: "https://legacy.example/file.pdf" }); // 5
  stores.documents.insert({ ...base, title: "Unmapped personal legacy document", category: "resident_personal", folderId: 5, visibility: "admin_only", uploadedById: 1 }); // 6
}

beforeEach(() => {
  seedDocumentLibrary();
  mockAuthState.userId = null;
});

describe("folder floor and retrieval enforcement", () => {
  it("shows a tenant only all-portal-user current documents and hides empty folders", async () => {
    mockAuthState.userId = CLERK_TENANT;
    const docs = await request(app).get("/api/documents");
    expect(docs.status).toBe(200);
    expect(docs.body.map((document: { id: number }) => document.id).sort()).toEqual([1, 5]);
    expect(docs.body[0]).not.toHaveProperty("fileUrl");

    const folders = await request(app).get("/api/document-folders");
    expect(folders.status).toBe(200);
    expect(folders.body.map((folder: { name: string }) => folder.name)).toEqual(["Rules and Regulations"]);
  });

  it("allows a verified owner to retrieve owners-only metadata and blocks a tenant guessing its ID", async () => {
    mockAuthState.userId = CLERK_OWNER;
    expect((await request(app).get("/api/documents/2")).status).toBe(200);
    expect((await request(app).get("/api/documents/2/download")).status).toBe(200);

    mockAuthState.userId = CLERK_TENANT;
    expect((await request(app).get("/api/documents/2")).status).toBe(403);
    expect((await request(app).get("/api/documents/2/download")).status).toBe(403);
  });

  it("enforces an admin-only document override even in an all-users folder", async () => {
    mockAuthState.userId = CLERK_OWNER;
    expect((await request(app).get("/api/documents/3")).status).toBe(403);
    mockAuthState.userId = CLERK_ADMIN;
    expect((await request(app).get("/api/documents/3")).status).toBe(200);
  });

  it("never lists or retrieves archived rows for an admin or resident", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const list = await request(app).get("/api/documents");
    expect(list.body.map((document: { id: number }) => document.id)).not.toContain(4);
    expect((await request(app).get("/api/documents/4")).status).toBe(404);
    expect((await request(app).get("/api/documents/4/download")).status).toBe(404);
  });

  it("does not redirect a legacy external document URL", async () => {
    mockAuthState.userId = CLERK_OWNER;
    const response = await request(app).get("/api/documents/5/download");
    expect(response.status).toBe(410);
    expect(response.headers.location).toBeUndefined();
  });

  it("keeps migration-triaged legacy personal documents admin-only", async () => {
    mockAuthState.userId = CLERK_OWNER;
    expect((await request(app).get("/api/documents")).body.map((document: { id: number }) => document.id)).not.toContain(6);
    expect((await request(app).get("/api/documents/6")).status).toBe(403);
    expect((await request(app).get("/api/documents/6/download")).status).toBe(403);

    mockAuthState.userId = CLERK_ADMIN;
    expect((await request(app).get("/api/documents/6")).status).toBe(200);
  });
});

describe("admin-only mutation and floor guards", () => {
  it("refuses crafted non-admin create, edit, replace, delete, and folder calls", async () => {
    mockAuthState.userId = CLERK_TENANT;
    expect((await request(app).post("/api/documents").send({ title: "attack", folderId: 1, fileUrl: "/objects/documents/a.pdf" })).status).toBe(403);
    expect((await request(app).patch("/api/documents/1").send({ title: "attack" })).status).toBe(403);
    expect((await request(app).post("/api/documents/1/replace").send({ fileUrl: "/objects/documents/a.pdf" })).status).toBe(403);
    expect((await request(app).delete("/api/documents/1")).status).toBe(403);
    expect((await request(app).post("/api/document-folders").send({ name: "attack", nameAr: "هجوم", defaultVisibility: "all_portal_users", defaultDownloadMode: "download_allowed" })).status).toBe(403);
  });

  it("refuses a visibility setting below an owners-only folder floor", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const response = await request(app).post("/api/documents").send({
      title: "Leaky invoice",
      folderId: 2,
      fileUrl: "/objects/documents/invoice.pdf",
      visibility: "all_portal_users",
      downloadMode: "download_allowed",
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/less restrictive/i);
  });

  it("cascades documents below the new floor when a folder is tightened", async () => {
    // Folder 1 (Rules and Regulations) is all_portal_users.
    // Documents 1 (all_portal_users) and 5 (all_portal_users) sit below verified_owners.
    // Document 3 (admin_only) already exceeds the new floor and must not be changed.
    // Document 4 (archived, all_portal_users) is below the new floor and should cascade.
    mockAuthState.userId = CLERK_ADMIN;
    const response = await request(app).patch("/api/document-folders/1").send({
      defaultVisibility: "verified_owners",
    });
    expect(response.status).toBe(200);
    expect(response.body.defaultVisibility).toBe("verified_owners");
    // Three documents (1, 4, 5) were below verified_owners and must have been raised.
    expect(response.body.cascadedDocuments).toBe(3);

    // Document 1 must now be verified_owners.
    const docCheck = stores.documents.findAll().find((d) => d.id === 1);
    expect(docCheck?.visibility).toBe("verified_owners");

    // Document 3 (admin_only) must remain unchanged.
    const docAdmin = stores.documents.findAll().find((d) => d.id === 3);
    expect(docAdmin?.visibility).toBe("admin_only");

    // Loosening the folder back to all_portal_users must NOT cascade downward.
    const loosen = await request(app).patch("/api/document-folders/1").send({
      defaultVisibility: "all_portal_users",
    });
    expect(loosen.status).toBe(200);
    expect(loosen.body).not.toHaveProperty("cascadedDocuments");
    // Document 1 keeps its verified_owners override after the folder loosens.
    const docAfterLoosen = stores.documents.findAll().find((d) => d.id === 1);
    expect(docAfterLoosen?.visibility).toBe("verified_owners");
  });

  it("stores replacements as a new row and excludes the prior row immediately", async () => {
    mockAuthState.userId = CLERK_ADMIN;
    const response = await request(app).post("/api/documents/1/replace").send({
      title: "Rules v2",
      fileUrl: "/objects/documents/rules-v2.pdf",
      mimeType: "application/pdf",
      fileSize: 256,
      downloadMode: "view_only",
    });
    expect(response.status).toBe(201);
    const replacementId = response.body.id;
    expect(replacementId).not.toBe(1);

    const allRows = stores.documents.findAll();
    const old = allRows.find((document) => document.id === 1)!;
    expect(old.isArchived).toBe(true);
    expect(old.replacedById).toBe(replacementId);
    expect(old.archivedById).toBe(3);
    expect(old.archivedAt).toBeInstanceOf(Date);

    expect((await request(app).get("/api/documents/1")).status).toBe(404);
    const list = await request(app).get("/api/documents");
    expect(list.body.map((document: { id: number }) => document.id)).toContain(replacementId);
    expect(list.body.map((document: { id: number }) => document.id)).not.toContain(1);
  });
});