import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { PaginationBar } from "@/components/PaginationBar";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import type { Lang } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker";
import { Plus, UserPlus, QrCode, CheckCircle2, Clock, Shield, Phone, Building2, User, Copy, Check, Share2, IdCard, AlertTriangle, CreditCard, Calendar, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import { displayUnitReference } from "@/lib/unitReference";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-600",
  checked_in: "bg-blue-100 text-blue-700",
  checked_out: "bg-slate-100 text-slate-600",
};

function statusLabel(status: string, lang: Lang): string {
  const key = `guest_status_${status}` as Parameters<typeof t>[1];
  const label = t(lang, key);
  return label !== key ? label : status.replace("_", " ");
}

type GuestPass = {
  id: number;
  passUuid: string;
  verificationToken: string;
  firstName: string;
  lastName: string;
  nationalId: string | null;
  visitDate: string;
  vehiclePlate: string | null;
  reasonForVisit: string | null;
  status: "approved" | "expired" | "revoked";
};

type Guest = {
  id: number;
  residentId: number;
  firstName: string;
  lastName: string;
  nationalId: string | null;
  vehiclePlate: string | null;
  visitDate: string;
  visitReason: string | null;
  status: string;
  pass: GuestPass | null;
  createdAt: string;
  residentName: string | null;
  residentMobile: string | null;
  residentUnit: string | null;
};

