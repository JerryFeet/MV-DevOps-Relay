import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatFullName } from "@workspace/db/name-utils";
import {
  Home, Megaphone, Building2,
  Hammer, BookOpen, Users, UserPlus, Car, LayoutDashboard, Shield, AlertCircle, MessageSquare, ShieldCheck, Menu, Globe, Bot, Wrench, Clock, CreditCard, KeyRound, Archive, ArrowLeftRight, ClipboardList, LifeBuoy, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { AiFloatingPanel } from "@/components/AiChat";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { getRoleIdleTimeoutMs, startGateIdleTimeout } from "@/lib/gateSession";

function SidebarContent({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const [location] = useLocation();
  const { data: appUser } = useCurrentUser();
  const { lang, setLang } = useLanguage();
  const { signOut, openUserProfile } = useClerk();
  const T = (key: string) => t(lang, key);

  const isVerified =
    appUser?.verificationStatus === "verified_owner" ||
    appUser?.verificationStatus === "verified_tenant";
  const isResidentRole = appUser?.role === "owner" || appUser?.role === "tenant";
  const needsVerification = Boolean(appUser && isResidentRole && !isVerified);
  const accountStatus = isResidentRole
    ? appUser?.verificationStatus
    : appUser?.role === "admin"
    ? T("sidebar_admin_account")
    : appUser?.role === "guard"
    ? T("sidebar_guard_account")
    : appUser?.role ?? "member";
  const isGuardRole = appUser?.role === "guard";
  // These endpoints are the same authoritative queues used by the decision
  // screens. Polling makes a decision submitted by another household member or
  // administrator visible without requiring the user to reload the portal.
  const hasVerifiedOwnerUnit =
    appUser?.role === "owner" &&
    appUser.verificationStatus === "verified_owner" &&
    Boolean(appUser.unitId);
  const { data: ownerTenantRequests = [] } = useQuery<any[]>({
    queryKey: ["tenantRequests"],
    queryFn: () => apiRequest("/unit-verify/pending-tenant-requests"),
    enabled: hasVerifiedOwnerUnit,
    refetchInterval: 30_000,
  });
  const { data: adminPendingItems } = useQuery<Record<string, any[]>>({
    queryKey: ["adminPendingItems"],
    queryFn: () => apiRequest("/admin/pending-items"),
    enabled: appUser?.role === "admin",
    refetchInterval: 30_000,
  });
  const adminActionCount = adminPendingItems
    ? Object.values(adminPendingItems).reduce((total, queue) => total + queue.length, 0)
    : 0;

  const navItems: { href: string; label: string; icon: React.ElementType; comingSoon?: boolean; actionCount?: number }[] = isGuardRole ? [
    { href: "/portal/security-gate", label: T("nav_security_gate"), icon: ShieldCheck },
  ] : [
    { href: "/portal",                    label: T("nav_dashboard"),         icon: Home },
    ...(isResidentRole ? [
      {
        href: "/portal/unit-verification",
        label: T("nav_unit_verification"),
        icon: Shield,
        actionCount: ownerTenantRequests.length,
      },
    ] : []),
    { href: "/portal/announcements",      label: T("nav_announcements"),     icon: Megaphone },
    { href: "/portal/facilities",         label: T("nav_facilities"),        icon: Building2 },
    { href: "/portal/permits",            label: T("nav_permits"),           icon: Hammer },
    { href: "/portal/documents",          label: T("nav_documents"),         icon: BookOpen },
    { href: "/portal/residents",          label: T("nav_residents"),         icon: Users },
    { href: "/portal/guests",             label: T("nav_guests"),            icon: UserPlus },
    { href: "/portal/vehicles",           label: T("nav_vehicles"),          icon: Car },
    ...(appUser?.role !== "tenant" ? [
      { href: "/portal/communications", label: T("nav_communications"), icon: MessageSquare },
    ] : []),
    ...(isResidentRole ? [
      { href: "/portal/portal-help", label: T("nav_portal_help"), icon: LifeBuoy },
    ] : []),
    { href: "/portal/payments",           label: T("nav_payment_history"),   icon: CreditCard },
    ...((isVerified || appUser?.role === "admin") ? [
      { href: "/portal/waha-pass", label: T("nav_waha_pass"), icon: KeyRound },
    ] : []),
    ...(appUser?.verificationStatus === "verified_owner" ? [
      { href: "/portal/change-of-ownership", label: T("nav_change_of_ownership"), icon: ArrowLeftRight },
    ] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-[#0F4442] text-white">
      <div className="p-5 border-b border-[#1a5a57] shrink-0">
        <h1 className="text-base font-bold text-white leading-tight">MADAIN Village</h1>
        <p className="text-xs text-slate-400 mt-0.5">{T("sidebar_portal")}</p>
        {appUser?.unitNumber && (
          <p className="text-xs text-slate-300 mt-1 font-medium">
            {T("sidebar_unit")} {displayUnitReference(appUser.unitNumber)}
          </p>
        )}
        {needsVerification && (
          <div className="mt-2 flex items-center gap-1.5 bg-amber-900/40 border border-amber-700/50 rounded-md px-2 py-1.5">
            <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-300">{T("sidebar_verify_unit")}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, comingSoon, actionCount = 0 }) => {
          const isActive =
            location === href || (href !== "/portal" && location.startsWith(href));
          const isVerifPage = href === "/portal/unit-verification";
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-[#E27A2F] text-white"
                  : isVerifPage && needsVerification
                  ? "text-amber-300 hover:bg-[#1c5250] hover:text-amber-200"
                  : "text-slate-300 hover:bg-[#1c5250] hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn("flex-1", collapsed && "sr-only")}>{label}</span>
              {actionCount > 0 && (
                <span
                  className="min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-bold text-[#0F4442]"
                  aria-label={T("nav_actions_need_decision").replace("{count}", String(actionCount))}
                  title={T("nav_actions_need_decision").replace("{count}", String(actionCount))}
                  data-testid={`nav-action-count-${href.split("/").pop()}`}
                >
                  {actionCount}
                </span>
              )}
              {isVerifPage && needsVerification && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
              {comingSoon && !isVerifPage && (
                <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                  <Clock className="h-2 w-2" />
                  {T("svc_coming_soon")}
                </span>
              )}
            </Link>
          );
        })}

        {appUser?.role === "admin" && (
          <div className="mt-3 border-t border-[#1a5a57] pt-3 space-y-0.5">
            <>
                <Link
                  href="/portal/admin"
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    collapsed && "justify-center px-2",
                    location === "/portal/admin"
                      ? "bg-[#E27A2F] text-white"
                      : "text-amber-300 hover:bg-[#1c5250] hover:text-amber-200"
                  )}
                >
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  <span className={cn("flex-1", collapsed && "sr-only")}>{T("nav_admin")}</span>
                  {adminActionCount > 0 && (
                    <span
                      className="min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-bold text-[#0F4442]"
                      aria-label={T("nav_pending_admin_items").replace("{count}", String(adminActionCount))}
                      title={T("nav_pending_admin_items").replace("{count}", String(adminActionCount))}
                      data-testid="nav-action-count-admin"
                    >
                      {adminActionCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/portal/admin/historical-records"
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    collapsed && "justify-center px-2",
                    location === "/portal/admin/historical-records"
                      ? "bg-[#E27A2F] text-white"
                      : "text-amber-300 hover:bg-[#1c5250] hover:text-amber-200"
                  )}
                >
                  <Archive className="h-4 w-4 shrink-0" />
                  <span className={collapsed ? "sr-only" : undefined}>{T("nav_historical_records")}</span>
                </Link>
                <Link
                  href="/portal/unit-registry"
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    collapsed && "justify-center px-2",
                    location === "/portal/unit-registry"
                      ? "bg-[#E27A2F] text-white"
                      : "text-amber-300 hover:bg-[#1c5250] hover:text-amber-200"
                  )}
                >
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  <span className={collapsed ? "sr-only" : undefined}>{T("nav_unit_registry")}</span>
                </Link>
            </>
          </div>
        )}
      </nav>

      {/* Language toggle */}
      <div className="px-4 pt-2 pb-1 border-t border-[#1a5a57] shrink-0">
        <button
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-[#1c5250] hover:text-white transition-colors"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span>{lang === "en" ? "عربي — Arabic" : "English — EN"}</span>
        </button>
      </div>

      <div className="px-4 pt-3 pb-4 border-t border-[#1a5a57] shrink-0 space-y-2">
        {/* User identity */}
        <div className="px-1 mb-1">
          <p className="text-sm text-white truncate font-medium">
            {formatFullName(appUser?.firstName, appUser?.middleName, appUser?.lastName) || appUser?.email || "Resident"}
          </p>
          <p className="text-xs text-slate-400 capitalize">
            {accountStatus}
          </p>
        </div>
        {/* Manage account — full-width button, safe on mobile */}
        <button
          onClick={() => { onNavigate?.(); openUserProfile(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-slate-300 hover:bg-[#1c5250] hover:text-white transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <span>{lang === "ar" ? "إدارة الحساب" : "Manage account"}</span>
        </button>
        {/* Sign out — full-width button, safe on mobile */}
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>{lang === "ar" ? "تسجيل الخروج" : "Sign out"}</span>
        </button>
      </div>
    </div>
  );
}

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const isRtl = lang === "ar";
  const { data: appUser, isSuspended, needsProfileName, refetch: refetchUser } = useCurrentUser();
  const { signOut } = useClerk();
  const [nameForm, setNameForm] = useState({ firstName: "", middleName: "", lastName: "" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Guards use shared, unattended gatehouse devices, so their timeout stays
  // short. Admin approval work receives a longer inactivity window.
  useEffect(() => {
    const timeoutMs = getRoleIdleTimeoutMs(appUser?.role);
    if (!timeoutMs) return;
    return startGateIdleTimeout(() => signOut({ redirectUrl: "/" }), timeoutMs);
  }, [appUser?.role, signOut]);

  useEffect(() => {
    if (!appUser) return;
    setNameForm({
      firstName: appUser.firstName ?? "",
      middleName: appUser.middleName ?? "",
      lastName: appUser.lastName ?? "",
    });
  }, [appUser?.id, appUser?.firstName, appUser?.middleName, appUser?.lastName]);

  async function saveProfileName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setSavingName(true);
    try {
      await apiRequest("/users/me/name", {
        method: "PATCH",
        body: JSON.stringify(nameForm),
      });
      await refetchUser();
    } catch (error) {
      setNameError(error instanceof Error ? error.message : T("profile_name_error"));
    } finally {
      setSavingName(false);
    }
  }

  // ── Suspended account screen ─────────────────────────────────────────────
  if (isSuspended) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-[#0F4442]">MADAIN Village</h1>
          <p className="text-xs text-slate-400 mt-0.5">{T("sidebar_portal")}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-2xl shadow-sm p-8 max-w-sm w-full">
          <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">{T("suspended_title")}</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">{T("suspended_body")}</p>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="w-full py-2.5 px-4 rounded-lg bg-[#0F4442] text-white text-sm font-medium hover:bg-[#1c5250] transition-colors"
          >
            {T("suspended_sign_out")}
          </button>
        </div>
      </div>
    );
  }

  if (needsProfileName) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center px-4">
        <form
          onSubmit={saveProfileName}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <p className="text-xs font-semibold tracking-wide text-[#E27A2F] uppercase">{T("sidebar_portal")}</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">{T("profile_name_title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{T("profile_name_body")}</p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              {T("profile_first_name")}
              <input
                value={nameForm.firstName}
                onChange={(event) => setNameForm((current) => ({ ...current, firstName: event.target.value }))}
                autoComplete="given-name"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#0F4442] focus:ring-2 focus:ring-[#0F4442]/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              {T("profile_middle_name")}
              <input
                value={nameForm.middleName}
                onChange={(event) => setNameForm((current) => ({ ...current, middleName: event.target.value }))}
                autoComplete="additional-name"
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#0F4442] focus:ring-2 focus:ring-[#0F4442]/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              {T("profile_last_name")}
              <input
                value={nameForm.lastName}
                onChange={(event) => setNameForm((current) => ({ ...current, lastName: event.target.value }))}
                autoComplete="family-name"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-[#0F4442] focus:ring-2 focus:ring-[#0F4442]/15"
              />
            </label>
          </div>
          {nameError && <p className="mt-3 text-sm text-red-600" role="alert">{nameError}</p>}
          <button
            type="submit"
            disabled={savingName}
            className="mt-6 w-full rounded-lg bg-[#0F4442] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1c5250] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingName ? T("profile_name_saving") : T("profile_name_save")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#faf7f2]">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className={cn("relative hidden shrink-0 flex-col transition-[width] duration-200 md:flex", sidebarCollapsed ? "w-20" : "w-64")}>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
          className="absolute -right-3 top-5 z-10 rounded-full border border-slate-200 bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50"
          aria-label={sidebarCollapsed ? T("nav_expand") : T("nav_collapse")}
          title={sidebarCollapsed ? T("nav_expand") : T("nav_collapse")}
          data-testid="button-toggle-desktop-navigation"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar — only visible on mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F4442] shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="p-1.5 rounded-md hover:bg-[#1c5250] transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5 text-white" />
              </button>
            </SheetTrigger>
            <SheetContent side={isRtl ? "right" : "left"} className="p-0 w-72 border-0 bg-[#0F4442]">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">MADAIN Village</p>
            <p className="text-xs text-slate-400">{T("sidebar_portal")}</p>
          </div>
        </header>

        {/* Page content — reduced padding on mobile */}
        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>

      {/* Floating AI chat button */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className={`fixed bottom-5 z-40 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          chatOpen ? "bg-[#E27A2F] hover:bg-[#c96a22]" : "bg-[#0F4442] hover:bg-[#1c5250]"
        } ${isRtl ? "left-5" : "right-5"}`}
        aria-label={T("nav_ai")}
        title={T("nav_ai")}
      >
        <Bot className="h-5 w-5 text-white" />
      </button>

      {chatOpen && <AiFloatingPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}
