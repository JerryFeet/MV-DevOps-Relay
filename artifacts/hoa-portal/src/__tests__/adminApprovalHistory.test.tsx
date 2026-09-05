import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useAuth: () => ({ isSignedIn: false, userId: null }),
  useClerk: () => ({}),
  useSession: () => ({ session: null }),
  ClerkProvider: ({ children }: any) => children,
  Show: ({ children }: any) => children,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/portal/admin", vi.fn()],
  useRoute: () => [false, {}],
  Link: ({ children }: any) => children,
}));

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  getAuthToken: vi.fn(),
  getApiBase: vi.fn(),
}));

const mockUseLanguage = vi.fn();

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => mockUseLanguage(),
  LanguageProvider: ({ children }: any) => children,
}));

const mockUseCurrentUser = vi.fn();

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

import AdminPage from "@/pages/portal/admin";

const ADMIN_USER = {
  id: 1,
  role: "admin",
  status: "active",
  firstName: "Test",
  lastName: "Admin",
  email: "admin@test.com",
  unitNumber: null,
  verificationStatus: "verified_owner",
};

const HISTORY_RECORD = {
  id: 501,
  approvalBases: JSON.stringify(["title_deed_reviewed", "other"]),
  approvalOtherText: "Board-approved exception for the recorded ownership evidence",
  requester: { firstName: "Alice", lastName: "Smith" },
  unit: { building: "A", unitNumber: "101" },
};

beforeEach(() => {
  mockUseLanguage.mockReturnValue({ lang: "en", setLang: vi.fn() });
  mockUseCurrentUser.mockReturnValue({ data: ADMIN_USER });
  mockUseQuery.mockImplementation((options: any) => {
    if (options?.queryKey?.[0] === "approvedVerificationHistory") {
      return { data: [HISTORY_RECORD], isLoading: false };
    }
    return { data: undefined, isLoading: false };
  });
});

describe("SG11 — populated approval history in the administrator interface", () => {
  it("renders the requester, unit, recorded bases, Other rationale, and approved status", () => {
    render(<AdminPage />);

    expect(screen.getByText("Approval history (1)")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("A101")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Recorded approval basis:")).toBeInTheDocument();
    expect(screen.getByText("Title deed reviewed, Other")).toBeInTheDocument();
    expect(screen.getByText("Other rationale:")).toBeInTheDocument();
    expect(screen.getByText(HISTORY_RECORD.approvalOtherText)).toBeInTheDocument();
  });
});