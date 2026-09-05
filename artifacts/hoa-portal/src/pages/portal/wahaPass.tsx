import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  KeyRound, Clock, CheckCircle2, XCircle, AlertCircle,
  ShieldAlert, Users, ArrowRight, Loader2,
} from "lucide-react";
import QRCode from "react-qr-code";

// ── Types ────────────────────────────────────────────────────────────────────

type Eligibility = {
  eligible: boolean;
  reason?: string;
  occupancyTrack?: "owner" | "tenant";
  unitId?: number;
  eligibleSecondResidents?: EligibleResident[];
};

type EligibleResident = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  relationship: string | null;
};

type WahaCredential = {
  id: number;
  applicationId: number;
  credentialIndex: 1 | 2;
  verificationToken: string;
  passNumber: string | null;
  holderName: string;
  status: "active" | "lost" | "stolen" | "damaged" | "revoked";
  heldByUserId: number | null;
  createdAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  chargeId: string | null;
  paymentUrl: string | null;
};

type WahaApp = {
  id: number;
  unitId: number;
  applicantUserId: number;
  secondResidentId: number | null;
  occupancyTrack: "owner" | "tenant";
  status: "pending_review" | "active" | "rejected" | "revoked";
  reviewNote: string | null;
  createdAt: string;
  applicant?: { id: number; firstName: string | null; lastName: string | null; email: string; unitNumber: string | null };
  secondResident?: { id: number; firstName: string; lastName: string; email: string | null } | null;
  credentials?: WahaCredential[];
  isApplicant: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function credStatusColor(status: WahaCredential["status"]): string {
  switch (status) {
    case "active":  return "bg-green-500/20 text-green-200 border-green-500/30";
    case "revoked": return "bg-red-500/20 text-red-200 border-red-500/30";
    case "lost":    return "bg-amber-500/20 text-amber-200 border-amber-500/30";
    case "stolen":  return "bg-red-500/20 text-red-200 border-red-500/30";
    case "damaged": return "bg-orange-500/20 text-orange-200 border-orange-500/30";
    default:        return "bg-slate-500/20 text-slate-200 border-slate-500/30";
  }
}

function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Branded Waha Pass Card ────────────────────────────────────────────────────

function WahaPassCard({
  cred,
  unitNumber,
  label,
  viewOnly,
}: {
  cred: WahaCredential;
  unitNumber: string | null;
  label: string;
  viewOnly?: boolean;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const baseUrl = window.location.origin;
  const verifyUrl = `${baseUrl}/api/verify/waha?token=${cred.verificationToken}`;
  const isActive = cred.status === "active";

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-xl select-none"
      style={{ background: "linear-gradient(135deg, #0F4442 0%, #1a6560 60%, #0c3a38 100%)" }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-amber-400 font-bold uppercase">
            Madain Village
          </p>
          <p className="text-white font-black text-lg leading-tight tracking-wide">
            WAHA PASS
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <KeyRound className="h-7 w-7 text-amber-400" />
          <span
            className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
              credStatusColor(cred.status),
            )}
          >
            {T(`waha_status_${cred.status}`) || cred.status}
          </span>
        </div>
      </div>

      {/* Gold separator */}
      <div className="mx-6 h-px bg-amber-400/50 mb-4" />

      {/* Body */}
      <div className="px-6 pb-4 flex gap-5">
        {/* QR */}
        <div className="shrink-0">
          <div className="bg-white rounded-xl p-2 w-24 h-24 flex items-center justify-center">
            {isActive ? (
              <QRCode value={verifyUrl} size={80} />
            ) : (
              <div className="w-20 h-20 flex items-center justify-center">
                <XCircle className="h-10 w-10 text-red-300" />
              </div>
            )}
          </div>
          {!isActive && (
            <p className="text-[9px] text-red-300 text-center mt-1 font-medium uppercase tracking-wide">
              {T(`waha_status_${cred.status}`) || cred.status}
            </p>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-[10px] text-amber-400/70 uppercase tracking-wide">{T("waha_pass_no")}</p>
            <p className="text-white font-bold font-mono text-sm tracking-wider">
              {cred.passNumber ?? "—"}
            </p>
          </div>
          {unitNumber && (
            <div>
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wide">{T("waha_card_unit")}</p>
              <p className="text-white text-sm font-medium">{displayUnitReference(unitNumber)}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-amber-400/70 uppercase tracking-wide">{T("waha_card_holder")}</p>
            <p className="text-white text-sm font-medium truncate">{cred.holderName || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-amber-400/70 uppercase tracking-wide">{T("waha_card_issued")}</p>
            <p className="text-white/80 text-xs">{formatDate(cred.createdAt, lang)}</p>
          </div>
        </div>
      </div>

      {/* Credential label strip */}
      <div className="mx-6 mb-1 flex items-center justify-between">
        <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-widest">{label}</span>
        {viewOnly && (
          <span className="text-[10px] text-slate-400 italic">{T("waha_card_view_only")}</span>
        )}
      </div>

      {/* Gold separator */}
      <div className="mx-6 h-px bg-amber-400/30 mb-3" />

      {/* Disclaimer */}
      <div className="px-6 pb-5">
        <p className="text-[10px] text-white/50 leading-relaxed">{T("waha_card_disclaimer")}</p>
      </div>
    </div>
  );
}

// ── Lost / Report Dialog ──────────────────────────────────────────────────────

function LostDialog({
  app,
  cred,
  onSuccess,
}: {
  app: WahaApp;
  cred: WahaCredential;
  onSuccess: () => void;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"lost" | "stolen" | "damaged">("lost");
  const [ack, setAck] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/waha-pass/${app.id}/report-lost`, {
        method: "POST",
        body: JSON.stringify({ credentialId: cred.id, reason }),
      }),
    onSuccess: () => {
      setOpen(false);
      toast({ title: T("waha_report_success_toast") });
      onSuccess();
    },
    onError: (e: any) =>
      toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
        onClick={() => { setOpen(true); setAck(false); }}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {T("waha_lost_btn")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              {T("waha_lost_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 leading-relaxed">
              {T("waha_lost_disclaimer")}
            </div>

            {/* Acknowledgment */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={ack}
                onChange={e => setAck(e.target.checked)}
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                {T("waha_lost_ack")}
              </span>
            </label>

            {/* Reason */}
            <div>
              <Label className="text-sm">{T("waha_lost_reason_label")}</Label>
              <div className="mt-2 flex gap-2">
                {(["lost", "stolen", "damaged"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-sm font-medium transition-colors",
                      reason === r
                        ? "border-amber-500 bg-amber-50 text-amber-800"
                        : "border-slate-200 hover:border-slate-300 text-slate-600",
                    )}
                  >
                    {T(`waha_lost_reason_${r}`)}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              disabled={!ack || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin me-2" />{T("waha_lost_confirming")}</>
              ) : T("waha_lost_confirm_btn")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Assign Second Resident Dialog ─────────────────────────────────────────────

function AssignSecondDialog({
  app,
  eligibleResidents,
  onSuccess,
}: {
  app: WahaApp;
  eligibleResidents: EligibleResident[];
  onSuccess: () => void;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/waha-pass/${app.id}/assign-second`, {
        method: "POST",
        body: JSON.stringify({ secondResidentId: Number(selectedId) }),
      }),
    onSuccess: () => {
      setOpen(false);
      toast({ title: T("waha_assign_success_toast") });
      onSuccess();
    },
    onError: (e: any) =>
      toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  if (eligibleResidents.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5 text-teal-700 border-teal-300 hover:bg-teal-50"
        onClick={() => { setOpen(true); setSelectedId(""); }}
      >
        <Users className="h-3.5 w-3.5" />
        {T("waha_assign_second_btn")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-600" />
              {T("waha_assign_second_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-slate-600">{T("waha_assign_second_body")}</p>

            <div>
              <Label className="text-sm mb-1 block">{T("waha_apply_cred2_label")}</Label>
              <select
                className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
              >
                <option value="">{T("waha_assign_second_select")}</option>
                {eligibleResidents.map(r => (
                  <option key={r.id} value={String(r.id)}>
                    {r.firstName} {r.lastName}
                  </option>
                ))}
              </select>
            </div>

            <Button
              className="w-full"
              disabled={!selectedId || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin me-2" />{T("waha_assign_second_saving")}</>
              ) : T("waha_assign_second_btn")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Replacement Pay Button ─────────────────────────────────────────────────────

function ReplacementPayButton({ app, cred }: { app: WahaApp; cred: WahaCredential }) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const result = await apiRequest(`/waha-pass/${app.id}/replacement-pay`, {
        method: "POST",
        body: JSON.stringify({ credentialId: cred.id }),
      });
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (e: any) {
      toast({ title: T("common_error"), description: e.message, variant: "destructive" });
      setLoading(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-900">{T("waha_replacement_title")}</p>
          <p className="text-xs text-amber-700 mt-0.5">{T("waha_replacement_body")}</p>
        </div>
      </div>
      <Button
        className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
        onClick={handlePay}
        disabled={loading}
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" />{T("waha_replacement_paying")}</>
          : T("waha_replacement_pay_btn")}
      </Button>
    </div>
  );
}

// ── Application Form ──────────────────────────────────────────────────────────

function ApplicationForm({
  eligibility,
  user,
  onSubmitted,
}: {
  eligibility: Eligibility;
  user: any;
  onSubmitted: () => void;
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [secondResidentId, setSecondResidentId] = useState<string>("");

  const residents = eligibility.eligibleSecondResidents ?? [];
  const selectedResident = residents.find(r => String(r.id) === secondResidentId) ?? null;
  const selfName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "—";

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/waha-pass/apply", {
        method: "POST",
        body: JSON.stringify(secondResidentId ? { secondResidentId: Number(secondResidentId) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["waha-mine"] });
      qc.invalidateQueries({ queryKey: ["waha-eligibility"] });
      onSubmitted();
    },
    onError: (e: any) =>
      toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">{T("waha_apply_title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{T("waha_apply_subtitle")}</p>
      </div>

      {/* Step 1 — Form */}
      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          {/* Credential 1 */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-1 block">
              {T("waha_apply_cred1_label")}
            </Label>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <span className="text-teal-700 text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{selfName}</p>
                <p className="text-xs text-slate-400">{T("waha_track_" + (eligibility.occupancyTrack ?? "owner"))}</p>
              </div>
            </div>
          </div>

          {/* Credential 2 */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-1 block">
              {T("waha_apply_cred2_label")}
            </Label>
            <p className="text-xs text-slate-400 mb-2">{T("waha_apply_cred2_hint")}</p>
            <select
              className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm"
              value={secondResidentId}
              onChange={e => setSecondResidentId(e.target.value)}
            >
              <option value="">{T("waha_apply_cred2_unassigned_opt")}</option>
              {residents.map(r => (
                <option key={r.id} value={String(r.id)}>
                  {r.firstName} {r.lastName}
                </option>
              ))}
            </select>
          </div>

          <Button className="w-full gap-2" onClick={() => setStep(2)}>
            {T("waha_apply_review_title")} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2 — Review */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <button onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-slate-600">
            {T("waha_apply_back")}
          </button>

          <h3 className="text-base font-semibold text-slate-800">{T("waha_apply_review_title")}</h3>

          {/* Summary */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <span className="text-teal-700 text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{T("waha_apply_cred1_label")}</p>
                <p className="text-sm font-medium text-slate-800">{selfName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <span className="text-amber-700 text-xs font-bold">2</span>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{T("waha_apply_cred2_label")}</p>
                <p className="text-sm font-medium text-slate-800">
                  {selectedResident
                    ? `${selectedResident.firstName} ${selectedResident.lastName}`
                    : T("waha_unassigned")}
                </p>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin me-2" />{T("waha_apply_submitting")}</>
            ) : T("waha_apply_submit_btn")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Active Pass View ──────────────────────────────────────────────────────────

function ActivePassView({
  app,
  eligibleResidents,
}: {
  app: WahaApp;
  eligibleResidents: EligibleResident[];
}) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const qc = useQueryClient();

  const credentials = app.credentials ?? [];
  const cred1 = credentials.find(c => c.credentialIndex === 1) ?? null;
  const cred2 = credentials.find(c => c.credentialIndex === 2) ?? null;

  const unitNumber = app.applicant?.unitNumber ?? null;

  const visibleCreds = app.isApplicant ? credentials : credentials.filter(c => c.credentialIndex === 2);
  const cred2Unassigned =
    app.isApplicant &&
    cred2 &&
    (cred2.holderName === "Unassigned" || !app.secondResidentId);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["waha-mine"] });
    qc.invalidateQueries({ queryKey: ["waha-eligibility"] });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Status banner */}
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">{T("waha_status_active")}</p>
          <p className="text-xs text-green-600 mt-0.5">
            {T("waha_issued")}: {formatDate(app.createdAt, lang)}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className={cn("grid gap-4", app.isApplicant && cred1 && cred2 ? "md:grid-cols-2" : "max-w-sm mx-auto")}>
        {visibleCreds.map(cred => (
          <div key={cred.id} className="space-y-3">
            <WahaPassCard
              cred={cred}
              unitNumber={unitNumber}
              label={cred.credentialIndex === 1 ? T("waha_card_cred1") : T("waha_card_cred2")}
              viewOnly={!app.isApplicant || cred.credentialIndex === 2}
            />

            {/* Actions — only for applicant, only for active credentials */}
            {app.isApplicant && cred.status === "active" && (
              <div className="flex justify-end">
                <LostDialog app={app} cred={cred} onSuccess={invalidate} />
              </div>
            )}

            {/* Replacement payment — credential reported lost/stolen/damaged */}
            {app.isApplicant && (cred.status === "lost" || cred.status === "stolen" || cred.status === "damaged") && (
              <ReplacementPayButton app={app} cred={cred} />
            )}
          </div>
        ))}
      </div>

      {/* Assign second resident (unassigned Cred 2) */}
      {cred2Unassigned && eligibleResidents.length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-teal-800">{T("waha_assign_second_title")}</p>
              <p className="text-xs text-teal-700 mt-0.5">{T("waha_assign_second_body")}</p>
            </div>
          </div>
          <AssignSecondDialog
            app={app}
            eligibleResidents={eligibleResidents}
            onSuccess={invalidate}
          />
        </div>
      )}
    </div>
  );
}

// ── Status Cards ──────────────────────────────────────────────────────────────

function PendingCard() {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{T("waha_pending_title")}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">{T("waha_pending_body")}</p>
        </div>
      </div>
    </div>
  );
}

function RejectedCard({ app }: { app: WahaApp }) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white border border-red-100 rounded-2xl p-8 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{T("waha_rejected_title")}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">{T("waha_rejected_body")}</p>
          {app.reviewNote && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 text-start">
              <span className="font-medium">{T("waha_col_notes")}: </span>{app.reviewNote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RevokedCard({ app }: { app: WahaApp }) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-8 w-8 text-slate-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{T("waha_revoked_title")}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">{T("waha_revoked_body")}</p>
          {app.reviewNote && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 text-start">
              <span className="font-medium">{T("waha_col_notes")}: </span>{app.reviewNote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IneligibleCard({ reason }: { reason: string }) {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);

  let titleKey = "waha_ineligible_unverified_title";
  let bodyKey  = "waha_ineligible_unverified_body";
  let action: React.ReactNode = null;

  if (reason === "opposing_track_active") {
    titleKey = "waha_ineligible_opposing_title";
    bodyKey  = "waha_ineligible_opposing_body";
  } else if (reason === "no_approved_residents") {
    titleKey = "waha_ineligible_no_residents_title";
    bodyKey  = "waha_ineligible_no_residents_body";
    action = (
      <Link href="/portal/residents">
        <Button variant="outline" className="gap-2">
          <Users className="h-4 w-4" />{T("nav_residents")}
        </Button>
      </Link>
    );
  } else {
    action = (
      <Link href="/portal/unit-verification">
        <Button variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" />{T("uv_verify_btn")}
        </Button>
      </Link>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <KeyRound className="h-8 w-8 text-slate-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{T(titleKey)}</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">{T(bodyKey)}</p>
        </div>
        {action && <div className="flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WahaPassPage() {
  const { lang } = useLanguage();
  const T = (k: string) => t(lang, k);
  const { data: user } = useCurrentUser();
  const [submitted, setSubmitted] = useState(false);

  const { data: mine, isLoading: mineLoading } = useQuery<WahaApp | null>({
    queryKey: ["waha-mine"],
    queryFn: () => apiRequest("/waha-pass/mine"),
  });

  const { data: eligibility, isLoading: eligLoading } = useQuery<Eligibility>({
    queryKey: ["waha-eligibility"],
    queryFn: () => apiRequest("/waha-pass/eligibility"),
    enabled: mine === null || mine === undefined,
  });

  // Always fetch user's registered residents so AssignSecondDialog has data
  // even when the user already has an active application (eligibility won't
  // return eligibleSecondResidents in that case).
  const { data: residentsRaw } = useQuery<{ data: EligibleResident[] }>({
    queryKey: ["residents"],
    queryFn: () => apiRequest("/residents?limit=200"),
    enabled: mine?.status === "active" && mine?.isApplicant === true,
  });
  const activeResidents = (residentsRaw?.data ?? []).filter((r: any) => r.status === "active");

  const isLoading = mineLoading || (mine === null && eligLoading);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-[#0F4442] flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{T("waha_page_title")}</h1>
        </div>
        <p className="text-slate-500 text-sm ms-12">{T("waha_page_subtitle")}</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        </div>
      )}

      {/* Existing application */}
      {!isLoading && mine && (
        <>
          {mine.status === "pending_review" && <PendingCard />}
          {mine.status === "rejected" && <RejectedCard app={mine} />}
          {mine.status === "revoked" && <RevokedCard app={mine} />}
          {mine.status === "active" && (
            <ActivePassView
              app={mine}
              eligibleResidents={activeResidents}
            />
          )}
        </>
      )}

      {/* No application */}
      {!isLoading && (mine === null || mine === undefined) && !submitted && eligibility && (
        <>
          {eligibility.eligible ? (
            <ApplicationForm
              eligibility={eligibility}
              user={user}
              onSubmitted={() => setSubmitted(true)}
            />
          ) : (
            <IneligibleCard reason={eligibility.reason ?? "unit_not_verified"} />
          )}
        </>
      )}

      {/* Submitted — waiting for mine to reload */}
      {submitted && (mine === null || mine === undefined) && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        </div>
      )}
    </div>
  );
}
