/**
 * Component-level tests: WahaStatusDisplay edge cases.
 *
 * WahaStatusDisplay (SecurityGate.tsx) renders the result card shown to a
 * gate guard after scanning a resident's Waha pass.  Three fields control
 * identity: holderName, unitNumber, and occupancyTrack.  These tests confirm
 * the component does not crash or display incorrect data when those fields are
 * null, and that a fully-populated result shows all expected values.
 *
 * Rules under test:
 *   1. holderName=null (runtime contract breach) → component renders without
 *      crashing; the name area is empty but no error is thrown.
 *   2. unitNumber=null → unit row is absent; card renders normally.
 *   3. occupancyTrack=null → occupancy row is absent; card renders normally.
 *   4. All fields populated (holderName, unitNumber, occupancyTrack) → each
 *      value is visible in the rendered output.
 *   5. valid=true → green approved label; valid=false → red status label.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mock useLanguage ─────────────────────────────────────────────────────────

const mockUseLanguage = vi.fn();

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => mockUseLanguage(),
  LanguageProvider: ({ children }: any) => children,
}));

// ─── Component under test ─────────────────────────────────────────────────────

import { WahaStatusDisplay } from "@/pages/portal/SecurityGate";

// ─── Fixture builder ──────────────────────────────────────────────────────────

type WahaResult = Parameters<typeof WahaStatusDisplay>[0]["result"];

function makeResult(overrides: Partial<WahaResult> = {}): WahaResult {
  return {
    valid: true,
    status: "ACTIVE",
    passNumber: "WP-2026-000042",
    credentialIndex: 1,
    holderName: "Fatima Al-Rashid",
    occupancyTrack: "owner",
    unitNumber: "B4",
    revocationReason: null,
    message: "Pass is valid.",
    ...overrides,
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseLanguage.mockReturnValue({ lang: "en", setLang: vi.fn() });
});
// ─── 1. holderName=null — must not crash ─────────────────────────────────────

describe("WahaStatusDisplay — holderName is null (runtime null)", () => {
  it("renders without throwing when holderName is null", () => {
    expect(() =>
      render(
        <WahaStatusDisplay
          result={makeResult({ holderName: null as unknown as string })}
        />,
      ),
    ).not.toThrow();
  });

  it("does not display a name value when holderName is null", () => {
    const { container } = render(
      <WahaStatusDisplay
        result={makeResult({ holderName: null as unknown as string })}
      />,
    );
    const nameParagraph = container.querySelector("p.font-bold.text-xl");
    expect(nameParagraph).toBeInTheDocument();
    expect(nameParagraph!.textContent).toBe("");
  });

  it("still shows the pass status label when holderName is null", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ holderName: null as unknown as string })}
      />,
    );
    expect(screen.getByText(/APPROVED — ENTRY PERMITTED/i)).toBeInTheDocument();
  });

  it("still shows the credential index row when holderName is null", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ holderName: null as unknown as string, credentialIndex: 3 })}
      />,
    );
    expect(screen.getByText(/Credential 3/)).toBeInTheDocument();
  });
});
// ─── 2. unitNumber=null — unit row must be absent ────────────────────────────

describe("WahaStatusDisplay — unitNumber is null", () => {
  it("renders without throwing when unitNumber is null", () => {
    expect(() =>
      render(<WahaStatusDisplay result={makeResult({ unitNumber: null })} />),
    ).not.toThrow();
  });

  it("does not render a unit row when unitNumber is null", () => {
    render(<WahaStatusDisplay result={makeResult({ unitNumber: null })} />);
    expect(screen.queryByText(/unit/i)).not.toBeInTheDocument();
  });

  it("still shows holderName when unitNumber is null", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ unitNumber: null, holderName: "Sara Al-Otaibi" })}
      />,
    );
    expect(screen.getByText("Sara Al-Otaibi")).toBeInTheDocument();
  });

  it("still shows the credential index when unitNumber is null", () => {
    render(
      <WahaStatusDisplay result={makeResult({ unitNumber: null, credentialIndex: 2 })} />,
    );
    expect(screen.getByText(/Credential 2/)).toBeInTheDocument();
  });
});

// ─── 3. occupancyTrack=null — occupancy row must be absent ───────────────────

describe("WahaStatusDisplay — occupancyTrack is null", () => {
  it("renders without throwing when occupancyTrack is null", () => {
    expect(() =>
      render(<WahaStatusDisplay result={makeResult({ occupancyTrack: null })} />),
    ).not.toThrow();
  });

  it("does not render an occupancy row when occupancyTrack is null", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: null })} />);
    expect(screen.queryByText(/owner|tenant|second owner/i)).not.toBeInTheDocument();
  });

  it("still shows holderName when occupancyTrack is null", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ occupancyTrack: null, holderName: "Khalid Mansour" })}
      />,
    );
    expect(screen.getByText("Khalid Mansour")).toBeInTheDocument();
  });
});

// ─── 4. All fields populated — positive control ───────────────────────────────

describe("WahaStatusDisplay — all fields populated (positive control)", () => {
  it("shows holderName prominently when all fields are set", () => {
    render(<WahaStatusDisplay result={makeResult()} />);
    expect(screen.getByText("Fatima Al-Rashid")).toBeInTheDocument();
  });

  it("shows unitNumber when all fields are set", () => {
    render(<WahaStatusDisplay result={makeResult()} />);
    expect(screen.getByText("B4")).toBeInTheDocument();
  });

  it("shows occupancy type label when occupancyTrack='owner'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "owner" })} />);
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows occupancy type label when occupancyTrack='tenant'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "tenant" })} />);
    expect(screen.getByText("Tenant")).toBeInTheDocument();
  });

  it("shows occupancy type label when occupancyTrack='second_owner'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "second_owner" })} />);
    expect(screen.getByText("Second Owner")).toBeInTheDocument();
  });

  it("shows the pass number when passNumber is set", () => {
    render(<WahaStatusDisplay result={makeResult()} />);
    expect(screen.getByText("WP-2026-000042")).toBeInTheDocument();
  });

  it("shows the credential index row", () => {
    render(<WahaStatusDisplay result={makeResult({ credentialIndex: 1 })} />);
    expect(screen.getByText("Credential 1")).toBeInTheDocument();
  });

});

// ─── 5. valid flag controls status label and colour class ────────────────────

describe("WahaStatusDisplay — valid flag controls approval vs rejection display", () => {
  it("shows 'APPROVED — ENTRY PERMITTED' when valid=true", () => {
    render(<WahaStatusDisplay result={makeResult({ valid: true })} />);
    expect(screen.getByText("APPROVED — ENTRY PERMITTED")).toBeInTheDocument();
  });

  it("does not show the approved label when valid=false", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ valid: false, status: "REVOKED" })}
      />,
    );
    expect(screen.queryByText("APPROVED — ENTRY PERMITTED")).not.toBeInTheDocument();
  });

  it("shows a humanised status derived from the status field when valid=false", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ valid: false, status: "PASS_REVOKED" })}
      />,
    );
    expect(screen.getByText("PASS REVOKED")).toBeInTheDocument();
  });

  it("shows the revocation reason when valid=false and revocationReason is set", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({
          valid: false,
          status: "REVOKED",
          revocationReason: "Lost credential reported",
        })}
      />,
    );
    expect(screen.getByText("Lost credential reported")).toBeInTheDocument();
  });

  it("does not show the revocation reason block when valid=true even if revocationReason is set", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ valid: true, revocationReason: "stale data" })}
      />,
    );
    expect(screen.queryByText("stale data")).not.toBeInTheDocument();
  });
});

// ─── 6. Arabic (lang=ar) rendering ───────────────────────────────────────────

describe("WahaStatusDisplay — Arabic occupancy labels (lang=ar)", () => {
  beforeEach(() => {
    mockUseLanguage.mockReturnValue({ lang: "ar", setLang: vi.fn() });
  });

  it("shows the Arabic label for occupancyTrack='owner'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "owner" })} />);
    expect(screen.getByText("مالك")).toBeInTheDocument();
  });

  it("shows the Arabic label for occupancyTrack='tenant'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "tenant" })} />);
    expect(screen.getByText("مستأجر")).toBeInTheDocument();
  });

  it("shows the Arabic label for occupancyTrack='second_owner'", () => {
    render(<WahaStatusDisplay result={makeResult({ occupancyTrack: "second_owner" })} />);
    expect(screen.getByText("مالك ثانٍ")).toBeInTheDocument();
  });
});

describe("WahaStatusDisplay — Arabic approval label (lang=ar)", () => {
  beforeEach(() => {
    mockUseLanguage.mockReturnValue({ lang: "ar", setLang: vi.fn() });
  });

  it("shows the Arabic approval string when valid=true", () => {
    render(<WahaStatusDisplay result={makeResult({ valid: true })} />);
    expect(screen.getByText("موافق — يُسمح بالدخول")).toBeInTheDocument();
  });

  it("does not show the Arabic approval string when valid=false", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ valid: false, status: "REVOKED" })}
      />,
    );
    expect(screen.queryByText("موافق — يُسمح بالدخول")).not.toBeInTheDocument();
  });

  it("shows the humanised status in the card when valid=false (lang=ar)", () => {
    render(
      <WahaStatusDisplay
        result={makeResult({ valid: false, status: "PASS_REVOKED" })}
      />,
    );
    expect(screen.getByText("PASS REVOKED")).toBeInTheDocument();
  });
});

 describe("WahaStatusDisplay — Arabic credential index format (lang=ar)", () => {
  beforeEach(() => {
    mockUseLanguage.mockReturnValue({ lang: "ar", setLang: vi.fn() });
  });

  it("shows the Arabic 'البطاقة N' format for credential index", () => {
    render(<WahaStatusDisplay result={makeResult({ credentialIndex: 2 })} />);
    expect(screen.getByText("البطاقة 2")).toBeInTheDocument();
  });

  it("shows the correct index number in Arabic format for credentialIndex=5", () => {
    render(<WahaStatusDisplay result={makeResult({ credentialIndex: 5 })} />);
    expect(screen.getByText("البطاقة 5")).toBeInTheDocument();
  });
});
