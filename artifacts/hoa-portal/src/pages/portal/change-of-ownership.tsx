import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ArrowLeftRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";

export default function ChangeOfOwnershipPage() {
  const { data: user } = useCurrentUser();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: pendingEvent, isLoading: pendingLoading } = useQuery({
    queryKey: ["ownership-changes", "my-pending"],
    queryFn: () => apiRequest("/ownership-changes/my-pending"),
    enabled: !!user && user.verificationStatus === "verified_owner",
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("/ownership-changes", {
      method: "POST",
      body: JSON.stringify({ notes: notes || undefined }),
    }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (e: any) => {
      toast({ title: T("common_error"), description: e.message, variant: "destructive" });
    },
  });

  if (user && user.verificationStatus !== "verified_owner") {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">{T("coo_owner_only_title")}</p>
            <p className="text-amber-700 text-sm mt-1">{T("coo_owner_only_desc")}</p>
          </div>
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/portal")}>
          ← {T("common_back")}
        </Button>
      </div>
    );
  }

  if (submitted || pendingEvent) {
    const isPending = !submitted && !!pendingEvent;
    return (
      <div className="max-w-lg mx-auto">
        <div className={`border rounded-xl p-8 text-center ${isPending ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
          {isPending ? (
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          ) : (
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          )}
          <p className={`text-xl font-bold ${isPending ? "text-amber-900" : "text-green-900"}`}>
            {isPending ? T("coo_pending_title") : T("coo_success_title")}
          </p>
          <p className={`text-sm mt-3 ${isPending ? "text-amber-700" : "text-green-700"}`}>
            {isPending ? T("coo_pending_desc") : T("coo_success_desc")}
          </p>
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/portal")}>
          ← {T("nav_dashboard")}
        </Button>
      </div>
    );
  }

  if (pendingLoading) {
    return (
      <div className="max-w-lg mx-auto flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6 flex items-start gap-3">
        <ArrowLeftRight className="h-7 w-7 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{T("coo_title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{T("coo_subtitle")}</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-6">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="text-sm text-red-800">
          <p className="font-semibold mb-1">{T("coo_warning_title")}</p>
          <p>{T("coo_warning_desc")}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* Unit info */}
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <p className="text-slate-500 text-xs mb-1">{T("coo_unit_label")}</p>
          <p className="font-semibold text-slate-900">{displayUnitReference(user?.unitNumber)}</p>
        </div>

        {/* Notes field */}
        <div>
          <Label htmlFor="coo-notes">{T("coo_notes_label")}</Label>
          <Textarea
            id="coo-notes"
            className="mt-1.5 text-sm"
            rows={3}
            placeholder={T("coo_notes_placeholder")}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Confirmation checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-red-600 shrink-0"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
          />
          <span className="text-sm text-slate-700">{T("coo_confirm_label")}</span>
        </label>

        <Button
          className="w-full bg-red-600 hover:bg-red-700 text-white"
          disabled={!confirmed || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? (
            <><Loader2 className="h-4 w-4 me-2 animate-spin" />{T("coo_submitting")}</>
          ) : T("coo_submit_btn")}
        </Button>
      </div>
    </div>
  );
}
