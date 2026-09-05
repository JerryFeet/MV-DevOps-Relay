import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState, useRef } from "react";
import { LifeBuoy, AlertCircle, CheckCircle, Clock, Image as ImageIcon, Send, X, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { 
  useCreatePortalHelpTicket, 
  useListMyPortalHelpTickets,
  getListMyPortalHelpTicketsQueryKey,
  useRequestPortalHelpScreenshotUploadUrl,
  PortalHelpCategory
} from "@workspace/api-client-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function PortalHelpPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const { toast } = useToast();
  
  const [tab, setTab] = useState<"new" | "history">("new");
  const [form, setForm] = useState({
    category: "" as PortalHelpCategory | "",
    details: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: mine = [], refetch } = useListMyPortalHelpTickets({
    query: {
      enabled: !!user && (user.role === "owner" || user.role === "tenant"),
      queryKey: getListMyPortalHelpTicketsQueryKey(),
    }
  });

  const createTicketMutation = useCreatePortalHelpTicket();
  const requestUploadUrlMutation = useRequestPortalHelpScreenshotUploadUrl();

  const CATEGORIES = [
    { value: PortalHelpCategory.account_access, label: T("ph_cat_account_access") },
    { value: PortalHelpCategory.unit_household_registration, label: T("ph_cat_unit_household_registration") },
    { value: PortalHelpCategory.booking_pass, label: T("ph_cat_booking_pass") },
    { value: PortalHelpCategory.payment, label: T("ph_cat_payment") },
    { value: PortalHelpCategory.document_opening, label: T("ph_cat_document_opening") },
    { value: PortalHelpCategory.vehicle_permit_registration, label: T("ph_cat_vehicle_permit_registration") },
    { value: PortalHelpCategory.screen_problem, label: T("ph_cat_screen_problem") },
  ];

  const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    pending: { label: T("ph_status_pending"), icon: Clock, color: "text-amber-700", bg: "bg-amber-100" },
    in_progress: { label: T("ph_status_in_progress"), icon: Clock, color: "text-blue-700", bg: "bg-blue-100" },
    closed: { label: T("ph_status_closed"), icon: CheckCircle, color: "text-slate-700", bg: "bg-slate-100" },
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    if (selected.size > MAX_FILE_SIZE) {
      toast({ title: T("ph_err_file_size"), variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      toast({ title: T("ph_err_file_type"), variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    setFile(selected);
  };

  const handleSubmit = async () => {
    if (!form.category || !form.details.trim()) return;
    
    setIsSubmitting(true);
    try {
      let screenshotObjectPath = undefined;
      let screenshotContentType = undefined;

      if (file) {
        const uploadInfo = await requestUploadUrlMutation.mutateAsync({
          data: {
            name: file.name,
            size: file.size,
            contentType: file.type as any,
          }
        });

        // Direct PUT to the signed URL
        const uploadRes = await fetch(uploadInfo.uploadURL, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload screenshot");
        }

        screenshotObjectPath = uploadInfo.objectPath;
        screenshotContentType = file.type;
      }

      await createTicketMutation.mutateAsync({
        data: {
          category: form.category as PortalHelpCategory,
          details: form.details,
          screenshotObjectPath,
          screenshotContentType: screenshotContentType as any,
        }
      });

      toast({ title: T("ph_success") });
      setForm({ category: "", details: "" });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetch();
      setTab("history");
    } catch (err) {
      toast({ title: T("ph_error"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageHeader = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <LifeBuoy className="h-6 w-6 text-slate-600" />
        {T("ph_title")}
      </h1>
      <p className="text-sm text-slate-500 mt-1">{T("ph_subtitle")}</p>
    </div>
  );

  const scopeNote = (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-5 space-y-3 text-sm text-slate-600 leading-relaxed">
      <p>
        <strong className="text-slate-900">{T("ph_scope_1")}</strong>
        {T("ph_scope_2")}
      </p>
      <p>
        <strong className="text-slate-900">{T("ph_scope_3")}</strong>
        {T("ph_scope_4")}
      </p>
      <p>
        <strong className="text-slate-900">{lang === "ar" ? "قبل الإرسال، يرجى مراجعة دليل الاستخدام في قسم المستندات، أو سؤال «دليل» من القائمة." : "Before submitting, please check the User Manual in the Documents section, or ask Dalil from the menu."}</strong>
        {lang === "ar" ? " فمعظم الأسئلة تجد إجابتها هناك فورًا." : " Most questions are answered there straight away."}
      </p>
      <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 mt-2">
        {T("ph_scope_6")}
      </p>
    </div>
  );

  if (user && user.role !== "owner" && user.role !== "tenant") {
    return (
      <div className="max-w-2xl mx-auto">
        {pageHeader}
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {pageHeader}
      {scopeNote}

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-5 w-fit">
        <button
          onClick={() => setTab("new")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            tab === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {T("ph_new_request")}
        </button>
        <button
          onClick={() => setTab("history")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            tab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {T("ph_history")} ({mine.length})
        </button>
      </div>

      {tab === "new" ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
          {/* Submitter info read-only */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex items-center gap-2 w-full mb-1">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{T("comm_submitting_as")}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">{T("comm_full_name")}</p>
              <p className="text-sm font-medium text-slate-900">
                {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">{T("sidebar_unit")}</p>
              <p className="text-sm font-medium text-slate-900">{displayUnitReference(user?.unitNumber)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{T("ph_category")}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <label
                  key={cat.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    form.category === cat.value
                      ? "border-[#0F4442] bg-[#0F4442]/5"
                      : "border-slate-200 hover:border-[#0F4442]/30"
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={form.category === cat.value}
                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value as PortalHelpCategory }))}
                    className="mt-1 h-4 w-4 text-[#0F4442] focus:ring-[#0F4442]"
                  />
                  <span className="text-sm text-slate-700 leading-tight">{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{T("ph_details")}</Label>
            <Textarea
              rows={4}
              placeholder={T("ph_details_placeholder")}
              value={form.details}
              onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{T("ph_screenshot")} <span className="text-slate-400 font-normal">{T("optional")}</span></Label>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4 text-slate-500" />
                {file ? T("doc_upload_pick") : T("doc_upload_pick")}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
              />
              {file && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-md px-3 py-1.5 max-w-[200px] md:max-w-xs">
                  <span className="text-sm text-slate-700 truncate">{file.name}</span>
                  <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-slate-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!file && <span className="text-xs text-slate-500">{T("ph_screenshot_hint")}</span>}
            </div>
          </div>

          <Button
            className="w-full gap-2 bg-[#0F4442] hover:bg-[#1c5250] text-white"
            onClick={handleSubmit}
            disabled={isSubmitting || !form.category || !form.details.trim()}
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? T("ph_submitting") : T("ph_submit")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {mine.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-xl">
              <LifeBuoy className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>{T("ph_empty")}</p>
            </div>
          ) : (
            mine.map((t) => {
              const statusCfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const catLabel = CATEGORIES.find(c => c.value === t.category)?.label || t.category;
              
              return (
                <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase block mb-1">#{t.id} · {catLabel}</span>
                    </div>
                    <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0", statusCfg.bg, statusCfg.color)}>
                      <StatusIcon className="h-3 w-3" /> {statusCfg.label}
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.details}</p>
                  
                  {t.adminReply && (
                    <div className={cn(
                      "mt-4 rounded-lg px-4 py-3 text-sm border",
                      t.replyKind === "redirect" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800"
                    )}>
                      <strong className="block text-xs font-semibold mb-1 uppercase tracking-wide opacity-80">
                        {t.replyKind === "redirect" ? T("ph_redirected") : T("comm_hoa_response")}
                      </strong>
                      <p className="whitespace-pre-wrap leading-relaxed">{t.adminReply}</p>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
                    <span>{new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(t.createdAt))}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
