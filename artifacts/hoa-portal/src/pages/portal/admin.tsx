import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, getAuthToken, getApiBase } from "@/lib/api";
import { useEffect, useState } from "react";
import { useLanguage, type Lang } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { PaginationBar } from "@/components/PaginationBar";
import {
  Users, Building2, Truck, Hammer, UserPlus, Car, BarChart3,
  Shield, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2, Upload,
  MessageSquare, Settings, Mail, AlertCircle, Lightbulb, Clock, Bot, FileText,
  KeyRound, Search, Send, ArrowLeftRight, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WahaCredBadge, WahaCredActionCell } from "@/components/WahaCredBadge";
import { PhoneInput } from "@/components/PhoneInput";
import { TenancyReleaseAdminPanel } from "@/components/TenancyReleaseAdminPanel";
import { SELECTABLE_UNIT_REFERENCES } from "@workspace/unit-reference";
import {
  attentionUrgency,
  formatWaitingAge,
  normalizeAttentionThresholds,
  sortAttentionQueues,
} from "@/lib/adminDashboard";
import { useListExtraResidentRequests, useDecideExtraResidentRequest, getListExtraResidentRequestsQueryKey } from "@workspace/api-client-react";

type VerificationItem = {
  id: number; type: string; status: string; nationalId: string | null; ejarReference: string | null;
  documentNote: string | null; createdAt: string; expiresAt: string | null;
  titleDeedKey: string | null; titleDeedNumber?: string | null; ownerNationalId: string | null; parkingLots: string | null;
  approvalBases: string | null; approvalOtherText: string | null;
  firstName: string | null; lastName: string | null; mobile: string | null;
  requester: { id: number; firstName: string | null; lastName: string | null; email: string; unitNumber: string | null } | null;
  unit: { id: number; building: string; unitNumber: string } | null;
};

type Vehicle = {
  id: number; make: string; model: string; year: number | null; color: string | null;
  plateNumber: string; isAdditional: boolean; status: string; createdAt: string;
  userId: number; registrationDocKey?: string | null;
  resident?: { fullName: string; nationalId: string | null };
};

type AdminSummary = {
  unitsRegistered: number;
  verifiedOwners: number;
  activeTenancies: number;
  residentsWithPortalAccess: number;
  tenanciesExpiringNext30Days: number;
  wahaPassesIssued: number;
  bookingsThisMonth: number;
  portalHelpTicketsThisMonth: number;
  attentionThresholdDays: number;
  overdueThresholdDays: number;
  smtpStatus: "configured" | "unconfigured" | "credential_unreadable" | "configuration_error";
  retryingEmailNotifications: number;
  failedEmailNotifications: number;
  oldestEmailFailureAt: string | null;
};

type NotificationFailureSummary = {
  retryingEmailNotifications: number;
  failedEmailNotifications: number;
  oldestEmailFailureAt: string | null;
};


function formatCanonicalUnit(unitDisplay?: string | null): string {
  return unitDisplay ? unitDisplay.replace(/\s+/g, "") : "—";
}

type AttentionQueueKey =
  | "ownerVerifications"
  | "permits"
  | "wahaApplications"
  | "wahaReplacementRequests"
  | "ownershipChanges"
  | "tenancyReleaseCases"
  | "communications"
  | "portalHelp"
  | "extraResidentRequests"
  | "emailNotifications";

// E5: controlled rejection reasons (must match API + schema)
const VEHICLE_REJECTION_REASONS = [
  "registration_name_mismatch",
  "parking_lot_entitlement_exceeded",
] as const;
type VehicleRejectionReason = (typeof VEHICLE_REJECTION_REASONS)[number];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  description,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<any>;
  color: string;
  description?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-3", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value ?? "—"}</p>
      <p className="text-slate-500 text-xs mt-1" title={description}>{label}</p>
      {description && <p className="mt-1 text-[10px] leading-snug text-slate-400">{description}</p>}
    </div>
  );
}

function Section({
  id,
  title,
  children,
  defaultOpen = true,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors" onClick={() => setOpen(o => !o)}>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-100">{children}</div>}
    </section>
  );
}

