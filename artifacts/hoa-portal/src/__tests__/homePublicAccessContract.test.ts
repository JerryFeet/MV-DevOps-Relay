import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "src/pages/home.tsx"),
  "utf8",
);

describe("public homepage access contract", () => {
  it("does not expose a separate administrator access link", () => {
    expect(homeSource).not.toContain('href="/admin"');
    expect(homeSource).not.toContain("home_admin_login");
  });
});