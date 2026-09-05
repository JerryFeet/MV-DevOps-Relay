import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { Link, useLocation } from "wouter";
import { ROLE_REDIRECT_FLAG } from "@/lib/auth-redirect";
import {
    Building2, FileText, Truck, Hammer, Users, Car, UserPlus, KeyRound,
  Megaphone, ShieldAlert, ArrowRight, Phone, ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { KeyContactsDrawer } from "@/components/KeyContactsDrawer";
import { displayUnitReference } from "@/lib/unitReference";

export default function Dashboard() {
  const { data: user } = useCurrentUser();
  const [, navigate] = useLocation();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const isRtl = lang === "ar";

  const [contactsOpen, setContactsOpen] = useState(false);

  const { data: announcementsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["announcements"],
    queryFn: () => apiRequest("/announcements"),
    enabled: !!user,
  });

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["settings"],
    queryFn: () => apiRequest("/settings"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    if (!sessionStorage.getItem(ROLE_REDIRECT_FLAG)) return;
    sessionStorage.removeItem(ROLE_REDIRECT_FLAG);
    if (user.role === "admin") {
      navigate("/portal/admin", { replace: true });
    } else if (user.role === "guard") {
      navigate("/portal/security-gate", { replace: true });
    }
  }, [user?.role]);

  // Hold rendering until role is known — prevents a flash of resident content for staff roles
  if (!user) return null;

  const staffRoleKey: Record<string, string> = {
    admin: "dash_role_admin",
    guard: "dash_role_guard",
  };
  const staffRole = staffRoleKey[user.role];
  if (staffRole) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            {T("dash_welcome")}{user.firstName ? `, ${user.firstName}` : ""}!
          </h1>
          <p className="mt-2 text-slate-600">{T(staffRole)}</p>
          <p className="mt-1 text-sm text-slate-500">{T("dash_staff_dashboard_note")}</p>
        </div>
        <KeyContactsCard
          isRtl={isRtl}
          label={T("kc_card_label")}
          onOpen={() => setContactsOpen(true)}
        />
        <KeyContactsDrawer
          open={contactsOpen}
          onOpenChange={setContactsOpen}
          securityPhone={settings?.security_phone}
          technicalMaintenancePhone={settings?.technical_maintenance_phone}
          technicalMaintenanceEmail={settings?.technical_maintenance_email}
          developerPhone={settings?.developer_phone}
          developerEmail={settings?.developer_email}
        />
      </div>
    );
  }

  const showUnverifiedBanner = user?.verificationStatus === "unverified";

  const announcements = announcementsResult?.data ?? [];

  const modules = [
    { href: "/portal/waha-pass",       label: T("nav_waha_pass"),       icon: KeyRound,    color: "bg-teal-100 text-teal-700" },
    { href: "/portal/announcements", label: T("nav_announcements"),  icon: Megaphone,  color: "bg-blue-100 text-blue-600" },
    { href: "/portal/facilities",    label: T("dash_book_facility"), icon: Building2,  color: "bg-green-100 text-green-600" },
    { href: "/portal/documents",     label: T("dash_documents"),     icon: FileText,   color: "bg-purple-100 text-purple-600" },
    { href: "/portal/residents",     label: T("dash_residents"),     icon: Users,      color: "bg-orange-100 text-orange-600" },
    { href: "/portal/guests",        label: T("dash_guests"),        icon: UserPlus,   color: "bg-pink-100 text-pink-600" },
    { href: "/portal/vehicles",      label: T("dash_vehicles"),      icon: Car,        color: "bg-slate-100 text-slate-600" },
    ...(user?.role === "owner" ? [
      { href: "/portal/move-forms",  label: T("dash_move"),          icon: Truck,      color: "bg-amber-100 text-amber-600" },
      { href: "/portal/permits",     label: T("dash_renovation"),    icon: Hammer,     color: "bg-red-100 text-red-600" },
    ] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {showUnverifiedBanner && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-4 items-start shadow-sm">
          <div className="shrink-0 mt-0.5">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm">
              {T("dash_unverified_banner_title")}
            </p>
            <p className="text-amber-800 text-sm mt-0.5 leading-relaxed">
              {T("dash_unverified_banner_body")}
            </p>
            <Link
              href="/portal/unit-verification"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {T("dash_unverified_banner_cta")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {T("dash_welcome")}{user?.firstName ? `, ${user.firstName}` : ""}!
        </h1>
        <p className="text-slate-500 mt-1">
          {`${T("dash_unit")} ${displayUnitReference(user?.unitNumber)} · `}
          <span>{
            user?.verificationStatus === "verified_owner" ? T("dash_role_owner") :
            user?.verificationStatus === "verified_tenant" ? T("dash_role_tenant") :
            user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Resident"
          }</span>
          {user?.status === "pending" && (
            <span className="ms-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {T("dash_pending")}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {modules.map(({ href, label, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3 hover:border-blue-300 hover:shadow-sm transition-all text-center"
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium text-slate-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* ── Key Contacts & Notices card ───────────────────────────────────── */}
      <KeyContactsCard
        isRtl={isRtl}
        label={T("kc_card_label")}
        onOpen={() => setContactsOpen(true)}
      />

      {/* ── Recent Announcements ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{T("dash_recent_announcements")}</h2>
        {!announcements || announcements.length === 0 ? (
          <div className="text-slate-500 text-sm">{T("dash_no_announcements")}</div>
        ) : (
          <div className="space-y-3">
            {announcements.slice(0, 4).map((a: any) => (
              <div key={a.id} className={`border rounded-lg p-4 ${a.isExpired ? "bg-slate-100 border-slate-200 opacity-60" : "bg-white border-slate-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {a.pinned && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {T("dash_pinned")}
                    </span>
                  )}
                  {a.isExpired && (
                    <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                      {lang === "ar" ? "منتهي الصلاحية" : "Expired"}
                    </span>
                  )}
                  <h3 className="font-medium text-slate-800 text-sm">
                    {lang === "ar" && a.titleAr ? a.titleAr : a.title}
                  </h3>
                </div>
                <p className="text-slate-500 text-sm line-clamp-2">
                  {lang === "ar" && a.bodyArabic ? a.bodyArabic : a.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Key Contacts drawer ───────────────────────────────────────────── */}
      <KeyContactsDrawer
        open={contactsOpen}
        onOpenChange={setContactsOpen}
        securityPhone={settings?.security_phone}
        technicalMaintenancePhone={settings?.technical_maintenance_phone}
        technicalMaintenanceEmail={settings?.technical_maintenance_email}
        developerPhone={settings?.developer_phone}
        developerEmail={settings?.developer_email}
      />
    </div>
  );
}

function KeyContactsCard({
  isRtl,
  label,
  onOpen,
}: {
  isRtl: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      dir={isRtl ? "rtl" : "ltr"}
      className="w-full mb-8 flex items-center gap-3 bg-[#0F4442] hover:bg-[#1c5250] active:bg-[#0a3230] text-white rounded-xl px-4 py-3.5 transition-colors shadow-sm"
      aria-label={label}
    >
      <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
        <Phone className="h-5 w-5 text-[#E27A2F]" />
      </div>
      <span className="flex-1 text-sm font-semibold text-white text-start">{label}</span>
      <ChevronRight
        className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isRtl ? "rotate-180" : ""}`}
      />
    </button>
  );
}
