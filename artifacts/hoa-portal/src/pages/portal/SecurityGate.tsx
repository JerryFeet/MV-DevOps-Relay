import { useState, useRef, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Shield, Camera, CameraOff, Search, CheckCircle2, XCircle,
  Loader2, LogIn, LogOut, QrCode, RotateCcw, Clock,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SELECTABLE_UNIT_REFERENCES, isSelectableUnitReference } from "@workspace/unit-reference";

// ─── Guest Pass types ─────────────────────────────────────────────────────────

type GuestVerifyResult = {
  credentialType?: "guest" | "daypass" | "waha" | "unknown";
  valid: boolean;
  status: string;
  visitDate?: string;
  message?: string;
  passType?: "guest" | "daypass";
  guestCount?: number;
  vehiclePlate?: string | null;
  guestName?: string | null;
  hostName?: string | null;
  holderName?: string | null;
  unitNumber?: string | null;
  paid?: boolean;
};

// ─── Waha Pass types ──────────────────────────────────────────────────────────

type WahaVerifyResult = {
  valid: boolean;
  status: string;
  passNumber: string | null;
  credentialIndex: number;
  holderName: string;
  occupancyTrack: string | null;
  unitNumber: string | null;
  revocationReason: string | null;
  message: string;
};

type GatePermitResult = {
  allowed: boolean;
  status: string;
  unitNumber: string;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  contractorName?: string | null;
  contractorMobile?: string | null;
};

type GatePlateLookupResult =
  | {
      status: "registered";
      residentName: string | null;
      unitNumber: string | null;
      vehicle: { make: string; model: string; color: string | null };
    }
  | { status: "not_registered" };

type ResidentSearchType = "name" | "nationalId" | "unitNumber";
type PermitLookupType = "movein" | "moveout" | "renovation";

// ─── Guest pass result card ───────────────────────────────────────────────────

