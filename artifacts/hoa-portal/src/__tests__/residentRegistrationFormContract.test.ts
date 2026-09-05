import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/pages/portal/residents.tsx"), "utf-8");

describe("resident registration form contract", () => {
  it("uses the mandated bilingual false-registration wording verbatim", () => {
    const translations = readFileSync(resolve(process.cwd(), "src/lib/translations.ts"), "utf-8");
    expect(translations).toContain("Registering a person who does not live in this unit is a violation of the community's rules and regulations, and may result in penalties. The Owners Association may remove registered residents who are found not to be resident.");
    expect(translations).toContain("تسجيل شخص لا يقيم في هذه الوحدة يُعد مخالفة لأنظمة ولوائح المجمع، وقد يترتب عليه غرامات. ويحق لجمعية الملاك إزالة أي ساكن مسجل يتبين أنه غير مقيم.");
  });

  it("does not collect nationality", () => {
    expect(source).not.toContain("res_nationality");
    expect(source).not.toContain("nationality:");
  });

  it("prevents future dates of birth in both the control and client state", () => {
    expect(source).toContain("max={today}");
    expect(source).toContain("isResidentDateOfBirthValid(form.dateOfBirth, today)");
    expect(source).toContain("if (!isResidentDateOfBirthValid(form.dateOfBirth, today))");
    expect(source).toContain("res_dob_future_error");
  });

  it("shows the bilingual false-registration disclaimer before both submissions", () => {
    expect(source).toContain('data-testid="false-registration-disclaimer"');
    expect(source).toContain('data-testid="self-false-registration-disclaimer"');
  });

  it("uses the Dialog close control rather than a second dead close button", () => {
    expect(source).toContain("setOpen(v);");
    expect(source).not.toContain('<Button variant="ghost" size="sm" onClick={() => { setOpen(false); resetForm(); }}>{T("close")}</Button>');
  });
});