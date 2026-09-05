import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/pages/portal/documents.tsx"), "utf-8");

describe("resident document preview contract", () => {
  it("renders view-only PDFs, DOCX HTML, and images through distinct previews", () => {
    expect(source).toContain('data-testid="document-pdf-preview"');
    expect(source).toContain('data-testid="document-docx-preview"');
    expect(source).toContain('data-testid="document-image-preview"');
    expect(source).toContain('srcDoc={preview.html}');
  });

  it("surfaces a clear missing-object error", () => {
    expect(source).toContain('body?.error === "DOCUMENT_OBJECT_NOT_FOUND"');
    expect(source).toContain('T("doc_missing_object")');
  });

  it("keeps document creation and deletion unavailable to residents", () => {
    expect(source).toContain("{isAdmin && (");
    expect(source).toContain("{isAdmin && (");
  });
});