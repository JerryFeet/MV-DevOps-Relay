import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { PaginationBar } from "@/components/PaginationBar";
import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Hammer, Truck, Plus, AlertCircle, Loader2 } from "lucide-react";
import { DatePickerField } from "@/components/ui/date-picker";
import { PhoneInput } from "@/components/PhoneInput";

// ── E.164 validation (shared logic) ────────────────────────────────────────────
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function isValidE164(value: string): boolean {
  return E164_REGEX.test(value.trim());
}

type Permit = {
  id: number; userId: number; unitNumber: string | null; type: string;
  description: string | null; status: string;
  conditions: string | null;
  reviewNote: string | null; requestedStartDate: string | null; requestedEndDate: string | null;
  moveType: string | null; movingCompanyName: string | null; movingCompanyContact: string | null; elevatorSlot: string | null;
  renovationScope: string | null; contractorName: string | null;
  contractorContact: string | null; workingHoursRequested: string | null;
  commonAreaImpact: boolean | null; commonAreaImpactDetails: string | null;
  vehicleMake: string | null; vehicleModel: string | null; vehiclePlate: string | null; vehicleColor: string | null;
  requester: { firstName: string | null; lastName: string | null; email: string; unitNumber: string | null } | null;
  createdAt: string;
};

// Active permit types — additional_vehicle is no longer offered to residents
const permitTypes = [
  { id: "move_in",      labelKey: "per_type_move_in",    descKey: "per_desc_move_in",    icon: Truck },
  { id: "move_out",     labelKey: "per_type_move_out",   descKey: "per_desc_move_out",   icon: Truck },
  { id: "renovation",   labelKey: "per_type_renovation", descKey: "per_desc_renovation", icon: Hammer },
];

const statusColors: Record<string, string> = {
  draft:                    "bg-slate-100 text-slate-600",
  submitted:                "bg-blue-100 text-blue-700",
  under_review:             "bg-purple-100 text-purple-700",
  approved:                 "bg-green-100 text-green-700",
  approved_with_conditions: "bg-teal-100 text-teal-700",
  rejected:                 "bg-red-100 text-red-600",
  in_progress:              "bg-amber-100 text-amber-700",
  completed:                "bg-slate-100 text-slate-700",
};

// All five renovation scope categories (bilingual via translation keys)
export const RENOVATION_SCOPES = [
  { value: "exterior_affecting",        labelKey: "per_scope_exterior_affecting" },
  { value: "major_plumbing_electrical", labelKey: "per_scope_major_plumbing_electrical" },
  { value: "structural_modifications",  labelKey: "per_scope_structural_modifications" },
  { value: "major_interior_upgrades",   labelKey: "per_scope_major_interior_upgrades" },
  { value: "flooring",                  labelKey: "per_scope_flooring" },
] as const;

const statusActionKeys: Record<string, string> = {
  under_review:             "per_action_under_review",
  approved:                 "per_action_approved",
  approved_with_conditions: "per_action_approved_conditions",
  rejected:                 "per_action_rejected",
  in_progress:              "per_action_in_progress",
  completed:                "per_action_completed",
};

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const color = statusColors[status] ?? "bg-slate-100 text-slate-600";
  const label = t(lang, `status_${status}`);
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color)}>{label}</span>;
}

/** Parse renovationScope: may be a JSON array string or a legacy plain string */
function parseRenovationScope(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [raw];
}

/** Display the renovation scope value(s) as a comma-separated translated label */
function RenovationScopeDisplay({ raw, lang: language }: { raw: string | null; lang: "en" | "ar" }) {
  const scopes = parseRenovationScope(raw);
  if (!scopes.length) return null;
  const labels = scopes
    .map(v => t(language, RENOVATION_SCOPES.find(s => s.value === v)?.labelKey ?? ""))
    .filter(Boolean)
    .join(", ");
  return <>{labels}</>;
}

