/**
 * Arabic layout guard for the Residents (Household Members) page.
 *
 * Rules under test:
 *   1. All res_* translation keys used in residents.tsx have non-empty Arabic values.
 *   2. Action button labels (add to household, add member) are ≤ 20 chars in Arabic.
 *   3. Relationship dropdown options are all translated.
 *   4. Member type labels (owner, tenant, family) have Arabic counterparts.
 */

import { describe, it, expect } from "vitest";
import { t } from "@/lib/translations";

const ar = "ar" as const;
const en = "en" as const;

function arStr(key: string): string {
  return t(ar, key);
}

function enStr(key: string): string {
  return t(en, key);
}

describe("Residents page Arabic translations — completeness", () => {
  const RES_KEYS_USED = [
    "res_title",
    "res_subtitle",
    "res_add",
    "res_add_dialog",
    "res_empty",
    "res_inactive",
    "res_info_title",
    "res_info_body",
    "res_verify_msg",
    "res_age",
    "res_portal_access",
    "res_relationship",
    "res_select_relationship",
    "res_first_name",
    "res_last_name",
    "res_dob",
    "res_dob_future_error",
    "res_id",
    "res_id_note",
    "res_phone",
    "res_email",
    "res_grant_portal",
    "res_grant_portal_desc",
    "res_add_to_household",
    "res_added",
    "res_removed",
    "res_rel_spouse",
    "res_rel_child",
    "res_rel_parent",
    "res_rel_sibling",
    "res_rel_worker",
    "res_rel_other",
    "res_type_owner",
    "res_type_tenant",
    "res_type_family",
    "common_error",
    "common_verify_required",
    "common_saving",
    "common_optional",
  ];

  RES_KEYS_USED.forEach(key => {
    it(`key "${key}" has a non-empty Arabic translation`, () => {
      const value = arStr(key);
      expect(value, `Missing Arabic translation for key: ${key}`).toBeTruthy();
      expect(value).not.toBe(enStr(key));
    });
  });
});

describe("Residents action button labels — length guard (≤ 20 chars)", () => {
  const ACTION_KEYS = [
    "res_add",
    "res_add_to_household",
    "res_add_dialog",
  ];

  ACTION_KEYS.forEach(key => {
    it(`Arabic label for "${key}" is ≤ 20 characters`, () => {
      const value = arStr(key);
      expect(
        value.length,
        `Arabic label "${value}" for key "${key}" is ${value.length} chars (max 20)`
      ).toBeLessThanOrEqual(20);
    });
  });
});

describe("Relationship dropdown options — Arabic counterparts", () => {
  const REL_KEYS = [
    "res_rel_spouse",
    "res_rel_child",
    "res_rel_parent",
    "res_rel_sibling",
    "res_rel_worker",
    "res_rel_other",
  ];

  REL_KEYS.forEach(key => {
    it(`relationship option "${key}" has Arabic translation`, () => {
      const value = arStr(key);
      expect(value).toBeTruthy();
      expect(value).not.toBe(enStr(key));
    });
  });
});

describe("Member type labels — Arabic counterparts", () => {
  const TYPE_KEYS = [
    "res_type_owner",
    "res_type_tenant",
    "res_type_family",
  ];

  TYPE_KEYS.forEach(key => {
    it(`member type "${key}" has Arabic translation`, () => {
      const value = arStr(key);
      expect(value).toBeTruthy();
      expect(value).not.toBe(enStr(key));
    });
  });
});
