/**
 * CommRow — optional-note behavior for Reject and Defer buttons.
 *
 * Rules under test:
 *   1. The standard bilingual reply is server-generated, so an administrator
 *      can Reject or Defer without entering a custom note.
 *   2. A custom note is still forwarded when supplied.
 *   3. Closed rows show the stored response instead of a stale editable field.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useAuth: () => ({ isSignedIn: false, userId: null }),
  useClerk: () => ({}),
  useSession: () => ({ session: null }),
  ClerkProvider: ({ children }: any) => children,
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
  Show: ({ children }: any) => children,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: undefined, isLoading: false }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: null }),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  getAuthToken: vi.fn(),
  getApiBase: vi.fn(() => ""),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ lang: "en", setLang: vi.fn() }),
  LanguageProvider: ({ children }: any) => children,
}));

// ─── Component under test ─────────────────────────────────────────────────────

import { CommRow } from "@/pages/portal/admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePendingComm(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "complaint",
    subject: "Test subject",
    body: "Test body",
    status: "pending",
    adminNote: "",
    senderEmail: "resident@example.com",
    senderFirstName: "Alice",
    senderLastName: "Smith",
    senderUnit: "101",
    senderBuilding: null,
    senderApartment: null,
    createdAt: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function renderCommRow(onUpdate: Mock, commOverrides: Record<string, unknown> = {}) {
  render(<CommRow c={makePendingComm(commOverrides)} onUpdate={onUpdate} />);
  // CommRow starts expanded when status === "pending", so buttons are visible immediately.
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CommRow — Reject uses an optional custom note", () => {
  let onUpdate: Mock;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it("Reject button is enabled when note is empty", () => {
    renderCommRow(onUpdate);
    const rejectBtn = screen.getByRole("button", { name: /reject/i });
    expect(rejectBtn).toBeEnabled();
    fireEvent.click(rejectBtn); fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onUpdate).toHaveBeenCalledWith(1, "rejected", "");
  });

  it("forwards a short optional note without imposing a hidden minimum", () => {
    renderCommRow(onUpdate);
    const textarea = screen.getByPlaceholderText(/note|response/i);
    fireEvent.change(textarea, { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: /reject/i })); fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onUpdate).toHaveBeenCalledWith(1, "rejected", "a");
  });
});

describe("CommRow — Defer uses an optional custom note", () => {
  let onUpdate: Mock;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it("Defer button is enabled when note is empty", () => {
    renderCommRow(onUpdate);
    const deferBtn = screen.getByRole("button", { name: /defer/i });
    expect(deferBtn).toBeEnabled();
    fireEvent.click(deferBtn); fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onUpdate).toHaveBeenCalledWith(1, "deferred_to_maintenance", "");
  });

  it("forwards a supplied custom note", () => {
    renderCommRow(onUpdate);
    const textarea = screen.getByPlaceholderText(/note|response/i);
    fireEvent.change(textarea, { target: { value: "Needs maintenance team" } });
    fireEvent.click(screen.getByRole("button", { name: /defer/i })); fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onUpdate).toHaveBeenCalledWith(1, "deferred_to_maintenance", "Needs maintenance team");
  });
});

describe("CommRow — Resolve button is never gated by note length", () => {
  let onUpdate: Mock;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it("Resolve button is enabled even when note is empty", () => {
    renderCommRow(onUpdate);
    const resolveBtn = screen.getByRole("button", { name: /resolve/i });
    expect(resolveBtn).toBeEnabled();
  });

  it("Resolve button is enabled when note has only 1 character", () => {
    renderCommRow(onUpdate);
    const textarea = screen.getByPlaceholderText(/note|response/i);
    fireEvent.change(textarea, { target: { value: "x" } });
    expect(screen.getByRole("button", { name: /resolve/i })).toBeEnabled();
  });

  it("clicking Resolve with an empty note still calls onUpdate", () => {
    renderCommRow(onUpdate);
    fireEvent.click(screen.getByRole("button", { name: /resolve/i })); fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][1]).toBe("resolved");
  });
});

describe("CommRow — action buttons absent after expanding a closed communication", () => {
  let onUpdate: Mock;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it.each(["resolved", "rejected", "deferred_to_maintenance"] as const)(
    "no action buttons rendered inside the expanded panel for status=%s",
    (status) => {
      renderCommRow(onUpdate, { status, adminNote: "Some prior note" });
      // Expand the row so the inner panel (where action buttons live) is visible.
      fireEvent.click(screen.getByRole("button"));
      // isClosed is true for these statuses, so action buttons must not mount at all.
      // We use accessible-name patterns that cannot match the expand-toggle button.
      expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^defer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^resolve$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^mark read$/i })).not.toBeInTheDocument();
    },
  );

  it("shows the stored standardized response in a closed row", () => {
    renderCommRow(onUpdate, {
      status: "rejected",
      adminNote: "Dear sender, thank you for contacting us.\n\nعزيزي المُرسِل، شكراً لتواصلك معنا.",
    });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/Dear sender, thank you for contacting us/)).toBeVisible();
    expect(screen.getByText(/عزيزي المُرسِل/)).toBeVisible();
    expect(screen.queryByPlaceholderText(/note|response/i)).not.toBeInTheDocument();
  });
});
