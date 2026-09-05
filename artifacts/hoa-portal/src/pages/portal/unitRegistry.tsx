import { useState } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { apiRequest } from "@/lib/api";
import {
  Building2, Search, ChevronLeft, ChevronRight, User, Users, Car, KeyRound,
  ParkingSquare, Shield, Phone, Mail, CreditCard, FileText, X,
  Plus, Pencil, Trash2, AlertTriangle, Wrench, CheckCircle2, XCircle,
  CalendarDays, ClipboardList, UserRoundCheck, ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { SELECTABLE_UNIT_REFERENCES } from "@workspace/unit-reference";

export async function invalidateUnitRegistryCorrectionQueries(
  queryClient: QueryClient,
  unitId: number,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin-units-full"] }),
    queryClient.invalidateQueries({ queryKey: ["unit-history", unitId] }),
  ]);
}

// ── Types ────────────────────────────────────────────────────────────────────

type UnitOwnershipCheckResult = {
  unitId: number;
  unitRecord: {
    id: number;
    building: string;
    unitNumber: string;
    titleReference: string | null;
    ownerNationalId: string | null;
    isVerified: boolean;
    verifiedOwnerId: number | null;
  };
  verifiedOwnerName: string | null;
};

type SearchMode = "unit" | "name" | "nationalId";

type OwnerInfo = {
  id: number; firstName: string | null; lastName: string | null;
  email: string; phone: string | null; nationalId: string | null;
  verificationStatus: string;
};

type TenantInfo = OwnerInfo & { ejarReference: string | null };

type ResidentInfo = {
  id: number; firstName: string; lastName: string;
  relationship: string | null; idNumber: string | null; idNumberIsGuardian: boolean; type: string;
  email: string | null; phone: string | null;
  portalAccess: boolean;
  hasActiveWahaCredential: boolean;
};

type VehicleInfo = {
  id: number; make: string; model: string; year: number | null;
  color: string | null; plateNumber: string; status: string;
  parkingLotNumber: string | null;
  parkingType: "underground" | "surface" | null;
};

type WahaPassInfo = {
  id: number; occupancyTrack: string; status: string;
  credentials: { id: number; passNumber: string | null; holderName: string; status: string; credentialIndex: number }[];
};

type PermitInfo = {
  id: number;
  type: string;
  status: string;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  renovationScope: string | null;
  contractorName: string | null;
  contractorContact: string | null;
  createdAt: string;
  updatedAt: string;
};

type GuestPassInfo = {
  id: number;
  visitDate: string;
  visitStartTime: string | null;
  visitEndTime: string | null;
  vehiclePlate: string | null;
  reasonForVisit: string | null;
  status: string;
};

type GuestInfo = {
  id: number;
  firstName: string;
  lastName: string;
  vehiclePlate: string | null;
  visitDate: string;
  visitReason: string | null;
  status: string;
  passes: GuestPassInfo[];
};

type GuestDayPassInfo = {
  id: number;
  date: string;
  guestCount: number | null;
  extraGuestCount: number;
  vehiclePlate: string | null;
  amountSar: string;
  paymentStatus: string;
  issuedAt: string | null;
  revokedAt: string | null;
};

type PaymentInfo = {
  id: number;
  purpose: string;
  amount: string;
  currency: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
};

type BookingInfo = {
  id: number;
  resolvedFacilityName: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
};

/** Legacy shape from the unit list (parkingLots JSONB column on units table) */
type LegacyParkingLot = { lotNumber: string; building: string; isInside?: boolean };

/** Normalized shape from /api/units/:unitId/parking-lots */
type NormalizedParkingLot = {
  id: number;
  unitId: number;
  building: string;
  lotNumber: string;
  parkingType: "underground" | "surface";
  active: boolean;
  source: string | null;
  sourceReference: string | null;
  label?: string;
};

type ParkingLot = LegacyParkingLot; // used in EnrichedUnit (legacy)

type EnrichedUnit = {
  id: number; building: string; unitNumber: string;
  floor: string | null; unitType: string | null; sizeSqm: string | null;
  occupantType: string; parkingLots: ParkingLot[];
  owner: OwnerInfo | null; tenant: TenantInfo | null;
  residents: ResidentInfo[]; vehicles: VehicleInfo[]; wahaPasses: WahaPassInfo[];
  permits: PermitInfo[]; guests: GuestInfo[]; guestDayPasses: GuestDayPassInfo[];
  payments: PaymentInfo[]; bookings: BookingInfo[];
  ownerless: { source: "never_registered" | "ownership_released"; since: string; elapsedDays: number } | null;
};

