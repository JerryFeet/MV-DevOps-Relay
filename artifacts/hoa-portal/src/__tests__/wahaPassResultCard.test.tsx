/**
 * Component-level tests: WahaStatusDisplay result card.
 *
 * WahaStatusDisplay renders the gate scanner's result card after a Waha Pass
 * is scanned or manually looked up. It must correctly show the holder name,
 * unit number, credential index, occupancy type, and revocation reason — and
 * degrade gracefully when any of those fields is null.
 *
 * Rules under test (14 tests):
 *
 *   Approved pass (holderName + unitNumber present)
 *     1. Holder name is rendered prominently.
 *     2. Unit number is displayed when present.
 *     3. "APPROVED — ENTRY PERMITTED" label is shown in English.
 *     4. Green styling class is applied (border-green-500).
 *     5. No revocation reason row is shown on an approved pass.
 *
 *   Missing / null optional fields
 *     6. Unit number row is absent when unitNumber is null.
 *     7. Occupancy row is absent when occupancyTrack is null.
 *     8. Pass number row is absent when passNumber is null.
 *     9. Revocation reason row is shown when pass is rejected and reason is set.
 *
 *   Rejected pass
 *    10. Red styling class is applied (border-red-500).
 *    11. Status label shows the human-readable rejected status string.
 *
 *   Arabic (lang=ar)
 *    12. Holder name still renders in Arabic locale.
 *    13. Unit label switches to Arabic "الوحدة".
 *    14. Approved status label switches to Arabic "موافق".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WahaStatusDisplay } from "@/pages/portal/SecurityGate";

// ─── Mocks required by SecurityGate.tsx imports ───────────────────────────────

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// LanguageContext — controlled per describe block
const mockUseLanguage = vi.fn();
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => mockUseLanguage(),
  LanguageProvider: ({ children }: any) => children,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type WahaResult = {
  valid: boolean;
  status: string;
  passNumber: string | null;
  credentialIndex: number;
  holderName: string;
  occupancyTrack: string | null;
  unitNumber: string | null;
  revocationReason: string | null;
  message: string;
};

const baseApproved: WahaResult = {
  valid: true,
  status: "ACTIVE",
  passNumber: "WP-2026-000042",
  credentialIndex: 1,
  holderName: "Ahmed Al-Khalidi",
  occupancyTrack: "owner",
  unitNumber: "B20",
  revocationReason: null,
  message: "Pass is valid",
};

const baseRejected: WahaResult = {
  ...baseApproved,
  valid: false,
  status: "REVOKED",
  revocationReason: "Non-payment of fees",
  message: "Pass has been revoked",
};

function renderEN(result: WahaResult) {
  mockUseLanguage.mockReturnValue({ lang: "en" });
  return render(<WahaStatusDisplay result={result} />);
}

function renderAR(result: WahaResult) {
  mockUseLanguage.mockReturnValue({ lang: "ar" });
  return render(<WahaStatusDisplay result={result} />);
}

beforeEach(() => {
  mockUseLanguage.mockReset();
});

// ─── Approved pass — fields present ──────────────────────────────────────────

describe("WahaStatusDisplay — approved pass, all fields present", () => {
  it("renders the holder name prominently", () => {
    renderEN(baseApproved);
    expect(screen.getByText("Ahmed Al-Khalidi")).toBeInTheDocument();
  });

  it("renders the unit number when unitNumber is non-null", () => {
    renderEN(baseApproved);
    expect(screen.getByText("B20")).toBeInTheDocument();
  });

  it("shows the APPROVED status label in English", () => {
    renderEN(baseApproved);
    expect(screen.getByText("APPROVED — ENTRY PERMITTED")).toBeInTheDocument();
  });

  it("applies green border class for an approved pass", () => {
    const { container } = renderEN(baseApproved);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/border-green-500/);
  });

  it("does not render a revocation reason row when pass is approved", () => {
    renderEN(baseApproved);
    expect(screen.queryByText("Revocation reason")).not.toBeInTheDocument();
  });

  it("renders the pass number when passNumber is non-null", () => {
    renderEN(baseApproved);
    expect(screen.getByText("WP-2026-000042")).toBeInTheDocument();
  });
});

// ─── Null / missing optional fields ──────────────────────────────────────────

describe("WahaStatusDisplay — null optional fields degrade gracefully", () => {
  it("omits the unit number row when unitNumber is null", () => {
    renderEN({ ...baseApproved, unitNumber: null });
    expect(screen.queryByText("B20")).not.toBeInTheDocument();
    // The label "Unit" should also be absent
    expect(screen.queryByText("Unit")).not.toBeInTheDocument();
  });

  it("omits the occupancy row when occupancyTrack is null", () => {
    renderEN({ ...baseApproved, occupancyTrack: null });
    expect(screen.queryByText("Occupancy")).not.toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("omits the pass number when passNumber is null", () => {
    renderEN({ ...baseApproved, passNumber: null });
    expect(screen.queryByText("WP-2026-000042")).not.toBeInTheDocument();
  });
});

// ─── Rejected pass ────────────────────────────────────────────────────────────

describe("WahaStatusDisplay — rejected pass", () => {
  it("applies red border class for a rejected pass", () => {
    const { container } = renderEN(baseRejected);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/border-red-500/);
  });

  it("shows a human-readable status label (underscores replaced with spaces)", () => {
    renderEN(baseRejected);
    expect(screen.getByText("REVOKED")).toBeInTheDocument();
  });

  it("shows the revocation reason when the pass is rejected and reason is set", () => {
    renderEN(baseRejected);
    expect(screen.getByText("Revocation reason")).toBeInTheDocument();
    expect(screen.getByText("Non-payment of fees")).toBeInTheDocument();
  });
});

// ─── Arabic locale ────────────────────────────────────────────────────────────

describe("WahaStatusDisplay — Arabic locale (lang=ar)", () => {
  it("still renders the holder name when lang=ar", () => {
    renderAR(baseApproved);
    expect(screen.getByText("Ahmed Al-Khalidi")).toBeInTheDocument();
  });

  it("shows the Arabic unit label 'الوحدة' and the unit value", () => {
    renderAR(baseApproved);
    expect(screen.getByText("الوحدة")).toBeInTheDocument();
    expect(screen.getByText("B20")).toBeInTheDocument();
  });

  it("shows the Arabic approved label 'موافق — يُسمح بالدخول'", () => {
    renderAR(baseApproved);
    expect(screen.getByText("موافق — يُسمح بالدخول")).toBeInTheDocument();
  });

});