export function PermitCard({
  p,
  isAdmin,
  onStatusChange,
}: {
  p: Permit;
  isAdmin: boolean;
  onStatusChange?: (id: number, status: string, note?: string, extra?: Record<string, string>) => void;
}) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const pt = p.type;
  const typeDef = permitTypes.find(x => x.id === pt);
  const Icon = typeDef?.icon ?? Hammer;
  const typeLabel = typeDef ? t(lang, typeDef.labelKey) : pt.replace(/_/g, " ");

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid={`permit-card-${p.id}`}>
      <button className="w-full text-start p-5" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900">{typeLabel}</span>
                <StatusBadge status={p.status} />
              </div>
              {isAdmin && p.requester && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {p.requester.firstName} {p.requester.lastName} · {t(lang, "sidebar_unit")} {p.unitNumber ?? "—"}
                </p>
              )}
              {p.requestedStartDate && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(p.requestedStartDate + "T12:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", { year: "numeric", month: "short", day: "numeric" })}
                  {" → "}
                  {p.requestedEndDate
                    ? new Date(p.requestedEndDate + "T12:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA", { year: "numeric", month: "short", day: "numeric" })
                    : t(lang, "per_tbd")}
                </p>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400 shrink-0">{new Date(p.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          {p.description && <p className="text-sm text-slate-700">{p.description}</p>}

          {/* Move permit details */}
          {(pt === "move_in" || pt === "move_out") && (
            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              {p.movingCompanyName && <div><span className="text-slate-400 text-xs">{t(lang, "per_field_moving_company")}</span><p>{p.movingCompanyName}</p></div>}
              {p.movingCompanyContact && <div><span className="text-slate-400 text-xs">{t(lang, "per_field_contact")}</span><p>{p.movingCompanyContact}</p></div>}
              {p.elevatorSlot && <div><span className="text-slate-400 text-xs">{t(lang, "per_field_elevator_slot")}</span><p>{p.elevatorSlot}</p></div>}
            </div>
          )}

          {/* Renovation details */}
          {pt === "renovation" && (
            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              {p.renovationScope && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-xs">{t(lang, "per_field_scope")}</span>
                  <p><RenovationScopeDisplay raw={p.renovationScope} lang={lang} /></p>
                </div>
              )}
              {p.contractorName && <div><span className="text-slate-400 text-xs">{t(lang, "per_contractor")}</span><p>{p.contractorName}</p></div>}
              {p.contractorContact && <div><span className="text-slate-400 text-xs">{t(lang, "per_contractor_mobile")}</span><p>{p.contractorContact}</p></div>}
              {p.workingHoursRequested && <div><span className="text-slate-400 text-xs">{t(lang, "per_working_hours")}</span><p>{p.workingHoursRequested}</p></div>}
              {p.commonAreaImpact && <div className="col-span-2"><span className="text-slate-400 text-xs">{t(lang, "per_common_area")}</span><p>{p.commonAreaImpactDetails || t(lang, "yes")}</p></div>}
            </div>
          )}

          {/* HOA review notes */}
          {p.reviewNote && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
              <span className="text-slate-400 text-xs block mb-1">{t(lang, "per_field_hoa_note")}</span>
              {p.reviewNote}
            </div>
          )}
          {p.status === "approved_with_conditions" && p.conditions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <span className="text-amber-600 text-xs block mb-1">{t(lang, "per_field_approval_cond")}</span>
              {p.conditions}
            </div>
          )}

          {/* Admin actions */}
          {isAdmin && onStatusChange && ["submitted", "under_review", "approved", "approved_with_conditions", "in_progress"].includes(p.status) && (
            <AdminPermitActions permit={p} onStatusChange={onStatusChange} />
          )}
        </div>
      )}
    </div>
  );
}