// ─── Guest Gate Pass QR Dialog ───────────────────────────────────────────────
function GuestPassQrDialog({ guest, lang }: { guest: Guest; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"" | "id" | "details" | "link">("");
  const { toast } = useToast();
  const pass = guest.pass;
  if (!pass) return null;

  const verifyUrl = `${window.location.origin}/api/verify?token=${pass.verificationToken}`;
  const dateLocale = lang === "ar" ? "ar-SA" : "en-SA";
  const visitDateLabel = new Date(guest.visitDate + "T12:00:00").toLocaleDateString(dateLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const detailsText = [
    "Madain Village — Gate Entry Pass",
    `Guest: ${guest.firstName} ${guest.lastName}`,
    guest.nationalId ? `ID / Iqama: ${guest.nationalId}` : null,
    `Visit date: ${visitDateLabel}`,
    guest.vehiclePlate ? `Vehicle plate: ${guest.vehiclePlate}` : null,
    guest.visitReason ? `Reason: ${guest.visitReason}` : null,
    guest.residentName ? `Host: ${guest.residentName}` : null,
    `Unit: ${displayUnitReference(guest.residentUnit)}`,
    `Pass ID: ${pass.passUuid}`,
    `Verify at gate: ${verifyUrl}`,
  ].filter(Boolean).join("\n");

  const copy = async (text: string, which: "id" | "details" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      toast({ title: t(lang, "gate_pass_copy_failed"), description: t(lang, "gate_pass_copy_manual"), variant: "destructive" });
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Madain Village — Gate Entry Pass",
          text: detailsText,
          url: verifyUrl,
        });
        return;
      } catch {
        // user cancelled or share unavailable — fall back to copy
      }
    }
    await copy(detailsText, "details");
    toast({ title: t(lang, "gate_pass_copied_toast"), description: t(lang, "gate_pass_share_fallback") });
  };

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-3.5 w-3.5" />{t(lang, "guest_pass")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />{t(lang, "gate_pass_dialog_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-white border-2 border-green-500 rounded-xl p-5 flex flex-col items-center gap-3 shadow-sm">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" />{t(lang, "gate_pass_title")}
              </div>
              <QRCode value={verifyUrl} size={192} />
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                {t(lang, "gate_pass_qr")}
              </p>
            </div>

            {/* Share / copy actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="col-span-2 gap-1.5 bg-green-600 hover:bg-green-700" onClick={share}>
                <Share2 className="h-3.5 w-3.5" />{t(lang, "gate_pass_share")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => copy(verifyUrl, "link")}>
                {copied === "link" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === "link" ? t(lang, "common_copied") : t(lang, "gate_pass_copy")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => copy(detailsText, "details")}>
                {copied === "details" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === "details" ? t(lang, "common_copied") : t(lang, "gate_pass_copy_details")}
              </Button>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="font-semibold text-slate-800 text-sm">{guest.firstName} {guest.lastName}</p>
              {guest.nationalId && <p><span className="text-slate-400">{t(lang, "gate_pass_national_id")}</span> <span className="font-mono">{guest.nationalId}</span></p>}
              <p><span className="text-slate-400">{t(lang, "gate_pass_visit")}</span> {visitDateLabel}</p>
              {guest.vehiclePlate && <p><span className="text-slate-400">{t(lang, "gate_pass_plate")}</span> {guest.vehiclePlate}</p>}
              {guest.visitReason && <p><span className="text-slate-400">{t(lang, "gate_pass_reason")}</span> {guest.visitReason}</p>}
              {guest.residentName && <p><span className="text-slate-400">{t(lang, "gate_pass_host_label")}</span> {guest.residentName}</p>}
              <p><span className="text-slate-400">{t(lang, "gate_pass_unit")}</span> {displayUnitReference(guest.residentUnit)}</p>
              <div className="mt-1 pt-2 border-t border-slate-200">
                <p className="text-slate-400 mb-1">{t(lang, "gate_pass_id")}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[10px] break-all text-slate-600">{pass.passUuid}</code>
                  <button
                    onClick={() => copy(pass.passUuid, "id")}
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                    title={t(lang, "gate_pass_id")}
                  >
                    {copied === "id" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t(lang, "gate_pass_warning")}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function GuestsPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dayPassPurchaseOpen, setDayPassPurchaseOpen] = useState(false);
  const [dayPassPurchase, setDayPassPurchase] = useState({
    guestCount: 1,
    visitDate: new Date().toISOString().slice(0, 10),
    vehiclePlate: "",
  });
  const [dayPassError, setDayPassError] = useState<{
    extraNeeded: number;
    costSar: number;
    visitDate: string;
    wahaPassHolderUserId: number | null;
  } | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    nationalId: "",
    gender: "",
    vehiclePlate: "",
    visitDate: "",
    visitReason: "",
  });

  const [page, setPage] = useState(1);
  const PAGE_LIMIT = 50;
  const { data: result, isLoading } = useQuery<{ data: Guest[]; total: number }>({
    queryKey: ["guests", page],
    queryFn: () => apiRequest(`/guests?page=${page}&limit=${PAGE_LIMIT}`),
  });
  const guests = result?.data ?? [];
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_LIMIT);

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/guests", {
      method: "POST",
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guests"] });
      setOpen(false);
      setDayPassError(null);
      setForm({ firstName: "", lastName: "", nationalId: "", gender: "", vehiclePlate: "", visitDate: "", visitReason: "" });
      toast({ title: t(lang, "guest_registered_toast") });
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error === "GUEST_DAY_PASS_REQUIRED") {
          setDayPassError({
            extraNeeded: parsed.extraNeeded,
            costSar: parsed.costSar,
            visitDate: parsed.visitDate,
            wahaPassHolderUserId: parsed.wahaPassHolderUserId ?? null,
          });
          return;
        }
      } catch {}
      toast({ title: "Failed to register guest", description: err.message, variant: "destructive" });
    },
  });

  const purchaseDayPassMutation = useMutation({
    mutationFn: (input: { guestCount: number; visitDate: string; vehiclePlate?: string }) => apiRequest("/waha-guest-day-passes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: (data: { paymentUrl: string }) => {
      window.location.href = data.paymentUrl;
    },
    onError: (err: Error) => {
      toast({ title: "Payment initiation failed", description: err.message, variant: "destructive" });
    },
  });

  const [changeDateGuestId, setChangeDateGuestId] = useState<number | null>(null);
  const [changeDateValue, setChangeDateValue] = useState("");

  const changeDateMutation = useMutation({
    mutationFn: ({ id, visitDate }: { id: number; visitDate: string }) =>
      apiRequest(`/guests/${id}`, { method: "PATCH", body: JSON.stringify({ visitDate }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guests"] });
      setChangeDateGuestId(null);
      toast({ title: t(lang, "guest_date_updated") });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update date", description: err.message, variant: "destructive" });
    },
  });

  const sharePassQuick = async (g: Guest) => {
    if (!g.pass) return;
    const verifyUrl = `${window.location.origin}/api/verify?token=${g.pass.verificationToken}`;
    const guestName = `${g.firstName} ${g.lastName}`;
    const text = `Madain Village Gate Pass — ${guestName}\n${verifyUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Gate Pass", text, url: verifyUrl }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(verifyUrl);
      toast({ title: t(lang, "gate_pass_copied_toast") });
    } catch {
      toast({ title: t(lang, "gate_pass_copy_failed"), variant: "destructive" });
    }
  };

  const hostName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "—";
  const isVerifiedResident = user?.verificationStatus === "verified_owner"
    || user?.verificationStatus === "verified_tenant"
    || user?.verificationStatus === "verified_household_member";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, "guest_title")}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t(lang, "guest_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDayPassError(null); setForm({ firstName: "", lastName: "", nationalId: "", gender: "", vehiclePlate: "", visitDate: "", visitReason: "" }); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> {t(lang, "guest_register")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {dayPassError ? t(lang, "guest_day_pass_limit_title") : t(lang, "guest_register")}
              </DialogTitle>
            </DialogHeader>

            {/* ── Day-pass limit reached UI ──────────────────────────────── */}
            {dayPassError && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">{t(lang, "guest_day_pass_limit_desc")}</p>
                    <p className="text-xs text-amber-600 mt-1">
                      {dayPassError.extraNeeded} × SAR 30 = <strong>SAR {dayPassError.costSar}</strong>
                    </p>
                  </div>
                </div>

                {isVerifiedResident ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => purchaseDayPassMutation.mutate({
                      guestCount: dayPassError.extraNeeded,
                      visitDate: dayPassError.visitDate,
                    })}
                    disabled={purchaseDayPassMutation.isPending}
                  >
                    {purchaseDayPassMutation.isPending ? (
                      t(lang, "guest_day_pass_purchasing")
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        {t(lang, "guest_day_pass_purchase_cta")} (SAR {dayPassError.costSar})
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {t(lang, "guest_day_pass_non_holder")}
                  </p>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDayPassError(null)}
                >
                  {t(lang, "common_cancel")}
                </Button>
              </div>
            )}

            {/* ── Normal registration form ───────────────────────────────── */}
            {!dayPassError && <div className="space-y-4">

              {/* Auto-filled host info */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t(lang, "gate_pass_host")} </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {hostName}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {user?.phone ?? <span className="text-slate-400 italic text-xs">No phone on file</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {`Unit ${displayUnitReference(user?.unitNumber)}`}
                  </span>
                </div>
              </div>

              {/* Guest name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="gf-firstName">{t(lang, "guest_first_name")}</Label>
                  <Input
                    id="gf-firstName"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder={t(lang, "guest_first_name")}
                  />
                </div>
                <div>
                  <Label htmlFor="gf-lastName">{t(lang, "guest_last_name")}</Label>
                  <Input
                    id="gf-lastName"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder={t(lang, "guest_last_name")}
                  />
                </div>
              </div>
              <div>
                <Label>{t(lang, "gender")} <span className="text-red-500 text-xs">*</span></Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t(lang, "gender")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t(lang, "gender_male")}</SelectItem>
                    <SelectItem value="female">{t(lang, "gender_female")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="gf-nationalId" className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5 text-slate-400" />{t(lang, "guest_id")} <span className="text-red-500">*</span></Label>
                <Input
                  id="gf-nationalId"
                  value={form.nationalId}
                  onChange={e => setForm(f => ({ ...f, nationalId: e.target.value }))}
                  placeholder={t(lang, "guest_id")}
                />
              </div>

              <div>
                <Label htmlFor="gf-visitDate">{t(lang, "guest_visit_date")}</Label>
                <DatePickerField
                  value={form.visitDate}
                  onChange={v => setForm(f => ({ ...f, visitDate: v }))}
                  placeholder={t(lang, "guest_visit_date")}
                />
              </div>

              <div>
                <Label htmlFor="gf-plate">{t(lang, "guest_plate")} <span className="text-slate-400 font-normal">{t(lang, "common_optional")}</span></Label>
                <Input
                  id="gf-plate"
                  value={form.vehiclePlate}
                  onChange={e => setForm(f => ({ ...f, vehiclePlate: e.target.value }))}
                  placeholder="e.g. ABC 1234"
                />
              </div>

              <div>
                <Label htmlFor="gf-reason">{t(lang, "guest_reason")} <span className="text-red-500 text-xs">*</span></Label>
                <Select
                  value={form.visitReason}
                  onValueChange={v => setForm(f => ({ ...f, visitReason: v }))}
                >
                  <SelectTrigger id="gf-reason" className="mt-1">
                    <SelectValue placeholder={t(lang, "guest_reason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {([
                      ["family_friend",    t(lang, "guest_reason_family_friend")],
                      ["delivery",         t(lang, "guest_reason_delivery")],
                      ["facility_event",   t(lang, "guest_reason_facility_event")],
                      ["maintenance_work", t(lang, "guest_reason_maintenance_work")],
                      ["household_work",   t(lang, "guest_reason_household_work")],
                      ["medical",          t(lang, "guest_reason_medical")],
                      ["other",            t(lang, "guest_reason_other")],
                    ] as [string, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.firstName || !form.lastName || !form.nationalId.trim() || !form.gender || !form.visitDate || !form.visitReason}
              >
                {createMutation.isPending ? t(lang, "guest_registering") : t(lang, "guest_register")}
              </Button>
            </div>}
          </DialogContent>
        </Dialog>
        <Dialog open={dayPassPurchaseOpen} onOpenChange={setDayPassPurchaseOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={!isVerifiedResident}>
              <CreditCard className="h-4 w-4" /> {t(lang, "guest_day_pass_purchase_cta")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t(lang, "guest_day_pass_purchase_title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t(lang, "guest_day_pass_purchase_desc")}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p>Every unit can bring up to 4 guests to the facility area for free. Exceeding 4 guests, a guest day pass must be purchased. Guests are not allowed to use the Clubs.</p>
                <p dir="rtl" className="mt-2">يمكن لكل وحدة إحضار ما يصل إلى 4 ضيوف إلى منطقة المرافق مجانًا. عند تجاوز 4 ضيوف، يجب شراء تصريح ضيف ليوم واحد. لا يُسمح للضيوف باستخدام الأندية.</p>
              </div>
              <div>
                <Label htmlFor="day-pass-guests">{t(lang, "guest_day_pass_guest_count")}</Label>
                <Input
                  id="day-pass-guests"
                  type="number"
                  min={1}
                  max={10}
                  value={dayPassPurchase.guestCount}
                  onChange={(event) => setDayPassPurchase((current) => ({
                    ...current,
                    guestCount: Math.max(1, Math.min(10, Number(event.target.value) || 1)),
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="day-pass-date">{t(lang, "guest_visit_date")}</Label>
                <Input
                  id="day-pass-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={dayPassPurchase.visitDate}
                  onChange={(event) => setDayPassPurchase((current) => ({ ...current, visitDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="day-pass-plate">
                  {t(lang, "guest_plate")} <span className="text-slate-400 font-normal">{t(lang, "common_optional")}</span>
                </Label>
                <Input
                  id="day-pass-plate"
                  value={dayPassPurchase.vehiclePlate}
                  onChange={(event) => setDayPassPurchase((current) => ({ ...current, vehiclePlate: event.target.value }))}
                  placeholder="e.g. ABC 1234"
                  maxLength={32}
                />
              </div>
              <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                {t(lang, "guest_day_pass_total")}: <strong>SAR {(dayPassPurchase.guestCount * 30).toFixed(2)}</strong>
              </div>
              <Button
                className="w-full gap-2"
                disabled={purchaseDayPassMutation.isPending || !dayPassPurchase.visitDate}
                onClick={() => purchaseDayPassMutation.mutate(dayPassPurchase)}
              >
                {purchaseDayPassMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" />{t(lang, "guest_day_pass_purchasing")}</>
                  : <><CreditCard className="h-4 w-4" />{t(lang, "guest_day_pass_purchase_cta")}</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">{t(lang, "loading")}</p>}
      {!isLoading && (!guests || guests.length === 0) && (
        <div className="text-center py-16 text-slate-400">
          <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t(lang, "guest_no_visits")}</p>
        </div>
      )}

      <div className="space-y-3">
        {guests?.map((g) => (
          <div key={g.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{g.firstName} {g.lastName}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {t(lang, "guest_card_visit")} {new Date(g.visitDate + "T12:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </p>

                {/* Host details */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {g.residentName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" />
                      <span className="text-slate-400">{t(lang, "gate_pass_host_label")}</span>&nbsp;{g.residentName}
                    </span>
                  )}
                  {g.residentMobile && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 text-slate-400" />
                      {g.residentMobile}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    {t(lang, "sidebar_unit")} {displayUnitReference(g.residentUnit)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  {g.nationalId && <span>{t(lang, "gate_pass_national_id")} {g.nationalId}</span>}
                  {g.vehiclePlate && <span>{t(lang, "guest_card_plate")} {g.vehiclePlate}</span>}
                  {g.visitReason && <span>{g.visitReason}</span>}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[g.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {statusLabel(g.status, lang)}
                </span>
                {g.status === "approved" && g.pass && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => sharePassQuick(g)}
                      className="p-1 rounded text-slate-400 hover:text-green-600 transition-colors"
                      title={t(lang, "gate_pass_share")}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                    <GuestPassQrDialog guest={g} lang={lang} />
                  </div>
                )}
                {g.status === "approved" && !g.pass && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />{t(lang, "gate_pass_generating")}
                  </span>
                )}
                {g.status === "approved" && g.pass?.status === "approved" &&
                  new Date(g.visitDate + "T00:00:00") >= new Date(new Date().toDateString()) && (
                  <button
                    onClick={() => { setChangeDateGuestId(g.id); setChangeDateValue(g.visitDate); }}
                    className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                  >
                    <Calendar className="h-3 w-3" />{t(lang, "guest_change_date")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />

      <Dialog open={changeDateGuestId !== null} onOpenChange={v => { if (!v) setChangeDateGuestId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />{t(lang, "guest_change_date_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t(lang, "guest_visit_date")}</Label>
              <DatePickerField
                value={changeDateValue}
                onChange={v => setChangeDateValue(v)}
                minDate={new Date().toISOString().split("T")[0]}
                placeholder={t(lang, "guest_visit_date")}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (changeDateGuestId && changeDateValue) {
                  changeDateMutation.mutate({ id: changeDateGuestId, visitDate: changeDateValue });
                }
              }}
              disabled={!changeDateValue || changeDateMutation.isPending}
            >
              {changeDateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t(lang, "guest_change_date_save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
