/**
 * Tests: VehicleFormSheet — Arabic field labels and placeholder text in the
 * vehicle registration sheet.
 *
 * The vehicle registration form in VehiclesScreen previously used hardcoded
 * English strings for all field labels, placeholders, the sheet title, and
 * the submit button. After the translation-key migration, all of these are
 * routed through useTranslations so Arabic-speaking residents see their
 * native text.
 *
 * The sheet is opened by pressing the add button (testID="register-vehicle-button").
 *
 * Labels tested (8 keys via testID):
 *   veh_form_register_title → "تسجيل مركبة"        (sheet header)
 *   veh_form_plate_label    → "رقم اللوحة *"        (plate field)
 *   veh_form_make_label     → "الشركة المصنعة *"    (make field)
 *   veh_form_model_label    → "الموديل *"           (model field)
 *   veh_form_color_label    → "اللون"               (color field)
 *   veh_form_istimara_label → "رقم الاستمارة"       (istimara field)
 *   veh_form_year_label     → "السنة"               (year field)
 *   veh_form_register_btn   → "تسجيل مركبة"         (submit button)
 *
 * Placeholders tested (5 fields):
 *   Plate input    → "أ-ب-1234"  (not "ABC-1234")
 *   Make input     → "تويوتا"    (not "Toyota")
 *   Model input    → "كامري"     (not "Camry")
 *   Color input    → "أبيض"      (not "White")
 *   Istimara input → "اختياري"   (not "Optional")
 *   Year input     → "2022"      (same in both, numeric)
 *
 * Test blocks (37 total):
 *   English path (2)    — sheet title and submit button show key string in identity mock
 *   Arabic labels (8)   — each label testID shows Arabic text when lang=ar
 *   Arabic placeholders (5) — positive: Arabic text appears
 *   English placeholder absence (5) — negative: English strings absent in Arabic mode
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  parkingLots: [] as any[],
  vehicles: [] as any[],
}));

// ─── react-native mock ────────────────────────────────────────────────────────

vi.mock("react-native", () => {
  const Animated = {
    Value: class { constructor(v: number) { return { _value: v }; } },
    View: ({ children, style: _s, ...rest }: any) =>
      React.createElement("div", rest, children),
    spring: () => ({ start: vi.fn() }),
    timing: () => ({ start: vi.fn() }),
  };
  return {
    View: ({ children, style: _s, testID, ...rest }: any) =>
      React.createElement("div", { "data-testid": testID, ...rest }, children),
    Text: ({ children, style: _s, testID, ...rest }: any) =>
      React.createElement("span", { "data-testid": testID, ...rest }, children),
    Pressable: ({ children, onPress, disabled, testID, style: _s, ...rest }: any) =>
      React.createElement(
        "button",
        { onClick: onPress, disabled, "data-testid": testID },
        typeof children === "function" ? children({ pressed: false }) : children,
      ),
    Modal: ({ children, visible, style: _s, ...rest }: any) =>
      visible ? React.createElement("div", rest, children) : null,
    FlatList: ({ data, renderItem, ListEmptyComponent, style: _s }: any) =>
      React.createElement(
        "div",
        null,
        data?.length
          ? data.map((item: any, i: number) => renderItem({ item, index: i }))
          : ListEmptyComponent,
      ),
    ScrollView: ({ children, style: _s, ...rest }: any) =>
      React.createElement("div", rest, children),
    TextInput: ({ style: _s, testID, placeholder, ...rest }: any) =>
      React.createElement("input", { "data-testid": testID, placeholder, ...rest }),
    ActivityIndicator: () => React.createElement("span", null, "loading"),
    RefreshControl: () => null,
    Alert: { alert: vi.fn() },
    Animated,
    I18nManager: { isRTL: false },
    StyleSheet: { create: (s: any) => s },
    Platform: { OS: "android" },
  };
});

vi.mock("expo-image", () => ({
  Image: ({ source, testID, style: _s }: any) =>
    React.createElement("img", { src: source?.uri, "data-testid": testID }),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: any) => React.createElement("span", null, name),
  Ionicons: ({ name }: any) => React.createElement("span", null, name),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.parkingLots, isLoading: false, isError: false, refetch: vi.fn() }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useMobilePagination", () => ({
  useMobilePagination: () => ({
    items: mocks.vehicles,
    total: 0,
    loadedCount: 0,
    isLoading: false,
    refetch: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasUnloadedItems: false,
  }),
}));

vi.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    primary: "#4f46e5",
    background: "#ffffff",
    foreground: "#000000",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    border: "#e4e4e7",
    brand: "#4f46e5",
    brandForeground: "#ffffff",
    card: "#ffffff",
    destructive: "#ef4444",
    accent: "#6366f1",
  }),
}));

const mockT = vi.fn((key: string) => key);
vi.mock("@/hooks/useTranslations", () => ({
  useTranslations: vi.fn(() => mockT),
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

// ─── Component under test ─────────────────────────────────────────────────────

import VehiclesScreen from "../app/(home)/(tabs)/vehicles";

// ─── Arabic string map ────────────────────────────────────────────────────────

const arLabels: Record<string, string> = {
  veh_form_register_title:  "تسجيل مركبة",
  veh_form_plate_label:     "رقم اللوحة *",
  veh_form_make_label:      "الشركة المصنعة *",
  veh_form_model_label:     "الموديل *",
  veh_form_color_label:     "اللون",
  veh_form_istimara_label:  "رقم الاستمارة",
  veh_form_year_label:      "السنة",
  veh_form_register_btn:    "تسجيل مركبة",
  veh_placeholder_plate:    "أ-ب-1234",
  veh_placeholder_make:     "تويوتا",
  veh_placeholder_model:    "كامري",
  veh_placeholder_color:    "أبيض",
  veh_placeholder_year:     "2022",
  form_placeholder_optional: "اختياري",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function openSheet() {
  fireEvent.click(screen.getByTestId("register-vehicle-button"));
}

// ─── English path (identity mock — sanity / regression guards) ────────────────

describe("VehicleFormSheet — English labels (lang=en, identity mock)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it("sheet title testID renders the translation key (wiring confirmed)", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-form-sheet-title").textContent).toBe("veh_form_register_title");
  });

  it("submit button testID renders the translation key (wiring confirmed)", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-form-submit-text").textContent).toBe("veh_form_register_btn");
  });
});

describe("Vehicle parking selection and display", () => {
  afterEach(() => {
    mocks.parkingLots = [];
    mocks.vehicles = [];
  });

  it("renders one parking-lot selector outside the repeated vehicle fields", () => {
    render(<VehiclesScreen />);
    openSheet();

    expect(screen.getAllByTestId("vehicle-parking-lots")).toHaveLength(1);
  });

  it("shows the assigned lot number and its parking type from the enriched vehicle", () => {
    mocks.vehicles = [{
      id: 1,
      make: "Toyota",
      model: "Camry",
      year: null,
      color: null,
      plateNumber: "ABC-1234",
      istimaraNumber: null,
      isAdditional: false,
      status: "active",
      createdAt: "2026-01-01",
      parkingLotId: 7,
      parkingLot: {
        id: 7,
        lotNumber: "B-07",
        building: "B",
        parkingType: "underground",
        active: true,
        underground: true,
      },
    }];
    render(<VehiclesScreen />);

    expect(screen.getByText("B-07 · Underground")).toBeTruthy();
  });

  it("shows an inactive assigned lot from the enriched vehicle even though it is unavailable for form selection", () => {
    mocks.parkingLots = [];
    mocks.vehicles = [{
      id: 2,
      make: "Honda",
      model: "Accord",
      year: null,
      color: null,
      plateNumber: "XYZ-5678",
      istimaraNumber: null,
      isAdditional: false,
      status: "inactive",
      createdAt: "2026-01-01",
      parkingLotId: 8,
      parkingLot: {
        id: 8,
        lotNumber: "C-08",
        building: "C",
        parkingType: "surface",
        active: false,
        underground: false,
      },
    }];
    render(<VehiclesScreen />);

    expect(screen.getByText("C-08 · Surface")).toBeTruthy();
  });
});

// ─── Arabic label assertions ──────────────────────────────────────────────────

describe("VehicleFormSheet — Arabic labels (lang=ar)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it("shows Arabic sheet title 'تسجيل مركبة'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-form-sheet-title").textContent).toBe("تسجيل مركبة");
  });

  it("shows Arabic license plate label 'رقم اللوحة *'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-plate").textContent).toBe("رقم اللوحة *");
  });

  it("shows Arabic make label 'الشركة المصنعة *'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-make").textContent).toBe("الشركة المصنعة *");
  });

  it("shows Arabic model label 'الموديل *'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-model").textContent).toBe("الموديل *");
  });

  it("shows Arabic color label 'اللون'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-color").textContent).toBe("اللون");
  });

  it("shows Arabic istimara label 'رقم الاستمارة'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-istimara").textContent).toBe("رقم الاستمارة");
  });

  it("shows Arabic year label 'السنة'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-label-year").textContent).toBe("السنة");
  });

  it("shows Arabic submit button 'تسجيل مركبة'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByTestId("veh-form-submit-text").textContent).toBe("تسجيل مركبة");
  });
});

// ─── Arabic placeholder positive assertions ───────────────────────────────────

describe("VehicleFormSheet — Arabic placeholder text (lang=ar)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it("plate input has Arabic placeholder 'أ-ب-1234'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByPlaceholderText("أ-ب-1234")).toBeTruthy();
  });

  it("make input has Arabic placeholder 'تويوتا'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByPlaceholderText("تويوتا")).toBeTruthy();
  });

  it("model input has Arabic placeholder 'كامري'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByPlaceholderText("كامري")).toBeTruthy();
  });

  it("color input has Arabic placeholder 'أبيض'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByPlaceholderText("أبيض")).toBeTruthy();
  });

  it("istimara input has Arabic optional placeholder 'اختياري'", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.getByPlaceholderText("اختياري")).toBeTruthy();
  });
});

// ─── English placeholder absence in Arabic mode (negative guards) ─────────────
//
// Confirms that the previous hardcoded English placeholder strings are completely
// absent from the form when the Arabic translation map is active. An accidental
// revert of any placeholder translation key would fail one of these immediately.

describe("VehicleFormSheet — English placeholders absent in Arabic mode (lang=ar)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it("'ABC-1234' is not present as a placeholder in Arabic mode", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.queryByPlaceholderText("ABC-1234")).toBeNull();
  });

  it("'Toyota' is not present as a placeholder in Arabic mode", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.queryByPlaceholderText("Toyota")).toBeNull();
  });

  it("'Camry' is not present as a placeholder in Arabic mode", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.queryByPlaceholderText("Camry")).toBeNull();
  });

  it("'White' is not present as a placeholder in Arabic mode", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.queryByPlaceholderText("White")).toBeNull();
  });

  it("'Optional' is not present as a placeholder in Arabic mode", () => {
    render(<VehiclesScreen />);
    openSheet();
    expect(screen.queryByPlaceholderText("Optional")).toBeNull();
  });
});

// ─── VEH_FORM_COVERAGE_TABLE — authoritative registry of all vehicle form fields ─
//
// This parameterized block is the authoritative registry of every label
// translation key wired into VehicleFormSheet. Adding a new form field requires
// adding a row here — the gap becomes immediately visible when either it.each()
// block fails with the raw key string instead of translated text.
//
// HOW TO EXTEND:
//   When a new form field is added to the vehicle registration sheet:
//     1. Add the translation key to useTranslations.ts (both `en` and `ar` tables).
//     2. Add the label testID to the field element in vehicles.tsx.
//     3. Add an entry to VEH_FORM_COVERAGE_TABLE below (tKey, phKey if the field
//        has a placeholder input, testID, expectedArabic, expectedEnglish).
//   The Arabic it.each() block will fail if the Arabic value in arLabels is
//   missing (returns the raw key instead of Arabic text), surfacing the gap
//   before it reaches Arabic-speaking residents.
//
// Current veh_form_* + veh_form_register_btn keys (8 total):
//   veh_form_register_title, veh_form_plate_label, veh_form_make_label,
//   veh_form_model_label, veh_form_color_label, veh_form_istimara_label,
//   veh_form_year_label, veh_form_register_btn
//   — all present in both EN and AR tables of useTranslations.ts.

const enLabels: Record<string, string> = {
  veh_form_register_title: "Register Vehicle",
  veh_form_plate_label:    "License Plate *",
  veh_form_make_label:     "Make *",
  veh_form_model_label:    "Model *",
  veh_form_color_label:    "Color",
  veh_form_istimara_label: "Istimara Number",
  veh_form_year_label:     "Year",
  veh_form_register_btn:   "Register Vehicle",
};

const VEH_FORM_COVERAGE_TABLE: Array<{
  tKey: string;
  phKey: string | null;
  testID: string;
  inputTestID: string | null;
  expectedArabic: string;
  expectedEnglish: string;
  expectedPlaceholderAr: string | null;
  expectedPlaceholderEn: string | null;
}> = [
  {
    tKey:                  "veh_form_register_title",
    phKey:                 null,
    testID:                "veh-form-sheet-title",
    inputTestID:           null,
    expectedArabic:        "تسجيل مركبة",
    expectedEnglish:       "Register Vehicle",
    expectedPlaceholderAr: null,
    expectedPlaceholderEn: null,
  },
  {
    tKey:                  "veh_form_plate_label",
    phKey:                 "veh_placeholder_plate",
    testID:                "veh-label-plate",
    inputTestID:           "veh-input-plate",
    expectedArabic:        "رقم اللوحة *",
    expectedEnglish:       "License Plate *",
    expectedPlaceholderAr: "أ-ب-1234",
    expectedPlaceholderEn: "ABC-1234",
  },
  {
    tKey:                  "veh_form_make_label",
    phKey:                 "veh_placeholder_make",
    testID:                "veh-label-make",
    inputTestID:           "veh-input-make",
    expectedArabic:        "الشركة المصنعة *",
    expectedEnglish:       "Make *",
    expectedPlaceholderAr: "تويوتا",
    expectedPlaceholderEn: "Toyota",
  },
  {
    tKey:                  "veh_form_model_label",
    phKey:                 "veh_placeholder_model",
    testID:                "veh-label-model",
    inputTestID:           "veh-input-model",
    expectedArabic:        "الموديل *",
    expectedEnglish:       "Model *",
    expectedPlaceholderAr: "كامري",
    expectedPlaceholderEn: "Camry",
  },
  {
    tKey:                  "veh_form_color_label",
    phKey:                 "veh_placeholder_color",
    testID:                "veh-label-color",
    inputTestID:           "veh-input-color",
    expectedArabic:        "اللون",
    expectedEnglish:       "Color",
    expectedPlaceholderAr: "أبيض",
    expectedPlaceholderEn: "White",
  },
  {
    tKey:                  "veh_form_istimara_label",
    phKey:                 "form_placeholder_optional",
    testID:                "veh-label-istimara",
    inputTestID:           "veh-input-istimara",
    expectedArabic:        "رقم الاستمارة",
    expectedEnglish:       "Istimara Number",
    expectedPlaceholderAr: "اختياري",
    expectedPlaceholderEn: "Optional",
  },
  {
    tKey:                  "veh_form_year_label",
    phKey:                 "veh_placeholder_year",
    testID:                "veh-label-year",
    inputTestID:           "veh-input-year",
    expectedArabic:        "السنة",
    expectedEnglish:       "Year",
    expectedPlaceholderAr: "2022",
    expectedPlaceholderEn: null,
  },
  {
    tKey:                  "veh_form_register_btn",
    phKey:                 null,
    testID:                "veh-form-submit-text",
    inputTestID:           null,
    expectedArabic:        "تسجيل مركبة",
    expectedEnglish:       "Register Vehicle",
    expectedPlaceholderAr: null,
    expectedPlaceholderEn: null,
  },
];

describe("VehicleFormSheet labels — Arabic coverage table (parameterized)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it.each(VEH_FORM_COVERAGE_TABLE)(
    "key '$tKey' → testID='$testID' renders Arabic text (not key string)",
    ({ tKey, testID, expectedArabic }) => {
      render(<VehiclesScreen />);
      openSheet();
      const el = screen.getByTestId(testID);
      expect(el.textContent).toBe(expectedArabic);
      expect(el.textContent).not.toBe(tKey);
    }
  );
});

describe("VehicleFormSheet labels — English coverage table (parameterized)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => enLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it.each(VEH_FORM_COVERAGE_TABLE)(
    "key '$tKey' → testID='$testID' renders English text (not key string)",
    ({ tKey, testID, expectedEnglish }) => {
      render(<VehiclesScreen />);
      openSheet();
      const el = screen.getByTestId(testID);
      expect(el.textContent).toBe(expectedEnglish);
      expect(el.textContent).not.toMatch(/^veh_form_/);
    }
  );
});

// ─── Placeholder coverage (parameterized) ─────────────────────────────────────
//
// These two blocks drive placeholder assertions directly from the same
// VEH_FORM_COVERAGE_TABLE registry. Rows where inputTestID is null (sheet
// title, submit button) are skipped automatically via the filter. Each row
// with an inputTestID gets a deterministic per-field assertion against the
// input element's placeholder attribute — no count-based getAllByPlaceholderText
// guessing.
//
// Year (veh_placeholder_year → "2022") is identical in both locales, so it
// is excluded from the English-absence block via the expectedPlaceholderEn
// null guard; it IS included in the Arabic-positive block.

describe("VehicleFormSheet placeholders — Arabic coverage table (parameterized)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it.each(VEH_FORM_COVERAGE_TABLE.filter((r) => r.inputTestID !== null))(
    "phKey '$phKey' → input '$inputTestID' has Arabic placeholder",
    ({ inputTestID, expectedPlaceholderAr }) => {
      render(<VehiclesScreen />);
      openSheet();
      const input = screen.getByTestId(inputTestID!);
      expect(input.getAttribute("placeholder")).toBe(expectedPlaceholderAr);
    }
  );
});

describe("VehicleFormSheet placeholders — English absence coverage table (parameterized)", () => {
  beforeEach(() => {
    mockT.mockImplementation((key: string) => arLabels[key] ?? key);
  });

  afterEach(() => {
    mockT.mockImplementation((key: string) => key);
  });

  it.each(
    VEH_FORM_COVERAGE_TABLE.filter(
      (r) => r.inputTestID !== null && r.expectedPlaceholderEn !== null,
    )
  )(
    "phKey '$phKey' → input '$inputTestID' does NOT show English placeholder '$expectedPlaceholderEn' in Arabic mode",
    ({ inputTestID, expectedPlaceholderEn }) => {
      render(<VehiclesScreen />);
      openSheet();
      const input = screen.getByTestId(inputTestID!);
      expect(input.getAttribute("placeholder")).not.toBe(expectedPlaceholderEn);
    }
  );
});

// ─── SENTINEL: rendered input count must match VEH_FORM_COVERAGE_TABLE ────────
//
// This test is the enforcement gate for VEH_FORM_COVERAGE_TABLE completeness.
// It compares two independent counts:
//
//   A) The number of <TextInput> elements in the open form sheet whose testID
//      begins with "veh-input-" (i.e. every covered input the component actually
//      renders at runtime).
//
//   B) The number of rows in VEH_FORM_COVERAGE_TABLE that have a non-null
//      inputTestID (i.e. every field the coverage registry declares it covers).
//
// The test fails when A ≠ B, which surfaces two distinct developer mistakes:
//
//   • A > B  — a new TextInput was added to vehicles.tsx with a "veh-input-*"
//              testID but no matching row was added to VEH_FORM_COVERAGE_TABLE.
//              The new placeholder is unchecked and could silently stay English
//              in an Arabic session.
//
//   • A < B  — a row was added to VEH_FORM_COVERAGE_TABLE for a field that was
//              never wired into the form, so the registry is lying about its
//              coverage.
//
// HOW TO FIX A FAILURE:
//   When you add a new form field to vehicles.tsx:
//     1. Give the TextInput  testID="veh-input-<name>"  (follows the convention).
//     2. Give the label Text testID="veh-label-<name>"  (already required for label
//        coverage tests above).
//     3. Add both keys to useTranslations.ts (en + ar tables).
//     4. Add a row to VEH_FORM_COVERAGE_TABLE with inputTestID="veh-input-<name>"
//        and the correct placeholder values.
//   All four steps must be done together — this sentinel enforces step 4.

describe("VehicleFormSheet — SENTINEL: rendered input count matches VEH_FORM_COVERAGE_TABLE", () => {
  it("number of veh-input-* testID inputs in the open sheet equals VEH_FORM_COVERAGE_TABLE rows with non-null inputTestID", () => {
    mockT.mockImplementation((key: string) => key);

    render(<VehiclesScreen />);
    openSheet();

    // Count every <input> element whose data-testid starts with "veh-input-".
    // In the RN mock, TextInput renders as <input data-testid={testID}>.
    // This count reflects what the component actually renders at runtime.
    const renderedInputs = document
      .querySelectorAll('[data-testid^="veh-input-"]')
      .length;

    // Count every VEH_FORM_COVERAGE_TABLE row that declares an input element.
    // This count reflects what the coverage registry claims to cover.
    const coveredInputs = VEH_FORM_COVERAGE_TABLE.filter(
      (r) => r.inputTestID !== null,
    ).length;

    expect(renderedInputs).toBe(coveredInputs);
  });
});

// ─── SENTINEL: rendered veh-label-* count must match VEH_FORM_COVERAGE_TABLE rows ─
//
// Symmetric counterpart to the input sentinel above. This block guards the
// label side of the form: it detects when a developer adds a new label Text
// element with a "veh-label-*" testID but forgets to add a corresponding row
// to VEH_FORM_COVERAGE_TABLE.
//
// Two independent counts are compared:
//
//   A) The number of DOM elements whose data-testid starts with "veh-label-"
//      (per-field labels the component actually renders at runtime).
//      Note: the sheet title (veh-form-sheet-title) and submit button
//      (veh-form-submit-text) use the "veh-form-*" prefix and are excluded.
//
//   B) The number of VEH_FORM_COVERAGE_TABLE rows whose testID starts with
//      "veh-label-" (per-field label rows declared in the coverage registry).
//      Currently 6 of the 8 rows — matching set A precisely.
//
// The test fails when A ≠ B, which surfaces two distinct developer mistakes:
//
//   • A > B  — a new label Text was added to vehicles.tsx with a "veh-label-*"
//              testID but no matching row was added to VEH_FORM_COVERAGE_TABLE.
//              The hardcoded English string evades the Arabic coverage checks.
//
//   • A < B  — a phantom row exists in VEH_FORM_COVERAGE_TABLE for a label
//              that was never rendered, so the registry over-claims coverage.
//
// HOW TO FIX A FAILURE:
//   When you add a new label to the vehicle registration sheet:
//     1. Give the Text element   testID="veh-label-<name>"  (follows convention).
//     2. Give the TextInput      testID="veh-input-<name>"  (required for input sentinel).
//     3. Add both translation keys to useTranslations.ts (en + ar tables).
//     4. Add a row to VEH_FORM_COVERAGE_TABLE (testID + inputTestID + all values).
//   All four steps must be done together — this sentinel enforces step 4 for labels.

describe("VehicleFormSheet — SENTINEL: rendered veh-label-* count matches VEH_FORM_COVERAGE_TABLE rows", () => {
  it("number of veh-label-* testID elements in the open sheet equals VEH_FORM_COVERAGE_TABLE rows with testID starting 'veh-label-'", () => {
    mockT.mockImplementation((key: string) => key);

    render(<VehiclesScreen />);
    openSheet();

    // Count every element whose data-testid starts with "veh-label-".
    // In the RN mock, Text renders as <span data-testid={testID}>.
    // This covers the per-field label rows (veh-label-plate, veh-label-make,
    // etc.) but intentionally excludes the sheet title (veh-form-sheet-title)
    // and submit button (veh-form-submit-text), which use "veh-form-*" prefixes.
    const renderedLabels = document
      .querySelectorAll('[data-testid^="veh-label-"]')
      .length;

    // Count only the VEH_FORM_COVERAGE_TABLE rows whose testID starts with
    // "veh-label-" — the per-field label rows. The sheet title and submit
    // button rows use "veh-form-*" testIDs and are excluded from this count,
    // keeping the two counts in sync.
    const coveredLabels = VEH_FORM_COVERAGE_TABLE.filter(
      (r) => r.testID.startsWith("veh-label-"),
    ).length;

    expect(renderedLabels).toBe(coveredLabels);
  });
});