export function GuestStatusDisplay({ result }: { result: GuestVerifyResult }) {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const approved = result.valid;
  const isExpired = result.status === "PASS_EXPIRED";
  const color = approved
    ? "border-green-500 bg-green-50"
    : isExpired
      ? "border-amber-400 bg-amber-50"
      : "border-red-500 bg-red-50";
  const icon = approved
    ? <CheckCircle2 className="h-12 w-12 text-green-600" />
    : isExpired
      ? <Clock className="h-12 w-12 text-amber-500" />
      : <XCircle className="h-12 w-12 text-red-600" />;
  const label = approved ? T("gate_approved") : isExpired ? T("gate_pass_expired") : result.status;
  const textColor = approved ? "text-green-800" : isExpired ? "text-amber-800" : "text-red-800";
  const subColor = approved ? "text-green-600" : isExpired ? "text-amber-600" : "text-red-500";
  const locale = lang === "ar" ? "ar-SA" : "en-SA";

  return (
    <div className={cn("rounded-2xl border-2 p-6 text-center space-y-3", color)}>
      <div className="flex justify-center">{icon}</div>
      <div>
        <p className={cn("text-2xl font-bold tracking-wide", textColor)}>{label}</p>
        <p className={cn("text-sm mt-1", subColor)}>{result.message}</p>
      </div>
      {result.visitDate && (
        <div className="bg-white rounded-xl p-4 text-left space-y-2 shadow-sm mt-2">
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            {new Date(result.visitDate + "T12:00:00").toLocaleDateString(locale, {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>
          {result.passType === "daypass" && (
            <>
              <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">{T("gate_day_pass_type")}</span>
                <span className="text-sm font-semibold text-slate-900">{T("gate_day_pass_label")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{T("gate_day_pass_guest_count")}</span>
                <span className="text-sm font-semibold text-slate-900">{result.guestCount}</span>
              </div>
              {result.vehiclePlate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{T("gate_day_pass_plate")}</span>
                  <span className="text-sm font-semibold text-slate-900 font-mono">{result.vehiclePlate}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Waha Pass result card ────────────────────────────────────────────────────

export function WahaStatusDisplay({ result }: { result: WahaVerifyResult }) {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const approved = result.valid;
  const borderColor = approved ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50";
  const icon = approved
    ? <CheckCircle2 className="h-12 w-12 text-green-600" />
    : <XCircle className="h-12 w-12 text-red-600" />;
  const statusLabel = approved
    ? (lang === "ar" ? "موافق — يُسمح بالدخول" : "APPROVED — ENTRY PERMITTED")
    : result.status.replace(/_/g, " ");
  const textColor = approved ? "text-green-800" : "text-red-800";
  const subColor = approved ? "text-green-600" : "text-red-500";

  const occupancyLabels: Record<string, { en: string; ar: string }> = {
    owner:        { en: "Owner",        ar: "مالك"      },
    tenant:       { en: "Tenant",       ar: "مستأجر"    },
    second_owner: { en: "Second Owner", ar: "مالك ثانٍ" },
  };
  const occupancyDisplay = result.occupancyTrack
    ? (lang === "ar"
        ? (occupancyLabels[result.occupancyTrack]?.ar ?? result.occupancyTrack)
        : (occupancyLabels[result.occupancyTrack]?.en ?? result.occupancyTrack))
    : null;

  return (
    <div className={cn("rounded-2xl border-2 p-6 text-center space-y-3", borderColor)}>
      <div className="flex justify-center">{icon}</div>
      <div>
        <p className={cn("text-2xl font-bold tracking-wide", textColor)}>{statusLabel}</p>
        <p className={cn("text-sm mt-1", subColor)}>{result.message}</p>
      </div>

      {/* Credential detail card */}
      <div className="bg-white rounded-xl p-4 text-left space-y-2.5 shadow-sm mt-2">
        {/* Holder name — most prominent */}
        <p className="font-bold text-slate-900 text-xl leading-tight">{result.holderName}</p>

        {/* Pass number */}
        {result.passNumber && (
          <p className="text-xs font-mono text-slate-400 tracking-wider">{result.passNumber}</p>
        )}

        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          {/* Unit */}
          {result.unitNumber !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{T("gate_waha_unit")}</span>
              <span className="text-sm font-semibold text-slate-900">{displayUnitReference(result.unitNumber)}</span>
            </div>
          )}

          {/* Credential index */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{T("gate_waha_cred")}</span>
            <span className="text-sm font-semibold text-slate-900">
              {lang === "ar" ? `البطاقة ${result.credentialIndex}` : `Credential ${result.credentialIndex}`}
            </span>
          </div>

          {/* Occupancy type */}
          {occupancyDisplay && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{T("gate_waha_occupancy")}</span>
              <span className="text-sm font-semibold text-slate-900">{occupancyDisplay}</span>
            </div>
          )}

          {/* Revocation reason — shown when pass is not active */}
          {!approved && result.revocationReason && (
            <div className="flex items-start justify-between pt-1 border-t border-red-100">
              <span className="text-sm text-slate-500">{T("gate_waha_revocation")}</span>
              <span className="text-sm font-semibold text-red-700 text-right max-w-[60%]">
                {result.revocationReason}
              </span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function UnifiedScanDisplay({ result }: { result: GuestVerifyResult }) {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const approved = result.valid;
  const reasonKey: Record<string, string> = {
    EXPIRED: "gate_scan_reason_expired",
    REVOKED: "gate_scan_reason_revoked",
    PAYMENT_PENDING: "gate_scan_reason_unpaid",
    NOT_YET_VALID: "gate_scan_reason_not_yet_valid",
    NOT_VALID_MADAIN_VILLAGE_CREDENTIAL: "gate_scan_reason_unknown",
    REPORTED_LOST: "gate_scan_reason_revoked",
    REPORTED_STOLEN: "gate_scan_reason_revoked",
    REPORTED_DAMAGED: "gate_scan_reason_revoked",
    APPLICATION_REVOKED: "gate_scan_reason_revoked",
  };
  const reason = approved ? T("gate_scan_valid") : T(reasonKey[result.status] ?? "gate_scan_reason_invalid");
  const detailRows = result.credentialType === "waha"
    ? [[T("gate_waha_holder"), result.holderName], [T("gate_waha_unit"), displayUnitReference(result.unitNumber)]]
    : result.credentialType === "daypass"
      ? [
        [T("gate_scan_visit_date"), result.visitDate],
        [T("gate_day_pass_guest_count"), result.guestCount?.toString()],
        [T("gate_scan_host"), result.hostName],
        [T("gate_waha_unit"), displayUnitReference(result.unitNumber)],
        [T("gate_scan_paid"), result.paid ? T("yes") : T("no")],
        ...(result.vehiclePlate ? [[T("gate_day_pass_plate"), result.vehiclePlate]] : []),
      ]
      : result.credentialType === "guest"
        ? [
          [T("gate_scan_guest"), result.guestName],
          [T("gate_scan_host"), result.hostName],
          [T("gate_waha_unit"), displayUnitReference(result.unitNumber)],
          [T("gate_scan_visit_date"), result.visitDate],
          ...(result.vehiclePlate ? [[T("gate_day_pass_plate"), result.vehiclePlate]] : []),
        ]
        : [];

  return (
    <div className={cn(
      "rounded-2xl border-2 p-6 text-center space-y-4",
      approved ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50",
    )}>
      <div className="flex justify-center">
        {approved ? <CheckCircle2 className="h-14 w-14 text-green-600" /> : <XCircle className="h-14 w-14 text-red-600" />}
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-wide", approved ? "text-green-800" : "text-red-800")}>
          {reason}
        </p>
        <p className={cn("text-sm mt-1", approved ? "text-green-700" : "text-red-700")}>{result.status.replace(/_/g, " ")}</p>
      </div>
      {detailRows.length > 0 && (
        <div className="rounded-xl bg-white p-4 text-left shadow-sm space-y-2">
          {detailRows.map(([label, value]) => value ? (
            <div key={label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="font-semibold text-slate-900 text-right">{value}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

function LookupUnavailableCard() {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-amber-500 bg-amber-50 p-5 text-center"
    >
      <XCircle className="mx-auto h-10 w-10 text-amber-700" />
      <p className="mt-3 text-lg font-bold text-amber-900">{T("gate_lookup_unavailable")}</p>
      <p className="mt-1 text-sm text-amber-800">{T("gate_lookup_unavailable_detail")}</p>
    </div>
  );
}

/** Fast gate lookup: text narrows canonical units, but only a canonical value submits. */
function GateUnitPicker({ value, onChange, onSubmit, disabled, placeholder }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  disabled: boolean; placeholder: string;
}) {
  const matches = SELECTABLE_UNIT_REFERENCES.filter(unit => unit.startsWith(value.toUpperCase())).slice(0, 20);
  const valid = isSelectableUnitReference(value);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input list="gate-unit-options" value={value} placeholder={placeholder}
          onChange={event => onChange(event.target.value.toUpperCase())}
          onKeyDown={event => event.key === "Enter" && valid && onSubmit()} className="font-mono" />
        <datalist id="gate-unit-options">{matches.map(unit => <option key={unit} value={unit} />)}</datalist>
      </div>
      <Button onClick={onSubmit} disabled={disabled || !valid}>
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// ─── Shared camera / scan section ────────────────────────────────────────────

function ScanSection({
  cameraActive,
  cameraError,
  videoRef,
  onStartCamera,
  onStopCamera,
  input,
  onInputChange,
  onSearch,
  loading,
  placeholder,
  orEnterLabel,
  scanQrLabel,
  stopCameraLabel,
}: {
  cameraActive: boolean;
  cameraError: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStartCamera: () => void;
  onStopCamera: () => void;
  input: string;
  onInputChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  placeholder: string;
  orEnterLabel: string;
  scanQrLabel: string;
  stopCameraLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {cameraActive ? (
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-video object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/70 rounded-xl w-48 h-48 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <Button size="sm" variant="outline" className="bg-white/90" onClick={onStopCamera}>
                <CameraOff className="h-4 w-4 me-2" />{stopCameraLabel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-3 bg-slate-50">
            <QrCode className="h-12 w-12 text-slate-300" />
            <Button onClick={onStartCamera} className="gap-2">
              <Camera className="h-4 w-4" />{scanQrLabel}
            </Button>
            {cameraError && (
              <p className="text-xs text-red-500 text-center px-4">{cameraError}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">{orEnterLabel}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSearch()}
          className="font-mono text-sm"
        />
        <Button onClick={onSearch} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SecurityGatePage() {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const { data: currentUser } = useCurrentUser();
  // Only admin and guard roles can use the residents search endpoint.
  const canSearchResidents =
    currentUser?.role === "admin" || currentUser?.role === "guard";
  const activeSessionName =
    [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ").trim()
    || currentUser?.email
    || T("gate_active_session_unknown");

  // ── Mode toggle ──
  const [mode, setMode] = useState<"guest" | "residents" | "plate" | "permits">("guest");

  // ── Guest pass state ──
  const [guestInput, setGuestInput] = useState("");
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestResult, setGuestResult] = useState<GuestVerifyResult | null>(null);
  const [logLoading, setLogLoading] = useState<"ENTRY" | "EXIT" | null>(null);

  // ── Waha pass state ──
  const [wahaInput, setWahaInput] = useState("");
  const [wahaLoading, setWahaLoading] = useState(false);
  const [wahaResult, setWahaResult] = useState<WahaVerifyResult | null>(null);

  // ── Resident search state ──
  const [residentInput, setResidentInput] = useState("");
  const [residentSearchType, setResidentSearchType] = useState<ResidentSearchType>("name");
  const [residentLoading, setResidentLoading] = useState(false);
  const [residentResults, setResidentResults] = useState<Array<{
    firstName: string | null;
    lastName: string | null;
    unitNumber: string | null;
    role: string | null;
    relationship?: string | null;
    idNumberIsGuardian?: boolean;
  }> | null>(null);
  const [permitLookupType, setPermitLookupType] = useState<PermitLookupType>("movein");
  const [permitUnitInput, setPermitUnitInput] = useState("");
  const [permitLoading, setPermitLoading] = useState(false);
  const [permitResult, setPermitResult] = useState<GatePermitResult | null>(null);
  const [guestLookupUnavailable, setGuestLookupUnavailable] = useState(false);
  const [residentLookupUnavailable, setResidentLookupUnavailable] = useState(false);
  const [permitLookupUnavailable, setPermitLookupUnavailable] = useState(false);
  const [plateInput, setPlateInput] = useState("");
  const [plateLoading, setPlateLoading] = useState(false);
  const [plateResult, setPlateResult] = useState<GatePlateLookupResult | null>(null);
  const [plateLookupUnavailable, setPlateLookupUnavailable] = useState(false);

  // ── Shared camera state ──
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const scanningRef = useRef(false);
  // Each scan owns a generation. A delayed prior response must never replace
  // the result for a later credential (or revive a result after reset).
  const guestScanGenerationRef = useRef(0);

  // ── Guest pass verify ──
  const verifyGuest = useCallback(async (rawInput: string) => {
    if (!rawInput.trim()) return;
    const generation = ++guestScanGenerationRef.current;
    const urlMatch = rawInput.match(/[?&]token=([^&\s]+)/);
    const token = urlMatch ? decodeURIComponent(urlMatch[1]) : rawInput.trim();
    setGuestLoading(true);
    setGuestResult(null);
    setGuestToken(null);
    setGuestLookupUnavailable(false);
    try {
      const data = await apiRequest(`/security/gate/scan?code=${encodeURIComponent(rawInput.trim())}`);
      if (generation !== guestScanGenerationRef.current) return;
      setGuestResult(data);
      if (data.valid && data.credentialType === "guest") setGuestToken(token);
    } catch {
      if (generation !== guestScanGenerationRef.current) return;
      setGuestLookupUnavailable(true);
      toast({ title: T("gate_lookup_unavailable"), description: T("gate_lookup_unavailable_detail"), variant: "destructive" });
    } finally {
      if (generation === guestScanGenerationRef.current) setGuestLoading(false);
    }
  }, [toast, lang]);

  // ── Camera ──
  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (readerRef.current) {
      try { BrowserMultiFormatReaderStop(readerRef.current); } catch {}
      readerRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (onScan: (raw: string) => void) => {
    setCameraError(null);
    setCameraActive(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      scanningRef.current = true;

      await reader.decodeFromVideoDevice(undefined, videoRef.current!, (res) => {
        if (res && scanningRef.current) {
          const text = res.getText();
          scanningRef.current = false;
          setCameraActive(false);
          stopCamera();
          onScan(text);
        }
      });
    } catch {
      setCameraError(T("gate_camera_error"));
      setCameraActive(false);
    }
  }, [stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Guest entry/exit log ──
  const logEntryExit = async (eventType: "ENTRY" | "EXIT") => {
    if (!guestResult?.valid || !guestToken) return;
    setLogLoading(eventType);
    try {
      await apiRequest("/security/gate/entry-exit", {
        method: "POST",
        body: JSON.stringify({ verificationToken: guestToken, eventType }),
      });
      toast({
        title: eventType === "ENTRY" ? T("gate_entry_logged") : T("gate_exit_logged"),
      });
    } catch (e: any) {
      toast({ title: T("gate_log_failed"), description: e.message, variant: "destructive" });
    } finally {
      setLogLoading(null);
    }
  };

  const resetGuest = () => {
    ++guestScanGenerationRef.current;
    setGuestResult(null);
    setGuestInput("");
    setGuestToken(null);
    setGuestLookupUnavailable(false);
    stopCamera();
  };

  const resetWaha = () => {
    setWahaResult(null);
    setWahaInput("");
    stopCamera();
  };

  // ── Resident search ──
  const searchResidents = async () => {
    if (!residentInput.trim() || (residentSearchType === "unitNumber" && !isSelectableUnitReference(residentInput))) return;
    setResidentLoading(true);
    setResidentResults(null);
    setResidentLookupUnavailable(false);
    try {
      const queryKey = residentSearchType === "nationalId"
        ? "nationalId"
        : residentSearchType === "unitNumber"
          ? "unitNumber"
          : "name";
      const data = await apiRequest(`/gate/residents?${queryKey}=${encodeURIComponent(residentInput.trim())}`);
      if (!Array.isArray(data)) throw new Error("Unexpected resident lookup response");
      setResidentResults(data);
    } catch {
      setResidentLookupUnavailable(true);
      toast({ title: T("gate_lookup_unavailable"), description: T("gate_lookup_unavailable_detail"), variant: "destructive" });
    } finally {
      setResidentLoading(false);
    }
  };

  const checkPermit = async () => {
    if (!isSelectableUnitReference(permitUnitInput)) return;
    const endpoint = {
      movein: "move-in-status",
      moveout: "move-out-status",
      renovation: "renovation-status",
    }[permitLookupType];
    setPermitLoading(true);
    setPermitResult(null);
    setPermitLookupUnavailable(false);
    try {
      const result: GatePermitResult = await apiRequest(
        `/gate/${endpoint}?unitNumber=${encodeURIComponent(permitUnitInput.trim())}`,
      );
      if (!result || typeof result.allowed !== "boolean" || typeof result.status !== "string") {
        throw new Error("Unexpected permit lookup response");
      }
      setPermitResult(result);
    } catch {
      setPermitLookupUnavailable(true);
      toast({ title: T("gate_lookup_unavailable"), description: T("gate_lookup_unavailable_detail"), variant: "destructive" });
    } finally {
      setPermitLoading(false);
    }
  };

  const lookupPlate = async () => {
    if (!plateInput.trim()) return;
    setPlateLoading(true);
    setPlateResult(null);
    setPlateLookupUnavailable(false);
    try {
      const result: GatePlateLookupResult = await apiRequest(
        `/gate/plate-lookup?plate=${encodeURIComponent(plateInput.trim())}`,
      );
      if (!result || !["registered", "not_registered"].includes(result.status)) {
        throw new Error("Unexpected plate lookup response");
      }
      setPlateResult(result);
    } catch {
      setPlateLookupUnavailable(true);
      toast({ title: T("gate_lookup_unavailable"), description: T("gate_lookup_unavailable_detail"), variant: "destructive" });
    } finally {
      setPlateLoading(false);
    }
  };

  // ── Switch mode ──
  const switchMode = (m: "guest" | "residents" | "plate" | "permits") => {
    stopCamera();
    setMode(m);
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{T("gate_title")}</h1>
          <p className="text-sm text-slate-500">{T("gate_subtitle")}</p>
        </div>
      </div>
      {canSearchResidents && (
        <div
          data-testid="gate-active-session"
          className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">{T("gate_active_session")}</p>
          <p className="text-lg font-bold text-slate-900">{activeSessionName}</p>
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-5 bg-slate-50">
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            mode === "guest"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
          )}
          onClick={() => switchMode("guest")}
        >
          {T("gate_guest_tab")}
        </button>
        {canSearchResidents && (
          <button
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              mode === "residents"
                ? "bg-slate-700 text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
            )}
            onClick={() => switchMode("residents")}
          >
            {T("gate_residents_tab")}
          </button>
        )}
        {canSearchResidents && (
          <button
            data-testid="gate-plate-tab"
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              mode === "plate"
                ? "bg-emerald-700 text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
            )}
            onClick={() => switchMode("plate")}
          >
            {T("gate_plate_tab")}
          </button>
        )}
        {canSearchResidents && (
          <button
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              mode === "permits"
                ? "bg-amber-700 text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
            )}
            onClick={() => switchMode("permits")}
          >
            {T("gate_permits_tab")}
          </button>
        )}
      </div>

      {/* ── Guest Pass mode ── */}
      {mode === "guest" && (
        <>
          <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {T("gate_identity_help")}
          </p>
          {!guestResult ? (
            <div className="space-y-4">
              {guestLookupUnavailable && <LookupUnavailableCard />}
              <ScanSection
                cameraActive={cameraActive}
                cameraError={cameraError}
                videoRef={videoRef}
                onStartCamera={() =>
                  startCamera((raw) => {
                    const urlMatch = raw.match(/[?&]token=([^&]+)/);
                    const token = urlMatch ? decodeURIComponent(urlMatch[1]) : raw;
                    setGuestInput(token);
                    verifyGuest(token);
                  })
                }
                onStopCamera={stopCamera}
                input={guestInput}
                onInputChange={setGuestInput}
                onSearch={() => verifyGuest(guestInput)}
                loading={guestLoading}
                placeholder={T("gate_unified_scan_placeholder")}
                orEnterLabel={T("gate_unified_scan_or_enter")}
                scanQrLabel={T("gate_unified_scan_qr")}
                stopCameraLabel={T("gate_stop_camera")}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <UnifiedScanDisplay result={guestResult} />

              {guestResult.valid && guestResult.credentialType === "guest" && guestToken && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">{T("gate_log_movement")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => logEntryExit("ENTRY")}
                      disabled={!!logLoading}
                    >
                      {logLoading === "ENTRY" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                      {T("gate_guest_entered")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-slate-300"
                      onClick={() => logEntryExit("EXIT")}
                      disabled={!!logLoading}
                    >
                      {logLoading === "EXIT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      {T("gate_guest_exited")}
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full gap-2" onClick={resetGuest}>
                <RotateCcw className="h-4 w-4" />{T("gate_scan_next")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Residents mode ── */}
      {mode === "residents" && canSearchResidents && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {([
              ["name", T("gate_resident_search_name")],
              ["nationalId", T("gate_resident_search_national_id")],
              ["unitNumber", T("gate_resident_search_unit")],
            ] as const).map(([searchType, label]) => (
              <button
                key={searchType}
                type="button"
                className={cn(
                  "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                  residentSearchType === searchType
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900",
                )}
                onClick={() => {
                  setResidentSearchType(searchType);
                  setResidentResults(null);
                  setResidentLookupUnavailable(false);
                  setResidentInput("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {residentSearchType === "unitNumber" ? (
            <GateUnitPicker value={residentInput} onChange={setResidentInput} onSubmit={searchResidents}
              disabled={residentLoading} placeholder={T("gate_resident_unit_search_placeholder")} />
          ) : <div className="flex gap-2">
            <Input
              placeholder={T(
                residentSearchType === "nationalId"
                  ? "gate_resident_national_id_placeholder"
                  : "gate_resident_search_placeholder",
              )}
              value={residentInput}
              onChange={e => setResidentInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchResidents()}
              className="text-sm"
            />
            <Button onClick={searchResidents} disabled={residentLoading || !residentInput.trim()}>
              {residentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>}
          {residentLookupUnavailable ? <LookupUnavailableCard /> : residentResults !== null && (
            residentResults.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                {T("gate_resident_no_results")}
              </div>
            ) : (
              <div className="space-y-2">
                {residentResults.map(r => (
                  <div
                    key={`${r.firstName ?? ""}-${r.lastName ?? ""}-${r.unitNumber ?? ""}-${r.role ?? ""}`}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                  >
                    <p className="font-semibold text-slate-900">
                      {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                    </p>
                    {r.unitNumber ? (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {T("gate_resident_unit_label")} <span className="font-medium text-slate-700">{displayUnitReference(r.unitNumber)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 mt-0.5">—</p>
                    )}
                    <p className="text-xs text-slate-400 capitalize mt-0.5">{r.relationship ?? r.role}{r.idNumberIsGuardian ? ` · ${T("res_guardian_id")}` : ""}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
      {mode === "plate" && canSearchResidents && (
        <div className="space-y-4">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {T("gate_plate_description")}
          </p>
          <div className="flex gap-2">
            <Input
              data-testid="gate-plate-input"
              placeholder={T("gate_plate_placeholder")}
              value={plateInput}
              onChange={e => setPlateInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookupPlate()}
              className="font-mono text-sm"
            />
            <Button onClick={lookupPlate} disabled={plateLoading || !plateInput.trim()}>
              {plateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {plateLookupUnavailable ? <LookupUnavailableCard /> : plateResult && (
            plateResult.status === "not_registered" ? (
              <div data-testid="gate-plate-result" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
                <XCircle className="mx-auto h-8 w-8 text-amber-700" />
                <p className="mt-2 font-semibold text-amber-900">{T("gate_plate_not_registered")}</p>
              </div>
            ) : (
              <div data-testid="gate-plate-result" className="rounded-xl border border-green-300 bg-green-50 p-4">
                <div className="flex items-center gap-2 text-green-900">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-semibold">{T("gate_plate_registered")}</p>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-700">
                  <p><span className="text-slate-500">{T("gate_plate_resident")}: </span>{plateResult.residentName ?? "—"}</p>
                  <p><span className="text-slate-500">{T("gate_resident_unit_label")}: </span>{displayUnitReference(plateResult.unitNumber)}</p>
                  <p><span className="text-slate-500">{T("gate_plate_vehicle")}: </span>{[plateResult.vehicle.make, plateResult.vehicle.model, plateResult.vehicle.color].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            )
          )}
        </div>
      )}
      {mode === "permits" && canSearchResidents && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {([
              ["movein", T("gate_permit_move_in")],
              ["moveout", T("gate_permit_move_out")],
              ["renovation", T("gate_permit_renovation")],
            ] as const).map(([lookupType, label]) => (
              <button
                key={lookupType}
                type="button"
                className={cn(
                  "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                  permitLookupType === lookupType
                    ? "bg-amber-700 text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900",
                )}
                onClick={() => {
                  setPermitLookupType(lookupType);
                  setPermitResult(null);
                  setPermitLookupUnavailable(false);
                  setPermitUnitInput("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-600">
            {T(`gate_${permitLookupType}_description`)}
          </p>
          <GateUnitPicker value={permitUnitInput} onChange={setPermitUnitInput} onSubmit={checkPermit}
            disabled={permitLoading} placeholder={T("gate_permit_unit_placeholder")} />
          {permitLookupUnavailable ? <LookupUnavailableCard /> : permitResult && (
            <div className={cn(
              "rounded-xl border p-4",
              permitResult.allowed ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900",
            )}>
              <p className="font-semibold">
                {T(`gate_${permitLookupType}_${permitResult.allowed ? "approved" : "not_approved"}`)}
              </p>
              <p className="text-sm mt-1">{T("gate_resident_unit_label")} {displayUnitReference(permitResult.unitNumber)}</p>
              {permitResult.allowed && <p className="text-sm mt-1">
                {permitResult.requestedStartDate}
                {permitResult.requestedEndDate && permitResult.requestedEndDate !== permitResult.requestedStartDate
                  ? ` – ${permitResult.requestedEndDate}`
                  : ""}
              </p>}
              {permitLookupType === "renovation" && permitResult.allowed && (
                <div className="mt-3 border-t border-green-200 pt-3 space-y-1 text-sm">
                  <p>{T("gate_contractor_name")} {permitResult.contractorName || "—"}</p>
                  <p>{T("gate_contractor_mobile")} {permitResult.contractorMobile || "—"}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BrowserMultiFormatReaderStop(reader: any) {
  if (typeof reader.reset === "function") reader.reset();
}