type PagedResult = {
  data: EnrichedUnit[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  buildings: string[];
  nameSearch?: string;
};

type MasterDataAudit = {
  id: number;
  actorUserId: number | null;
  action: string;
  field: string;
  oldValue: any;
  newValue: any;
  createdAt: string;
};

type CorrectionRecord = {
  id: number;
  entityType: string;
  sourceReference: string | null;
  issueCode: string;
  details: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function verificationBadge(status: string, lang: Lang) {
  const { label, cls } = ({
    verified_owner:   { label: t(lang, "unit_reg_verified"),   cls: "bg-green-100 text-green-700" },
    verified_tenant:  { label: t(lang, "unit_reg_verified"),   cls: "bg-green-100 text-green-700" },
    pending_manual:   { label: t(lang, "unit_reg_pending"),    cls: "bg-amber-100 text-amber-700" },
    pending_owner_approval: { label: t(lang, "unit_reg_pending"), cls: "bg-amber-100 text-amber-700" },
    unverified:       { label: t(lang, "unit_reg_unverified"), cls: "bg-slate-100 text-slate-500" },
  } as Record<string, { label: string; cls: string }>)[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cls)}>{label}</span>;
}

function occupantBadge(type: string, lang: Lang) {
  const map: Record<string, { label: string; cls: string }> = {
    owner_occupied:  { label: t(lang, "unit_reg_owner_occupied"),  cls: "bg-blue-100 text-blue-700" },
    tenant_occupied: { label: t(lang, "unit_reg_tenant_occupied"), cls: "bg-purple-100 text-purple-700" },
    vacant:          { label: t(lang, "unit_reg_vacant"),          cls: "bg-slate-100 text-slate-500" },
  };
  const { label, cls } = map[type] ?? { label: type, cls: "bg-slate-100 text-slate-500" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cls)}>{label}</span>;
}

function registryValueLabel(value: string, lang: Lang) {
  const arabic: Record<string, string> = {
    move_in: "نقل دخول", move_out: "نقل خروج", renovation: "تجديد",
    additional_vehicle: "مركبة إضافية", draft: "مسودة", submitted: "مقدم",
    under_review: "قيد المراجعة", approved: "معتمد",
    approved_with_conditions: "معتمد بشروط", rejected: "مرفوض",
    in_progress: "قيد التنفيذ", completed: "مكتمل",
    deposit_refunded: "تم رد التأمين", deposit_forfeited: "تم حجز التأمين",
    pending: "معلق", pending_payment: "بانتظار الدفع", confirmed: "مؤكد",
    cancelled: "ملغى", expired: "منتهي", revoked: "ملغى الصلاحية",
    active: "نشط", paid: "مدفوع", unpaid: "غير مدفوع", failed: "فشل",
    refunded: "مسترد", waived: "معفى", not_required: "غير مطلوب",
    cosmetic: "تجميلي", structural: "إنشائي", paint: "دهان", kitchen: "مطبخ",
    guest_day_pass: "تصريح ضيوف ليوم واحد", facility_booking: "حجز مرفق",
    booking: "حجز", owner: "مالك", tenant: "مستأجر", resident: "مقيم",
    family_friend: "زيارة عائلية أو صديق", delivery: "توصيل",
    facility_event: "فعالية في المرافق", maintenance_work: "أعمال صيانة",
    household_work: "أعمال منزلية", medical: "طبي", other: "أخرى",
    spouse: "زوج أو زوجة", child: "ابن أو ابنة", parent: "والد أو والدة",
    family_member: "فرد من العائلة",
  };
  return lang === "ar"
    ? (arabic[value] ?? value.replace(/_/g, " "))
    : value.replace(/_/g, " ");
}

function passStatusBadge(status: string, lang: Lang) {
  const cls = {
    active: "bg-green-100 text-green-700",
    pending_review: "bg-amber-100 text-amber-700",
    revoked: "bg-red-100 text-red-700",
    rejected: "bg-slate-100 text-slate-500",
  }[status] ?? "bg-slate-100 text-slate-500";
  return <span className={cn("text-xs px-2 py-0.5 rounded-full", cls)}>{registryValueLabel(status, lang)}</span>;
}

function credentialStatusBadge(status: string, lang: Lang) {
  const statusKey = `waha_status_${status}` as const;
  const label = t(lang, statusKey) ?? status.replace(/_/g, " ");
  const cls = (() => {
    if (status === "active") return "bg-green-100 text-green-700";
    if (status === "damaged") return "bg-amber-100 text-amber-700";
    if (["revoked", "lost", "stolen"].includes(status)) return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-500";
  })();
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", cls)}>{label}</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-500 w-32 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium break-all">{value}</span>
    </div>
  );
}

function RegistrySection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
      open={count > 0 ? true : undefined}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          <span>{title}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90 rtl:group-open:-rotate-90" />
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

function formatRegistryDate(value: string | null | undefined, lang: Lang) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

function parseScope(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return [value];
  }
}