export default function AdminPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Queries ──
  const { data: summary } = useQuery<AdminSummary>({
    queryKey: ["adminSummary"],
    queryFn: () => apiRequest("/admin/summary"),
    enabled: user?.role === "admin",
  });
  const { data: pendingItems } = useQuery<Record<string, any[]>>({
    queryKey: ["adminPendingItems"],
    queryFn: () => apiRequest("/admin/pending-items"),
    enabled: user?.role === "admin",
  });

  // ── User management state ──
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");          // debounced
  const [userStatusFilter, setUserStatusFilter] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [pendingSuspend, setPendingSuspend] = useState<{ id: number; name: string } | null>(null);
  const [notificationDetailUser, setNotificationDetailUser] = useState<{ id: number; name: string; email: string } | null>(null);

  // E5: vehicle rejection dialog state
  const [rejectVehicleDialog, setRejectVehicleDialog] = useState<{ id: number; plateNumber: string } | null>(null);
  const [rejectVehicleReason, setRejectVehicleReason] = useState<VehicleRejectionReason | "">("");
  const [rejectVehicleNote, setRejectVehicleNote] = useState("");

  const [extraResDialog, setExtraResDialog] = useState<{ id: number; action: "approved" | "refused"; proposedName: string } | null>(null);
  const [extraResReason, setExtraResReason] = useState("");

  // Debounce search input by 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setUserSearch(userSearchInput);
      setUserPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchInput]);

  // Paginated + filtered user list for the User Management section
  const { data: usersData } = useQuery<{ data: any[]; total: number; page: number; limit: number }>({
    queryKey: ["users", userSearch, userStatusFilter, userPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(userPage), limit: "50" });
      if (userSearch) params.set("search", userSearch);
      if (userStatusFilter) params.set("status", userStatusFilter);
      return apiRequest(`/users?${params.toString()}`);
    },
    enabled: user?.role === "admin",
  });
  const { data: notificationFailureSummary, isLoading: isNotificationFailureSummaryLoading } = useQuery<NotificationFailureSummary>({
    queryKey: ["notificationFailureSummary", notificationDetailUser?.id],
    queryFn: async () => {
      const userDetail = await apiRequest(`/users/${notificationDetailUser!.id}`);
      const summary = userDetail.notificationFailureSummary;
      return {
        retryingEmailNotifications: summary?.retryingCount ?? 0,
        failedEmailNotifications: summary?.failedCount ?? 0,
        oldestEmailFailureAt: summary?.oldestFailure ?? null,
      };
    },
    enabled: user?.role === "admin" && !!notificationDetailUser,
  });

  // Full (unfiltered) user list consumed by WahaPassSection for actor name lookup.
  // Uses ?all=true which bypasses pagination and returns every user as a flat array,
  // so communities with >200 users still get complete actor-name resolution.
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["allUsers"],
    queryFn: () => apiRequest("/users?all=true"),
    enabled: user?.role === "admin",
  });

  const { data: verifications } = useQuery<VerificationItem[]>({
    queryKey: ["pendingVerifications"],
    queryFn: () => apiRequest("/unit-verify/pending"),
    enabled: user?.role === "admin",
  });

  const { data: permitsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["permits"],
    queryFn: () => apiRequest("/permits?limit=200"),
    enabled: user?.role === "admin",
  });
  const permits = permitsResult?.data ?? [];

  const { data: moveFormsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["moveForms"],
    queryFn: () => apiRequest("/move-forms?limit=200"),
    enabled: user?.role === "admin",
  });
  const moveForms = moveFormsResult?.data ?? [];

  const { data: guestsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["guests"],
    queryFn: () => apiRequest("/guests?limit=200"),
    enabled: user?.role === "admin",
  });
  const guests = guestsResult?.data ?? [];

  const { data: vehiclesResult } = useQuery<{ data: Vehicle[]; total: number }>({
    queryKey: ["vehicles"],
    queryFn: () => apiRequest("/vehicles?limit=200"),
    enabled: user?.role === "admin",
  });
  const vehicles = vehiclesResult?.data ?? [];

  const { data: communicationsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["communications"],
    queryFn: () => apiRequest("/communications?limit=200"),
    enabled: user?.role === "admin",
  });
  const communications = communicationsResult?.data ?? [];
  const { data: portalHelpTickets = [] } = useQuery<any[]>({
    queryKey: ["adminPortalHelpTickets"],
    queryFn: () => apiRequest("/admin/portal-help"),
    enabled: user?.role === "admin",
    refetchInterval: 30_000,
  });

  const { data: hoaSettings } = useQuery<Record<string, string>>({
    queryKey: ["hoaSettings"],
    queryFn: () => apiRequest("/settings"),
    enabled: user?.role === "admin",
  });

  const { data: kbDocs = [], refetch: refetchKb } = useQuery<any[]>({
    queryKey: ["aiKnowledge"],
    queryFn: () => apiRequest("/ai/knowledge"),
    enabled: user?.role === "admin",
  });

  const { data: aiStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["aiStatus"],
    queryFn: () => apiRequest("/ai/status"),
    enabled: user?.role === "admin",
  });

  const { data: wahaPassAppsResult } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["wahaPassAdmin"],
    queryFn: () => apiRequest("/waha-pass/admin?limit=200"),
    enabled: user?.role === "admin",
  });
  const wahaPassApps = wahaPassAppsResult?.data ?? [];

  const { data: ownershipChanges = [] } = useQuery<any[]>({
    queryKey: ["ownershipChanges"],
    queryFn: () => apiRequest("/ownership-changes"),
    enabled: user?.role === "admin",
  });

  const { data: extraResidentRequests = [] } = useListExtraResidentRequests({
    query: { enabled: user?.role === "admin", queryKey: getListExtraResidentRequestsQueryKey() }
  });

  const { data: approvedVerificationHistory = [] } = useQuery<VerificationItem[]>({
    queryKey: ["approvedVerificationHistory"],
    queryFn: () => apiRequest("/unit-verify/history"),
    enabled: user?.role === "admin",
  });

  // ── Mutations ──
  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast({ title: t(lang, "adm_user_updated") }); },
  });

  const updateMoveFormMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/move-forms/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["moveForms"] }); qc.invalidateQueries({ queryKey: ["adminSummary"] }); },
    onError: (e: any) => toast({ title: t(lang, "adm_cannot_update_move_form"), description: e.message, variant: "destructive" }),
  });

  const updatePermitMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/permits/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits"] }); qc.invalidateQueries({ queryKey: ["adminSummary"] }); toast({ title: t(lang, "adm_permit_updated") }); },
  });

  const updateGuestMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/guests/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["guests"] }); qc.invalidateQueries({ queryKey: ["adminSummary"] }); },
  });

  const approveVerificationMutation = useMutation({
    mutationFn: ({ id, note, approvalBases, otherText }: {
      id: number; note?: string; approvalBases: string[]; otherText?: string;
    }) =>
      apiRequest(`/unit-verify/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ note, approvalBases, otherText }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pendingVerifications"] }); qc.invalidateQueries({ queryKey: ["users"] }); toast({ title: t(lang, "adm_verification_approved") }); },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  const rejectVerificationMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiRequest(`/unit-verify/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pendingVerifications"] }); qc.invalidateQueries({ queryKey: ["users"] }); toast({ title: t(lang, "adm_verification_rejected") }); },
  });

  const approveVehicleMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiRequest(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify({ status: "active", approvalNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); toast({ title: t(lang, "adm_vehicle_approved") }); },
  });

  // E5: reject vehicle with a controlled reason
  const rejectVehicleMutation = useMutation({
    mutationFn: ({ id, rejectionReason, approvalNote }: { id: number; rejectionReason: string; approvalNote?: string }) =>
      apiRequest(`/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "inactive", rejectionReason, ...(approvalNote ? { approvalNote } : {}) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast({ title: t(lang, "adm_vehicle_rejected") });
      setRejectVehicleDialog(null);
      setRejectVehicleReason("");
      setRejectVehicleNote("");
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  async function openVehicleRegistrationDocument(vehicleId: number) {
    try {
      const { downloadUrl } = await apiRequest(`/vehicles/${vehicleId}/registration-doc-url`);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast({ title: t(lang, "common_error"), description: error.message, variant: "destructive" });
    }
  }

  const updateCommMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/communications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["communications"] }); toast({ title: t(lang, "adm_comm_updated") }); },
  });
  const replyPortalHelpMutation = useMutation({
    mutationFn: ({ id, kind, reply }: { id: number; kind: "reply" | "redirect"; reply?: string }) =>
      apiRequest(`/admin/portal-help/${id}/reply`, { method: "POST", body: JSON.stringify({ kind, reply }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminPortalHelpTickets"] }); qc.invalidateQueries({ queryKey: ["adminPendingItems"] }); },
  });
  const closePortalHelpMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/admin/portal-help/${id}/close`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminPortalHelpTickets"] }); qc.invalidateQueries({ queryKey: ["adminPendingItems"] }); },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => apiRequest("/settings", { method: "PUT", body: JSON.stringify(updates) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hoaSettings"] }); toast({ title: t(lang, "adm_settings_saved") }); },
    onError: () => toast({ title: t(lang, "adm_save_failed"), variant: "destructive" }),
  });


  // ── KB state ──
  const [kbUploading, setKbUploading] = useState(false);
  const [kbAudience, setKbAudience] = useState<"all_portal_users" | "verified_owners_admin">("all_portal_users");

  const deleteKbMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/ai/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetchKb(); toast({ title: t(lang, "adm_doc_deleted") }); },
    onError: (e: any) => toast({ title: t(lang, "adm_delete_failed"), description: e.message, variant: "destructive" }),
  });

  async function handleKbUpload(file: File) {
    setKbUploading(true);
    try {
      const base = getApiBase();
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("audience", kbAudience);
      const res = await fetch(`${base}/api/ai/knowledge`, {
        method: "POST",
        credentials: "include",
        headers,
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      await refetchKb();
      toast({ title: t(lang, "adm_doc_uploaded") });
    } catch (e: any) {
      toast({ title: t(lang, "adm_upload_failed"), description: e.message, variant: "destructive" });
    } finally {
      setKbUploading(false);
    }
  }

  // ── Permit status filter state ──
  const [permitStatusFilter, setPermitStatusFilter] = useState("all");

  const approveWahaMutation = useMutation({
    mutationFn: ({ id, reviewNote }: { id: number; reviewNote?: string }) =>
      apiRequest(`/waha-pass/${id}/approve`, { method: "POST", body: JSON.stringify({ reviewNote }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wahaPassAdmin"] });
      toast({ title: t(lang, "waha_app_approved_toast") });
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  const rejectWahaMutation = useMutation({
    mutationFn: ({ id, reviewNote }: { id: number; reviewNote: string }) =>
      apiRequest(`/waha-pass/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wahaPassAdmin"] });
      toast({ title: t(lang, "waha_app_rejected_toast") });
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  const revokeWahaMutation = useMutation({
    mutationFn: ({ id, credentialId, reason }: { id: number; credentialId: number; reason: string }) =>
      apiRequest(`/waha-pass/${id}/revoke`, { method: "POST", body: JSON.stringify({ credentialId, reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wahaPassAdmin"] });
      toast({ title: t(lang, "waha_cred_revoked_toast") });
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  const decideExtraResidentMutation = useDecideExtraResidentRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListExtraResidentRequestsQueryKey() });
        qc.invalidateQueries({ queryKey: ["adminPendingItems"] });
        qc.invalidateQueries({ queryKey: ["adminSummary"] });
        qc.invalidateQueries({ queryKey: ["residents"] });
        qc.invalidateQueries({ queryKey: ["users"] });
        toast({ title: t(lang, "adm_extra_res_decided") || "Extra resident request updated" });
      },
      onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
    }
  });

  const reviewOwnershipChangeMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: "approved" | "rejected"; note?: string }) =>
      apiRequest(`/ownership-changes/${id}/review`, { method: "PATCH", body: JSON.stringify({ action, note }) }),
    onSuccess: (_data: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ["ownershipChanges"] });
      toast({ title: t(lang, vars.action === "approved" ? "adm_coo_approved_toast" : "adm_coo_rejected_toast") });
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });
  const reviewReplacementMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approved" | "rejected" }) =>
      apiRequest(`/waha-pass/replacements/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminPendingItems"] });
      toast({ title: lang === "ar" ? "تم تحديث طلب البديل" : "Replacement request updated" });
    },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  if (user && user.role !== "admin" && user.role !== "supervisor") return null;

  const pendingPermits = permits?.filter(p => p.status === "submitted" || p.status === "under_review") ?? [];
  const pendingVehicles = vehicles?.filter(v => v.status === "pending_approval" && v.isAdditional) ?? [];

  const pendingWahaApps = wahaPassApps.filter(a => a.status === "pending_review");

  const attentionThresholds = normalizeAttentionThresholds(
    summary?.attentionThresholdDays,
    summary?.overdueThresholdDays,
  );
  const attentionQueueDefinitions: Array<{
    key: AttentionQueueKey;
    label: string;
    href: string;
    dateField: "createdAt" | "releaseRequestedAt";
  }> = [
    { key: "ownerVerifications", label: t(lang, "adm_attention_owner_verifications"), href: "#admin-unit-verifications", dateField: "createdAt" },
    { key: "permits", label: t(lang, "adm_attention_permits"), href: "#admin-permits", dateField: "createdAt" },
    { key: "wahaApplications", label: t(lang, "adm_attention_waha_applications"), href: "#admin-waha-passes", dateField: "createdAt" },
    { key: "wahaReplacementRequests", label: t(lang, "adm_attention_waha_replacements"), href: "#admin-waha-replacements", dateField: "createdAt" },
    { key: "ownershipChanges", label: t(lang, "adm_attention_ownership_changes"), href: "#admin-ownership-changes", dateField: "createdAt" },
    { key: "tenancyReleaseCases", label: t(lang, "adm_attention_tenancy_releases"), href: "#admin-tenancy-releases", dateField: "releaseRequestedAt" },
    { key: "communications", label: t(lang, "adm_attention_communications"), href: "#admin-communications", dateField: "createdAt" },
    { key: "portalHelp", label: t(lang, "adm_attention_portal_help"), href: "/portal/admin/portal-help", dateField: "createdAt" },
  ];
  const retryingEmailNotifications = Number(summary?.retryingEmailNotifications) || 0;
  const failedEmailNotifications = Number(summary?.failedEmailNotifications) || 0;
  const emailNotificationCount = retryingEmailNotifications + failedEmailNotifications;

  const pendingExtraResidentRequests = extraResidentRequests.filter(r => r.status === "pending");
  const extraResidentRequestsOldestAt = pendingExtraResidentRequests
    .map(item => item.submittedAt)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(new Date(value).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null;

  const attentionQueues = sortAttentionQueues([
    ...attentionQueueDefinitions.map((definition, originalIndex) => {
    const items = pendingItems?.[definition.key] ?? [];
    const oldestAt = items
      .map((item) => item?.[definition.dateField])
      .filter((value): value is string => typeof value === "string" && Number.isFinite(new Date(value).getTime()))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null;

    return {
      ...definition,
      count: items.length,
      oldestAt,
      originalIndex,
    };
    }),
    {
      key: "extraResidentRequests",
      label: t(lang, "adm_attention_extra_residents") || "Extra Resident Requests",
      href: "#admin-extra-residents",
      count: pendingExtraResidentRequests.length,
      oldestAt: extraResidentRequestsOldestAt,
      originalIndex: attentionQueueDefinitions.length,
    },
    {
      key: "emailNotifications",
      label: t(lang, "adm_attention_email_delivery"),
      href: "#admin-settings",
      count: emailNotificationCount,
      oldestAt: summary?.oldestEmailFailureAt ?? null,
      originalIndex: attentionQueueDefinitions.length + 1,
      retrying: retryingEmailNotifications,
      failed: failedEmailNotifications,
    },
  ]);
  const totalAttentionItems = pendingItems && summary
    ? attentionQueues.reduce((total, queue) => total + queue.count, 0)
    : undefined;
  const oldestAttentionAt = attentionQueues.find((queue) => queue.count > 0)?.oldestAt ?? null;
  const attentionSummary = totalAttentionItems === undefined
    ? t(lang, "adm_attention_loading")
    : totalAttentionItems === 0
      ? t(lang, "adm_attention_none")
      : t(lang, "adm_attention_summary")
        .replace("{count}", String(totalAttentionItems))
        .replace("{age}", oldestAttentionAt ? formatWaitingAge(oldestAttentionAt, lang) : t(lang, "adm_attention_age_unknown"));
  const overallAttentionUrgency = attentionUrgency(oldestAttentionAt, attentionThresholds);

  const statCards = [
    { label: t(lang, "adm_units_registered"), value: summary?.unitsRegistered, icon: Building2, color: "text-blue-600 bg-blue-100" },
    { label: t(lang, "adm_verified_owners"), value: summary?.verifiedOwners, icon: Shield, color: "text-emerald-600 bg-emerald-100" },
    { label: t(lang, "adm_active_tenancies"), value: summary?.activeTenancies, icon: Users, color: "text-cyan-600 bg-cyan-100" },
    { label: t(lang, "adm_residents_portal_access"), value: summary?.residentsWithPortalAccess, icon: UserPlus, color: "text-violet-600 bg-violet-100" },
    {
      label: t(lang, "adm_tenancies_expiring_30_days"),
      value: summary?.tenanciesExpiringNext30Days,
      icon: Clock,
      color: "text-amber-700 bg-amber-100",
      description: t(lang, "adm_tenancies_expiring_30_days_desc"),
    },
    { label: t(lang, "adm_waha_passes_issued"), value: summary?.wahaPassesIssued, icon: KeyRound, color: "text-teal-600 bg-teal-100" },
    {
      label: t(lang, "adm_bookings_this_month"),
      value: summary?.bookingsThisMonth,
      icon: BarChart3,
      color: "text-indigo-600 bg-indigo-100",
      description: t(lang, "adm_bookings_this_month_desc"),
    },
    {
      label: t(lang, "adm_portal_help_this_month"),
      value: summary?.portalHelpTicketsThisMonth,
      icon: MessageSquare,
      color: "text-rose-600 bg-rose-100",
      description: t(lang, "adm_portal_help_this_month_desc"),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-6 w-6 text-amber-600" />
        <h1 className="text-2xl font-bold text-slate-900">{t(lang, "adm_title")}</h1>
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <Link href="/portal/unit-registry">
            <Building2 className="me-2 h-4 w-4" />
            {t(lang, "unit_reg_title")}
          </Link>
        </Button>
      </div>

      {(summary?.smtpStatus === "unconfigured" || summary?.smtpStatus === "credential_unreadable" || summary?.smtpStatus === "configuration_error") && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-4 text-red-950"
        >
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold">{t(lang, "adm_smtp_warning_title")}</p>
            <p className="mt-1 text-sm">{t(lang,
              summary.smtpStatus === "credential_unreadable"
                ? "adm_smtp_warning_unreadable"
                : summary.smtpStatus === "configuration_error"
                  ? "adm_smtp_warning_configuration_error"
                  : "adm_smtp_warning_unconfigured",
            )}</p>
            <a className="mt-2 inline-block text-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700" href="#admin-settings">
              {t(lang, "adm_smtp_warning_action")}
            </a>
          </div>
        </div>
      )}

      {/* AD6: action first. Tenant renewals remain owner-decided and excluded. */}
      <section
        aria-labelledby="admin-attention-heading"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="admin-attention-heading" className="text-base font-semibold text-slate-900">
            {t(lang, "adm_attention_title")}
          </h2>
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg border px-4 py-3",
              totalAttentionItems === 0 && "border-emerald-200 bg-emerald-50 text-emerald-900",
              totalAttentionItems !== 0 && overallAttentionUrgency === "normal" && "border-blue-200 bg-blue-50 text-blue-900",
              totalAttentionItems !== 0 && overallAttentionUrgency === "attention" && "border-amber-300 bg-amber-50 text-amber-950",
              totalAttentionItems !== 0 && overallAttentionUrgency === "overdue" && "border-red-300 bg-red-50 text-red-950",
            )}
          >
            {totalAttentionItems === 0
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <p className="text-sm font-semibold sm:text-base" aria-live="polite">{attentionSummary}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {attentionQueues.map((queue) => {
            const isLoaded = queue.key === "emailNotifications"
              ? summary !== undefined
              : pendingItems !== undefined;
            const isEmpty = isLoaded && queue.count === 0;
            const urgency = attentionUrgency(queue.oldestAt, attentionThresholds);
            const urgencyLabel = t(lang, `adm_attention_${urgency}`);
            const urgencyClasses = {
              normal: "border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100/70",
              attention: "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100/70",
              overdue: "border-red-300 bg-red-50 text-red-950 hover:bg-red-100/70",
            }[urgency];

            return (
              <a
                key={queue.key}
                href={queue.href}
                className={cn(
                  "group rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                  isEmpty
                    ? "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    : urgencyClasses,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("font-bold", isEmpty ? "text-lg text-slate-500" : "text-2xl")}>
                      {isLoaded ? queue.count : "—"}
                    </p>
                    <p className="text-xs font-medium">{queue.label}</p>
                  </div>
                  {!isEmpty && isLoaded && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-current/20 bg-white/60 px-2 py-1 text-[10px] font-semibold">
                      {urgency === "overdue" ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
                      {urgencyLabel}
                    </span>
                  )}
                </div>
                {!isEmpty && queue.oldestAt && (
                  <p className="mt-2 text-xs">
                    {t(lang, "adm_attention_oldest")
                      .replace("{age}", formatWaitingAge(queue.oldestAt, lang))}
                  </p>
                )}
                {queue.key === "emailNotifications" && isLoaded && (
                  <p className="mt-2 text-xs font-medium">
                    {t(lang, "adm_attention_email_delivery_detail")
                      .replace("{retrying}", String("retrying" in queue ? queue.retrying : 0))
                      .replace("{failed}", String("failed" in queue ? queue.failed : 0))}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      </section>

      {/* ── Action-Required Queues ── */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mt-10 mb-4">{lang === "ar" ? "طوابير الإجراءات المطلوبة" : "Action-Required Queues"}</h2>
        <div className="space-y-6">
      {/* Unit verification queue */}
      <Section
        id="admin-unit-verifications"
        title={`${t(lang, "adm_unit_queue")} (${verifications?.length ?? 0})`}
        defaultOpen={(verifications?.length ?? 0) > 0}
      >
        <div className="mt-3 space-y-3">
          {(!verifications || verifications.length === 0) && (
            <p className="text-slate-400 text-sm py-3">{t(lang, "adm_no_pending_verifications")}</p>
          )}
          {verifications?.map(v => (
            <VerificationRow key={v.id} v={v}
              onApprove={(id, note, approvalBases, otherText) => approveVerificationMutation.mutate({ id, note, approvalBases, otherText })}
              onReject={(id, note) => rejectVerificationMutation.mutate({ id, note })} />
          ))}
        </div>
      </Section>
      <Section
        id="admin-portal-help"
        title={`${t(lang, "ph_admin_title")} (${portalHelpTickets.length})`}
        defaultOpen={portalHelpTickets.some((ticket) => ticket.status === "pending")}
      >
        <div className="mt-3 space-y-3">
          {portalHelpTickets.length === 0 && <p className="py-2 text-sm text-slate-400">{t(lang, "ph_empty")}</p>}
          {portalHelpTickets.map((ticket) => (
            <PortalHelpRow
              key={ticket.id}
              ticket={ticket}
              onReply={(id, kind, reply) => replyPortalHelpMutation.mutate({ id, kind, reply })}
              onClose={(id) => closePortalHelpMutation.mutate(id)}
              busy={replyPortalHelpMutation.isPending || closePortalHelpMutation.isPending}
            />
          ))}
        </div>
      </Section>

      <Section
        title={`${t(lang, "sg11_approval_history")} (${approvedVerificationHistory.length})`}
        defaultOpen={approvedVerificationHistory.length > 0}
      >
        <div className="mt-3 space-y-3">
          {approvedVerificationHistory.length === 0 ? (
            <p className="text-slate-400 text-sm py-3">{t(lang, "sg11_no_approval_history")}</p>
          ) : approvedVerificationHistory.map((verification) => (
            <VerificationHistoryRow key={verification.id} verification={verification} />
          ))}
        </div>
      </Section>

      <div id="admin-tenancy-releases" className="scroll-mt-6">
        <TenancyReleaseAdminPanel />
      </div>

      {/* Permit queue */}
      {(() => {
        const PERMIT_TYPE_LABEL_KEYS: Record<string, string> = {
          move_in:            "per_type_move_in",
          move_out:           "per_type_move_out",
          renovation:         "per_type_renovation",
          additional_vehicle: "per_type_additional_vehicle",
        };
        const PERMIT_STATUS_COLORS: Record<string, string> = {
          submitted:    "bg-blue-100 text-blue-700",
          under_review: "bg-purple-100 text-purple-700",
        };
        const filteredPermits = permitStatusFilter === "all"
          ? pendingPermits
          : pendingPermits.filter(p => p.status === permitStatusFilter);
        return (
          <Section
            id="admin-permits"
            title={`${t(lang, "adm_permits_section")} (${pendingPermits.length})`}
            defaultOpen={pendingPermits.length > 0}
          >
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">{t(lang, "per_filter_status")}:</span>
                <select
                  className="text-xs border rounded px-2 py-1 bg-white"
                  value={permitStatusFilter}
                  onChange={e => setPermitStatusFilter(e.target.value)}
                >
                  <option value="all">{t(lang, "all")}</option>
                  <option value="submitted">{t(lang, "status_submitted")}</option>
                  <option value="under_review">{t(lang, "status_under_review")}</option>
                </select>
              </div>
              {filteredPermits.length === 0 && <p className="text-slate-400 text-sm py-2">{t(lang, "adm_no_submitted_permits")}</p>}
              {filteredPermits.map(p => {
                const permitTypeKey = p.permitType ?? p.type;
                const typeLabel = PERMIT_TYPE_LABEL_KEYS[permitTypeKey]
                  ? t(lang, PERMIT_TYPE_LABEL_KEYS[permitTypeKey])
                  : permitTypeKey?.replace(/_/g, " ");
                const statusBadgeClass = PERMIT_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600";
                return (
                  <div key={p.id} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass}`}>
                            {t(lang, `status_${p.status}`)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          {typeLabel}
                          {p.requester && <span className="text-slate-400 font-normal ms-2">— {p.requester.firstName} {p.requester.lastName}</span>}
                        </p>
                        <p className="text-xs text-slate-500">{t(lang, "adm_unit_label")} {formatCanonicalUnit(p.unitNumber)} · {new Date(p.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}</p>
                        {p.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{p.description}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {p.status === "submitted" && (
                          <Button size="sm" className="h-7 text-xs whitespace-nowrap" variant="outline"
                            onClick={() => updatePermitMutation.mutate({ id: p.id, status: "under_review" })}>
                            {t(lang, "adm_review")}
                          </Button>
                        )}
                        <Button size="sm" className="h-7 text-xs whitespace-nowrap bg-green-600 hover:bg-green-700"
                          onClick={() => updatePermitMutation.mutate({ id: p.id, status: "approved" })}>{t(lang, "adm_approve")}</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap text-red-500 border-red-300"
                          onClick={() => updatePermitMutation.mutate({ id: p.id, status: "rejected" })}>{t(lang, "adm_reject")}</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* Additional vehicle approvals */}
      <Section
        id="admin-vehicles"
        title={`${t(lang, "adm_vehicle_requests")} (${pendingVehicles.length})`}
        defaultOpen={pendingVehicles.length > 0}
      >
        <div className="mt-3 space-y-2">
          {pendingVehicles.length === 0 && <p className="text-slate-400 text-sm py-2">{t(lang, "adm_no_pending_vehicles")}</p>}
          {pendingVehicles.map(v => (
            <div key={v.id} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{v.year} {v.make} {v.model}</p>
                <p className="text-xs text-slate-500">{v.color} · {t(lang, "adm_plate_label")} {v.plateNumber}</p>
                {v.resident && <p className="text-xs text-slate-500">{v.resident.fullName} · {v.resident.nationalId ?? "—"}</p>}
                {/* E5: link to registration doc if present */}
                {v.registrationDocKey && (
                  <button
                    type="button"
                    onClick={() => void openVehicleRegistrationDocument(v.id)}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <FileText className="h-3 w-3" />
                    {t(lang, "veh_view_reg_doc")}
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" className="h-7 text-xs whitespace-nowrap bg-green-600 hover:bg-green-700"
                  disabled={approveVehicleMutation.isPending}
                  onClick={() => approveVehicleMutation.mutate({ id: v.id })}>{t(lang, "adm_approve")}</Button>
                {/* E5: open rejection dialog instead of calling approve mutation */}
                <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap text-red-500 border-red-300"
                  disabled={rejectVehicleMutation.isPending}
                  onClick={() => {
                    setRejectVehicleDialog({ id: v.id, plateNumber: v.plateNumber });
                    setRejectVehicleReason("");
                    setRejectVehicleNote("");
                  }}>{t(lang, "adm_reject")}</Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* E5: Vehicle rejection dialog */}
      <Dialog open={!!rejectVehicleDialog} onOpenChange={(open) => { if (!open) setRejectVehicleDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "adm_reject_vehicle_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              {rejectVehicleDialog?.plateNumber}
            </p>
            <div className="space-y-1.5">
              <Label>{t(lang, "adm_reject_vehicle_reason_label")} <span className="text-red-500">*</span></Label>
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={rejectVehicleReason}
                onChange={(e) => setRejectVehicleReason(e.target.value as VehicleRejectionReason | "")}
              >
                <option value="">— {t(lang, "adm_reject_vehicle_reason_label")} —</option>
                {VEHICLE_REJECTION_REASONS.map(r => (
                  <option key={r} value={r}>{t(lang, `veh_rejection_reason_${r}` as any)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t(lang, "adm_reject_vehicle_note_label")}</Label>
              <Textarea
                value={rejectVehicleNote}
                onChange={(e) => setRejectVehicleNote(e.target.value)}
                placeholder="..."
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRejectVehicleDialog(null)}>{t(lang, "common_cancel")}</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!rejectVehicleReason || rejectVehicleMutation.isPending}
                onClick={() => {
                  if (!rejectVehicleDialog || !rejectVehicleReason) {
                    toast({ title: t(lang, "adm_rejection_reason_required"), variant: "destructive" });
                    return;
                  }
                  rejectVehicleMutation.mutate({
                    id: rejectVehicleDialog.id,
                    rejectionReason: rejectVehicleReason,
                    approvalNote: rejectVehicleNote || undefined,
                  });
                }}
              >
                {rejectVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t(lang, "adm_reject_vehicle_submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extraResDialog} onOpenChange={(open) => { if (!open) setExtraResDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {extraResDialog?.action === "approved"
                ? (t(lang, "adm_approve_extra_res_title") || "Approve Extra Resident")
                : (t(lang, "adm_reject_extra_res_title") || "Refuse Extra Resident")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              {t(lang, "adm_extra_res_proposed") || "Proposed resident"}: <strong>{extraResDialog?.proposedName}</strong>
            </p>
            <div className="space-y-1.5">
              <Label>{t(lang, "adm_reason_label") || "Reason (recorded for audit)"} {extraResDialog?.action === "refused" && <span className="text-red-500">*</span>}</Label>
              <Textarea
                value={extraResReason}
                onChange={(e) => setExtraResReason(e.target.value)}
                placeholder={t(lang, "adm_reason_placeholder") || "Enter reason..."}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setExtraResDialog(null)}>{t(lang, "cancel")}</Button>
              <Button
                size="sm"
                variant={extraResDialog?.action === "approved" ? "default" : "destructive"}
                disabled={decideExtraResidentMutation.isPending || (extraResDialog?.action === "refused" && !extraResReason.trim())}
                onClick={() => {
                  if (extraResDialog) {
                    decideExtraResidentMutation.mutate({
                      id: extraResDialog.id,
                      data: {
                        decision: extraResDialog.action,
                        reason: extraResReason.trim() || undefined,
                      }
                    });
                    setExtraResDialog(null);
                  }
                }}
              >
                {extraResDialog?.action === "approved" ? t(lang, "adm_approve") : t(lang, "adm_reject")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Waha Pass */}
      <div id="admin-waha-passes" className="scroll-mt-6">
        <WahaPassSection
          apps={wahaPassApps}
          users={allUsers}
          onApprove={(id, reviewNote) => approveWahaMutation.mutate({ id, reviewNote })}
          onReject={(id, reviewNote) => rejectWahaMutation.mutate({ id, reviewNote })}
          onRevoke={(id, credentialId, reason) => revokeWahaMutation.mutate({ id, credentialId, reason })}
          approving={approveWahaMutation.isPending}
          rejecting={rejectWahaMutation.isPending}
          revoking={revokeWahaMutation.isPending}
        />
      </div>

      <Section
        id="admin-waha-replacements"
        title={lang === "ar" ? `طلبات بديل بطاقة واحة (${pendingItems?.wahaReplacementRequests?.length ?? 0})` : `Waha Pass replacement requests (${pendingItems?.wahaReplacementRequests?.length ?? 0})`}
        defaultOpen={(pendingItems?.wahaReplacementRequests?.length ?? 0) > 0}
      >
        <div className="mt-3 space-y-2">
          {(pendingItems?.wahaReplacementRequests ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">{lang === "ar" ? "لا توجد طلبات بديل بانتظار المراجعة." : "No replacement requests are awaiting review."}</p>
          ) : pendingItems!.wahaReplacementRequests.map((request: any) => (
            <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">#{request.id} · {request.reason}</p>
                <p className="text-xs text-slate-500">Application #{request.applicationId} · Credential #{request.originalCredentialId}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={reviewReplacementMutation.isPending}
                  onClick={() => reviewReplacementMutation.mutate({ id: request.id, action: "approved" })}>
                  {t(lang, "adm_approve")}
                </Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-600" disabled={reviewReplacementMutation.isPending}
                  onClick={() => reviewReplacementMutation.mutate({ id: request.id, action: "rejected" })}>
                  {t(lang, "adm_reject")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Extra Resident Requests */}
      <Section
        id="admin-extra-residents"
        title={`${t(lang, "adm_extra_residents") || "Extra Resident Requests"} (${pendingExtraResidentRequests.length})`}
        defaultOpen={pendingExtraResidentRequests.length > 0}
      >
        <div className="mt-3 space-y-3">
          {pendingExtraResidentRequests.length === 0 && (
            <p className="text-sm text-slate-500 py-2 text-center">{t(lang, "adm_no_pending_requests") || "No pending requests."}</p>
          )}
          {pendingExtraResidentRequests.map((req: any) => {
            const proposedName = req.proposedResident ? `${req.proposedResident.firstName} ${req.proposedResident.lastName}` : "Unknown";
            const currentCount = typeof req.currentCount === "number" ? req.currentCount : "?";
            const unitDisplay = formatCanonicalUnit(req.unitReference || req.unitNumber) || `ID:${req.unitId}`;
            const requesterDisplay = req.requesterResidentName || `ID:${req.requesterResidentId}`;

            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 text-sm">
                      {t(lang, "adm_unit")} {unitDisplay} &mdash; {proposedName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(lang, "adm_extra_res_requester") || "Requested by"}: {requesterDisplay}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(lang, "adm_extra_res_reason") || "Reason"}: <span className="text-slate-800">{req.reason}</span>
                    </p>
                    <p className="text-xs text-amber-600 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200 mt-1">
                      {t(lang, "adm_extra_res_count") || "Current household size"}: {currentCount}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => {
                        setExtraResDialog({ id: req.id, action: "approved", proposedName });
                        setExtraResReason("");
                      }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> {t(lang, "adm_approve")}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setExtraResDialog({ id: req.id, action: "refused", proposedName });
                        setExtraResReason("");
                      }}>
                      <XCircle className="h-4 w-4 mr-1" /> {t(lang, "adm_reject")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Ownership Changes */}
      <Section
        id="admin-ownership-changes"
        title={`${t(lang, "adm_coo_section")} (${ownershipChanges.filter((e: any) => e.status === "pending").length})`}
        defaultOpen={ownershipChanges.filter((e: any) => e.status === "pending").length > 0}
      >
        <div className="mt-3 space-y-3">
          {ownershipChanges.filter((e: any) => e.status === "pending").length === 0 && (
            <p className="text-slate-400 text-sm py-3">{t(lang, "adm_coo_no_pending")}</p>
          )}
          {ownershipChanges.filter((e: any) => e.status === "pending").map((ev: any) => {
            const isOverdue = (Date.now() - new Date(ev.createdAt).getTime()) > 14 * 24 * 60 * 60 * 1000;
            return (
            <div key={ev.id} className={`bg-white border rounded-lg p-4 space-y-3 ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ev.initiationType === "path_a" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                    {ev.initiationType === "path_a" ? t(lang, "adm_coo_path_a") : t(lang, "adm_coo_path_b")}
                  </span>
                  {isOverdue && (
                    <span title={t(lang, "adm_coo_overdue_tooltip")} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{t(lang, "adm_coo_overdue_badge")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {ev.outgoingOwnerName && (
                  <div>
                    <p className="text-xs text-slate-400">{t(lang, "adm_coo_outgoing_owner")}</p>
                    <p className="font-medium text-slate-800">{ev.outgoingOwnerName}</p>
                    {ev.outgoingOwnerNationalId && <p className="text-xs text-slate-500">{ev.outgoingOwnerNationalId}</p>}
                  </div>
                )}
                {ev.newOwnerName && (
                  <div>
                    <p className="text-xs text-slate-400">{t(lang, "adm_coo_new_claimant")}</p>
                    <p className="font-medium text-slate-800">{ev.newOwnerName}</p>
                    {ev.newOwnerNationalId && <p className="text-xs text-slate-500">{ev.newOwnerNationalId}</p>}
                  </div>
                )}
              </div>
              {ev.proofDocumentKey && (
                <p className="text-xs text-slate-500">
                  <span className="font-medium">{t(lang, "adm_coo_proof_doc")}:</span>{" "}
                  <code className="bg-slate-100 px-1 rounded">{ev.proofDocumentKey}</code>
                </p>
              )}
              {ev.notes && <p className="text-xs text-slate-500 italic">{ev.notes}</p>}
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                {t(lang, "adm_coo_approve_warning")}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline"
                  className="text-green-700 border-green-200 hover:bg-green-50"
                  disabled={reviewOwnershipChangeMutation.isPending}
                  onClick={() => reviewOwnershipChangeMutation.mutate({ id: ev.id, action: "approved" })}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />{t(lang, "adm_approve")}
                </Button>
                <Button size="sm" variant="outline"
                  className="text-red-700 border-red-200 hover:bg-red-50"
                  disabled={reviewOwnershipChangeMutation.isPending}
                  onClick={() => reviewOwnershipChangeMutation.mutate({ id: ev.id, action: "rejected" })}>
                  <XCircle className="h-4 w-4 mr-1" />{t(lang, "adm_reject")}
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      </Section>

      {/* Ownership Changes — released records, retained as audit history */}
      {(() => {
        const completed = ownershipChanges.filter((e: any) => e.status === "approved" || e.status === "completed");
        return (
          <Section title={`${t(lang, "adm_coo_completed_section")} (${completed.length})`} defaultOpen={false}>
            <div className="mt-3 space-y-3">
              {completed.length === 0 && (
                <p className="text-slate-400 text-sm py-3">{t(lang, "adm_coo_no_completed")}</p>
              )}
              {completed.map((ev: any) => (
                <div key={ev.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {t(lang, "adm_coo_path_b")} — {t(lang, "adm_coo_transfer_auto_activated")}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {ev.outgoingOwnerName && (
                      <div>
                        <p className="text-xs text-slate-400">{t(lang, "adm_coo_outgoing_owner")}</p>
                        <p className="font-medium text-slate-800">{ev.outgoingOwnerName}</p>
                      </div>
                    )}
                    {ev.newOwnerName && (
                      <div>
                        <p className="text-xs text-slate-400">{t(lang, "adm_coo_new_claimant")}</p>
                        <p className="font-medium text-slate-800">{ev.newOwnerName}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );
      })()}

      {/* Ownership Changes — Rejected / Cancelled (by admin or auto-expiry) */}
      {(() => {
        const rejected = ownershipChanges.filter((e: any) => e.status === "rejected");
        const rejectionReasonLabel: Record<string, string> = {
          auto_expired:        t(lang, "adm_coo_reason_auto_expired"),
          auto_expired_path_b: t(lang, "adm_coo_reason_auto_expired_path_b"),
          admin_rejected:      t(lang, "adm_coo_reason_admin_rejected"),
        };
        const rejectionReasonStyle: Record<string, string> = {
          auto_expired:        "bg-orange-100 text-orange-700",
          auto_expired_path_b: "bg-orange-100 text-orange-700",
          admin_rejected:      "bg-red-100 text-red-700",
        };
        return (
          <Section title={`${t(lang, "adm_coo_rejected_section")} (${rejected.length})`} defaultOpen={false}>
            <div className="mt-3 space-y-3">
              {rejected.length === 0 && (
                <p className="text-slate-400 text-sm py-3">{t(lang, "adm_coo_no_rejected")}</p>
              )}
              {rejected.map((ev: any) => (
                <div key={ev.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {ev.initiationType === "path_a" ? t(lang, "adm_coo_path_a") : t(lang, "adm_coo_path_b")}
                    </span>
                    {ev.rejectionReason && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rejectionReasonStyle[ev.rejectionReason] ?? "bg-slate-100 text-slate-600"}`}>
                        {rejectionReasonLabel[ev.rejectionReason] ?? ev.rejectionReason}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {ev.outgoingOwnerName && (
                      <div>
                        <p className="text-xs text-slate-400">{t(lang, "adm_coo_outgoing_owner")}</p>
                        <p className="font-medium text-slate-800">{ev.outgoingOwnerName}</p>
                      </div>
                    )}
                    {ev.newOwnerName && (
                      <div>
                        <p className="text-xs text-slate-400">{t(lang, "adm_coo_new_claimant")}</p>
                        <p className="font-medium text-slate-800">{ev.newOwnerName}</p>
                      </div>
                    )}
                  </div>
                  {ev.notes && (
                    <p className="text-xs text-slate-500 italic">{ev.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        );
      })()}

      {/* Move forms */}
      {(() => {
        const MOVE_FORM_ALLOWED_TRANSITIONS: Record<string, string[]> = {
          pending: ["approved", "rejected"],
          approved: ["completed", "rejected"],
          completed: [],
          rejected: [],
        };
        const MOVE_FORM_STATUS_LABELS: Record<string, string> = {
          approved: t(lang, "adm_approve"),
          completed: t(lang, "adm_mark_completed"),
          rejected: t(lang, "adm_reject"),
        };
        const MOVE_FORM_STATUS_STYLE: Record<string, string> = {
          pending: "bg-amber-100 text-amber-700",
          approved: "bg-green-100 text-green-700",
          completed: "bg-slate-100 text-slate-600",
          rejected: "bg-red-100 text-red-600",
        };
        const MOVE_FORM_STATUS_DISPLAY: Record<string, string> = {
          pending: t(lang, "comm_status_pending"),
          approved: t(lang, "status_approved"),
          completed: t(lang, "status_completed"),
          rejected: t(lang, "status_rejected"),
        };
        const activeForms = moveForms?.filter(f => f.status === "pending" || f.status === "approved") ?? [];
        return (
          <Section title={`${t(lang, "adm_move_forms")} (${activeForms.length})`} defaultOpen={false}>
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>
                <strong>Legacy records only.</strong> New move-in/out requests are submitted via{" "}
                <strong>Permits → Move-In / Move-Out</strong> and appear in the Permits queue above.
                These entries were created through the old mobile move-forms flow.
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {activeForms.length === 0 && <p className="text-slate-400 text-sm py-2">{t(lang, "adm_no_active_move_forms")}</p>}
              {activeForms.map(f => {
                const nextStatuses = MOVE_FORM_ALLOWED_TRANSITIONS[f.status] ?? [];
                return (
                  <div key={f.id} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${MOVE_FORM_STATUS_STYLE[f.status] ?? "bg-slate-100 text-slate-600"}`}>{MOVE_FORM_STATUS_DISPLAY[f.status] ?? f.status}</span>
                        <p className="text-sm font-medium text-slate-900 capitalize">{f.type?.replace("_", " ")} — {t(lang, "adm_unit_label")} {formatCanonicalUnit(f.unitNumber)}</p>
                      </div>
                      <p className="text-xs text-slate-500">{f.scheduledDate}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {nextStatuses.map(next => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "rejected" ? "outline" : "default"}
                          className={cn(
                            "h-7 text-xs whitespace-nowrap",
                            next === "approved" && "bg-green-600 hover:bg-green-700",
                            next === "completed" && "bg-blue-600 hover:bg-blue-700",
                            next === "rejected" && "text-red-500 border-red-300",
                          )}
                          disabled={updateMoveFormMutation.isPending}
                          onClick={() => updateMoveFormMutation.mutate({ id: f.id, status: next })}
                        >
                          {MOVE_FORM_STATUS_LABELS[next] ?? next}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}

            {/* Communications Inbox */}
      <Section
        id="admin-communications"
        title={`${t(lang, "adm_communications")} (${communications.length})`}
        defaultOpen={communications.filter((c: any) => c.status === "pending").length > 0}
      >
        <div className="mt-3 space-y-3">
          {communications.length === 0 && <p className="text-slate-400 text-sm py-2">{t(lang, "adm_no_communications")}</p>}
          {communications.map((c: any) => (
            <CommRow key={c.id} c={c}
              onUpdate={(id, status, adminNote) => updateCommMutation.mutate({ id, status, adminNote })} />
          ))}
        </div>
      </Section>

      </div>
      </div>

      {/* ── Management ── */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mt-10 mb-4">{lang === "ar" ? "الإدارة" : "Management"}</h2>
        <div className="space-y-6">
      {/* Guest registry — admins can revoke any approved pass */}
      <Section title={`${t(lang, "adm_guest_registry")} (${guests?.length ?? 0})`} defaultOpen={false}>
        <div className="mt-3 space-y-2">
          {(!guests || guests.length === 0) && <p className="text-slate-400 text-sm py-2">{t(lang, "adm_no_guests")}</p>}
          {guests?.map(g => (
            <div key={g.id} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{g.firstName} {g.lastName}</p>
                <p className="text-xs text-slate-500">{t(lang, "guest_visit_date")}: {g.visitDate} · {g.residentUnit ?? "—"}</p>
              </div>
              {g.status === "approved" && (
                <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap text-red-500 border-red-300" onClick={() => updateGuestMutation.mutate({ id: g.id, status: "denied" })}>{t(lang, "adm_revoke")}</Button>
              )}
              {g.status === "denied" && (
                <span className="text-xs text-red-500 font-medium">{t(lang, "adm_revoked")}</span>
              )}
            </div>
          ))}
        </div>
      </Section>


      {/* HOA Settings */}
      <Section id="admin-settings" title={t(lang, "adm_settings")} defaultOpen={false}>
        <HoaSettingsForm
          current={hoaSettings ?? {}}
          onSave={(updates) => saveSettingsMutation.mutate(updates)}
          saving={saveSettingsMutation.isPending}
        />
      </Section>

      {/* AI Knowledge Base */}
      <Section title={`${t(lang, "adm_knowledge_base")} (${kbDocs.length})`} defaultOpen={false}>
        <div className="mt-3 space-y-4">
          {aiStatus && !aiStatus.configured && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">{t(lang, "adm_kb_no_key_title")}</p>
                <p className="text-xs text-amber-700 mt-0.5">{t(lang, "adm_kb_no_key_desc")}</p>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">{t(lang, "adm_kb_subtitle")}</p>
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-amber-800">{t(lang, "adm_kb_governance_warning")}</p>
          </div>

          {/* Upload button */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={kbAudience}
              onChange={e => setKbAudience(e.target.value as "all_portal_users" | "verified_owners_admin")}
              disabled={kbUploading}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700"
              aria-label="Knowledge document audience"
            >
              <option value="all_portal_users">{t(lang, "adm_kb_audience_all")}</option>
              <option value="verified_owners_admin">{t(lang, "adm_kb_audience_owners")}</option>
            </select>
            <label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="sr-only"
                disabled={kbUploading}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { handleKbUpload(f); e.target.value = ""; }
                }}
              />
              <Button asChild size="sm" className="gap-2 cursor-pointer" disabled={kbUploading}>
                <span>
                  {kbUploading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t(lang, "adm_uploading")}</>
                    : <><Upload className="h-3.5 w-3.5" />{t(lang, "adm_upload_source")}</>}
                </span>
              </Button>
            </label>
          </div>

          {/* Document list */}
          {kbDocs.length === 0 && !kbUploading && (
            <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-slate-200 rounded-xl">
              <Bot className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">{t(lang, "adm_kb_empty")}</p>
            </div>
          )}
          {kbDocs.length > 0 && (
            <div className="space-y-2">
              {kbDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.filename}</p>
                    <p className="text-xs text-slate-400">
                      {doc.chunkCount ?? "?"} {t(lang, "adm_kb_chunks")}
                      {" · "}{doc.audience === "verified_owners_admin" ? t(lang, "adm_kb_audience_owners") : t(lang, "adm_kb_audience_all")}
                      {doc.createdAt && <> · {new Date(doc.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}</>}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">
                    {t(lang, "adm_kb_indexed")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => {
                      if (confirm(t(lang, "adm_kb_delete_confirm"))) {
                        deleteKbMutation.mutate(doc.id);
                      }
                    }}
                    disabled={deleteKbMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* User management */}
      {(() => {
        const ROLE_BADGE: Record<string, string> = {
          admin:  "bg-purple-100 text-purple-700",
          guard:  "bg-teal-100 text-teal-700",
          owner:  "bg-green-100 text-green-700",
          tenant: "bg-slate-100 text-slate-600",
        };
        const ROLE_LABEL_KEY: Record<string, string> = {
          admin: "adm_role_admin", guard: "adm_role_guard",
          owner: "adm_role_owner", tenant: "adm_role_tenant",
        };
        const VERIF_BADGE: Record<string, string> = {
          verified_owner:  "bg-green-100 text-green-700",
          verified_tenant: "bg-cyan-100 text-cyan-700",
          pending:         "bg-amber-100 text-amber-700",
          rejected:        "bg-red-100 text-red-600",
          unverified:      "bg-slate-100 text-slate-500",
        };
        const STATUS_BADGE: Record<string, string> = {
          active:    "bg-green-100 text-green-700",
          pending:   "bg-amber-100 text-amber-700",
          suspended: "bg-red-100 text-red-700",
        };
        const users = usersData?.data ?? [];
        const totalUsers = usersData?.total ?? 0;
        const totalPages = usersData ? Math.ceil(usersData.total / usersData.limit) : 1;
        return (
          <Section title={t(lang, "adm_user_management")} defaultOpen={false}>
            {/* Search + Status filter bar */}
            <div className="mt-3 flex flex-wrap gap-2 mb-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <Input
                  className="ps-8 h-8 text-sm"
                  placeholder={t(lang, "adm_search_users")}
                  value={userSearchInput}
                  onChange={e => setUserSearchInput(e.target.value)}
                />
              </div>
              <select
                className="text-xs border rounded px-2 py-1 bg-white"
                value={userStatusFilter}
                onChange={e => { setUserStatusFilter(e.target.value); setUserPage(1); }}
              >
                <option value="">{t(lang, "adm_all_statuses")}</option>
                <option value="pending">{t(lang, "adm_status_pending")}</option>
                <option value="active">{t(lang, "adm_status_active")}</option>
                <option value="suspended">{t(lang, "adm_status_suspended")}</option>
              </select>
            </div>

            <div className="space-y-2">
              {users.length === 0 && (
                <p className="text-sm text-slate-400 py-2 text-center">{t(lang, "adm_no_users")}</p>
              )}
              {users.map((u: any) => {
                const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                return (
                  <div key={u.id} className="rounded-lg border border-slate-100 p-3">
                    {/* Top row: name + status badge */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      {u.status && (
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", STATUS_BADGE[u.status] ?? "bg-slate-100 text-slate-600")}>
                          {t(lang, `adm_status_${u.status}`)}
                        </span>
                      )}
                    </div>

                    {/* Detail row: role · verification · unit · phone */}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", ROLE_BADGE[u.role] ?? "bg-slate-100 text-slate-600")}>
                        {t(lang, ROLE_LABEL_KEY[u.role] ?? "adm_role_tenant")}
                      </span>
                      {u.verificationStatus && (
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", VERIF_BADGE[u.verificationStatus] ?? "bg-slate-100 text-slate-500")}>
                          {u.verificationStatus.replace(/_/g, " ")}
                        </span>
                      )}
                      {u.unitNumber && (
                        <span>{t(lang, "adm_unit_label")} {formatCanonicalUnit(u.unitNumber)}</span>
                      )}
                      {u.phone && (
                        <span>{t(lang, "adm_phone_label")} {u.phone}</span>
                      )}
                    </div>

                    {/* Actions row: role + status selects */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setNotificationDetailUser({ id: u.id, name: displayName, email: u.email })}
                        aria-label={t(lang, "adm_notification_history_for").replace("{name}", displayName)}
                      >
                        <Mail className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                        {t(lang, "adm_notification_history")}
                      </Button>
                      <select
                        className="text-xs border rounded px-1.5 py-0.5 bg-white"
                        value={u.role}
                        onChange={e => updateUserMutation.mutate({ id: u.id, role: e.target.value })}
                      >
                        <option value="tenant">{t(lang, "adm_role_tenant")}</option>
                        <option value="owner">{t(lang, "adm_role_owner")}</option>
                        <option value="guard">{t(lang, "adm_role_guard")}</option>
                      </select>
                      <select
                        className="text-xs border rounded px-1.5 py-0.5 bg-white"
                        value={u.status}
                        onChange={e => {
                          const next = e.target.value;
                          if (next === "suspended") {
                            setPendingSuspend({ id: u.id, name: displayName });
                          } else {
                            updateUserMutation.mutate({ id: u.id, status: next });
                          }
                        }}
                      >
                        <option value="pending">{t(lang, "adm_status_pending")}</option>
                        <option value="active">{t(lang, "adm_status_active")}</option>
                        <option value="suspended">{t(lang, "adm_status_suspended")}</option>
                      </select>
                      {u.role === "admin" && (
                        <label className="ms-1 flex items-center gap-2 text-xs text-slate-600">
                          <Switch
                            checked={Boolean(u.receivesApprovalNotifications)}
                            onCheckedChange={(receivesApprovalNotifications) =>
                              updateUserMutation.mutate({ id: u.id, receivesApprovalNotifications })
                            }
                            aria-label={lang === "ar" ? "تلقي تنبيهات الموافقات" : "Receive approval alerts"}
                          />
                          {lang === "ar" ? "تنبيهات الموافقات" : "Approval alerts"}
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3">
                <PaginationBar page={userPage} totalPages={totalPages} onPageChange={setUserPage} />
              </div>
            )}
            {totalUsers > 0 && (
              <p className="text-xs text-slate-400 mt-2 text-center">
                {totalUsers} {t(lang, "adm_total_users").toLowerCase()}
              </p>
            )}
          </Section>
        );
      })()}

      {/* Suspend confirmation dialog */}
      <Dialog open={!!pendingSuspend} onOpenChange={open => { if (!open) setPendingSuspend(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t(lang, "adm_suspend_confirm_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {t(lang, "adm_suspend_confirm_desc").replace("{name}", pendingSuspend?.name ?? "")}
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={updateUserMutation.isPending}
              onClick={() => {
                if (pendingSuspend) {
                  updateUserMutation.mutate({ id: pendingSuspend.id, status: "suspended" });
                  setPendingSuspend(null);
                }
              }}
            >
              {t(lang, "adm_confirm_suspend_btn")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setPendingSuspend(null)}>
              {t(lang, "common_cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notificationDetailUser} onOpenChange={open => { if (!open) setNotificationDetailUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "adm_notification_history")}</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-3 text-sm">
            <div>
              <p className="font-medium text-slate-900">{notificationDetailUser?.name}</p>
              <p className="truncate text-xs text-slate-500">{notificationDetailUser?.email}</p>
            </div>
            {isNotificationFailureSummaryLoading ? (
              <p className="text-slate-500">{t(lang, "loading")}</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <dt className="text-xs text-amber-900">{t(lang, "adm_notification_retrying")}</dt>
                    <dd className="mt-1 text-xl font-bold text-amber-950">{notificationFailureSummary?.retryingEmailNotifications ?? 0}</dd>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <dt className="text-xs text-red-900">{t(lang, "adm_notification_terminal")}</dt>
                    <dd className="mt-1 text-xl font-bold text-red-950">{notificationFailureSummary?.failedEmailNotifications ?? 0}</dd>
                  </div>
                </dl>
                <p className="text-slate-600">
                  {notificationFailureSummary?.oldestEmailFailureAt
                    ? t(lang, "adm_notification_oldest").replace("{age}", formatWaitingAge(notificationFailureSummary.oldestEmailFailureAt, lang))
                    : t(lang, "adm_notification_none")}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      </div>
      </div>

      <section aria-labelledby="admin-community-health-heading" className="space-y-3">
        <div>
          <h2 id="admin-community-health-heading" className="text-lg font-semibold text-slate-900">
            {t(lang, "adm_community_health")}
          </h2>
          <p className="text-xs text-slate-500">{t(lang, "adm_community_health_desc")}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((card) => <StatCard key={card.label} {...card} />)}
        </div>
      </section>

    </div>
  );
}

export function CommRow({ c, onUpdate }: { c: any; onUpdate: (id: number, status: string, adminNote: string) => void }) {
  const { lang } = useLanguage();
  const [note, setNote] = useState(c.adminNote ?? "");
  const [expanded, setExpanded] = useState(c.status === "pending");
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);
  const TypeIcon = c.type === "complaint" ? AlertCircle : Lightbulb;
  const typeColor = c.type === "complaint" ? "text-red-600 bg-red-50 border-red-200" : "text-amber-600 bg-amber-50 border-amber-200";
  const statusBadge: Record<string, string> = {
    pending: "bg-slate-100 text-slate-500",
    read: "bg-blue-100 text-blue-600",
    resolved: "bg-green-100 text-green-600",
    rejected: "bg-red-100 text-red-600",
    deferred_to_maintenance: "bg-amber-100 text-amber-600",
  };
  const statusLabel: Record<string, string> = {
    pending: t(lang, "comm_status_pending"),
    read: t(lang, "comm_status_read"),
    resolved: t(lang, "comm_status_resolved"),
    rejected: t(lang, "comm_status_rejected"),
    deferred_to_maintenance: t(lang, "comm_status_deferred"),
  };
  const isClosed = ["resolved", "rejected", "deferred_to_maintenance"].includes(c.status);

  const senderName = [c.senderFirstName, c.senderLastName].filter(Boolean).join(" ") || c.senderEmail;

  return (
    <div className={cn("border rounded-lg overflow-hidden", c.status === "pending" ? "border-slate-200" : "border-slate-100")}>
      <button className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border shrink-0", typeColor)}>
              <TypeIcon className="h-3 w-3" />
              {c.type === "complaint" ? t(lang, "comm_type_complaint") : t(lang, "comm_type_suggestion")}
            </span>
            <span className="text-sm font-medium text-slate-900 truncate">{c.subject}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusBadge[c.status] ?? "bg-slate-100 text-slate-500")}>
              {statusLabel[c.status] ?? c.status}
            </span>
            <span className="text-xs text-slate-400">{senderName}</span>
            {c.senderBuilding && (
              <span className="text-xs text-slate-400">· Bldg <span className="font-medium text-slate-600">{c.senderBuilding}</span></span>
            )}
            {c.senderApartment && (
              <span className="text-xs text-slate-400">Apt <span className="font-medium text-slate-600">{c.senderApartment}</span></span>
            )}
            {!c.senderBuilding && c.senderUnit && (
              <span className="text-xs text-slate-400">· {t(lang, "adm_unit_label")} {c.senderUnit}</span>
            )}
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 space-y-3 bg-slate-50">
          <div className="pt-3 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-xs text-slate-500"><span className="font-medium text-slate-700">From:</span> {senderName} ({c.senderEmail})</span>
            {c.senderBuilding && (
              <span className="text-xs text-slate-500"><span className="font-medium text-slate-700">Building:</span> {c.senderBuilding}</span>
            )}
            {c.senderApartment && (
              <span className="text-xs text-slate-500"><span className="font-medium text-slate-700">Apt:</span> {c.senderApartment}</span>
            )}
            {!c.senderBuilding && c.senderUnit && (
              <span className="text-xs text-slate-500"><span className="font-medium text-slate-700">{t(lang, "adm_unit_label")}:</span> {c.senderUnit}</span>
            )}
            {c.senderPhone && (
              <span className="text-xs text-slate-500"><span className="font-medium text-slate-700">{t(lang, "adm_phone_label")}:</span> {c.senderPhone}</span>
            )}
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
          <p className="text-xs text-slate-400">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(c.createdAt))}</p>
          {isClosed && c.adminNote ? (
            <div className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              c.status === "rejected"
                ? "bg-red-50 border-red-200 text-red-700"
                : c.status === "deferred_to_maintenance"
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-green-50 border-green-200 text-green-700",
            )}>
              <strong className="block text-xs font-semibold mb-1">{t(lang, "comm_hoa_response")}</strong>
              <p className="whitespace-pre-wrap">{c.adminNote}</p>
            </div>
          ) : !isClosed && confirmStatus ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <h4 className="text-sm font-semibold text-indigo-900 mb-2">
                {lang === "ar" ? "تأكيد إرسال الرد" : "Confirm outgoing message"}
              </h4>
              <p className="text-xs text-indigo-700 mb-3">
                {lang === "ar" ? "سيتم إرسال هذه الرسالة إلى الساكن كرد نهائي." : "This message will be sent to the resident as the final response."}
              </p>
              <div className="bg-white border border-indigo-100 rounded p-3 mb-4 text-sm text-slate-800 whitespace-pre-wrap">
                {note || (lang === "ar" ? "(لم يتم كتابة رسالة)" : "(No message provided)")}
              </div>
              <div className="flex gap-3">
                <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-xs text-white" onClick={() => {
                  if (confirmStatus === "resolved") onUpdate(c.id, "resolved", note);
                  else if (confirmStatus === "rejected") onUpdate(c.id, "rejected", note);
                  else if (confirmStatus === "deferred_to_maintenance") onUpdate(c.id, "deferred_to_maintenance", note);
                  else onUpdate(c.id, confirmStatus, note);
                  setConfirmStatus(null);
                }}>
                  {t(lang, "send") || "Send"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-100" onClick={() => setConfirmStatus(null)}>
                  {t(lang, "back") || "Back to message"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Textarea
                rows={2}
                placeholder={t(lang, "adm_response_note_placeholder")}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="text-xs flex-1"
              />
            </div>
          )}
          {!isClosed && !confirmStatus && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => setConfirmStatus("resolved")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {t(lang, "adm_resolve")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmStatus("rejected")}>
                <XCircle className="h-3.5 w-3.5" /> {t(lang, "adm_comm_reject")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => setConfirmStatus("deferred_to_maintenance")}>
                <Wrench className="h-3.5 w-3.5" /> {t(lang, "adm_comm_defer")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PortalHelpRow({
  ticket,
  onReply,
  onClose,
  busy,
}: {
  ticket: any;
  onReply: (id: number, kind: "reply" | "redirect", reply?: string) => void;
  onClose: (id: number) => void;
  busy: boolean;
}) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(ticket.status === "pending");
  const [reply, setReply] = useState("");
  const closed = ticket.status === "closed";
  const statusClass = ticket.status === "pending"
    ? "bg-amber-100 text-amber-700"
    : ticket.status === "in_progress"
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-700";
  const statusLabel = ticket.status === "pending"
    ? t(lang, "ph_status_pending")
    : ticket.status === "in_progress"
      ? t(lang, "ph_status_in_progress")
      : t(lang, "ph_status_closed");

  async function viewScreenshot() {
    const response = await apiRequest(`/admin/portal-help/${ticket.id}/screenshot-url`);
    window.open(response.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200" data-testid={`portal-help-row-${ticket.id}`}>
      <button
        type="button"
        className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        data-testid={`button-expand-portal-help-${ticket.id}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">#{ticket.id} · {ticket.category}</span>
            <span className="block truncate text-sm font-medium text-slate-900">{ticket.details}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusClass)}>{statusLabel}</span>
            <span className="hidden text-xs text-slate-400 sm:inline">{ticket.submitterUnit || "—"}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 pb-4">
          <div className="pt-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{t(lang, "ph_submitter_role")}:</span> {ticket.submitterRole || "—"} ·
            <span className="ml-1 font-medium text-slate-700">{t(lang, "ph_unit_label")}:</span> {ticket.submitterUnit || "—"}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.details}</p>
          {ticket.screenshotContentType && (
            <Button size="sm" variant="outline" onClick={viewScreenshot} data-testid={`button-view-portal-help-screenshot-${ticket.id}`}>
              {t(lang, "ph_admin_view_screenshot")}
            </Button>
          )}
          {ticket.adminReply && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 whitespace-pre-wrap">{ticket.adminReply}</div>}
          {!closed && (
            <>
              <Textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder={t(lang, "ph_admin_reply_placeholder")} data-testid={`input-portal-help-reply-${ticket.id}`} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!reply.trim() || busy} onClick={() => onReply(ticket.id, "reply", reply)}>{t(lang, "ph_admin_send_reply")}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onReply(ticket.id, "redirect")}>{t(lang, "ph_admin_redirect")}</Button>
                {ticket.status === "in_progress" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(ticket.id)}>{t(lang, "ph_admin_close")}</Button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HoaSettingsForm({
  current,
  onSave,
  saving,
}: {
  current: Record<string, string>;
  onSave: (u: Record<string, string>) => void;
  saving: boolean;
}) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [contactEmail, setContactEmail] = useState(current.contact_email ?? "");
  const [notificationEmail, setNotificationEmail] = useState(current.notification_email ?? "");
  const [hoaName, setHoaName] = useState(current.hoa_name ?? "Madain Village HOA");
  const [hoaPhone, setHoaPhone] = useState(current.hoa_phone ?? "");
  const [securityPhone, setSecurityPhone] = useState(current.security_phone ?? "");
  const [technicalMaintenancePhone, setTechnicalMaintenancePhone] = useState(current.technical_maintenance_phone ?? "");
  const [technicalMaintenanceEmail, setTechnicalMaintenanceEmail] = useState(current.technical_maintenance_email ?? "");
  const [developerPhone, setDeveloperPhone] = useState(current.developer_phone ?? "");
  const [developerEmail, setDeveloperEmail] = useState(current.developer_email ?? "");
  const [guestDayPassPrice, setGuestDayPassPrice] = useState(current.guest_day_pass_price_sar ?? "30");
  const [attentionThresholdDays, setAttentionThresholdDays] = useState(current.admin_attention_threshold_days ?? "2");
  const [overdueThresholdDays, setOverdueThresholdDays] = useState(current.admin_overdue_threshold_days ?? "7");

  // SMTP fields — password is never returned by the server; smtp_pass_set signals a stored password
  const [smtpHost, setSmtpHost] = useState(current.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(current.smtp_port ?? "587");
  const [smtpUser, setSmtpUser] = useState(current.smtp_user ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(current.smtp_secure === "true");
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const passStored = !!current.smtp_pass_set;

  const testEmailMutation = useMutation({
    mutationFn: () => apiRequest("/settings/test-email", { method: "POST" }),
    onSuccess: () => {
      const msg = t(lang, "adm_smtp_test_sent");
      setTestEmailResult({ ok: true, msg });
      toast({ title: msg });
    },
    onError: (e: any) => {
      const msg = e.message || t(lang, "adm_smtp_test_failed");
      setTestEmailResult({ ok: false, msg });
      toast({ title: t(lang, "adm_smtp_test_failed"), description: msg, variant: "destructive" });
    },
  });

  function handleSave() {
    const safeAttentionThreshold = Math.max(1, Number.parseInt(attentionThresholdDays, 10) || 2);
    const safeOverdueThreshold = Math.max(
      safeAttentionThreshold,
      Number.parseInt(overdueThresholdDays, 10) || 7,
    );
    const updates: Record<string, string> = {
      contact_email: contactEmail,
      notification_email: notificationEmail,
      hoa_name: hoaName,
      hoa_phone: hoaPhone,
      security_phone: securityPhone,
      technical_maintenance_phone: technicalMaintenancePhone,
      technical_maintenance_email: technicalMaintenanceEmail,
      developer_phone: developerPhone,
      developer_email: developerEmail,
      guest_day_pass_price_sar: guestDayPassPrice,
      admin_attention_threshold_days: String(safeAttentionThreshold),
      admin_overdue_threshold_days: String(safeOverdueThreshold),
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_secure: smtpSecure ? "true" : "false",
    };
    // Only include password if user typed something new
    if (smtpPass.trim()) updates["smtp_pass"] = smtpPass.trim();
    onSave(updates);
  }

  return (
    <div className="mt-4 space-y-4 max-w-lg">
      <div>
        <Label className="flex items-center gap-1.5 mb-1"><Mail className="h-3.5 w-3.5 text-slate-500" /> {t(lang, "adm_comm_email_label")}</Label>
        <Input
          type="email"
          placeholder="board@madainvillage.com"
          value={contactEmail}
          onChange={e => setContactEmail(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">{t(lang, "adm_comm_email_desc")}</p>
      </div>
      <div>
        <Label className="flex items-center gap-1.5 mb-1"><Mail className="h-3.5 w-3.5 text-slate-500" /> {t(lang, "adm_notif_email_label")}</Label>
        <Input
          type="email"
          placeholder="admin@madainvillage.com"
          value={notificationEmail}
          onChange={e => setNotificationEmail(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">{t(lang, "adm_notif_email_desc")}</p>
      </div>
      <div>
        <Label className="mb-1 block">{t(lang, "adm_hoa_name")}</Label>
        <Input value={hoaName} onChange={e => setHoaName(e.target.value)} />
      </div>
      <div>
        <Label className="mb-1 block">{t(lang, "adm_contact_phone")}</Label>
        <PhoneInput
          value={hoaPhone}
          onChange={setHoaPhone}
          T={(key) => t(lang, key)}
        />
      </div>

      {/* ── Key Contacts ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800">{t(lang, "adm_key_contacts_section")}</p>
        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_security_phone")}</Label>
          <PhoneInput
            value={securityPhone}
            onChange={setSecurityPhone}
            T={(key) => t(lang, key)}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_technical_maintenance_phone")}</Label>
          <PhoneInput
            value={technicalMaintenancePhone}
            onChange={setTechnicalMaintenancePhone}
            T={(key) => t(lang, key)}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_technical_maintenance_email")}</Label>
          <Input
            type="email"
            placeholder="maintenance@madainvillage.com"
            value={technicalMaintenanceEmail}
            onChange={e => setTechnicalMaintenanceEmail(e.target.value)}
            className="bg-white"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_developer_phone")}</Label>
          <PhoneInput
            value={developerPhone}
            onChange={setDeveloperPhone}
            T={(key) => t(lang, key)}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_developer_email")}</Label>
          <Input
            type="email"
            placeholder="developer@madainvillage.com"
            value={developerEmail}
            onChange={e => setDeveloperEmail(e.target.value)}
            className="bg-white"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1 block">{t(lang, "adm_guest_day_pass_price")}</Label>
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="30"
          value={guestDayPassPrice}
          onChange={e => setGuestDayPassPrice(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">{t(lang, "adm_guest_day_pass_price_desc")}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">{t(lang, "adm_attention_thresholds_title")}</p>
        <p className="mt-1 text-xs text-slate-500">{t(lang, "adm_attention_thresholds_desc")}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">{t(lang, "adm_attention_threshold_label")}</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={attentionThresholdDays}
              onChange={(event) => setAttentionThresholdDays(event.target.value)}
              className="bg-white"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">{t(lang, "adm_overdue_threshold_label")}</Label>
            <Input
              type="number"
              min={Math.max(1, Number.parseInt(attentionThresholdDays, 10) || 1)}
              step="1"
              value={overdueThresholdDays}
              onChange={(event) => setOverdueThresholdDays(event.target.value)}
              className="bg-white"
            />
          </div>
        </div>
      </div>

      {/* ── SMTP Section ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">{t(lang, "adm_smtp_title")}</span>
        </div>
        <p className="text-xs text-slate-500">{t(lang, "adm_smtp_desc")}</p>

        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <div>
            <Label className="mb-1 block text-xs">{t(lang, "adm_smtp_host")}</Label>
            <Input
              placeholder="smtp.gmail.com"
              value={smtpHost}
              onChange={e => setSmtpHost(e.target.value)}
              className="bg-white"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">{t(lang, "adm_smtp_port")}</Label>
            <Input
              type="number"
              placeholder="587"
              value={smtpPort}
              onChange={e => setSmtpPort(e.target.value)}
              className="bg-white"
            />
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_smtp_user")}</Label>
          <Input
            type="email"
            placeholder="noreply@madainvillage.com"
            value={smtpUser}
            onChange={e => setSmtpUser(e.target.value)}
            className="bg-white"
          />
        </div>

        <div>
          <Label className="mb-1 block text-xs">{t(lang, "adm_smtp_pass")}</Label>
          <Input
            type="password"
            placeholder={passStored ? t(lang, "adm_smtp_pass_placeholder") : ""}
            value={smtpPass}
            onChange={e => setSmtpPass(e.target.value)}
            className="bg-white"
            autoComplete="new-password"
          />
          {passStored && !smtpPass && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className="text-green-600">●</span> {t(lang, "adm_smtp_pass_placeholder")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="smtp-secure"
            checked={smtpSecure}
            onCheckedChange={setSmtpSecure}
          />
          <Label htmlFor="smtp-secure" className="text-xs cursor-pointer">{t(lang, "adm_smtp_secure")}</Label>
        </div>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => { setTestEmailResult(null); testEmailMutation.mutate(); }}
            disabled={testEmailMutation.isPending || !smtpHost}
          >
            {testEmailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {testEmailMutation.isPending ? t(lang, "adm_smtp_testing") : t(lang, "adm_smtp_test")}
          </Button>
          {testEmailResult && (
            <span className={cn("flex items-center gap-1 text-xs font-medium", testEmailResult.ok ? "text-green-600" : "text-red-600")}>
              {testEmailResult.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              {testEmailResult.msg}
            </span>
          )}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Settings className="h-4 w-4" />
        {saving ? t(lang, "adm_saving") : t(lang, "adm_save_settings")}
      </Button>
    </div>
  );
}

// ── Waha Pass credential status badge ─────────────────────────────────────────
// ── Waha Pass admin section ─────────────────────────────────────────────────
const WAHA_PAGE_SIZE = 20;

function WahaPassSection({
  apps, users, onApprove, onReject, onRevoke, approving, rejecting, revoking,
}: {
  apps: any[];
  users: any[];
  onApprove: (id: number, reviewNote?: string) => void;
  onReject: (id: number, reviewNote: string) => void;
  onRevoke: (id: number, credentialId: number, reason: string) => void;
  approving: boolean;
  rejecting: boolean;
  revoking: boolean;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const [unitSearch, setUnitSearch] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [evPage, setEvPage] = useState(0);

  // Build actor name lookup from the already-loaded users list
  const actorMap = new Map<number, string>(
    users.map((u: any) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || `#${u.id}`,
    ])
  );

  const pendingApps = apps.filter(a => a.status === "pending_review");
  const activeApps  = apps.filter(a => a.status === "active");

  // Unit View — apps + portal users matching search
  const unitApps = unitQuery
    ? apps.filter(a => (a.applicant?.unitNumber ?? "").toLowerCase().includes(unitQuery.toLowerCase()))
    : [];
  const unitUsers = unitQuery
    ? users.filter((u: any) => (u.unitNumber ?? "").toLowerCase().includes(unitQuery.toLowerCase()))
    : [];

  // All credential holder IDs across matching apps (for Unit View tagging)
  const credHolderIds = new Set<number>(
    unitApps.flatMap((a: any) =>
      (a.credentials ?? [])
        .filter((c: any) => c.status === "active")
        .map((c: any) => c.heldByUserId)
        .filter(Boolean)
    )
  );

  // All events across all applications, sorted newest-first
  const allEvents = apps
    .flatMap((a: any) => (a.events ?? []).map((e: any) => ({ ...e, unitNumber: formatCanonicalUnit(a.applicant?.unitNumber), appId: a.id })))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalEvPages = Math.ceil(allEvents.length / WAHA_PAGE_SIZE);
  const pagedEvents  = allEvents.slice(evPage * WAHA_PAGE_SIZE, (evPage + 1) * WAHA_PAGE_SIZE);

  const EVENT_LABEL: Record<string, string> = {
    applied:             "waha_event_applied",
    approved:            "waha_event_approved",
    revoked:             "waha_event_revoked",
    lost_reported:       "waha_event_lost_reported",
    replacement_paid:    "waha_event_replacement_paid",
    replacement_issued:  "waha_event_replacement_issued",
    resident_archived:   "waha_event_resident_archived",
  };

  const EVENT_COLOR: Record<string, string> = {
    applied:            "bg-blue-100 text-blue-700",
    approved:           "bg-green-100 text-green-700",
    revoked:            "bg-red-100 text-red-700",
    lost_reported:      "bg-amber-100 text-amber-700",
    replacement_paid:   "bg-purple-100 text-purple-700",
    replacement_issued: "bg-teal-100 text-teal-700",
    resident_archived:  "bg-slate-100 text-slate-600",
  };

  const REVOKE_REASONS = [
    { value: "admin_decision", key: "waha_reason_admin_decision" },
    { value: "lost",           key: "waha_reason_lost" },
    { value: "stolen",         key: "waha_reason_stolen" },
    { value: "damaged",        key: "waha_reason_damaged" },
    { value: "move_out",       key: "waha_reason_move_out" },
  ];

  return (
    <Section title={`${T("waha_section")} (${T("waha_pending_apps")}: ${pendingApps.length})`} defaultOpen={pendingApps.length > 0}>
      <div className="mt-3 space-y-5">

        {/* ── Pending Applications ─────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-teal-600" />
            {T("waha_pending_apps")} ({pendingApps.length})
          </h3>
          {pendingApps.length === 0 && (
            <p className="text-slate-400 text-sm py-2">{T("waha_no_pending")}</p>
          )}
          {pendingApps.map(app => (
            <WahaPendingRow key={app.id} app={app} onApprove={onApprove} onReject={onReject} approving={approving} rejecting={rejecting} />
          ))}
        </div>

        {/* ── Active Passes ─────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            {T("waha_active_passes")} ({activeApps.length})
          </h3>
          {activeApps.length === 0 && (
            <p className="text-slate-400 text-sm py-2">{T("waha_no_active")}</p>
          )}
          {activeApps.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_unit")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_track")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_cred_index")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_pass_no")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_holder")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_issued")}</th>
                    <th className="px-3 py-2 font-medium text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeApps.flatMap((app: any) =>
                    (app.credentials ?? []).map((cred: any) => (
                      <WahaCredRow
                        key={cred.id}
                        app={app}
                        cred={cred}
                        reasons={REVOKE_REASONS}
                        onRevoke={onRevoke}
                        revoking={revoking}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Unit View ─────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            {T("waha_unit_view")}
          </h3>
          <div className="flex gap-2 mb-3">
            <select
              className="h-8 text-xs max-w-xs border border-slate-200 rounded px-2 bg-white"
              value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
            >
              <option value="">{T("waha_unit_search_placeholder")}</option>
              {SELECTABLE_UNIT_REFERENCES.map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setUnitQuery(unitSearch)}>
              <Search className="h-3 w-3" />{T("waha_unit_search_btn")}
            </Button>
          </div>
          {unitQuery && unitApps.length === 0 && unitUsers.length === 0 && (
            <p className="text-slate-400 text-sm py-1">{T("waha_no_unit_found")}</p>
          )}
          {unitApps.map(app => (
            <div key={app.id} className="border border-slate-100 rounded-lg p-3 mb-2 text-xs space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{T("adm_unit_label")} {formatCanonicalUnit(app.applicant?.unitNumber)}</span>
                <span className={cn("px-2 py-0.5 rounded-full font-medium",
                  app.status === "pending_review" ? "bg-amber-100 text-amber-700"
                  : app.status === "active" ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700")}>
                  {app.status === "pending_review" ? T("waha_status_pending_review") : app.status === "active" ? T("waha_status_active") : T("waha_status_revoked")}
                </span>
                <span className="text-slate-400">
                  {app.occupancyTrack === "owner" ? T("waha_track_owner") : T("waha_track_tenant")}
                </span>
              </div>

              {/* Approved residents on this unit (portal accounts) */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">{T("waha_unit_residents")}</p>
                {unitUsers.length === 0
                  ? <p className="text-slate-400 text-xs">{T("waha_no_residents_on_unit")}</p>
                  : unitUsers.map((u: any) => {
                    const isHolder = credHolderIds.has(u.id);
                    const uName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                    return (
                      <div key={u.id} className="flex items-center gap-2 py-0.5">
                        <span className="text-slate-700">{uName}</span>
                        <span className="text-slate-400 text-[10px]">({u.role})</span>
                        {isHolder && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                            {T("waha_credential_holder")}
                          </span>
                        )}
                      </div>
                    );
                  })
                }
              </div>

              {/* Credential holders from this application */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">{T("waha_pass_no")}</p>
                {(app.credentials ?? []).map((cred: any) => (
                  <div key={cred.id} className="flex items-center gap-2 py-0.5">
                    <span className="font-mono text-slate-700">{cred.passNumber ?? "—"}</span>
                    <span className="text-slate-400">{T("waha_cred_label")} {cred.credentialIndex}</span>
                    <WahaCredBadge status={cred.status} />
                  </div>
                ))}
              </div>

              {/* Pass history for this unit */}
              {(app.events ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">{T("waha_audit_log")}</p>
                  {(app.events as any[])
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((ev: any) => {
                      const evKey = EVENT_LABEL[ev.eventType] ?? ev.eventType;
                      const evCls = EVENT_COLOR[ev.eventType] ?? "bg-slate-100 text-slate-600";
                      const actor = ev.actorUserId ? (actorMap.get(ev.actorUserId) ?? `#${ev.actorUserId}`) : "—";
                      return (
                        <div key={ev.id} className="flex items-start gap-2 py-0.5 text-slate-600">
                          <span className="text-slate-400 whitespace-nowrap shrink-0">
                            {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(ev.createdAt))}
                          </span>
                          <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0", evCls)}>{T(evKey)}</span>
                          <span className="text-slate-400 shrink-0">{actor}</span>
                          <span className="text-slate-500 truncate">{ev.notes ?? ""}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Audit Log ─────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            {T("waha_audit_log")} ({allEvents.length})
          </h3>
          {allEvents.length === 0 && (
            <p className="text-slate-400 text-sm py-2">{T("waha_no_events")}</p>
          )}
          {allEvents.length > 0 && (
            <>
              <div className="rounded-lg border border-slate-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_date")}</th>
                      <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_unit")}</th>
                      <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_event")}</th>
                      <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_actor")}</th>
                      <th className="px-3 py-2 text-start font-medium text-slate-500">{T("waha_col_notes")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pagedEvents.map((ev: any) => {
                      const evKey = EVENT_LABEL[ev.eventType] ?? ev.eventType;
                      const evCls = EVENT_COLOR[ev.eventType] ?? "bg-slate-100 text-slate-600";
                      const actor = ev.actorUserId ? (actorMap.get(ev.actorUserId) ?? `#${ev.actorUserId}`) : "—";
                      return (
                        <tr key={ev.id} className="text-slate-700">
                          <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                            {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ev.createdAt))}
                          </td>
                          <td className="px-3 py-2">{formatCanonicalUnit(ev.unitNumber)}</td>
                          <td className="px-3 py-2">
                            <span className={cn("px-2 py-0.5 rounded-full font-medium", evCls)}>
                              {T(evKey)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{actor}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{ev.notes ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalEvPages > 1 && (
                <div className="flex items-center justify-between mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={evPage === 0}
                    onClick={() => setEvPage(p => p - 1)}
                  >
                    {T("waha_page_prev")}
                  </Button>
                  <span className="text-xs text-slate-400">
                    {T("waha_audit_page").replace("{page}", String(evPage + 1)).replace("{total}", String(totalEvPages))}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={evPage >= totalEvPages - 1}
                    onClick={() => setEvPage(p => p + 1)}
                  >
                    {T("waha_page_next")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </Section>
  );
}

// ── Waha Pass pending row ───────────────────────────────────────────────────
function WahaPendingRow({
  app, onApprove, onReject, approving, rejecting,
}: {
  app: any;
  onApprove: (id: number, reviewNote?: string) => void;
  onReject: (id: number, reviewNote: string) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const [note, setNote] = useState("");
  const applicantName = [app.applicant?.firstName, app.applicant?.lastName].filter(Boolean).join(" ") || app.applicant?.email || "—";
  const secondName = app.secondResident
    ? [app.secondResident.firstName, app.secondResident.lastName].filter(Boolean).join(" ") || T("waha_unassigned")
    : T("waha_unassigned");

  return (
    <div className="border border-slate-100 rounded-lg p-3 mb-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              {T("waha_status_pending_review")}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {app.occupancyTrack === "owner" ? T("waha_track_owner") : T("waha_track_tenant")}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900 mt-1">
            {T("adm_unit_label")} {formatCanonicalUnit(app.applicant?.unitNumber)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {T("waha_applicant")}: <span className="text-slate-700">{applicantName}</span>
          </p>
          <p className="text-xs text-slate-500">
            {T("waha_second_resident")}: <span className="text-slate-700">{secondName}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {T("waha_submitted")}: {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(app.createdAt))}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Input
          className="h-7 text-xs flex-1 min-w-0"
          placeholder={T("waha_review_note_placeholder")}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <Button
          size="sm"
          className="h-7 text-xs whitespace-nowrap bg-green-600 hover:bg-green-700 shrink-0"
          disabled={approving}
          onClick={() => onApprove(app.id, note || undefined)}
        >
          {approving ? <><Loader2 className="h-3 w-3 animate-spin me-1" />{T("waha_approving")}</> : <><CheckCircle2 className="h-3 w-3 me-1" />{T("waha_approve_btn")}</>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs whitespace-nowrap text-red-500 border-red-300 shrink-0"
          disabled={rejecting}
          onClick={() => onReject(app.id, note)}
        >
          {rejecting ? <><Loader2 className="h-3 w-3 animate-spin me-1" />{T("waha_rejecting")}</> : <><XCircle className="h-3 w-3 me-1" />{T("waha_reject_btn")}</>}
        </Button>
      </div>
    </div>
  );
}

// ── Waha Pass credential row (in active table) ─────────────────────────────
function WahaCredRow({
  app, cred, reasons, onRevoke, revoking,
}: {
  app: any;
  cred: any;
  reasons: { value: string; key: string }[];
  onRevoke: (id: number, credentialId: number, reason: string) => void;
  revoking: boolean;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const [revokeReason, setRevokeReason] = useState("admin_decision");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const holderName = cred.credentialIndex === 1
    ? ([app.applicant?.firstName, app.applicant?.lastName].filter(Boolean).join(" ") || app.applicant?.email || "—")
    : (app.secondResident
        ? [app.secondResident.firstName, app.secondResident.lastName].filter(Boolean).join(" ") || T("waha_unassigned")
        : T("waha_unassigned"));

  return (
    <>
      <tr className="text-slate-700">
        <td className="px-3 py-2">{formatCanonicalUnit(app.applicant?.unitNumber)}</td>
        <td className="px-3 py-2 capitalize">{app.occupancyTrack === "owner" ? T("waha_track_owner") : T("waha_track_tenant")}</td>
        <td className="px-3 py-2">{cred.credentialIndex}</td>
        <td className="px-3 py-2 font-mono">{cred.passNumber ?? "—"}</td>
        <td className="px-3 py-2">{holderName}</td>
        <td className="px-3 py-2 text-slate-400">
          {cred.createdAt ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(cred.createdAt)) : "—"}
        </td>
        <td className="px-3 py-2">
          <WahaCredActionCell
            status={cred.status}
            onRequestRevoke={() => setConfirmOpen(true)}
          />
        </td>
      </tr>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{T("waha_revoke_confirm")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{T("waha_revoke_reason")}</Label>
              <select
                className="mt-1 w-full text-sm border rounded px-2 py-1.5 bg-white"
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
              >
                {reasons.map(r => (
                  <option key={r.value} value={r.value}>{T(r.key)}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              {T("waha_pass_no")}: <span className="font-mono font-medium">{cred.passNumber}</span>
              <br />{T("waha_holder")}: {holderName}
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>{t(lang, "cancel")}</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-xs"
                disabled={revoking}
                onClick={() => { onRevoke(app.id, cred.id, revokeReason); setConfirmOpen(false); }}
              >
                {revoking ? T("waha_revoking") : T("waha_revoke_btn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TitleDeedLink({ verificationId, lang }: { verificationId: number; lang: Lang }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleView = async () => {
    setLoading(true);
    setError(false);
    try {
      const base = getApiBase();
      const token = await getAuthToken();
      const res = await fetch(`${base}/api/unit-verify/${verificationId}/title-deed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
      setUrl(data.url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleView}
      disabled={loading}
      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
    >
      {loading ? t(lang, "common_loading") : t(lang, "adm_view_historical_title_deed")}
      {error && <span className="text-red-500 no-underline ms-1">({t(lang, "common_error")})</span>}
    </button>
  );
}

function VerificationRow({ v, onApprove, onReject }: {
  v: VerificationItem;
  onApprove: (id: number, note: string | undefined, approvalBases: string[], otherText: string | undefined) => void;
  onReject: (id: number, note?: string) => void;
}) {
  const { lang } = useLanguage();
  const [note, setNote] = useState("");
  const [approvalBases, setApprovalBases] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const typeLabel = v.type === "owner_manual" ? t(lang, "adm_owner_manual_label") : t(lang, "adm_tenant_request_label");
  // Numeric Mullak deed numbers are the current claim flow. An uploaded deed is
  // retained solely so an administrator can inspect a historical request.
  const hasCurrentMullakDeedNumber = /^[0-9]{16}$/.test(v.titleDeedNumber ?? "");
  const basisOptions = [
    ...(hasCurrentMullakDeedNumber
      ? [{ value: "mullak_verified", label: t(lang, "deed_number_verified_against_mullak") }]
      : []),
    { value: "known_to_board", label: t(lang, "sg11_known_to_board") },
    { value: "other", label: t(lang, "sg11_other") },
  ];
  const accountSubmittedName = [v.requester?.firstName, v.requester?.lastName]
    .filter(Boolean)
    .join(" ");

  function toggleBasis(value: string) {
    setApprovalBases((current) => current.includes(value)
      ? current.filter((basis) => basis !== value)
      : [...current, value]);
  }

  return (
    <div className="border border-slate-100 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs px-2 py-0.5 rounded-full", v.type === "owner_manual" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700")}>
              {typeLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900">
            <span className="text-xs font-normal text-slate-500 me-1">{t(lang, "adm_account_submitted_owner_name")}:</span>
            {accountSubmittedName || "—"}
            <span className="text-slate-400 font-normal text-xs ms-2">{v.requester?.email}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(lang, "adm_unit_label")} <strong>{v.unit ? formatCanonicalUnit(`${v.unit.building}${v.unit.unitNumber}`) : "—"}</strong>
            {v.nationalId && <> · {t(lang, "adm_id_label")} {v.nationalId}</>}
            {v.ejarReference && <> · {t(lang, "adm_ejar_label")} {v.ejarReference}</>}
          </p>
          {v.mobile && (
            <p className="text-xs text-slate-500 mt-0.5">
              {t(lang, "adm_mobile_label")} <strong>{v.mobile}</strong>
            </p>
          )}
          {v.type === "tenant_request" && (v.ownerNationalId || v.parkingLots) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {v.ownerNationalId && (
                <>{t(lang, "adm_owner_nid_label")} <strong>{v.ownerNationalId}</strong></>
              )}
              {v.ownerNationalId && v.parkingLots && <> · </>}
              {v.parkingLots && (() => {
                try {
                  const lots = JSON.parse(v.parkingLots);
                  if (!Array.isArray(lots) || lots.length === 0) return null;
                  const labels = lots.map((l: any) => {
                    if (typeof l === "string") return l;
                    const bldg = l.building ?? "";
                    const num  = l.lotNumber ?? l.number ?? String(l);
                    return bldg ? `${bldg} – ${num}` : num;
                  }).join(", ");
                  return <>{t(lang, "adm_parking_lots_label")} <strong>{labels}</strong></>;
                } catch { return null; }
              })()}
            </p>
          )}
          {v.type === "owner_manual" && v.parkingLots && (() => {
            try {
              const lots = JSON.parse(v.parkingLots);
              if (!Array.isArray(lots) || lots.length === 0) return null;
              const labels = lots.map((l: any) => {
                if (typeof l === "string") return l;
                const bldg = l.building ?? "";
                const num  = l.lotNumber ?? l.number ?? String(l);
                return bldg ? `${bldg} – ${num}` : num;
              }).join(", ");
              return (
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(lang, "adm_parking_lots_label")} <strong>{labels}</strong>
                </p>
              );
            } catch { return null; }
          })()}
          {v.expiresAt && <p className="text-xs text-slate-400 mt-0.5">{t(lang, "adm_expires_label")} {new Date(v.expiresAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}</p>}
          {v.type === "owner_manual" && hasCurrentMullakDeedNumber && (
            <p className="text-xs text-slate-500 mt-1">
              {t(lang, "sg11_title_deed_number_label") || "Deed Number"}: <strong className="font-mono text-slate-700">{v.titleDeedNumber}</strong>
              <span className="text-slate-400 italic ms-2">({t(lang, "deed_number_verified_against_mullak")})</span>
            </p>
          )}
          {v.type === "owner_manual" && v.titleDeedKey && (
            <TitleDeedLink verificationId={v.id} lang={lang} />
          )}
        </div>
      </div>
      {v.type === "owner_manual" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-slate-700">{t(lang, "sg11_owner_approval_basis")}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {basisOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={approvalBases.includes(option.value)} onChange={() => toggleBasis(option.value)} />
                {option.label}
              </label>
            ))}
          </div>
          {approvalBases.includes("other") && (
            <Input className="h-8 text-xs" placeholder={t(lang, "sg11_other_placeholder")} value={otherText} onChange={e => setOtherText(e.target.value)} />
          )}
          <div className="flex items-start gap-2">
            <Input className="h-8 text-xs flex-1" placeholder={t(lang, "adm_review_note_placeholder")} value={note} onChange={e => setNote(e.target.value)} />
            <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 shrink-0 whitespace-nowrap"
              disabled={approvalBases.length === 0 || (approvalBases.includes("other") && !otherText.trim())}
              onClick={() => onApprove(v.id, note || undefined, approvalBases, otherText.trim() || undefined)}>
            <CheckCircle2 className="h-3.5 w-3.5 me-1" />{t(lang, "adm_approve")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 border-red-200 shrink-0 whitespace-nowrap" onClick={() => onReject(v.id, note || undefined)}>
            <XCircle className="h-3.5 w-3.5 me-1" />{t(lang, "adm_reject")}
          </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
          {t(lang, "adm_tenant_req_owner_action_note")}
        </div>
      )}
    </div>
  );
}

function VerificationHistoryRow({ verification }: { verification: VerificationItem }) {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  let approvalBases: string[] = [];
  try {
    const parsed = verification.approvalBases ? JSON.parse(verification.approvalBases) : [];
    approvalBases = Array.isArray(parsed) ? parsed.filter((basis): basis is string => typeof basis === "string") : [];
  } catch {
    approvalBases = [];
  }
  const labels: Record<string, string> = {
    mullak_verified: T("sg11_mullak_verified"),
    known_to_board: T("sg11_known_to_board"),
    ejar_contract_verified: T("sg11_ejar_contract_verified"),
    tenant_known_to_me: T("sg11_tenant_known_to_me"),
    // Retain a readable audit trail for approvals recorded before this basis
    // was removed from the current owner-approval form.
    title_deed_reviewed: T("sg11_title_deed_reviewed"),
    other: T("sg11_other"),
  };
  const basisText = approvalBases.map((basis) => labels[basis] ?? basis).join(", ");
  const requesterName = [verification.requester?.firstName, verification.requester?.lastName].filter(Boolean).join(" ") || T("sg11_unknown_requester");
  const unitLabel = verification.unit ? formatCanonicalUnit(`${verification.unit.building}${verification.unit.unitNumber}`) : "—";

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{requesterName}</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{T("sg11_approved")}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{T("adm_unit_label")} <strong>{unitLabel}</strong></p>
      <p className="mt-2 text-xs text-slate-700"><strong>{T("sg11_recorded_approval_basis")}:</strong> {basisText || "—"}</p>
      {verification.approvalOtherText && (
        <p className="mt-1 text-xs text-slate-700"><strong>{T("sg11_recorded_other_reason")}:</strong> {verification.approvalOtherText}</p>
      )}
    </div>
  );
}