export function AdminPermitActions({
  permit,
  onStatusChange,
}: {
  permit: Permit;
  onStatusChange: (id: number, status: string, note?: string, extra?: Record<string, string>) => void;
}) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [reviewNote, setReviewNote] = useState("");
  const [conditions, setConditions] = useState(permit.conditions ?? "");

  useEffect(() => { setConditions(permit.conditions ?? ""); }, [permit.conditions]);

  const nextStatuses = {
    submitted: ["under_review", "approved_with_conditions", "rejected"],
    under_review: ["approved", "approved_with_conditions", "rejected"],
    approved: ["in_progress", "completed"],
    approved_with_conditions: ["in_progress", "completed"],
    in_progress: ["completed"],
  }[permit.status] ?? [];

  return (
    <div className="border-t border-slate-100 pt-3 space-y-3">
      <div><Label className="text-xs">{t(lang, "per_review_note")}</Label><Textarea rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)} className="mt-1 text-xs" /></div>
      {(permit.status === "submitted" || permit.status === "under_review") && (
        <div><Label className="text-xs">{t(lang, "per_conditions_label")}</Label><Textarea rows={2} value={conditions} onChange={e => setConditions(e.target.value)} className="mt-1 text-xs" /></div>
      )}
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map(s => (
          <Button
            key={s}
            size="sm"
            className={cn(
              "h-8 text-xs",
              s === "rejected" ? "bg-red-600 hover:bg-red-700" :
              s === "approved" ? "bg-green-600 hover:bg-green-700" : "",
            )}
            onClick={() => {
              if (s === "approved_with_conditions" && !conditions.trim()) {
                toast({ title: t(lang, "common_error"), description: t(lang, "per_conditions_required"), variant: "destructive" });
                return;
              }
              onStatusChange(permit.id, s, reviewNote, { ...(s === "approved_with_conditions" ? { conditions } : {}) });
            }}
          >
            {t(lang, statusActionKeys[s] ?? s)}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ── Renovation scope multi-select component ─────────────────────────────────────
function RenovationScopeMultiSelect({
  value,
  onChange,
  lang: language,
  error,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  lang: "en" | "ar";
  error?: string;
}) {
  function toggle(scope: string) {
    if (value.includes(scope)) {
      onChange(value.filter(s => s !== scope));
    } else {
      onChange([...value, scope]);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mt-1">
        {RENOVATION_SCOPES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => toggle(s.value)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              value.includes(s.value)
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-300 hover:border-blue-400",
            )}
          >
            {t(language, s.labelKey)}
          </button>
        ))}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function NewPermitDialog({ user }: { user: any }) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: "",
    requestedStartDate: "",
    requestedEndDate: "",
    moveType: "",
    movingCompanyName: "",
    movingCompanyContact: "",
    elevatorSlot: "",
    renovationScopes: [] as string[],
    contractorName: "",
    contractorContact: "",
    workingHoursRequested: "",
    commonAreaImpact: false,
    commonAreaImpactDetails: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setStep(1);
    setSelectedType(null);
    setFieldErrors({});
    setForm({
      description: "",
      requestedStartDate: "",
      requestedEndDate: "",
      moveType: "",
      movingCompanyName: "",
      movingCompanyContact: "",
      elevatorSlot: "",
      renovationScopes: [],
      contractorName: "",
      contractorContact: "",
      workingHoursRequested: "",
      commonAreaImpact: false,
      commonAreaImpactDetails: "",
    });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        permitType: selectedType,
        description: form.description,
        requestedStartDate: form.requestedStartDate,
        requestedEndDate: form.requestedEndDate,
      };

      if (selectedType === "move_in" || selectedType === "move_out") {
        body.movingCompanyName = form.movingCompanyName;
        body.movingCompanyContact = form.movingCompanyContact;
        body.elevatorSlot = form.elevatorSlot;
      }

      if (selectedType === "renovation") {
        // Send as JSON array
        body.renovationScope = form.renovationScopes;
        body.contractorName = form.contractorName;
        body.contractorContact = form.contractorContact;
        body.workingHoursRequested = form.workingHoursRequested;
        body.commonAreaImpact = form.commonAreaImpact;
        if (form.commonAreaImpact) body.commonAreaImpactDetails = form.commonAreaImpactDetails;
      }

      return apiRequest("/permits", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permits"] });
      setOpen(false);
      reset();
      toast({ title: t(lang, "per_permit_submitted"), description: t(lang, "per_permit_submitted_desc") });
    },
    onError: (e: any) => {
      const msg: string = e.message ?? t(lang, "common_error");
      // If the server returned a field-specific error, surface it
      if (e.field) {
        setFieldErrors(prev => ({ ...prev, [e.field]: msg }));
      } else {
        toast({ title: t(lang, "common_error"), description: msg, variant: "destructive" });
      }
    },
  });

  function validateAndSubmit() {
    const errors: Record<string, string> = {};

    if (!form.requestedStartDate) {
      errors.requestedStartDate = t(lang, "per_dates_required");
    }
    if (!form.requestedEndDate) {
      errors.requestedEndDate = t(lang, "per_dates_required");
    }
    if (form.requestedStartDate && form.requestedEndDate && form.requestedEndDate < form.requestedStartDate) {
      errors.requestedEndDate = t(lang, "per_end_before_start");
    }

    if (selectedType === "move_in" || selectedType === "move_out") {
      if (!form.movingCompanyName.trim()) {
        errors.movingCompanyName = t(lang, "per_moving_company_required");
      }
    }

    if (selectedType === "renovation") {
      if (form.renovationScopes.length === 0) {
        errors.renovationScopes = t(lang, "per_scope_required");
      }
      if (!form.contractorName.trim()) {
        errors.contractorName = t(lang, "per_contractor_required");
      }
      if (!form.contractorContact.trim()) {
        errors.contractorContact = t(lang, "per_contractor_contact_required");
      } else if (!isValidE164(form.contractorContact)) {
        errors.contractorContact = t(lang, "per_contractor_contact_e164");
      }
      if (!form.workingHoursRequested.trim()) {
        errors.workingHoursRequested = t(lang, "per_working_hours_required");
      }
      if (form.commonAreaImpact && !form.commonAreaImpactDetails.trim()) {
        errors.commonAreaImpactDetails = t(lang, "per_common_area_details_required");
      }
      if (!form.description.trim()) {
        errors.description = t(lang, "per_description_required");
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    createMutation.mutate();
  }

  const isAdmin = user?.role === "admin";
  const isVerified = user?.verificationStatus === "verified_owner" || user?.verificationStatus === "verified_tenant";
  const canCreate = isVerified || isAdmin;

  const selectedTypeDef = permitTypes.find(x => x.id === selectedType);
  const dialogTitle = step === 1
    ? t(lang, "per_select_type")
    : `${t(lang, "per_new")} — ${selectedTypeDef ? t(lang, selectedTypeDef.labelKey) : ""}`;

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" disabled={!canCreate}>
        <Plus className="h-4 w-4" /> {t(lang, "per_new")}
      </Button>
      {!canCreate && <p className="text-xs text-amber-600 ms-2">{t(lang, "common_verify_required")}</p>}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {permitTypes.filter(pt => {
                if (pt.id === "renovation" && user?.verificationStatus !== "verified_owner" && user?.role !== "admin") return false;
                return true;
              }).map(pt => {
                const Icon = pt.icon;
                return (
                  <button key={pt.id} onClick={() => { setSelectedType(pt.id); setStep(2); }}
                    className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-xl p-4 text-start transition-all hover:shadow-sm">
                    <Icon className="h-6 w-6 text-blue-600 mb-2" />
                    <p className="font-semibold text-slate-900 text-sm">{t(lang, pt.labelKey)}</p>
                    <p className="text-slate-500 text-xs mt-1">{t(lang, pt.descKey)}</p>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && selectedType && (
            <div className="space-y-4">
              <button onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-slate-600">{t(lang, "per_back")}</button>

              {/* Common: dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t(lang, "per_start_date")} *</Label>
                  <DatePickerField
                    value={form.requestedStartDate}
                    onChange={v => { setForm(f => ({ ...f, requestedStartDate: v })); setFieldErrors(e => ({ ...e, requestedStartDate: "" })); }}
                  />
                  {fieldErrors.requestedStartDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.requestedStartDate}</p>}
                </div>
                <div>
                  <Label>{t(lang, "per_end_date")} {selectedType === "renovation" ? "*" : ""}</Label>
                  <DatePickerField
                    value={form.requestedEndDate}
                    onChange={v => { setForm(f => ({ ...f, requestedEndDate: v })); setFieldErrors(e => ({ ...e, requestedEndDate: "" })); }}
                    minDate={form.requestedStartDate || undefined}
                  />
                  {fieldErrors.requestedEndDate && <p className="text-red-500 text-xs mt-1">{fieldErrors.requestedEndDate}</p>}
                </div>
              </div>

              {/* Move fields */}
              {(selectedType === "move_in" || selectedType === "move_out") && (
                <>
                  <div>
                    <Label>{t(lang, "per_moving_company")} * <span className="text-slate-400 text-xs">{t(lang, "per_moving_company_hint")}</span></Label>
                    <Input
                      className={cn("mt-1", fieldErrors.movingCompanyName && "border-red-400")}
                      value={form.movingCompanyName}
                      onChange={e => { setForm(f => ({ ...f, movingCompanyName: e.target.value })); setFieldErrors(err => ({ ...err, movingCompanyName: "" })); }}
                    />
                    {fieldErrors.movingCompanyName && <p className="text-red-500 text-xs mt-1">{fieldErrors.movingCompanyName}</p>}
                  </div>
                  <div><Label>{t(lang, "per_moving_contact")}</Label><Input className="mt-1" value={form.movingCompanyContact} onChange={e => setForm(f => ({ ...f, movingCompanyContact: e.target.value }))} /></div>
                  <div><Label>{t(lang, "per_elevator")}</Label><Input className="mt-1" placeholder={t(lang, "per_elevator_placeholder")} value={form.elevatorSlot} onChange={e => setForm(f => ({ ...f, elevatorSlot: e.target.value }))} /></div>
                </>
              )}

              {/* Renovation fields */}
              {selectedType === "renovation" && (
                <>
                  {/* Description — mandatory for renovation */}
                  <div>
                    <Label>{t(lang, "per_description")} *</Label>
                    <Textarea
                      rows={3}
                      className={cn("mt-1", fieldErrors.description && "border-red-400")}
                      value={form.description}
                      onChange={e => { setForm(f => ({ ...f, description: e.target.value })); setFieldErrors(err => ({ ...err, description: "" })); }}
                      placeholder={t(lang, "per_description_placeholder")}
                    />
                    {fieldErrors.description && <p className="text-red-500 text-xs mt-1">{fieldErrors.description}</p>}
                  </div>

                  {/* Scope multi-select — mandatory */}
                  <div>
                    <Label>{t(lang, "per_scope_label")} *</Label>
                    <RenovationScopeMultiSelect
                      value={form.renovationScopes}
                      onChange={v => { setForm(f => ({ ...f, renovationScopes: v })); setFieldErrors(err => ({ ...err, renovationScopes: "" })); }}
                      lang={lang}
                      error={fieldErrors.renovationScopes}
                    />
                  </div>

                  {/* Contractor Name — mandatory */}
                  <div>
                    <Label>{t(lang, "per_contractor")} *</Label>
                    <Input
                      className={cn("mt-1", fieldErrors.contractorName && "border-red-400")}
                      value={form.contractorName}
                      onChange={e => { setForm(f => ({ ...f, contractorName: e.target.value })); setFieldErrors(err => ({ ...err, contractorName: "" })); }}
                    />
                    {fieldErrors.contractorName && <p className="text-red-500 text-xs mt-1">{fieldErrors.contractorName}</p>}
                  </div>

                  {/* Contractor Mobile — mandatory E.164 (no licence field) */}
                  <div>
                    <Label>{t(lang, "per_contractor_mobile")} * <span className="text-slate-400 text-xs">{t(lang, "per_contractor_mobile_hint")}</span></Label>
                    <PhoneInput
                      className={cn("mt-1", fieldErrors.contractorContact && "ring-1 ring-red-400 rounded-md")}
                      value={form.contractorContact}
                      onChange={value => { setForm(f => ({ ...f, contractorContact: value })); setFieldErrors(err => ({ ...err, contractorContact: "" })); }}
                      T={key => t(lang, key)}
                      testID="contractor-mobile"
                    />
                    {fieldErrors.contractorContact && <p className="text-red-500 text-xs mt-1">{fieldErrors.contractorContact}</p>}
                  </div>

                  {/* Working Hours — mandatory */}
                  <div>
                    <Label>{t(lang, "per_working_hours")} *</Label>
                    <Input
                      className={cn("mt-1", fieldErrors.workingHoursRequested && "border-red-400")}
                      placeholder={t(lang, "per_working_hours_placeholder")}
                      value={form.workingHoursRequested}
                      onChange={e => { setForm(f => ({ ...f, workingHoursRequested: e.target.value })); setFieldErrors(err => ({ ...err, workingHoursRequested: "" })); }}
                    />
                    {fieldErrors.workingHoursRequested && <p className="text-red-500 text-xs mt-1">{fieldErrors.workingHoursRequested}</p>}
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch checked={form.commonAreaImpact} onCheckedChange={v => setForm(f => ({ ...f, commonAreaImpact: v }))} />
                    <Label>{t(lang, "per_common_area_question")}</Label>
                  </div>
                  {form.commonAreaImpact && (
                    <div>
                      <Label>{t(lang, "per_common_area_details")} *</Label>
                      <Textarea rows={2} className={cn("mt-1", fieldErrors.commonAreaImpactDetails && "border-red-400")} value={form.commonAreaImpactDetails} onChange={e => { setForm(f => ({ ...f, commonAreaImpactDetails: e.target.value })); setFieldErrors(err => ({ ...err, commonAreaImpactDetails: "" })); }} />
                      {fieldErrors.commonAreaImpactDetails && <p className="text-red-500 text-xs mt-1">{fieldErrors.commonAreaImpactDetails}</p>}
                    </div>
                  )}
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    {t(lang, "per_renovation_liability_note")}
                  </p>
                </>
              )}

              {/* Description for non-renovation */}
              {selectedType !== "renovation" && (
                <div>
                  <Label>{t(lang, "per_description")}</Label>
                  <Textarea rows={3} className="mt-1" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t(lang, "per_description_placeholder")} />
                </div>
              )}

              <Button className="w-full" onClick={validateAndSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{t(lang, "per_submitting")}</> : t(lang, "per_submit_request")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PermitsPage() {
  const { lang } = useLanguage();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const isAdmin = user?.role === "admin";

  const [page, setPage] = useState(1);
  const PAGE_LIMIT = 50;
  const { data: result, isLoading } = useQuery<{ data: Permit[]; total: number }>({
    queryKey: ["permits", page],
    queryFn: () => apiRequest(`/permits?page=${page}&limit=${PAGE_LIMIT}`),
    refetchInterval: 30_000,
  });
  const permits = result?.data ?? [];
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_LIMIT);

  const statusChangeMutation = useMutation({
    mutationFn: ({ id, status, note, extra }: { id: number; status: string; note?: string; extra?: Record<string, string> }) =>
      apiRequest(`/permits/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNote: note, ...extra }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits"] }); toast({ title: t(lang, "per_permit_updated") }); },
    onError: (e: any) => toast({ title: t(lang, "common_error"), description: e.message, variant: "destructive" }),
  });

  const filterTypeOptions = ["all", "move_in", "move_out", "renovation"];

  const filtered = permits.filter(p =>
    (filterType === "all" || p.type === filterType) &&
    (filterStatus === "all" || p.status === filterStatus)
  );

  const isVerified = user?.verificationStatus === "verified_owner" || user?.verificationStatus === "verified_tenant";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, "per_title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t(lang, "per_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <NewPermitDialog user={user} />
        </div>
      </div>

      {!isVerified && !isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-900 font-medium text-sm">{t(lang, "common_verify_required")}</p>
            <p className="text-amber-700 text-xs mt-0.5">{t(lang, "per_unit_required_msg")}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-5">
        <div>
          <p className="text-xs text-slate-500 mb-1">{t(lang, "per_filter_type")}</p>
          <div className="flex gap-1 flex-wrap">
            {filterTypeOptions.map(id => (
              <button key={id} onClick={() => setFilterType(id)}
                className={cn("text-xs px-3 py-1 rounded-full capitalize transition-colors",
                  filterType === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {id === "all" ? t(lang, "all") : t(lang, permitTypes.find(pt => pt.id === id)?.labelKey ?? id)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">{t(lang, "per_filter_status")}</p>
          <select className="text-xs border rounded-md px-2 py-1 bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">{t(lang, "per_all_statuses")}</option>
            {Object.keys(statusColors).map(k => <option key={k} value={k}>{t(lang, `status_${k}`)}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-slate-500 py-8"><Loader2 className="h-4 w-4 animate-spin" />{t(lang, "loading")}</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Hammer className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t(lang, "per_no_permits")}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(p => (
          <PermitCard key={p.id} p={p} isAdmin={isAdmin}
            onStatusChange={(id, status, note, extra) => statusChangeMutation.mutate({ id, status, note, extra })} />
        ))}
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