function AdminUnitCorrectionPanel({ unit, lang, onSaved }: { unit: EnrichedUnit; lang: Lang; onSaved: () => void }) {
  const [building, setBuilding] = useState(unit.building);
  const [unitNumber, setUnitNumber] = useState(unit.unitNumber);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const T = (k: string) => t(lang, k);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest(`/units/${unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ building, unitNumber })
      });
      toast({ title: T("unit_reg_correction_saved") });
      await onSaved();
    } catch (e: any) {
      toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-blue-200 rounded-lg bg-blue-50/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800 mb-3">
        <Building2 className="h-4 w-4 text-blue-600" />
        {T("unit_reg_admin_correction_title")}
      </h3>
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 space-y-1 w-full">
          <Label className="text-xs text-blue-800">{T("unit_reg_building")}</Label>
          <Input value={building} onChange={e => setBuilding(e.target.value)} className="bg-white" />
        </div>
        <div className="flex-1 space-y-1 w-full">
          <Label className="text-xs text-blue-800">{T("unit_reg_unit_number")}</Label>
          <Input value={unitNumber} onChange={e => setUnitNumber(e.target.value)} className="bg-white" />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || (building === unit.building && unitNumber === unit.unitNumber)}
          className="w-full sm:w-auto"
        >
          {saving ? T("saving") : T("save")}
        </Button>
      </div>
    </section>
  );
}

function AdminMasterDataHistoryPanel({ unitId, lang }: { unitId: number; lang: Lang }) {
  const T = (k: string) => t(lang, k);
  const { data: history = [], isLoading } = useQuery<MasterDataAudit[]>({
    queryKey: ["unit-history", unitId],
    queryFn: () => apiRequest(`/units/${unitId}/history`),
  });

  return (
    <section className="border border-slate-200 rounded-lg bg-slate-50/50 p-4 mt-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
        <ClipboardList className="h-4 w-4 text-slate-500" />
        {T("unit_reg_audit_history")}
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{T("unit_reg_no_audit_history")}</p>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/60 text-xs text-slate-500">
              <tr>
                <th className="text-start px-3 py-2">{T("unit_reg_audit_date")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_audit_action")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_audit_field")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_audit_old")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_audit_new")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/40">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2 text-slate-700 font-medium">
                    {registryValueLabel(row.action, lang)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.field}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">
                    {typeof row.oldValue === 'object' ? JSON.stringify(row.oldValue) : String(row.oldValue ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-slate-700 max-w-[120px] truncate">
                    {typeof row.newValue === 'object' ? JSON.stringify(row.newValue) : String(row.newValue ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


  const handleApiError = (err: any, T: (k: string) => string, toast: any, lang: Lang) => {
    let msg = err?.message ?? "";
    let parsedErr: any = {};
    try {
      parsedErr = JSON.parse(msg);
    } catch {
      parsedErr = {};
    }

    if (parsedErr.error === "PARKING_ENTITLEMENT_OVERALLOCATED") {
      const typeStr = parsedErr.parkingType === "underground"
        ? T("unit_reg_parking_underground")
        : T("unit_reg_parking_surface");
      const desc = T("unit_reg_parking_overallocated_desc")
        .replace("{type}", typeStr)
        .replace("{count}", String(parsedErr.vehiclesCount))
        .replace("{entitlement}", String(parsedErr.entitlement));
      toast({
        title: T("unit_reg_parking_overallocated"),
        description: parsedErr.message ?? desc,
        variant: "destructive",
      });
    } else {
      const errStr = typeof parsedErr.error === "string" ? parsedErr.error : "";
      const isDuplicate = errStr.includes("already exists");
      toast({
        title: isDuplicate ? T("unit_reg_parking_error_duplicate") : t(lang, "common_error"),
        description: isDuplicate ? undefined : ((parsedErr.message ?? errStr) || t(lang, "common_error")),
        variant: "destructive",
      });
    }
  };

// ── Admin Parking Lot Form ────────────────────────────────────────────────────

type ParkingLotFormProps = {
  open: boolean;
  onClose: () => void;
  unitId: number;
  lot?: NormalizedParkingLot | null;
  lang: Lang;
  onSaved: () => void;
};

function ParkingLotForm({ open, onClose, unitId, lot, lang, onSaved }: ParkingLotFormProps) {
  const { toast } = useToast();
  const T = (k: string) => t(lang, k);
  const isEdit = !!lot;

  const [building, setBuilding] = useState(lot?.building ?? "");
  const [lotNumber, setLotNumber] = useState(lot?.lotNumber ?? "");
  const [parkingType, setParkingType] = useState<"underground" | "surface">(lot?.parkingType ?? "underground");
  const [active, setActive] = useState(lot?.active !== false);
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens with new lot data
  useEffect(() => {
    if (open) {
      setBuilding(lot?.building ?? "");
      setLotNumber(lot?.lotNumber ?? "");
      setParkingType(lot?.parkingType ?? "underground");
      setActive(lot?.active !== false);
    }
  }, [open, lot]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!building.trim() || !lotNumber.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ building: building.trim(), lotNumber: lotNumber.trim(), parkingType, active });
      if (isEdit && lot) {
        await apiRequest(`/units/${unitId}/parking-lots/${lot.id}`, { method: "PATCH", body });
        toast({ title: T("unit_reg_parking_updated") });
      } else {
        await apiRequest(`/units/${unitId}/parking-lots`, { method: "POST", body });
        toast({ title: T("unit_reg_parking_added") });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      handleApiError(err, T, toast, lang);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? T("unit_reg_parking_edit_title") : T("unit_reg_parking_add_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="pl-building">{T("unit_reg_parking_building_label")}</Label>
            <Input
              id="pl-building"
              value={building}
              onChange={e => setBuilding(e.target.value)}
              required
              placeholder="e.g. A1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pl-lot">{T("unit_reg_parking_lot_label")}</Label>
            <Input
              id="pl-lot"
              value={lotNumber}
              onChange={e => setLotNumber(e.target.value)}
              required
              placeholder="e.g. 12"
            />
          </div>
          <div className="space-y-1">
            <Label>{T("unit_reg_parking_type")}</Label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700"
              value={parkingType}
              onChange={e => setParkingType(e.target.value as "underground" | "surface")}
            >
              <option value="underground">{T("unit_reg_parking_underground")}</option>
              <option value="surface">{T("unit_reg_parking_surface")}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pl-active"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Label htmlFor="pl-active" className="cursor-pointer text-sm">
              {active ? T("unit_reg_parking_active") : T("unit_reg_parking_inactive")}
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t(lang, "cancel")}
            </Button>
            <Button type="submit" disabled={saving || !building.trim() || !lotNumber.trim()}>
              {saving ? T("unit_reg_parking_saving") : T("unit_reg_parking_save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Admin Parking Management Panel ───────────────────────────────────────────

function AdminParkingPanel({ unitId, lang }: { unitId: number; lang: Lang }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const T = (k: string) => t(lang, k);

  const queryKey = ["unit-parking-lots", unitId];

  const { data: lots = [], isLoading } = useQuery<NormalizedParkingLot[]>({
    queryKey,
    queryFn: () => apiRequest(`/units/${unitId}/parking-lots`),
  });

  const deleteMutation = useMutation({
    mutationFn: (lotId: number) =>
      apiRequest(`/units/${unitId}/parking-lots/${lotId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      // Also invalidate the unit list so counts update
      qc.invalidateQueries({ queryKey: ["admin-units-full"] });
      qc.invalidateQueries({ queryKey: ["unit-history", unitId] });
      toast({ title: T("unit_reg_parking_deleted") });
    },
    onError: (err: any) => handleApiError(err, T, toast, lang),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<NormalizedParkingLot | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleSaved() {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["admin-units-full"] });
    qc.invalidateQueries({ queryKey: ["unit-history", unitId] });
  }

  function openAdd() {
    setEditingLot(null);
    setFormOpen(true);
  }

  function openEdit(lot: NormalizedParkingLot) {
    setEditingLot(lot);
    setFormOpen(true);
  }

  return (
    <section className="border border-amber-200 rounded-lg bg-amber-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <Shield className="h-4 w-4 text-amber-600" />
          {T("unit_reg_admin_parking_title")}
        </h3>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAdd}>
          <Plus className="h-3 w-3" /> {T("unit_reg_parking_add")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 bg-amber-100 animate-pulse rounded" />)}
        </div>
      ) : lots.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{T("unit_reg_no_parking")}</p>
      ) : (
        <div className="rounded-lg border border-amber-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-amber-100/60 text-xs text-amber-700">
              <tr>
                <th className="text-start px-3 py-2">{T("unit_reg_parking_building_label")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_parking_lot_label")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_parking_type")}</th>
                <th className="text-start px-3 py-2">{T("unit_reg_status")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {lots.map(lot => (
                <tr key={lot.id} className="bg-white hover:bg-amber-50/40">
                  <td className="px-3 py-2 font-medium text-slate-900">{lot.building}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{lot.lotNumber}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {lot.parkingType === "underground"
                      ? T("unit_reg_parking_underground")
                      : T("unit_reg_parking_surface")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      lot.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {lot.active ? T("unit_reg_parking_active") : T("unit_reg_parking_inactive")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(lot)}
                        aria-label={T("unit_reg_parking_edit")}
                        className="p-1 rounded hover:bg-amber-100 text-amber-700 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(lot.id)}
                        aria-label={T("unit_reg_parking_delete")}
                        className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit form dialog */}
      <ParkingLotForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        unitId={unitId}
        lot={editingLot}
        lang={lang}
        onSaved={handleSaved}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={v => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {T("unit_reg_parking_delete")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700 mt-2">{T("unit_reg_parking_confirm_delete")}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {t(lang, "cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDeleteId !== null) {
                  deleteMutation.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              {T("unit_reg_parking_delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Admin Corrections Panel ───────────────────────────────────────────────────

function AdminCorrectionsPanel({ lang }: { lang: Lang }) {
  const T = (k: string) => t(lang, k);

  const { data: corrections = [], isLoading } = useQuery<CorrectionRecord[]>({
    queryKey: ["data-migration-corrections"],
    queryFn: () => apiRequest("/data-migration-corrections"),
    staleTime: 60_000,
  });

  return (
    <section className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Wrench className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">
          {T("unit_reg_corrections_title")} {!isLoading && `(${corrections.length})`}
        </h2>
      </div>

      {isLoading ? (
        <div className="px-5 py-4 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : corrections.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400 italic">{T("unit_reg_corrections_empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="text-start px-4 py-2">{T("unit_reg_correction_entity")}</th>
                <th className="text-start px-4 py-2">{T("unit_reg_correction_source_ref")}</th>
                <th className="text-start px-4 py-2">{T("unit_reg_correction_issue")}</th>
                <th className="text-start px-4 py-2">{T("unit_reg_correction_details")}</th>
                <th className="text-start px-4 py-2">{T("unit_reg_correction_created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {corrections.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                      {c.entityType}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500 max-w-[120px] truncate">
                    {c.sourceReference ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {c.issueCode}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 text-xs max-w-[200px] truncate">
                    {c.details ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Admin Registry Owner-Name Check Panel (B5) ───────────────────────────────

function AdminRegistryOwnerNameCheck({ unitId, lang }: { unitId: number; lang: Lang }) {
  const { data, isLoading } = useQuery<UnitOwnershipCheckResult>({
    queryKey: ["admin-registry-check", unitId],
    queryFn: () => apiRequest(`/admin/units/${unitId}/registry-check`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="border border-slate-200 rounded-lg p-4">
        <div className="h-4 w-48 bg-slate-100 animate-pulse rounded" />
      </section>
    );
  }

  if (!data) return null;

  return <RegistryOwnerNameCheckView data={data} lang={lang} />;
}

export function RegistryOwnerNameCheckView({ data, lang }: { data: UnitOwnershipCheckResult; lang: Lang }) {
  const T = (k: string) => t(lang, k);
  const { unitRecord, verifiedOwnerName } = data;

  return (
    <section className="border border-slate-200 rounded-lg p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <FileText className="h-4 w-4 text-slate-500" />
        {T("unit_reg_registry_check_title")}
      </h3>

      <div className="space-y-2">
        <div className="flex items-start gap-2 text-sm">
          <span className="text-slate-500 w-36 shrink-0">{T("unit_reg_registry_owner_name")}</span>
          <span className="text-slate-900 font-medium break-all">{verifiedOwnerName ?? "—"}</span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <span className="text-slate-500 w-36 shrink-0">{T("unit_reg_verified_owner_name")}</span>
          <span className="text-slate-900 font-medium break-all">{unitRecord.titleReference ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{T("unit_reg_registry_matched_flag")}:</span>
          <span className={cn(
            "px-2 py-0.5 rounded-full font-medium",
            unitRecord.isVerified ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
          )}>
            {unitRecord.isVerified ? T("unit_reg_registry_is_matched") : T("unit_reg_registry_not_matched")}
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Unit Detail Sheet ─────────────────────────────────────────────────────────

function UnitDetailSheet({ unit, open, onClose, lang, isAdmin }: {
  unit: EnrichedUnit | null; open: boolean; onClose: () => void; lang: Lang; isAdmin: boolean;
}) {
  const qc = useQueryClient();
  if (!unit) return null;
  const T = (key: string) => t(lang, key);

  let parkingLots: ParkingLot[] = [];
  try {
    parkingLots = typeof unit.parkingLots === "string"
      ? JSON.parse(unit.parkingLots as unknown as string)
      : (unit.parkingLots ?? []);
  } catch {}

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <SheetTitle className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-amber-600 shrink-0" />
            <span>{unit.building} – {unit.unitNumber}</span>
            {occupantBadge(unit.occupantType, lang)}
          </SheetTitle>
          <div className="flex gap-4 text-xs text-slate-500 mt-1">
            {unit.unitType && <span>{T("unit_reg_unit_type")}: {unit.unitType}</span>}
            {unit.floor && <span>{T("unit_reg_floor")}: {unit.floor}</span>}
            {unit.sizeSqm && <span>{T("unit_reg_size")}: {unit.sizeSqm} m²</span>}
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6">
          {/* Owner */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <User className="h-4 w-4 text-blue-600" /> {T("unit_reg_owner_section")}
            </h3>
            {unit.owner ? (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-slate-900">
                    {unit.owner.firstName} {unit.owner.lastName}
                  </span>
                  {verificationBadge(unit.owner.verificationStatus, lang)}
                </div>
                <DetailRow label={T("unit_reg_national_id")} value={unit.owner.nationalId} />
                <DetailRow label={T("unit_reg_mobile")} value={unit.owner.phone} />
                <DetailRow label={T("common_email")} value={unit.owner.email} />
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_owner")}</p>
            )}
          </section>

          {/* Tenant */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <User className="h-4 w-4 text-purple-600" /> {T("unit_reg_tenant_section")}
            </h3>
            {unit.tenant ? (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-slate-900">
                    {unit.tenant.firstName} {unit.tenant.lastName}
                  </span>
                  {verificationBadge(unit.tenant.verificationStatus, lang)}
                </div>
                <DetailRow label={T("unit_reg_national_id")} value={unit.tenant.nationalId} />
                <DetailRow label={T("unit_reg_mobile")} value={unit.tenant.phone} />
                <DetailRow label={T("common_email")} value={unit.tenant.email} />
                <DetailRow label={T("unit_reg_ejar_ref")} value={unit.tenant.ejarReference} />
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_tenant")}</p>
            )}
          </section>

          {/* Household Residents */}
          <RegistrySection
            title={T("unit_reg_residents_section")}
            count={unit.residents.length}
            icon={<Users className="h-4 w-4 text-green-600" />}
          >
            {unit.residents.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_residents")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {unit.residents.map(r => (
                  <div key={r.id} className="min-w-0 rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-900">{r.firstName} {r.lastName}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-xs text-slate-500">{r.relationship ? registryValueLabel(r.relationship, lang) : "—"}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.portalAccess ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                        {r.portalAccess ? T("unit_reg_portal_access") : T("unit_reg_no_portal_access")}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.hasActiveWahaCredential ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500")}>
                        {r.hasActiveWahaCredential ? T("unit_reg_active_waha_credential") : T("unit_reg_no_active_waha_credential")}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <DetailRow label={r.idNumberIsGuardian ? T("res_guardian_id") : T("unit_reg_national_id")} value={r.idNumber} />
                      <DetailRow label={T("unit_reg_mobile")} value={r.phone} />
                      <DetailRow label={T("common_email")} value={r.email} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>


          {/* Admin Tools */}
          {isAdmin && (
            <div className="space-y-6 pt-6 border-t border-slate-200">
              <h2 className="font-semibold text-slate-900">{T("unit_reg_admin_tools")}</h2>
              <AdminUnitCorrectionPanel unit={unit} lang={lang} onSaved={() =>
                invalidateUnitRegistryCorrectionQueries(qc, unit.id)
              } />
              <AdminParkingPanel unitId={unit.id} lang={lang} />
              <AdminMasterDataHistoryPanel unitId={unit.id} lang={lang} />
            </div>
          )}

          {/* Vehicles */}
          <RegistrySection
            title={T("unit_reg_vehicles_section")}
            count={unit.vehicles.length}
            icon={<Car className="h-4 w-4 text-amber-600" />}
          >
            {unit.vehicles.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_vehicles")}</p>
            ) : (
              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-start px-3 py-2">{T("unit_reg_plate")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_vehicle_desc")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_assigned_parking_lot")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_parking_type")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unit.vehicles.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-mono font-bold text-slate-900">{v.plateNumber}</td>
                        <td className="px-3 py-2 text-slate-600">{v.year} {v.make} {v.model}{v.color ? ` · ${v.color}` : ""}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{v.parkingLotNumber ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {v.parkingType === "underground"
                            ? T("unit_reg_parking_underground")
                            : v.parkingType === "surface"
                              ? T("unit_reg_parking_surface")
                              : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full",
                            v.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                          )}>{registryValueLabel(v.status, lang)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RegistrySection>

          <RegistrySection
            title={T("unit_reg_permits_section")}
            count={unit.permits.length}
            icon={<ClipboardList className="h-4 w-4 text-orange-600" />}
          >
            {unit.permits.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_permits")}</p>
            ) : (
              <div className="space-y-3">
                {unit.permits.map(permit => (
                  <div key={permit.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{registryValueLabel(permit.type, lang)}</span>
                      <Badge variant="outline">{registryValueLabel(permit.status, lang)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {T("unit_reg_submitted")}: {formatRegistryDate(permit.createdAt, lang)}
                      {" · "}{T("unit_reg_decision")}: {formatRegistryDate(permit.updatedAt, lang)}
                    </p>
                    {(permit.requestedStartDate || permit.requestedEndDate) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatRegistryDate(permit.requestedStartDate, lang)} – {formatRegistryDate(permit.requestedEndDate, lang)}
                      </p>
                    )}
                    {permit.renovationScope && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {parseScope(permit.renovationScope).map(scope => (
                          <Badge key={scope} variant="secondary">{registryValueLabel(scope, lang)}</Badge>
                        ))}
                      </div>
                    )}
                    {(permit.contractorName || permit.contractorContact) && (
                      <p className="mt-2 text-xs text-slate-600">
                        {T("unit_reg_contractor")}: {[permit.contractorName, permit.contractorContact].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>

          <RegistrySection
            title={T("unit_reg_guests_section")}
            count={unit.guests.length + unit.guestDayPasses.length}
            icon={<UserRoundCheck className="h-4 w-4 text-violet-600" />}
          >
            <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
              {T("unit_reg_guest_retention")}
            </p>
            {unit.guests.length === 0 && unit.guestDayPasses.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_guests")}</p>
            ) : (
              <div className="space-y-3">
                {unit.guests.map(guest => (
                  <div key={`guest-${guest.id}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{guest.firstName} {guest.lastName}</span>
                      <Badge variant="outline">{registryValueLabel(guest.status, lang)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRegistryDate(guest.visitDate, lang)}
                      {guest.vehiclePlate ? ` · ${guest.vehiclePlate}` : ""}
                      {guest.visitReason ? ` · ${registryValueLabel(guest.visitReason, lang)}` : ""}
                    </p>
                    {guest.passes.map(pass => (
                      <p key={pass.id} className="mt-2 rounded bg-white px-2 py-1 text-xs text-slate-600">
                        {T("unit_reg_guest_pass")}: {registryValueLabel(pass.status, lang)} · {formatRegistryDate(pass.visitDate, lang)}
                      </p>
                    ))}
                  </div>
                ))}
                {unit.guestDayPasses.map(pass => (
                  <div key={`day-${pass.id}`} className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{T("unit_reg_guest_day_pass")}</span>
                      <Badge variant="outline">{registryValueLabel(pass.paymentStatus, lang)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {formatRegistryDate(pass.date, lang)} · {pass.guestCount ?? pass.extraGuestCount} {T("unit_reg_guests_count")}
                      {pass.vehiclePlate ? ` · ${pass.vehiclePlate}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>

          <RegistrySection
            title={T("unit_reg_payments_section")}
            count={unit.payments.length}
            icon={<CreditCard className="h-4 w-4 text-emerald-600" />}
          >
            {unit.payments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_payments")}</p>
            ) : (
              <div className="space-y-2">
                {unit.payments.map(payment => (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{registryValueLabel(payment.purpose, lang)}</p>
                      <p className="text-xs text-slate-500">{formatRegistryDate(payment.confirmedAt ?? payment.createdAt, lang)}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold text-slate-900">{payment.amount} {payment.currency}</p>
                      <p className="text-xs text-slate-500">{registryValueLabel(payment.status, lang)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>

          <RegistrySection
            title={T("unit_reg_bookings_section")}
            count={unit.bookings.length}
            icon={<CalendarDays className="h-4 w-4 text-indigo-600" />}
          >
            {unit.bookings.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_bookings")}</p>
            ) : (
              <div className="space-y-2">
                {unit.bookings.map(booking => (
                  <div key={booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{booking.resolvedFacilityName}</p>
                      <p className="text-xs text-slate-500">{formatRegistryDate(booking.startTime, lang)}</p>
                    </div>
                    <Badge variant="outline">{registryValueLabel(booking.status, lang)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>

          {/* Waha Passes */}
          <RegistrySection
            title={T("unit_reg_passes_section")}
            count={unit.wahaPasses.length}
            icon={<KeyRound className="h-4 w-4 text-teal-600" />}
          >
            {unit.wahaPasses.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_passes")}</p>
            ) : (
              <div className="space-y-3">
                {unit.wahaPasses.map(p => (
                  <div key={p.id} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-700">{registryValueLabel(p.occupancyTrack, lang)} {T("unit_reg_pass_track")}</span>
                      {passStatusBadge(p.status, lang)}
                    </div>
                    {p.credentials.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 text-xs text-slate-600 py-0.5">
                        <span className="truncate">{T("unit_reg_pass_number")} {c.credentialIndex}: {c.passNumber ?? "—"} — {c.holderName}</span>
                        {credentialStatusBadge(c.status, lang)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </RegistrySection>

          {/* Parking — read-only view (all roles) */}
          <RegistrySection
            title={T("unit_reg_parking_section")}
            count={parkingLots.length}
            icon={<ParkingSquare className="h-4 w-4 text-slate-600" />}
          >
            {parkingLots.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_parking")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {parkingLots.map((lot, i) => (
                  <span key={i} className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
                    {lot.building} – {lot.lotNumber} ({T(lot.isInside ? "unit_reg_parking_underground" : "unit_reg_parking_surface")})
                  </span>
                ))}
              </div>
            )}
          </RegistrySection>

          {/* Admin-only: Parking Lot Management */}
          {isAdmin && (
            <AdminParkingPanel unitId={unit.id} lang={lang} />
          )}

          {/* Admin-only: Registry Owner Name Check (B5) */}
          {isAdmin && (
            <AdminRegistryOwnerNameCheck unitId={unit.id} lang={lang} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Name highlight helper ─────────────────────────────────────────────────────

function nameMatches(name: string | null | undefined, query: string): boolean {
  if (!name || !query) return false;
  return name.toLowerCase().includes(query.toLowerCase());
}

function MatchedBadge({ lang }: { lang: Lang }) {
  return (
    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
      {t(lang, "unit_reg_matched_resident")}
    </span>
  );
}

// ── Unit List Row ─────────────────────────────────────────────────────────────

function UnitRow({ unit, lang, onSelect, nameQuery }: {
  unit: EnrichedUnit; lang: Lang; onSelect: () => void; nameQuery?: string;
}) {
  const ownerName = unit.owner ? `${unit.owner.firstName ?? ""} ${unit.owner.lastName ?? ""}`.trim() : null;
  const tenantName = unit.tenant ? `${unit.tenant.firstName ?? ""} ${unit.tenant.lastName ?? ""}`.trim() : null;
  const ownerlessLabel = lang === "ar" ? "لا مالك مسجل" : "No registered owner";
  const ownerlessElapsed = unit.ownerless
    ? (lang === "ar"
      ? `${unit.ownerless.elapsedDays} يوم بدون مالك`
      : `${unit.ownerless.elapsedDays} days without owner`)
    : null;

  const ownerMatched = nameQuery ? nameMatches(ownerName, nameQuery) : false;
  const tenantMatched = nameQuery ? nameMatches(tenantName, nameQuery) : false;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-start bg-white border rounded-xl p-4 hover:border-amber-400 hover:shadow-sm transition-all group",
        (ownerMatched || tenantMatched) ? "border-amber-300 bg-amber-50/30" : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-semibold text-slate-900 text-base">
              {unit.building} – {unit.unitNumber}
            </span>
            {occupantBadge(unit.occupantType, lang)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {ownerName && (
              <span className={cn("text-xs flex items-center gap-1", ownerMatched ? "text-amber-700 font-medium" : "text-slate-500")}>
                <User className="h-3 w-3" /> {ownerName}
                {ownerMatched && <MatchedBadge lang={lang} />}
              </span>
            )}
            {!ownerName && unit.ownerless && (
              <span className="text-xs flex items-center gap-1 text-amber-700 font-medium">
                <User className="h-3 w-3" /> {ownerlessLabel} · {ownerlessElapsed}
              </span>
            )}
            {tenantName && (
              <span className={cn("text-xs flex items-center gap-1", tenantMatched ? "text-amber-700 font-medium" : "text-slate-500")}>
                <User className={cn("h-3 w-3", tenantMatched ? "text-amber-500" : "text-purple-400")} /> {tenantName}
                {tenantMatched && <MatchedBadge lang={lang} />}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 mt-1.5 text-xs text-slate-400">
            <span>{unit.residents.length} {t(lang, "unit_reg_residents_count")}</span>
            <span>{unit.vehicles.length} {t(lang, "unit_reg_vehicles_count")}</span>
            {unit.wahaPasses.length > 0 && (
              <span className="text-teal-500">{unit.wahaPasses.length} {t(lang, "unit_reg_passes_count")}</span>
            )}
          </div>
        </div>
        <ChevronLeft className={cn("h-4 w-4 text-slate-300 group-hover:text-amber-500 shrink-0 mt-1 transition-colors", lang === "ar" ? "" : "rotate-180")} />
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UnitRegistryPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const T = (key: string) => t(lang, key);

  const isAdmin = user?.role === "admin";
  const isAdminOrSupervisor = isAdmin || user?.role === "supervisor";

  const [searchMode, setSearchMode] = useState<SearchMode>("unit");
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<EnrichedUnit | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const limit = 20;

  // Debounce search slightly
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 on filter/mode change
  useEffect(() => { setPage(1); }, [debouncedSearch, building, searchMode]);

  // Clear search when switching modes
  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode);
    setSearch("");
    setDebouncedSearch("");
  };

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (debouncedSearch) {
    if (searchMode === "name") {
      params.set("name", debouncedSearch);
    } else if (searchMode === "nationalId") {
      params.set("nationalId", debouncedSearch);
    } else {
      params.set("search", debouncedSearch);
    }
  }
  if (building) params.set("building", building);

  const { data, isLoading } = useQuery<PagedResult>({
    queryKey: ["admin-units-full", searchMode, debouncedSearch, building, page],
    queryFn: () => apiRequest(`/admin/units/full?${params.toString()}`),
    enabled: isAdminOrSupervisor,
    placeholderData: prev => prev,
  });

  const units = data?.data ?? [];
  const pagination = data?.pagination;
  const buildings = data?.buildings ?? [];
  const nameQuery = data?.nameSearch;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-900">{T("unit_reg_title")}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/portal/admin">
            <ArrowLeft className={cn("me-2 h-4 w-4", lang === "ar" && "rotate-180")} />
            {T("unit_reg_back_dashboard")}
          </Link>
        </Button>
      </div>

      {/* Search mode tabs + filters */}
      <div className="space-y-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          {(["unit", "name", "nationalId"] as SearchMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                searchMode === mode
                  ? "bg-white text-amber-700 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {mode === "unit"
                ? T("unit_reg_search_by_unit")
                : mode === "name"
                  ? T("unit_reg_search_by_name")
                  : T("unit_reg_search_by_national_id")}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {searchMode === "name" ? (
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={T("unit_reg_name_search_placeholder")} className="ps-9" />
            ) : searchMode === "nationalId" ? (
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={T("unit_reg_national_id_search_placeholder")} className="ps-9" />
            ) : (
              <select value={search} onChange={e => setSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
                <option value="">{T("unit_reg_search_placeholder")}</option>
                {SELECTABLE_UNIT_REFERENCES.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            )}
          </div>
          <select
            value={building}
            onChange={e => setBuilding(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 min-w-[140px]"
          >
            <option value="">{T("unit_reg_all_buildings")}</option>
            {buildings.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Count */}
      {pagination && (
        <p className="text-xs text-slate-500">
          {T("unit_reg_showing")
            .replace("{from}", String((page - 1) * limit + 1))
            .replace("{to}", String(Math.min(page * limit, pagination.total)))
            .replace("{total}", String(pagination.total))}
        </p>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{T("unit_reg_no_results")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {units.map(unit => (
            <UnitRow
              key={unit.id}
              unit={unit}
              lang={lang}
              nameQuery={nameQuery}
              onSelect={() => { setSelectedUnit(unit); setSheetOpen(true); }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline" size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 me-1" /> {T("common_prev")}
          </Button>
          <span className="text-sm text-slate-500">
            {T("common_page")} {page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            {T("common_next")} <ChevronRight className="h-4 w-4 ms-1" />
          </Button>
        </div>
      )}

      {/* Admin-only: Data Migration Corrections */}
      {isAdmin && (
        <AdminCorrectionsPanel lang={lang} />
      )}

      {/* Detail sheet */}
      <UnitDetailSheet
        unit={selectedUnit}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lang={lang}
        isAdmin={isAdmin}
      />
    </div>
  );
}
