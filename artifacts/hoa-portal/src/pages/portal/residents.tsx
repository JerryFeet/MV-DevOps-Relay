import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Users, AlertCircle, Trash2, UserCheck, Mail, Copy, XCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { PaginationBar } from "@/components/PaginationBar";
import { PhoneInput } from "@/components/PhoneInput";
import { isPhoneValid } from "@/lib/phoneUtils";

type Resident = {
  id: number; type: string; firstName: string; lastName: string;
  email: string | null; phone: string | null; unitNumber: string;
  relationship: string | null; dateOfBirth: string | null; idNumber: string | null; idNumberIsGuardian: boolean;
  hasPortalAccess: boolean; status: string; createdAt: string;
  isPrimary: boolean;
  invitation: {
    status: "pending" | "accepted" | "revoked";
    invitedEmail: string;
    expiresAt: string | null;
    invitationUrl: string | null;
  } | null;
};

const typeColors: Record<string, string> = {
  owner: "bg-blue-100 text-blue-700",
  tenant: "bg-purple-100 text-purple-700",
  family: "bg-green-100 text-green-700",
};

function getAge(dob: string | null) {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((today.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
}

export function isResidentDateOfBirthValid(value: string, today: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && value <= today;
}

export default function ResidentsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "family", firstName: "", lastName: "", email: "", phone: "",
    relationship: "", dateOfBirth: "", idNumber: "", idNumberIsGuardian: false, hasPortalAccess: false,
    gender: "", reason: "", proofWarningAcknowledged: false,
  });
  const [dobError, setDobError] = useState("");
  const [selfRegistrationOpen, setSelfRegistrationOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");

  const isAdmin = user?.role === "admin";
  const isVerifiedOwner = user?.verificationStatus === "verified_owner";
  const isVerifiedTenant = user?.verificationStatus === "verified_tenant";
  const isVerified = isVerifiedOwner || isVerifiedTenant;
  const canManage = isVerified || isAdmin;
  const selfType = isVerifiedOwner ? "owner" : isVerifiedTenant ? "tenant" : null;

  const [page, setPage] = useState(1);
  const PAGE_LIMIT = 50;
  const { data: result, isLoading } = useQuery<{ data: Resident[]; total: number }>({
    queryKey: ["residents", page],
    queryFn: () => apiRequest(`/residents?page=${page}&limit=${PAGE_LIMIT}`),
  });
  const residents = result?.data ?? [];
  const alreadySelf = selfType
    ? residents.some(r => r.type === selfType && r.status === "active")
    : false;
  const canSelfRegister = !!selfType && !alreadySelf;
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_LIMIT);

  const activeResidentsCount = residents.filter(r => r.status === "active").length;
  const isLimitReached = activeResidentsCount >= 4;

  function resetForm() {
    setForm({ type: "family", firstName: "", lastName: "", email: "", phone: "", relationship: "", dateOfBirth: "", idNumber: "", idNumberIsGuardian: false, hasPortalAccess: false, gender: "", reason: "", proofWarningAcknowledged: false });
    setDobError("");
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!isResidentDateOfBirthValid(form.dateOfBirth, today)) {
        throw new Error(T("res_dob_future_error"));
      }
      return apiRequest("/residents", {
        method: "POST",
        body: JSON.stringify({ ...form, unitNumber: user?.unitNumber ?? "", unitId: user?.unitId }),
      });
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      setOpen(false);
      const wantedInvite = form.hasPortalAccess;
      resetForm();

      if (data && data.status === "pending") {
        toast({ title: T("res_queued_title") || "Request Submitted", description: T("res_queued_desc") || "Your request for an extra resident is pending HOA approval." });
        return;
      }

      if (wantedInvite && data?.invitationSent === false) {
        toast({ title: T("res_added"), description: T("res_invite_failed"), variant: "destructive" });
      } else {
        toast({ title: T("res_added") });
      }
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/residents/${id}/invite`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      toast({ title: T("res_invite_sent") });
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/residents/${id}/invite`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      toast({ title: T("res_invite_revoked") });
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  async function copyInviteLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: T("res_invite_link_copied") });
    } catch {
      toast({ title: T("common_error"), description: url, variant: "destructive" });
    }
  }

  const [deleteDialog, setDeleteDialog] = useState<{ id: number; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Using apiRequest instead of useDeleteResident because we need to dynamically set
  // the Idempotency-Key header per-request, which isn't supported by the generated hook.
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest(`/residents/${id}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": `del-res-${id}-${Date.now()}` },
        body: JSON.stringify({ reason })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      toast({ title: T("res_removed") || "Resident removed" });
      setDeleteDialog(null);
      setDeleteReason("");
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const selfRegisterMutation = useMutation({
    mutationFn: () => apiRequest("/residents/self", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      setSelfRegistrationOpen(false);
      toast({ title: T("res_self_reg_success") });
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const age = form.dateOfBirth ? getAge(form.dateOfBirth) : null;
  const isAdult = age !== null && age >= 18;

  const relationships = [
    t(lang, "res_rel_spouse"),
    t(lang, "res_rel_child"),
    t(lang, "res_rel_parent"),
    t(lang, "res_rel_sibling"),
    t(lang, "res_rel_worker"),
    t(lang, "res_rel_other"),
  ];

  const emailMissingForPortal = form.hasPortalAccess && !form.email.trim();
  const dobIsValid = isResidentDateOfBirthValid(form.dateOfBirth, today);
  const canSubmit =
    !!form.firstName.trim() &&
    !!form.lastName.trim() &&
    !!form.relationship &&
    !!form.gender &&
    dobIsValid &&
    !!form.idNumber.trim() &&
    !!form.phone &&
    isPhoneValid(form.phone) &&
    !emailMissingForPortal &&
    (!isLimitReached || (!!form.reason.trim() && form.proofWarningAcknowledged));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{T("res_title")}</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500 text-sm">{T("res_subtitle")}</p>
            {canManage && (
              <span className={cn("text-xs px-2 py-0.5 rounded-full", isLimitReached ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>
                {activeResidentsCount} / 4
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button onClick={() => setOpen(true)} className="gap-2" disabled={!canManage}>
            <Plus className="h-4 w-4" /> {T("res_add")}
          </Button>
          {canSelfRegister && (
            <Button
              variant="outline"
              className="gap-2 text-sm border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
              onClick={() => setSelfRegistrationOpen(true)}
              disabled={selfRegisterMutation.isPending}
            >
              <UserCheck className="h-4 w-4" />
              {selfRegisterMutation.isPending ? T("common_saving") : T("res_register_self")}
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-900 font-medium text-sm">{T("common_verify_required")}</p>
            <p className="text-amber-700 text-xs mt-0.5">{T("res_verify_msg")}</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <p className="font-medium mb-1">{T("res_info_title")}</p>
        <p className="text-xs">{T("res_info_body")}</p>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">{T("common_loading")}</p>}
      {!isLoading && residents.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{T("res_empty")}</p>
        </div>
      )}

      <div className="space-y-3">
        {residents.filter(r => r.status === "active").map(r => {
          const memberAge = getAge(r.dateOfBirth);
          return (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                {r.firstName[0]}{r.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-medium text-slate-900 text-sm">{r.firstName} {r.lastName}</p>
                  {r.isPrimary && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                      {T("res_primary_occupant") || "Primary"}
                    </span>
                  )}
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", typeColors[r.type] ?? "bg-slate-100 text-slate-600")}>
                    {r.relationship || t(lang, `res_type_${r.type}`) || r.type}
                  </span>
                  {r.hasPortalAccess && <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">{T("res_portal_access")}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {memberAge !== null && <span>{T("res_age")} {memberAge}</span>}
                  {r.idNumber && <span>{r.idNumberIsGuardian ? T("res_guardian_id") : "ID"}: {r.idNumber}</span>}
                  {r.phone && <span>{r.phone}</span>}
                  {r.email && <span>{r.email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5 flex-wrap justify-end">
                {r.hasPortalAccess && r.invitation?.status === "accepted" && (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {T("res_invite_active")}
                  </span>
                )}
                {r.hasPortalAccess && r.invitation?.status === "pending" && r.invitation.invitationUrl && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => copyInviteLink(r.invitation!.invitationUrl!)}>
                    <Copy className="h-3.5 w-3.5" /> {T("res_copy_invite_link")}
                  </Button>
                )}
                {r.hasPortalAccess && r.email && r.invitation?.status !== "accepted" && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => resendInviteMutation.mutate(r.id)} disabled={resendInviteMutation.isPending}>
                    <Mail className="h-3.5 w-3.5" />
                    {resendInviteMutation.isPending ? T("common_saving") : T("res_resend_invite")}
                  </Button>
                )}
                {r.hasPortalAccess && r.invitation && r.invitation.status !== "revoked" && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => revokeInviteMutation.mutate(r.id)} disabled={revokeInviteMutation.isPending}>
                    <XCircle className="h-3.5 w-3.5" />
                    {revokeInviteMutation.isPending ? T("common_saving") : T("res_revoke_invite")}
                  </Button>
                )}
                {r.isPrimary ? (
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 px-2"
                    onClick={() => {
                      toast({
                        title: T("res_primary_remove_title") || "Move Out Required",
                        description: T("res_primary_remove_desc") || "As the primary resident, please submit a move-out permit to vacate the unit.",
                      });
                      setLocation("/portal/permits");
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 px-2"
                    onClick={() => {
                      setDeleteDialog({ id: r.id, name: `${r.firstName} ${r.lastName}` });
                      setDeleteReason("");
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {residents.some(r => r.status === "inactive") && (
        <div className="mt-6">
          <p className="text-xs text-slate-400 font-medium mb-2">{T("res_inactive")}</p>
          {residents.filter(r => r.status === "inactive").map(r => (
            <div key={r.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3 opacity-50">
              <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">{r.firstName[0]}{r.lastName[0]}</div>
              <p className="text-slate-500 text-sm">{r.firstName} {r.lastName}</p>
            </div>
          ))}
        </div>
      )}

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />

      <Dialog open={open} onOpenChange={v => {
        setOpen(v);
        if (!v) resetForm();
      }}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{T("res_add_dialog")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{T("res_relationship")}</Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm mt-1" value={form.relationship}
                onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
                <option value="">{T("res_select_relationship")}</option>
                {relationships.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T("res_first_name")}</Label><Input className="mt-1" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div><Label>{T("res_last_name")}</Label><Input className="mt-1" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div>
              <Label>{T("gender")} <span className="text-red-500">*</span></Label>
              <select className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm mt-1" value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">{T("gender")}</option>
                <option value="male">{T("gender_male")}</option>
                <option value="female">{T("gender_female")}</option>
              </select>
            </div>
            <div>
              <Label>{T("res_dob")} <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                max={today}
                className="mt-1"
                value={form.dateOfBirth}
                aria-invalid={!!dobError}
                aria-describedby={dobError ? "resident-dob-error" : undefined}
                onChange={e => {
                  setForm(f => ({ ...f, dateOfBirth: e.target.value }));
                  setDobError(
                    e.target.value && !isResidentDateOfBirthValid(e.target.value, today)
                      ? T("res_dob_future_error")
                      : "",
                  );
                }}
              />
              {dobError && <p id="resident-dob-error" className="mt-1 text-xs text-red-600" role="alert">{dobError}</p>}
            </div>
            <div>
              <Label>{T("res_id")} <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} />
              {age !== null && age < 18 && (
                <div className="mt-2 rounded-md bg-blue-50 p-2 text-xs text-blue-800">
                  <p>For residents under 18, you may provide the National ID or Iqama number of the registered father or mother.</p>
                  <p dir="rtl" className="mt-1">بالنسبة للمقيمين دون سن 18 عامًا، يمكنك إدخال رقم الهوية الوطنية أو الإقامة للأب أو الأم المسجلين.</p>
                  <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={form.idNumberIsGuardian} onChange={e => setForm(f => ({ ...f, idNumberIsGuardian: e.target.checked }))} />{T("res_guardian_id")}</label>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label>{T("res_phone")} <span className="text-red-500">*</span></Label>
                <PhoneInput
                  className="mt-1"
                  value={form.phone}
                  onChange={canonical => setForm(f => ({ ...f, phone: canonical }))}
                  T={T}
                />
              </div>
              <div><Label>{T("res_email")} <span className="text-slate-400 text-xs">{T("common_optional")}</span></Label><Input type="email" className="mt-1" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>

            {isAdult && (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <Switch checked={form.hasPortalAccess} onCheckedChange={v => setForm(f => ({ ...f, hasPortalAccess: v }))} />
                <div>
                  <Label className="text-indigo-900">{T("res_grant_portal")}</Label>
                  <p className="text-indigo-600 text-xs mt-0.5">{T("res_grant_portal_desc")}</p>
                  {emailMissingForPortal && (
                    <p className="text-red-600 text-xs mt-1">{T("res_invite_email_required")}</p>
                  )}
                </div>
              </div>
            )}

            {isLimitReached && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 text-sm">{T("res_limit_reached_title") || "Household Limit Reached"}</p>
                    <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                      {T("res_limit_reached_desc") || "You have reached the standard limit of 4 household members. Adding another resident requires HOA approval."}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-amber-900">{T("res_limit_reason") || "Reason for extra resident"} <span className="text-red-500">*</span></Label>
                  <Input
                    className="mt-1 bg-white border-amber-300 focus-visible:ring-amber-500"
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder={T("res_limit_reason_ph") || "e.g., newborn, domestic worker..."}
                  />
                </div>

                <label className="flex items-start gap-2 text-sm text-amber-900 bg-white/50 p-2 rounded border border-amber-100 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-amber-600"
                    checked={form.proofWarningAcknowledged}
                    onChange={e => setForm(f => ({ ...f, proofWarningAcknowledged: e.target.checked }))}
                  />
                  <span className="leading-snug">
                    {T("res_limit_proof_warning") || "I understand the HOA may request official documentation (birth certificate, Iqama, etc.) to verify this request."}
                  </span>
                </label>
              </div>
            )}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" data-testid="false-registration-disclaimer">
              <p>{T("res_false_registration_disclaimer_en")}</p>
              <p dir="rtl" className="mt-1">{T("res_false_registration_disclaimer_ar")}</p>
            </div>

            <Button className="w-full" onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !canSubmit}>
              {createMutation.isPending ? T("common_saving") : T("res_add_to_household")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selfRegistrationOpen} onOpenChange={setSelfRegistrationOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T("res_register_self")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" data-testid="self-false-registration-disclaimer">
              <p>{T("res_false_registration_disclaimer_en")}</p>
              <p dir="rtl" className="mt-1">{T("res_false_registration_disclaimer_ar")}</p>
            </div>
            <Button
              className="w-full"
              onClick={() => selfRegisterMutation.mutate()}
              disabled={selfRegisterMutation.isPending}
            >
              {selfRegisterMutation.isPending ? T("common_saving") : T("res_register_self")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{T("res_remove_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              {T("res_remove_confirm")} <strong>{deleteDialog?.name}</strong>?
            </p>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>{T("adm_reason_label") || "Reason (recorded for audit)"} <span className="text-red-500">*</span></Label>
                <Input
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={T("adm_reason_placeholder") || "Enter reason..."}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setDeleteDialog(null)}>{T("cancel")}</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending || (isAdmin && !deleteReason.trim())}
                onClick={() => {
                  if (deleteDialog) {
                    deleteMutation.mutate({
                      id: deleteDialog.id,
                      reason: isAdmin ? deleteReason.trim() : "primary_resident_removal"
                    });
                  }
                }}
              >
                {deleteMutation.isPending ? T("common_saving") : T("delete")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
