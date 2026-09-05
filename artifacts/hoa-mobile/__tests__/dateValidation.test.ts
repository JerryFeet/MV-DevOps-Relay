import { describe, expect, it } from "vitest";
import { isValidDateOfBirth } from "../lib/dateValidation";

describe("isValidDateOfBirth", () => {
  const today = new Date(2026, 2, 27);

  it("accepts today and prior calendar dates", () => {
    expect(isValidDateOfBirth("2026-03-27", today)).toBe(true);
    expect(isValidDateOfBirth("1990-04-12", today)).toBe(true);
  });

  it("refuses future, malformed, and impossible dates", () => {
    expect(isValidDateOfBirth("2026-03-28", today)).toBe(false);
    expect(isValidDateOfBirth("2026-02-29", today)).toBe(false);
    expect(isValidDateOfBirth("03/27/2026", today)).toBe(false);
  });
});