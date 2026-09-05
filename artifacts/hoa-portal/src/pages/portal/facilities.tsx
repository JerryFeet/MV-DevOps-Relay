import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaginatedApi } from "@/hooks/usePaginatedApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import type { Lang } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, Calendar, Clock, ChevronLeft, ChevronRight,
  Plus, CheckCircle2, XCircle, AlertCircle, Loader2, Settings,
  Users, Banknote, Info, Shield,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Facility = {
  id: number; name: string; description: string | null;
  pricePerHour: string; maxCapacity: number | null; imageUrl: string | null;
  isActive: boolean;
  weekdayOpenHour: number; weekdayCloseHour: number;
  weekendOpenHour: number; weekendCloseHour: number;
  slotIntervalMinutes: number; minDurationMinutes: number; maxDurationMinutes: number; cleaningBufferMinutes: number;
  requiresApproval: boolean;
  pricingModel: string; // "per_hour" | "flat"
  flatFeeAmount: string | null;
  capacityMode: string; // "numeric" | "posted" | "available"
};
type Slot = { hour: number; label: string; startISO: string; available: boolean };
type Availability = {
  date: string; isWeekend: boolean;
  openHour: number; closeHour: number;
  slotIntervalMinutes: number; minDurationMinutes: number; maxDurationMinutes: number;
  cleaningBufferMinutes: number; durationMinutes: number;
  requiresApproval: boolean; pricePerHour: string;
  pricingModel: string; flatFeeAmount: string | null;
  slots: Slot[];
  durations: { minutes: number; label: string }[];
};
type Booking = {
  id: number; facilityId: number; facilityName: string; userId: number;
  startTime: string; endTime: string; status: string; paymentStatus: string;
  totalAmount: string; notes: string | null; movieTitle: string | null;
  resident: { firstName: string | null; lastName: string | null; email: string; unitNumber: string | null } | null;
  unit?: { id: number; building: string; unitNumber: string } | null;
  paymentExemptionReason?: string | null;
  createdAt: string;
};
type FacilityAudit = {
  configNormalizations: {
    id: number; facilityId: number; facilityName: string;
    previousSlotIntervalMinutes: number; previousMinDurationMinutes: number; previousMaxDurationMinutes: number;
    normalizedSlotIntervalMinutes: number; normalizedMinDurationMinutes: number; normalizedMaxDurationMinutes: number;
    createdAt: string; reviewedAt: string | null;
  }[];
  operatingHoursConflicts: {
    id: number; facilityId: number; facilityName: string; bookingId: number;
    reason: string; createdAt: string; reviewedAt: string | null;
  }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function bookingSubmitButtonLabel({
  lang,
  requiresApproval,
  isCinema,
  totalCost,
  usesFreeMonthlyAllowance,
}: {
  lang: Lang;
  requiresApproval: boolean;
  isCinema: boolean;
  totalCost: string | number | null;
  usesFreeMonthlyAllowance: boolean;
}) {
  const requiresPayment = !requiresApproval
    && !isCinema
    && Number(totalCost) > 0
    && !usesFreeMonthlyAllowance;
  return requiresPayment
    ? `${t(lang, "fac_btn_confirm_pay")} ${totalCost} SAR`
    : t(lang, "fac_btn_confirm_booking");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isWeekendBookingDate(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 4 || weekday === 5 || weekday === 6;
}
function dateLang(lang: Lang) {
  return lang === "ar" ? "ar-SA" : "en-SA";
}
function formatDateTime(iso: string, lang: Lang) {
  const d = new Date(iso);
  return d.toLocaleString(dateLang(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
}
function formatTime(iso: string, lang: Lang) {
  return new Date(iso).toLocaleTimeString(dateLang(lang), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });
}
function formatDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(dateLang(lang), { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Riyadh" });
}
function formatHourLabel(h: number, lang?: Lang) {
  const totalMins = Math.round(h * 60) % (24 * 60);
  const hr = Math.floor(totalMins / 60);
  const min = totalMins % 60;
  const nextDay = h >= 24;
  const dummy = new Date(2000, 0, 1, hr, min);
  const locale = lang ? dateLang(lang) : "en-SA";
  const timeStr = dummy.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true });
  const suffix = nextDay ? ` ${t(lang ?? "en", "fac_next_day")}` : "";
  return `${timeStr}${suffix}`;
}
function calcCost(facility: Facility, durationMinutes: number): string {
  if (facility.pricingModel === "flat" && facility.flatFeeAmount != null) {
    return Number(facility.flatFeeAmount).toFixed(2);
  }
  return (Number(facility.pricePerHour) * durationMinutes / 60).toFixed(2);
}
function pricingLabel(facility: Facility, lang: Lang): string {
  if (facility.pricingModel === "flat" && facility.flatFeeAmount != null) {
    return `${Number(facility.flatFeeAmount).toFixed(0)} SAR ${t(lang, "fac_flat_fee")}`;
  }
  return `${Number(facility.pricePerHour).toFixed(0)} SAR ${t(lang, "fac_per_hour")}`;
}
function durationLabel(minutes: number, lang: Lang): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes} ${t(lang, "fac_dur_min")}`;
  if (h === 1) return t(lang, "fac_dur_1hr");
  if (h % 1 === 0) return `${h} ${t(lang, "fac_dur_hours")}`;
  return `${h} ${t(lang, "fac_dur_hrs")}`;
}

const statusColorMap: Record<string, { key: string; color: string; icon: React.ReactNode }> = {
  pending:   { key: "fac_status_pending",   color: "bg-amber-100 text-amber-700 border-amber-200",   icon: <AlertCircle className="h-3 w-3" /> },
  confirmed: { key: "fac_status_confirmed", color: "bg-green-100 text-green-700 border-green-200",   icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { key: "fac_status_cancelled", color: "bg-red-100 text-red-600 border-red-200",         icon: <XCircle className="h-3 w-3" /> },
  completed: { key: "fac_status_completed", color: "bg-slate-100 text-slate-600 border-slate-200",   icon: <CheckCircle2 className="h-3 w-3" /> },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const cfg = statusColorMap[status] ?? { key: status, color: "bg-slate-100 text-slate-600 border-slate-200", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>
      {cfg.icon} {t(lang, cfg.key)}
    </span>
  );
}

function FacilityRulesChip({ facility, lang }: { facility: Facility; lang: Lang }) {
  const chips: { label: string; icon: React.ReactNode }[] = [];
  if (facility.capacityMode === "posted") {
    chips.push({ label: t(lang, "fac_capacity_mode_posted"), icon: <Users className="h-3 w-3" /> });
  } else if (facility.capacityMode === "available") {
    chips.push({ label: t(lang, "fac_capacity_mode_available"), icon: <Users className="h-3 w-3" /> });
  } else if (facility.maxCapacity) {
    chips.push({ label: `${facility.maxCapacity} ${t(lang, "fac_people_max")}`, icon: <Users className="h-3 w-3" /> });
  }
  chips.push({ label: pricingLabel(facility, lang), icon: <Banknote className="h-3 w-3" /> });
  if (facility.minDurationMinutes === facility.maxDurationMinutes) {
    chips.push({ label: durationLabel(facility.minDurationMinutes, lang), icon: <Clock className="h-3 w-3" /> });
  } else {
    chips.push({ label: `${durationLabel(facility.minDurationMinutes, lang)}–${durationLabel(facility.maxDurationMinutes, lang)}`, icon: <Clock className="h-3 w-3" /> });
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map(c => (
        <span key={c.label} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {c.icon}{c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Booking Card (My Bookings) ───────────────────────────────────────────────
export function BookingCard({
  b, lang, onCancel, cancelPending,
}: {
  b: Booking; lang: Lang; onCancel: () => void; cancelPending: boolean;
}) {
  const { toast } = useToast();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const showPayNow =
    Number(b.totalAmount) > 0 &&
    b.paymentStatus === "unpaid" &&
    b.status !== "cancelled" &&
    b.status !== "completed";

  const isFree = b.paymentExemptionReason === "monthly_free_allowance";

  const handlePayNow = async () => {
    setPaymentLoading(true);
    try {
      const { paymentUrl } = await apiRequest("/payments/create", {
        method: "POST",
        body: JSON.stringify({ bookingId: b.id }),
      });
      if (paymentUrl) {
        window.location.href = paymentUrl;
        return;
      }
    } catch (e: any) {
      toast({
        title: t(lang, "fac_payment_error"),
        description: e.message ?? t(lang, "fac_payment_error_desc"),
        variant: "destructive",
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-5"
      data-testid={`booking-card-${b.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-semibold text-slate-900">{b.facilityName}</span>
            <StatusBadge status={b.status} lang={lang} />
            {b.paymentStatus === "paid" && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                {t(lang, "pay_paid")}
              </span>
            )}
            {b.paymentStatus === "not_required" && isFree && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                {t(lang, "fac_free_allowance_title")}
              </span>
            )}
            {showPayNow && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                {t(lang, "pay_unpaid")}
              </span>
            )}
          </div>
          <div className="space-y-0.5 text-sm text-slate-500">
            <p className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> {formatDate(b.startTime, lang)}
            </p>
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {formatTime(b.startTime, lang)} — {formatTime(b.endTime, lang)}
            </p>
          </div>
        </div>
        <div className="text-end shrink-0">
          {isFree ? (
            <>
              <p className="font-bold text-slate-900 line-through opacity-50 text-sm">{Number(b.totalAmount).toFixed(2)} SAR</p>
              <p className="font-bold text-emerald-600">0.00 SAR</p>
            </>
          ) : (
            <p className="font-bold text-slate-900">{Number(b.totalAmount).toFixed(2)} SAR</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {t(lang, "fac_booked_at")} {formatDateTime(b.createdAt, lang)}
          </p>
        </div>
      </div>
      {b.notes && (
        <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded px-3 py-2">{b.notes}</p>
      )}
      {(showPayNow || b.status === "pending" || b.status === "confirmed") && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2 flex-wrap">
          {showPayNow && (
            <Button
              size="sm"
              className="text-xs h-7 bg-[#0F4442] hover:bg-[#1a5a57] gap-1"
              onClick={handlePayNow}
              disabled={paymentLoading}
            >
              {paymentLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Banknote className="h-3.5 w-3.5" />
              }
              {t(lang, "pay_now_btn")} · {Number(b.totalAmount).toFixed(2)} SAR
            </Button>
          )}
          {(b.status === "pending" || b.status === "confirmed") && (
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm" variant="outline"
                  className="text-red-500 border-red-200 hover:bg-red-50 text-xs h-7"
                  disabled={cancelPending}
                >
                  <XCircle className="h-3.5 w-3.5 me-1" />{t(lang, "fac_cancel_booking")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t(lang, "fac_cancel_confirm_title")}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-slate-700 mt-2">
                  {isFree ? t(lang, "fac_cancel_confirm_free_desc") : t(lang, "fac_cancel_confirm_desc")}
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setCancelOpen(false)}>
                    {t(lang, "cancel")}
                  </Button>
                  <Button variant="destructive" onClick={() => { onCancel(); setCancelOpen(false); }} disabled={cancelPending}>
                    {t(lang, "fac_cancel_booking")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Booking Wizard ───────────────────────────────────────────────────────────
function BookingWizard({ facilities }: { facilities: Facility[] }) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  const { data: wahaPassData, isLoading: wahaPassLoading } = useQuery<any>({
    queryKey: ["waha-pass-mine"],
    queryFn: () => apiRequest("/waha-pass/mine"),
    enabled: !!user && !isAdmin,
  });

  // F9: Fetch configurable advance booking window so the calendar maxDate and
  // the BOOKING_CUTOFF_EXCEEDED error message both use the server's value.
  const { data: bookingConfig } = useQuery<{ advanceDays: number }>({
    queryKey: ["booking-config"],
    queryFn: () => apiRequest("/bookings/config"),
    enabled: !!user,
  });
  const advanceDays = bookingConfig?.advanceDays ?? 14;

  const hasActivePass = isAdmin ||
    (wahaPassData?.credentials ?? []).some((c: any) => c.status === "active");

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [movieTitle, setMovieTitle] = useState("");
  const [cutoffError, setCutoffError] = useState<string | null>(null);

  // F9: Maximum bookable date — today + advanceDays (admin users bypass server-side,
  // but the calendar still shows the window to avoid surprising them).
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + advanceDays);
    return d.toISOString().slice(0, 10);
  }, [advanceDays]);

  const isCinema = !!selectedFacility && selectedFacility.name.toLowerCase().includes("cinema");

  const { data: allowance, isLoading: allowanceLoading } = useQuery<any>({
    queryKey: ["booking-allowance"],
    queryFn: () => apiRequest("/bookings/monthly-allowance"),
    enabled: !!user && !isAdmin,
  });

  const { data: avail, isLoading: availLoading } = useQuery<Availability>({
    queryKey: ["availability", selectedFacility?.id, selectedDate, selectedDuration],
    queryFn: () => apiRequest(`/facilities/${selectedFacility!.id}/availability?date=${selectedDate}&durationMinutes=${selectedDuration ?? selectedFacility!.minDurationMinutes}`),
    enabled: !!selectedFacility && !!selectedDate && step >= 2,
  });

  const [paymentLoading, setPaymentLoading] = useState(false);

  const resetWizard = () => {
    setStep(1);
    setSelectedFacility(null);
    setSelectedDate(todayStr());
    setSelectedDuration(null);
    setSelectedSlot(null);
    setNotes("");
    setMovieTitle("");
    setCutoffError(null);
  };

  const bookMutation = useMutation({
    mutationFn: () => apiRequest("/bookings", {
      method: "POST",
      body: JSON.stringify({
        facilityId: selectedFacility!.id,
        startTime: selectedSlot!.startISO,
        durationMinutes: selectedDuration!,
        notes,
        ...(isCinema ? { movieTitle } : {}),
      }),
    }),
    onSuccess: async (booking: any) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-allowance"] });
      const needsPayment = !selectedFacility?.requiresApproval && !isCinema && Number(booking.totalAmount) > 0 && booking.paymentExemptionReason !== "monthly_free_allowance";

      if (needsPayment) {
        setPaymentLoading(true);
        try {
          const { paymentUrl } = await apiRequest("/payments/create", {
            method: "POST",
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (paymentUrl) {
            window.location.href = paymentUrl;
            return;
          }
        } catch (e: any) {
          toast({ title: t(lang, "fac_payment_error"), description: e.message ?? t(lang, "fac_payment_error_desc"), variant: "destructive" });
          setPaymentLoading(false);
        }
      } else {
        toast({
          title: t(lang, "fac_booking_submitted"),
          description: booking.status === "confirmed"
            ? t(lang, "fac_booking_submitted_confirmed")
            : isCinema
            ? t(lang, "fac_booking_submitted_cinema")
            : selectedFacility?.requiresApproval ? t(lang, "fac_booking_submitted_approval") : t(lang, "fac_booking_submitted_confirmed"),
        });
      }
      resetWizard();
    },
    onError: (e: any) => {
      if (typeof e.message === "string" && e.message.includes("BOOKING_CUTOFF_EXCEEDED")) {
        // F9: Parse the configured advance days from the server's error code and show
        // a bilingual message. The server emits "BOOKING_CUTOFF_EXCEEDED: <days>".
        const parsed = parseInt(e.message.replace("BOOKING_CUTOFF_EXCEEDED: ", ""), 10);
        const n = !isNaN(parsed) ? parsed : advanceDays;
        const msg = lang === "ar"
          ? `يمكن حجز المرافق قبل ${n} يومًا كحد أقصى. يرجى اختيار تاريخ خلال ${n} يومًا القادمة.`
          : `Facility bookings can be made up to ${n} days in advance. Please choose a date within the next ${n} days.`;
        setCutoffError(msg);
      } else {
        toast({ title: t(lang, "fac_booking_failed"), description: e.message, variant: "destructive" });
      }
    },
  });

  const availableSlots = useMemo(() => {
    return avail?.slots ?? [];
  }, [avail]);

  const cleaningBufferMinutes = avail?.cleaningBufferMinutes ?? selectedFacility?.cleaningBufferMinutes ?? 15;
  const requiresClosingCleaningDisclaimer = !!(
    avail
    && selectedSlot
    && selectedDuration
    && selectedSlot.hour + selectedDuration / 60 + cleaningBufferMinutes / 60 > avail.closeHour
  );
  const withMinutes = (key: string) => t(lang, key).replace("{minutes}", String(cleaningBufferMinutes));

  const steps = [
    { n: 1, label: t(lang, "fac_step_facility") },
    { n: 2, label: t(lang, "fac_step_date") },
    { n: 3, label: t(lang, "fac_step_time") },
    { n: 4, label: t(lang, "fac_step_confirm") },
  ];

  const totalCost = selectedFacility && selectedDuration
    ? calcCost(selectedFacility, selectedDuration)
    : null;

  const isFreeAllowanceApplicable = allowance?.available && Number(totalCost) > 0;

  // Cinema & other fixed-duration: auto-select the only duration on arrival at step 2
  const autoSetDuration = (f: Facility) => {
    if (f.minDurationMinutes === f.maxDurationMinutes) return f.minDurationMinutes;
    return f.minDurationMinutes;
  };

  return (
    <div>
      {/* Waha Pass gate — non-admin, pass status resolved, no active credential */}
      {!isAdmin && !wahaPassLoading && !hasActivePass && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold mb-1">{t(lang, "fac_waha_pass_required")}</p>
              <Link href="/portal/waha-pass" className="underline font-medium hover:text-amber-900">
                {t(lang, "fac_waha_pass_cta")} →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Free Allowance Status */}
      {!isAdmin && !allowanceLoading && allowance && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <div>
              <p className="font-semibold mb-1">{t(lang, "fac_free_allowance_title")}</p>
              <p className="text-emerald-700 text-xs mb-1">
                {allowance.available && allowance.eligibleForBooking
                  ? t(lang, "fac_free_allowance_available")
                  : allowance.available && allowance.reason === "no_waha_pass"
                    ? t(lang, "fac_free_allowance_no_pass")
                  : allowance.claim
                    ? t(lang, "fac_free_allowance_used")
                    : t(lang, "fac_free_allowance_unavailable")}
              </p>
              {allowance.renewsAt && (
                 <p className="text-emerald-600 text-xs">
                   {t(lang, "fac_free_allowance_renews")} {formatDate(allowance.renewsAt, lang)}
                 </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Booking Rules Banner */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          <div>
            <p className="font-semibold mb-1">{t(lang, "fac_booking_rules")}</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-xs">
              <li>{t(lang, "fac_rule_1")}</li>
              <li>{t(lang, "fac_rule_2")}</li>
              <li>{t(lang, "fac_rule_3")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step indicator — hidden when gate is active */}
      {(isAdmin || hasActivePass || wahaPassLoading) && <div className="flex items-center gap-0 mb-8">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              step === s.n ? "bg-blue-600 text-white" :
              step > s.n ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
            )}>
              <span className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold",
                step === s.n ? "bg-white/20" : step > s.n ? "bg-green-200" : "bg-slate-200"
              )}>
                {step > s.n ? "✓" : s.n}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && <div className={cn("h-px w-6 mx-1", step > s.n ? "bg-green-300" : "bg-slate-200")} />}
          </div>
        ))}
      </div>}

      {/* Steps 1–4: only rendered when user has an active pass */}
      {(isAdmin || hasActivePass || wahaPassLoading) && <>

      {/* Step 1: Facility selection */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">{t(lang, "fac_select_facility")}</h2>
          {facilities.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t(lang, "fac_no_facilities")}</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFacility(f);
                  setSelectedDuration(autoSetDuration(f));
                  setStep(2);
                }}
                className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-xl p-5 text-start transition-all hover:shadow-md group"
              >
                <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-900">{f.name}</h3>
                {f.description && <p className="text-slate-500 text-sm mt-1 line-clamp-2">{f.description}</p>}
                <FacilityRulesChip facility={f} lang={lang} />
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>{t(lang, "fac_weekdays")}: {formatHourLabel(f.weekdayOpenHour, lang)}–{formatHourLabel(f.weekdayCloseHour, lang)}</span>
                  <span>{t(lang, "fac_weekends")}: {formatHourLabel(f.weekendOpenHour, lang)}–{formatHourLabel(f.weekendCloseHour, lang)}</span>
                </div>
                {f.requiresApproval && (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">
                    <Shield className="h-3 w-3" />{t(lang, "fac_requires_approval")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Date + Duration */}
      {step === 2 && selectedFacility && (
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setStep(1)} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">{selectedFacility.name} — {t(lang, "fac_step2_heading")}</h2>
          </div>
          <p className="text-slate-500 text-sm mb-6 ms-6">
            {selectedFacility.requiresApproval ? t(lang, "fac_approval_required_msg") : t(lang, "fac_confirmed_immediately")}
          </p>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div>
              <Label className="text-sm font-medium text-slate-700">{t(lang, "fac_label_date")}</Label>
              <DatePickerField
                value={selectedDate}
                onChange={v => { setSelectedDate(v); setSelectedSlot(null); }}
                minDate={todayStr()}
                maxDate={isAdmin ? undefined : maxDateStr}
              />
              {selectedDate && (
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString(dateLang(lang), { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  {" "}({isWeekendBookingDate(selectedDate) ? t(lang, "fac_weekend_hours") : t(lang, "fac_weekday_hours")})
                </p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">{t(lang, "fac_label_booking_duration")}</Label>

              {/* Fixed-duration facilities (e.g. Cinema) */}
              {selectedFacility.minDurationMinutes === selectedFacility.maxDurationMinutes ? (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  <p className="font-medium">{durationLabel(selectedFacility.minDurationMinutes, lang)} — {t(lang, "fac_fixed_session")}</p>
                  <p className="text-blue-600 text-xs mt-0.5">{t(lang, "fac_fixed_duration_note")}</p>
                  <p className="font-semibold mt-2">
                    {t(lang, "fac_total")}: {calcCost(selectedFacility, selectedFacility.minDurationMinutes)} SAR
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Array.from(
                    { length: Math.floor((selectedFacility.maxDurationMinutes - selectedFacility.minDurationMinutes) / 30) + 1 },
                    (_, i) => selectedFacility.minDurationMinutes + i * 30
                  ).map(mins => {
                    const cost = calcCost(selectedFacility, mins);
                    return (
                      <button
                        key={mins}
                        onClick={() => { setSelectedDuration(mins); setSelectedSlot(null); }}
                        className={cn(
                          "border rounded-lg p-3 text-start transition-all",
                          selectedDuration === mins
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 hover:border-blue-300 bg-white"
                        )}
                      >
                        <p className="font-medium text-sm text-slate-800">{durationLabel(mins, lang)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cost} SAR</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              disabled={!selectedDate || !selectedDuration}
              onClick={() => setStep(3)}
            >
              {t(lang, "fac_btn_view_times")} <ChevronRight className="h-4 w-4 ms-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Time slot grid */}
      {step === 3 && selectedFacility && (
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setStep(2)} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {selectedFacility.name} — {new Date(selectedDate + "T12:00:00").toLocaleDateString(dateLang(lang), { weekday: "long", month: "short", day: "numeric" })}
            </h2>
          </div>
          <p className="text-slate-500 text-sm mb-4 ms-6">
            {t(lang, "fac_label_duration_inline")}: <strong>{durationLabel(selectedDuration!, lang)}</strong>
            {" · "}{t(lang, "fac_label_cost")}: <strong>{totalCost} SAR</strong>
          </p>

          {availLoading && (
            <div className="flex items-center gap-2 text-slate-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> {t(lang, "fac_loading_avail")}
            </div>
          )}

          {avail && !availLoading && (
            <>
              <div className="flex flex-wrap gap-4 mb-4 text-xs">
                <div className="flex items-center gap-1.5"><div className="h-4 w-4 bg-green-100 border border-green-300 rounded" /> {t(lang, "fac_legend_available")}</div>
                <div className="flex items-center gap-1.5"><div className="h-4 w-4 bg-red-100 border border-red-300 rounded" /> {t(lang, "fac_legend_booked")}</div>
                <div className="flex items-center gap-1.5"><div className="h-4 w-4 bg-blue-500 rounded" /> {t(lang, "fac_legend_selected")}</div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot.hour}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-lg p-3 text-sm font-medium border transition-all",
                      !slot.available
                        ? "bg-red-50 border-red-200 text-red-400 cursor-not-allowed"
                        : selectedSlot?.hour === slot.hour
                        ? "bg-blue-500 border-blue-600 text-white shadow-md scale-105"
                        : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-400 hover:scale-105"
                    )}
                  >
                    {formatHourLabel(slot.hour, lang)}
                  </button>
                ))}
              </div>

              {availableSlots.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>{t(lang, "fac_no_slots")}</p>
                </div>
              )}

              {selectedSlot && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                  <p className="font-medium text-blue-900">{t(lang, "fac_selected_label")} {formatHourLabel(selectedSlot.hour, lang)}</p>
                  <p className="text-blue-700">
                    {t(lang, "fac_end_time_label")} {formatHourLabel(selectedSlot.hour + selectedDuration! / 60, lang)}
                    <span className="ms-2 text-blue-500">{withMinutes("fac_cleaning_note")}</span>
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button disabled={!selectedSlot} onClick={() => { setCutoffError(null); setStep(4); }}>
                  {t(lang, "fac_btn_review_confirm")} <ChevronRight className="h-4 w-4 ms-1" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && selectedFacility && selectedSlot && selectedDuration && (
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => { setCutoffError(null); setStep(3); }} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">{t(lang, "fac_confirm_heading")}</h2>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
              <h3 className="font-semibold text-slate-900 text-lg">{selectedFacility.name}</h3>
              {selectedFacility.description && <p className="text-slate-500 text-sm mt-0.5">{selectedFacility.description}</p>}
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Calendar className="h-4 w-4" />{t(lang, "fac_label_date")}</span>
                <span className="font-medium text-slate-800">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString(dateLang(lang), { weekday: "long", month: "long", day: "numeric" })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Clock className="h-4 w-4" />{t(lang, "fac_label_time")}</span>
                <span className="font-medium text-slate-800">
                  {formatHourLabel(selectedSlot.hour, lang)} → {formatHourLabel(selectedSlot.hour + selectedDuration / 60, lang)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t(lang, "fac_label_duration_row")}</span>
                <span className="font-medium text-slate-800">{durationLabel(selectedDuration, lang)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t(lang, "fac_label_pricing")}</span>
                <span className="font-medium text-slate-800">{pricingLabel(selectedFacility, lang)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
                <span className="text-slate-700 font-medium">{t(lang, "fac_total")}</span>
                {isFreeAllowanceApplicable ? (
                  <div className="text-end">
                    <span className="font-bold text-slate-900 text-base line-through opacity-50 me-2">{totalCost} SAR</span>
                    <span className="font-bold text-emerald-600 text-base">0.00 SAR</span>
                    <p className="text-xs text-emerald-600 mt-1 font-normal">{t(lang, "fac_free_allowance_applied")}</p>
                  </div>
                ) : (
                  <span className="font-bold text-slate-900 text-base">{totalCost} SAR</span>
                )}
              </div>
              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                <Clock className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                <span>{withMinutes("fac_cleaning_interval_note")}</span>
              </div>
              {requiresClosingCleaningDisclaimer && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <strong>{withMinutes("fac_closing_cleaning_disclaimer")}</strong>
                </div>
              )}
              {selectedFacility.requiresApproval && !isCinema && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t(lang, "fac_approval_note")}</span>
                </div>
              )}
              {isCinema && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t(lang, "fac_cinema_review_note")}</span>
                </div>
              )}
              {/* F8: Non-refundable disclaimer — shown on every booking before confirmation */}
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <strong>{t(lang, "fac_nonrefundable_disclaimer")}</strong>
              </div>
            </div>
          </div>

          {/* Cut-off error banner */}
          {cutoffError && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="font-semibold mb-0.5">{t(lang, "fac_cutoff_error_title")}</p>
                <p className="text-red-700 text-xs">{cutoffError}</p>
              </div>
            </div>
          )}

          {isCinema && (
            <div className="mt-4">
              <Label>{t(lang, "fac_movie_title")} <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                placeholder={t(lang, "fac_movie_title_placeholder")}
                value={movieTitle}
                onChange={e => setMovieTitle(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">{t(lang, "fac_movie_review_note")}</p>
            </div>
          )}

          <div className="mt-4">
            <Label>{t(lang, "fac_notes")} <span className="text-slate-400 font-normal">{t(lang, "optional")}</span></Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder={t(lang, "fac_notes_placeholder")}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStep(1)} disabled={bookMutation.isPending || paymentLoading}>{t(lang, "fac_btn_start_over")}</Button>
            <Button onClick={() => bookMutation.mutate()} disabled={bookMutation.isPending || paymentLoading || (isCinema && !movieTitle.trim())}>
              {paymentLoading
                ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{t(lang, "fac_redirecting_payment")}</>
                : bookMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{t(lang, "fac_submitting_booking")}</>
                  : bookingSubmitButtonLabel({
                    lang,
                    requiresApproval: selectedFacility.requiresApproval,
                    isCinema,
                    totalCost,
                    usesFreeMonthlyAllowance: !!isFreeAllowanceApplicable,
                  })
              }
            </Button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

// ─── My Bookings Tab ──────────────────────────────────────────────────────────
function MyBookings() {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [dateMode, setDateMode] = useState<"all" | "upcoming">("all");
  const [facilityFilter, setFacilityFilter] = useState<number | null>(null);

  // H4 P1 — server-side filters so records beyond page 1 are not silently truncated.
  // Filter state is included in the query key; usePaginatedApi resets to page 1
  // automatically when any key element changes.
  const { items: bookings, totalPages, page, setPage, isLoading } = usePaginatedApi<Booking>(
    ["bookings", filter, dateMode, facilityFilter],
    (p, l) => {
      const params = new URLSearchParams({ page: String(p), limit: String(l) });
      if (filter !== "all") params.set("status", filter);
      if (dateMode === "upcoming") params.set("upcoming", "true");
      if (facilityFilter !== null) params.set("facilityId", String(facilityFilter));
      return `/bookings?${params}`;
    },
  );

  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ["facilities"],
    queryFn: () => apiRequest("/facilities"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/bookings/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); toast({ title: t(lang, "fac_cancel_booking") }); },
  });

  // Filters are applied server-side via usePaginatedApi — no client-side
  // post-fetch filtering here. Client-side filtering on page data silently
  // truncated records beyond page 1 (H4 root cause).

  const filterLabels: Record<string, string> = {
    all: t(lang, "all"),
    pending: t(lang, "fac_status_pending"),
    confirmed: t(lang, "fac_status_confirmed"),
    cancelled: t(lang, "fac_status_cancelled"),
    completed: t(lang, "fac_status_completed"),
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["all", "upcoming"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDateMode(mode)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                dateMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
            >
              {mode === "all" ? t(lang, "all") : t(lang, "fac_filter_upcoming")}
            </button>
          ))}
        </div>
        {facilities.length > 0 && (
          <select
            value={facilityFilter ?? ""}
            onChange={e => setFacilityFilter(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">{t(lang, "fac_all_facilities")}</option>
            {facilities.filter(f => f.isActive).map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["all", "pending", "confirmed", "cancelled", "completed"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("text-xs px-3 py-1.5 rounded-full transition-colors",
              filter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {filterLabels[s]}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex items-center gap-2 text-slate-500 py-8"><Loader2 className="h-4 w-4 animate-spin" />{t(lang, "loading")}</div>}
      {!isLoading && bookings.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t(lang, "fac_no_bookings_found")}</p>
        </div>
      )}

      <div className="space-y-3">
        {bookings.map(b => (
          <BookingCard
            key={b.id}
            b={b}
            lang={lang}
            onCancel={() => cancelMutation.mutate(b.id)}
            cancelPending={cancelMutation.isPending}
          />
        ))}
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminScheduleAvailability({ facilities }: { facilities: Facility[] }) {
  const { lang } = useLanguage();
  const [facilityId, setFacilityId] = useState<number | null>(facilities[0]?.id ?? null);
  const [date, setDate] = useState(todayStr());
  const { data: availability, isLoading } = useQuery<Availability>({
    queryKey: ["admin-facility-availability", facilityId, date],
    queryFn: () => apiRequest(`/facilities/${facilityId}/availability?date=${date}`),
    enabled: facilityId !== null,
    refetchInterval: 30_000,
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="admin-schedule-availability">
      <h3 className="font-semibold text-slate-800">Schedule availability</h3>
      <p className="mt-1 text-xs text-slate-500">Choose a facility and date to view every available and unavailable booking slot.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          {t(lang, "fac_select_facility")}
          <select value={facilityId ?? ""} onChange={(event) => setFacilityId(Number(event.target.value))} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" data-testid="select-admin-schedule-facility">
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
        <div className="w-44">
          <Label className="text-xs">{t(lang, "fac_select_date")}</Label>
          <DatePickerField value={date} onChange={setDate} />
        </div>
      </div>
      {isLoading ? <p className="mt-4 text-sm text-slate-500">{t(lang, "loading")}</p> : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(availability?.slots ?? []).map((slot) => (
            <div key={slot.startISO} className={cn("rounded-md border px-2 py-1.5 text-center text-xs", slot.available ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500")} data-testid={`admin-schedule-slot-${slot.startISO}`}>
              <span className="font-medium">{slot.label}</span>
              <span className="ml-1">{slot.available ? t(lang, "fac_available") : t(lang, "fac_unavailable")}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AdminPanel({ facilities, role }: { facilities: Facility[]; role?: string }) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canManageFacilities = role === "admin";
  const canApprove = role === "admin" || role === "supervisor";
  const [open, setOpen] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", pricePerHour: "", maxCapacity: "",
    capacityMode: "numeric",
    slotIntervalMinutes: "60", minDurationMinutes: "60", maxDurationMinutes: "240",
    cleaningBufferMinutes: "15",
    requiresApproval: false,
    pricingModel: "per_hour", flatFeeAmount: "",
  });

  const { data: allBookingsResult, isLoading: bookingsLoading } = useQuery<{ data: Booking[]; total: number }>({
    queryKey: ["bookings"],
    queryFn: () => apiRequest("/bookings?limit=200"),
    refetchInterval: 30_000,
  });
  const allBookings = allBookingsResult?.data ?? [];
  const { data: facilityAudit } = useQuery<FacilityAudit>({
    queryKey: ["facility-audit"],
    queryFn: () => apiRequest("/facilities/audit"),
    enabled: canManageFacilities,
  });
  const configNormalizations = facilityAudit?.configNormalizations ?? [];
  const operatingHoursConflicts = facilityAudit?.operatingHoursConflicts ?? [];

  const confirmBookingMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/bookings/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); toast({ title: "Booking confirmed" }); },
  });
  const cancelBookingMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/bookings/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); toast({ title: "Booking cancelled" }); },
  });

  const openNew = () => {
    setEditFacility(null);
    setForm({
      name: "", description: "", pricePerHour: "", maxCapacity: "",
      capacityMode: "numeric",
      slotIntervalMinutes: "60", minDurationMinutes: "60", maxDurationMinutes: "240",
      cleaningBufferMinutes: "15",
      requiresApproval: false, pricingModel: "per_hour", flatFeeAmount: "",
    });
    setOpen(true);
  };

  const openEdit = (f: Facility) => {
    setEditFacility(f);
    setForm({
      name: f.name, description: f.description ?? "", pricePerHour: f.pricePerHour,
      maxCapacity: f.maxCapacity?.toString() ?? "",
      capacityMode: f.capacityMode ?? "numeric",
      slotIntervalMinutes: f.slotIntervalMinutes.toString(),
      minDurationMinutes: f.minDurationMinutes.toString(),
      maxDurationMinutes: f.maxDurationMinutes.toString(),
      cleaningBufferMinutes: (f.cleaningBufferMinutes ?? 15).toString(),
      requiresApproval: f.requiresApproval,
      pricingModel: f.pricingModel, flatFeeAmount: f.flatFeeAmount ?? "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name, description: form.description || null,
        pricePerHour: form.pricingModel === "per_hour" ? form.pricePerHour : (Number(form.flatFeeAmount) / (Number(form.minDurationMinutes) / 60)).toFixed(2),
        maxCapacity: form.capacityMode === "numeric" && form.maxCapacity ? Number(form.maxCapacity) : null,
        capacityMode: form.capacityMode,
        slotIntervalMinutes: Number(form.slotIntervalMinutes),
        minDurationMinutes: Number(form.minDurationMinutes), maxDurationMinutes: Number(form.maxDurationMinutes),
        cleaningBufferMinutes: Number(form.cleaningBufferMinutes),
        requiresApproval: form.requiresApproval,
        pricingModel: form.pricingModel,
        flatFeeAmount: form.pricingModel === "flat" ? form.flatFeeAmount || null : null,
      };
      return editFacility
        ? apiRequest(`/facilities/${editFacility.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiRequest("/facilities", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      setOpen(false);
      toast({ title: editFacility ? "Facility updated" : "Facility created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/facilities/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["facilities"] }); toast({ title: "Facility deactivated" }); },
  });

  const pendingBookings = allBookings?.filter(b => b.status === "pending") ?? [];
  const bookingUnitLabel = (booking: Booking) =>
    booking.unit?.building === "HOA" && booking.unit.unitNumber === "COMMON"
      ? "Common Area"
      : booking.unit
        ? displayUnitReference(`${booking.unit.building}${booking.unit.unitNumber}`)
        : displayUnitReference(booking.resident?.unitNumber);

  return (
    <div className="space-y-6">
      <AdminScheduleAvailability facilities={facilities} />
      <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="admin-booking-overview">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">{t(lang, "fac_all_bookings")}</h3>
            <p className="mt-1 text-xs text-slate-500">All facility reservations, including their booked unit. Availability is reflected by booked time slots below.</p>
          </div>
          <span className="text-xs text-slate-400">{allBookingsResult?.total ?? "—"}</span>
        </div>
        {bookingsLoading ? <div className="mt-4 text-sm text-slate-500">{t(lang, "loading")}</div> : (
          <div className="mt-4 space-y-2">
            {allBookings.length === 0 ? <p className="text-sm text-slate-400">{t(lang, "fac_no_bookings")}</p> : allBookings.map(booking => (
              <div key={booking.id} className="grid gap-1 rounded-lg border border-slate-100 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto]" data-testid={`admin-booking-${booking.id}`}>
                <span className="font-medium text-slate-800">{booking.facilityName}</span>
                <span className="text-slate-600">{formatDate(booking.startTime, lang)} · {formatTime(booking.startTime, lang)}–{formatTime(booking.endTime, lang)}</span>
                <span className="text-slate-500 sm:text-end">{bookingUnitLabel(booking)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {/* Pending approvals */}
      {pendingBookings.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3">{t(lang, "fac_pending_approvals")} ({pendingBookings.length})</h3>
          <div className="space-y-2">
            {pendingBookings.map(b => (
              <div key={b.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900 text-sm">{b.facilityName}</p>
                  <p className="text-xs text-slate-500">
                    {b.resident?.firstName} {b.resident?.lastName} · {t(lang, "sidebar_unit")} {bookingUnitLabel(b)}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(b.startTime, lang)} · {formatTime(b.startTime, lang)}–{formatTime(b.endTime, lang)} · {Number(b.totalAmount).toFixed(2)} SAR</p>
                  {b.movieTitle && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-100 border border-purple-200 rounded px-2 py-0.5">
                      🎬 {t(lang, "fac_movie_label")} {b.movieTitle} <span className="font-normal text-purple-500">— {t(lang, "fac_content_compliance")}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {canApprove ? (
                    <>
                      <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700" onClick={() => confirmBookingMutation.mutate(b.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 me-1" />{t(lang, "fac_btn_confirm")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 border-red-200" onClick={() => cancelBookingMutation.mutate(b.id)}>
                        <XCircle className="h-3.5 w-3.5 me-1" />{t(lang, "reject")}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">{t(lang, "fac_awaiting_approver")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facility list — management is admin-only */}
      {canManageFacilities && (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">{t(lang, "fac_facilities_heading")}</h3>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" />{t(lang, "fac_add_facility")}
          </Button>
        </div>
        <div className="space-y-2">
          {facilities.map(f => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{f.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                  <span>{pricingLabel(f, lang)}</span>
                  {f.maxCapacity && <span>{f.maxCapacity} {t(lang, "fac_people_max")}</span>}
                  <span>{durationLabel(f.minDurationMinutes, lang)}–{durationLabel(f.maxDurationMinutes, lang)}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openEdit(f)}>
                  <Settings className="h-3.5 w-3.5" />{t(lang, "edit")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 border-red-200"
                  onClick={() => deactivateMutation.mutate(f.id)}>{t(lang, "fac_btn_deactivate")}</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {canManageFacilities && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-800">{t(lang, "fac_audit_heading")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t(lang, "fac_audit_description")}</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-100 p-3">
              <h4 className="text-sm font-medium text-slate-700">{t(lang, "fac_audit_config_changes")}</h4>
              {configNormalizations.length ? (
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {configNormalizations.map(item => (
                    <li key={item.id} className="rounded bg-slate-50 p-2">
                      <p className="font-medium text-slate-800">{item.facilityName}</p>
                      <p>
                        {item.previousSlotIntervalMinutes}/{item.previousMinDurationMinutes}/{item.previousMaxDurationMinutes}
                        {" → "}
                        {item.normalizedSlotIntervalMinutes}/{item.normalizedMinDurationMinutes}/{item.normalizedMaxDurationMinutes} {t(lang, "fac_audit_minutes")}
                      </p>
                      <p className="mt-1 text-slate-400">{formatDateTime(item.createdAt, lang)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">{t(lang, "fac_audit_none")}</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-100 p-3">
              <h4 className="text-sm font-medium text-slate-700">{t(lang, "fac_audit_booking_conflicts")}</h4>
              {operatingHoursConflicts.length ? (
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {operatingHoursConflicts.map(item => (
                    <li key={item.id} className="rounded bg-amber-50 p-2">
                      <p className="font-medium text-amber-900">{item.facilityName} · #{item.bookingId}</p>
                      <p>{item.reason}</p>
                      <p className="mt-1 text-amber-600">{formatDateTime(item.createdAt, lang)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">{t(lang, "fac_audit_none")}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {pendingBookings.length === 0 && !canManageFacilities && (
        <div className="text-center text-sm text-slate-400 py-10">{t(lang, "fac_no_pending")}</div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editFacility ? `${t(lang, "fac_dialog_edit_prefix")}${editFacility.name}` : t(lang, "fac_add_facility_dialog")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>{t(lang, "fac_form_name")}</Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>{t(lang, "fac_form_description")}</Label>
              <Textarea className="mt-1" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            {/* Pricing model */}
            <div className="col-span-2">
              <Label>{t(lang, "fac_form_pricing_model")}</Label>
              <div className="flex gap-3 mt-2">
                {["per_hour", "flat"].map(model => (
                  <button key={model} onClick={() => setForm(f => ({ ...f, pricingModel: model }))}
                    className={cn("flex-1 border rounded-lg p-3 text-sm font-medium transition-all",
                      form.pricingModel === model ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
                    {model === "per_hour" ? t(lang, "fac_form_per_hour_btn") : t(lang, "fac_form_flat_fee_btn")}
                  </button>
                ))}
              </div>
            </div>

            {form.pricingModel === "per_hour" ? (
              <div>
                <Label>{t(lang, "fac_form_price_per_hour")}</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={form.pricePerHour}
                  onChange={e => setForm(f => ({ ...f, pricePerHour: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>{t(lang, "fac_form_flat_fee_amount")}</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={form.flatFeeAmount}
                  onChange={e => setForm(f => ({ ...f, flatFeeAmount: e.target.value }))} />
              </div>
            )}

            {/* Capacity mode */}
            <div className="col-span-2">
              <Label>{t(lang, "fac_capacity_mode")}</Label>
              <div className="flex gap-2 mt-2">
                {(["numeric", "posted", "available"] as const).map(mode => (
                  <button key={mode} onClick={() => setForm(f => ({ ...f, capacityMode: mode }))}
                    className={cn("flex-1 border rounded-lg p-2.5 text-xs font-medium transition-all",
                      form.capacityMode === mode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
                    {t(lang, `fac_capacity_mode_${mode}` as any)}
                  </button>
                ))}
              </div>
            </div>

            {form.capacityMode === "numeric" && (
              <div>
                <Label>{t(lang, "fac_form_max_capacity")}</Label>
                <Input className="mt-1" type="number" min="0" value={form.maxCapacity}
                  onChange={e => setForm(f => ({ ...f, maxCapacity: e.target.value }))} />
              </div>
            )}

            <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p><strong>{t(lang, "fac_weekdays")}:</strong> {formatHourLabel(10, lang)}–{formatHourLabel(23, lang)}</p>
              <p className="mt-1"><strong>{t(lang, "fac_weekends")}:</strong> {formatHourLabel(10, lang)}–{formatHourLabel(25, lang)}</p>
            </div>

            <div>
              <Label>{t(lang, "fac_form_slot_interval")}</Label>
              <Input className="mt-1" type="number" min="30" step="30" value={form.slotIntervalMinutes}
                onChange={e => setForm(f => ({ ...f, slotIntervalMinutes: e.target.value }))} />
            </div>
            <div>
              <Label>{t(lang, "fac_form_min_duration")}</Label>
              <Input className="mt-1" type="number" min="30" step="30" value={form.minDurationMinutes}
                onChange={e => setForm(f => ({ ...f, minDurationMinutes: e.target.value }))} />
            </div>
            <div>
              <Label>{t(lang, "fac_form_max_duration")}</Label>
              <Input className="mt-1" type="number" min="30" step="30" value={form.maxDurationMinutes}
                onChange={e => setForm(f => ({ ...f, maxDurationMinutes: e.target.value }))} />
            </div>
            <div>
              <Label>{t(lang, "fac_form_cleaning_buffer")}</Label>
              <Input className="mt-1" type="number" min="0" step="1" value={form.cleaningBufferMinutes}
                onChange={e => setForm(f => ({ ...f, cleaningBufferMinutes: e.target.value }))} />
            </div>

            <div className="col-span-2 flex items-center justify-between p-3 border border-slate-200 rounded-lg">
              <div>
                <p className="font-medium text-slate-700 text-sm">{t(lang, "fac_form_requires_approval")}</p>
                <p className="text-xs text-slate-400">{t(lang, "fac_form_requires_approval_desc")}</p>
              </div>
              <Switch checked={form.requiresApproval} onCheckedChange={v => setForm(f => ({ ...f, requiresApproval: v }))} />
            </div>

            <div className="col-span-2">
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
                {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{t(lang, "fac_form_saving")}</> : editFacility ? t(lang, "fac_form_save_changes") : t(lang, "fac_form_create_facility")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FacilitiesPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const [tab, setTab] = useState<"book" | "mybookings" | "admin">("book");
  const isStaff = user?.role === "admin" || user?.role === "supervisor" || user?.role === "guard";

  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ["facilities"],
    queryFn: () => apiRequest("/facilities"),
  });

  const activeFacilities = facilities.filter(f => f.isActive);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">{t(lang, "fac_title")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("book")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "book" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
        >
          {t(lang, "fac_title")}
        </button>
        <button
          onClick={() => setTab("mybookings")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "mybookings" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
        >
          {t(lang, "fac_my_bookings_tab")}
        </button>
        {isStaff && (
          <button
            onClick={() => setTab("admin")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tab === "admin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
          >
            {t(lang, "fac_admin_tab")}
          </button>
        )}
      </div>

      {tab === "book" && <BookingWizard facilities={activeFacilities} />}
      {tab === "mybookings" && <MyBookings />}
      {tab === "admin" && isStaff && <AdminPanel facilities={activeFacilities} role={user?.role} />}
    </div>
  );
}
