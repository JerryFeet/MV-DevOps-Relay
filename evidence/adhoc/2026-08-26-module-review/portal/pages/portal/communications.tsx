import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, type AppUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { useState } from "react";
import { MessageSquare, AlertCircle, Lightbulb, Clock, CheckCircle, Eye, Send, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";

// Standard bilingual reply bodies — must match the wording sent by the API server
// (artifacts/api-server/src/routes/communications.ts: REJECT_BODY / DEFER_BODY)
export const COMM_REJECT_BODY =
  "Dear sender, thank you for contacting us. This request is not within the responsibility of the owner association.\n\nعزيزي المُرسِل، شكراً لتواصلك معنا. هذا الطلب ليس ضمن مسؤولية جمعية الملاك.";

export const COMM_DEFER_BODY =
  "Dear sender, thank you for contacting us. Please contact the official channels for maintenance requests.\n\nعزيزي المُرسِل، شكراً لتواصلك معنا. يرجى التواصل مع القنوات الرسمية لطلبات الصيانة.";

interface UnitData {
  building: string;
  unitNumber: string;
}

function SubmitForm({ onSuccess, user }: { onSuccess: () => void; user: AppUser }) {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const [form, setForm] = useState({ type: "complaint" as "complaint" | "suggestion", subject: "", body: "" });

  const { data: unit } = useQuery<UnitData | null>({
    queryKey: ["my-unit"],
    queryFn: () => apiRequest("/units"),
  });

  const displayBuilding = unit?.building ?? null;
  const displayApartment = unit?.unitNumber ?? null;

  const TYPE_CONFIG = {
    complaint: { label: T("comm_complaint"), icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    suggestion: { label: T("comm_suggestion"), icon: Lightbulb, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  };

  const mutation = useMutation({
    mutationFn: () => apiRequest("/communications", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      toast({ title: T("comm_submit_success") });
      setForm({ type: "complaint", subject: "", body: "" });
      onSuccess();
    },
    onError: () => toast({ title: T("comm_submit_fail"), variant: "destructive" }),
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      {/* Identity section — read-only, auto-filled from profile */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{T("comm_submitting_as")}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="col-span-2">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{T("comm_full_name")}</p>
            <p className="text-sm font-medium text-slate-900">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{T("comm_building")}</p>
            <p className="text-sm font-medium text-slate-900">{displayBuilding || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{T("comm_apartment")}</p>
            <p className="text-sm font-medium text-slate-900">{displayApartment || "—"}</p>
          </div>
        </div>
        {(!displayBuilding || !displayApartment) && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {T("comm_no_unit_data")}
          </p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">{T("comm_type")}</Label>
        <div className="grid grid-cols-2 gap-3">
          {(["complaint", "suggestion"] as const).map(tp => {
            const cfg = TYPE_CONFIG[tp];
            const Icon = cfg.icon;
            return (
              <button
                key={tp}
                type="button"
                onClick={() => setForm(f => ({ ...f, type: tp }))}
                className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg border-2 text-sm font-medium transition-all",
                  form.type === tp
                    ? tp === "complaint" ? "border-red-500 bg-red-50 text-red-700" : "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                <Icon className="h-4 w-4" />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="mb-1 block">{T("comm_subject")}</Label>
        <Input
          placeholder={form.type === "complaint" ? T("comm_subject_placeholder_complaint") : T("comm_subject_placeholder_suggestion")}
          value={form.subject}
          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
        />
      </div>

      <div>
        <Label className="mb-1 block">{T("comm_details")}</Label>
        <Textarea
          rows={5}
          placeholder={T("comm_details_placeholder")}
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
        />
      </div>

      <Button
        className="w-full gap-2"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !form.subject.trim() || !form.body.trim()}
      >
        <Send className="h-4 w-4" />
        {mutation.isPending ? T("comm_sending") : T("comm_send")}
      </Button>
    </div>
  );
}

export default function CommunicationsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const [tab, setTab] = useState<"new" | "history">("new");

  const STATUS_CONFIG = {
    pending:                { label: T("comm_status_pending"),  icon: Clock,        color: "text-slate-500 bg-slate-100" },
    read:                   { label: T("comm_status_read"),     icon: Eye,          color: "text-blue-600 bg-blue-100" },
    resolved:               { label: T("comm_status_resolved"), icon: CheckCircle,  color: "text-green-600 bg-green-100" },
    rejected:               { label: T("comm_status_rejected"), icon: Lock,         color: "text-red-600 bg-red-100" },
    deferred_to_maintenance:{ label: T("comm_status_deferred"), icon: Lock,         color: "text-amber-600 bg-amber-100" },
  } as Record<string, { label: string; icon: any; color: string }>;

  const TYPE_CONFIG = {
    complaint: { label: T("comm_complaint"), icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    suggestion: { label: T("comm_suggestion"), icon: Lightbulb, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  } as Record<string, { label: string; icon: any; color: string; bg: string }>;

  const { data: mine = [], refetch } = useQuery<any[]>({
    queryKey: ["communications-mine"],
    queryFn: () => apiRequest("/communications/mine"),
    enabled: !!user && user.role === "owner" && user.verificationStatus === "verified_owner",
  });

  const locale = lang === "ar" ? "ar-SA" : "en-GB";

  const pageHeader = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-slate-600" />
        {T("comm_title")}
      </h1>
      <p className="text-sm text-slate-500 mt-1">{T("comm_subtitle")}</p>
    </div>
  );

  // Bilingual scope note — shown to all users before the access gate
  const scopeNote = (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-5">
      <p className="text-xs text-slate-500 leading-relaxed">{T("comm_scope_note")}</p>
    </div>
  );

  // Unverified owner — has the right role but verification is incomplete
  if (user && user.role === "owner" && user.verificationStatus !== "verified_owner") {
    return (
      <div className="max-w-2xl mx-auto">
        {pageHeader}
        {scopeNote}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">{T("comm_unverified_owner")}</p>
            <p className="text-sm text-amber-700 mt-1">{T("comm_unverified_owner_desc")}</p>
          </div>
        </div>
      </div>
    );
  }

  // Non-owner access restriction (tenant, household member, staff, guard)
  if (user && user.role !== "owner") {
    return (
      <div className="max-w-2xl mx-auto">
        {pageHeader}
        {scopeNote}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">{T("comm_owner_only")}</p>
            <p className="text-sm text-amber-700 mt-1">{T("comm_owner_only_desc")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {pageHeader}
      {scopeNote}

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-5 w-fit">
        {([["new", T("comm_new")], ["history", `${T("comm_history")} (${mine.length})`]] as const).map(([tp, label]) => (
          <button
            key={tp}
            onClick={() => setTab(tp)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === tp ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        user ? (
          <SubmitForm
            user={user}
            onSuccess={() => { refetch(); qc.invalidateQueries({ queryKey: ["communications-mine"] }); setTab("history"); }}
          />
        ) : null
      ) : (
        <div className="space-y-3">
          {mine.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>{T("comm_empty")}</p>
            </div>
          ) : (
            mine.map((c: any) => {
              const typeCfg = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.complaint;
              const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.pending;
              const TypeIcon = typeCfg.icon;
              const StatusIcon = statusCfg.icon;
              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", typeCfg.bg, typeCfg.color)}>
                        <TypeIcon className="h-3 w-3" /> {typeCfg.label}
                      </span>
                      <h3 className="font-medium text-slate-900 truncate">{c.subject}</h3>
                    </div>
                    <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0", statusCfg.color)}>
                      <StatusIcon className="h-3 w-3" /> {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.body}</p>
                  {(c.adminNote || c.status === "rejected" || c.status === "deferred_to_maintenance") && (
                    <div className={cn(
                      "mt-3 rounded-lg px-3 py-2 text-sm border",
                      c.status === "rejected"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : c.status === "deferred_to_maintenance"
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : c.status === "resolved"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-blue-50 border-blue-200 text-blue-700"
                    )}>
                      <strong className={cn(
                        "block text-xs font-semibold mb-0.5",
                        c.status === "rejected" ? "text-red-500" :
                        c.status === "deferred_to_maintenance" ? "text-amber-500" :
                        c.status === "resolved" ? "text-green-600" : "text-blue-500"
                      )}>{T("comm_hoa_response")}</strong>
                      {/* Show stored adminNote (contains bilingual reply for rejected/deferred),
                          falling back to JS constants only if the record pre-dates storage persistence */}
                      {c.adminNote ? (
                        <p className="whitespace-pre-wrap">{c.adminNote}</p>
                      ) : c.status === "rejected" ? (
                        <p className="whitespace-pre-wrap">{COMM_REJECT_BODY}</p>
                      ) : c.status === "deferred_to_maintenance" ? (
                        <p className="whitespace-pre-wrap">{COMM_DEFER_BODY}</p>
                      ) : null}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(c.createdAt))}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
