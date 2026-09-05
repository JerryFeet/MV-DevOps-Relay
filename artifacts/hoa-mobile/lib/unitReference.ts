import { isSelectableUnitReference } from "@workspace/unit-reference";

/** Never present a legacy apartment number as a unit address. */
export function displayUnitReference(value?: string | null): string {
  if (!value) return "—";
  const canonical = value.replace(/\s/g, "");
  return isSelectableUnitReference(canonical) || canonical === "HOACOMMON" ? canonical : "—";
}