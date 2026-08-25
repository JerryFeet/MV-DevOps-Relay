import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaginatedApi } from "@/hooks/usePaginatedApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/api";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Car, Trash2, AlertCircle, Clock, Upload, FileText, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { PaginationBar } from "@/components/PaginationBar";

type Vehicle = {
  id: number; userId: number; make: string; model: string; year: number | null;
  color: string | null; plateNumber: string; istimaraNumber: string | null;
  isAdditional: boolean; isBasementParking: boolean; registrationDocKey: string | null;
  status: string; approvalNote: string | null; rejectionReason: string | null;
  createdAt: string;
};

type UnitRecord = {
  id: number;
  building: string;
  unitNumber: string;
  parkingLots: string | null; // JSON: [{lotNumber, building, isInside}]
};

type ParkingLot = { lotNumber: string; building: string; isInside: boolean };

export default function VehiclesPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    make: "", model: "", year: "", color: "", plateNumber: "", istimaraNumber: "",
    isBasementParking: false,
  });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docKey, setDocKey] = useState<string | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [basementError, setBasementError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // H4 P1 — shared pagination hook; total derived from API, not data.length.
  const { items: vehicles, totalPages, page, setPage, isLoading } = usePaginatedApi<Vehicle>(
    ["vehicles"],
    (p, l) => `/vehicles?page=${p}&limit=${l}`,
  );

  // Fetch the user's unit record to get building + parking lots
  const { data: unitRecord } = useQuery<UnitRecord | null>({
    queryKey: ["my-unit"],
    queryFn: () => apiRequest("/units"),
    enabled: !!user,
  });

  const parkingLots: ParkingLot[] = unitRecord?.parkingLots
    ? (() => { try { return JSON.parse(unitRecord.parkingLots); } catch { return []; } })()
    : [];
  const hasBasementLot = parkingLots.some(lot => lot.isInside);

  // E1: fetch the user's own resident stubs to show verified resident name
  const { data: residentsResult } = useQuery<{ data: any[] }>({
    queryKey: ["my-residents"],
    queryFn: () => apiRequest("/residents"),
    enabled: !!user && (user.role === "owner" || user.role === "tenant"),
  });
  const selfStub = residentsResult?.data?.find(
    (r: any) => r.linkedUserId === user?.id && r.status === "active",
  );
  const verifiedResidentName = selfStub
    ? [selfStub.firstName, selfStub.lastName].filter(Boolean).join(" ")
    : null;

  const ownerName = verifiedResidentName
    || [user?.firstName, user?.lastName].filter(Boolean).join(" ")
    || user?.email
    || "";

  const activeVehicles = vehicles.filter(v => v.status === "active");
  const isAdmin = user?.role === "admin";
  const isVerified = user?.verificationStatus === "verified_owner" || user?.verificationStatus === "verified_tenant";
  const canRegister = isVerified || isAdmin;
  const isAdditional = activeVehicles.length >= 1;

  const statusConfig = {
    active:           { label: T("status_active"),           color: "bg-green-100 text-green-700" },
    inactive:         { label: T("status_inactive"),         color: "bg-slate-100 text-slate-500" },
    pending_approval: { label: T("status_pending_approval"), color: "bg-amber-100 text-amber-700" },
  } as Record<string, { label: string; color: string }>;

  const resetForm = () => {
    setForm({ make: "", model: "", year: "", color: "", plateNumber: "", istimaraNumber: "", isBasementParking: false });
    setDocFile(null);
    setDocKey(null);
    setDocUploading(false);
    setBasementError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Upload file to object storage via presigned URL
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFile(file);
    setDocKey(null);
    setDocUploading(true);
    try {
      const { uploadURL, objectPath } = await apiRequest("/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);
      setDocKey(objectPath);
    } catch {
      toast({ title: T("veh_doc_upload_failed"), variant: "destructive" });
      setDocFile(null);
      setDocKey(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setDocUploading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/vehicles", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        year: form.year ? Number(form.year) : undefined,
        registrationDocKey: docKey ?? undefined,
      }),
    }),
    onSuccess: (data: Vehicle) => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      setOpen(false);
      resetForm();
      if (data.isAdditional) {
        toast({ title: T("veh_additional_submitted") });
      } else {
        toast({ title: T("veh_registered") });
      }
    },
    onError: (e: any) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); toast({ title: T("veh_removed") }); },
  });

  const handleCreate = () => {
    if (form.year && isNaN(Number(form.year))) {
      toast({ title: T("common_error"), description: T("veh_year_invalid"), variant: "destructive" });
      return;
    }
    // Basement parking — client-side pre-check
    if (form.isBasementParking && !hasBasementLot) {
      setBasementError(true);
      return;
    }
    setBasementError(false);
    // Document required for additional vehicles
    if (isAdditional && !docKey) {
      toast({ title: T("common_error"), description: T("veh_doc_missing"), variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const isSubmitDisabled =
    createMutation.isPending ||
    docUploading ||
    !form.make ||
    !form.model ||
    !form.plateNumber;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{T("veh_title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{T("veh_subtitle")}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 shrink-0" disabled={!canRegister}>
          <Plus className="h-4 w-4" /> {T("veh_register")}
        </Button>
      </div>

      {!canRegister && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-900 font-medium text-sm">{T("common_verify_required")}</p>
            <p className="text-amber-700 text-xs mt-0.5">{T("veh_verify_msg")}</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <p className="font-medium mb-1">{T("veh_policy_title")}</p>
        <ul className="text-xs space-y-1 list-disc list-inside">
          <li>{T("veh_policy_1")}</li>
          <li>{T("veh_policy_2")}</li>
          <li>{T("veh_policy_3")}</li>
        </ul>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">{T("common_loading")}</p>}
      {!isLoading && (!vehicles || vehicles.length === 0) && (
        <div className="text-center py-16 text-slate-400">
          <Car className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{T("veh_empty")}</p>
        </div>
      )}

      <div className="space-y-3">
        {vehicles?.map(v => {
          const sc = statusConfig[v.status] ?? { label: v.status, color: "bg-slate-100 text-slate-600" };
          return (
            <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                v.status === "active" ? "bg-green-50" : v.status === "pending_approval" ? "bg-amber-50" : "bg-slate-50")}>
                <Car className={cn("h-5 w-5", v.status === "active" ? "text-green-600" : v.status === "pending_approval" ? "text-amber-600" : "text-slate-400")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-900 text-sm">{[v.year, v.make, v.model].filter(Boolean).join(" ")}</p>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", sc.color)}>{sc.label}</span>
                  {v.isAdditional && <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full">{T("veh_additional")}</span>}
                  {v.isBasementParking && <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">{T("veh_basement_parking")}</span>}
                </div>
                <p className="text-slate-500 text-xs mt-0.5">
                  {v.color && `${v.color} · `}{T("veh_plate")}: <strong>{v.plateNumber}</strong>
                  {v.istimaraNumber && ` · ${T("veh_istimara")}: ${v.istimaraNumber}`}
                </p>
                {v.status === "pending_approval" && (
                  <p className="text-amber-600 text-xs mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{T("veh_awaiting_approval")}</p>
                )}
                {v.approvalNote && <p className="text-slate-400 text-xs mt-0.5">{T("common_note")}: {v.approvalNote}</p>}
                {/* E5: show rejection reason when a vehicle has been declined */}
                {v.status === "inactive" && v.rejectionReason && (
                  <p className="text-red-500 text-xs mt-0.5">
                    {T(`veh_rejection_reason_${v.rejectionReason}` as any)}
                  </p>
                )}
              </div>
              {v.status !== "inactive" && (
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 shrink-0"
                  onClick={() => deactivateMutation.mutate(v.id)} disabled={deactivateMutation.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeVehicles.length === 0 ? T("veh_register_first") : T("veh_register_additional")}
            </DialogTitle>
          </DialogHeader>

          {activeVehicles.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              {T("veh_already_has").replace("{n}", String(activeVehicles.length))}
            </div>
          )}

          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* ── Unit context (pre-filled) ─────────────────────────── */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{T("veh_owner_name")}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-800 font-medium">{ownerName}</p>
                {/* E1: verified badge when we have an active resident stub */}
                {verifiedResidentName && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    {T("veh_verified_resident")}
                  </span>
                )}
              </div>
              {unitRecord && (
                <p className="text-xs text-slate-500">
                  {T("veh_building")}: <span className="font-medium">{unitRecord.building}</span>
                  {" · "}{T("veh_apartment")}: <span className="font-medium">{unitRecord.unitNumber}</span>
                </p>
              )}
              {!unitRecord && user?.unitNumber && (
                <p className="text-xs text-slate-500">
                  {T("veh_apartment")}: <span className="font-medium">{user.unitNumber}</span>
                </p>
              )}
            </div>

            {/* ── Vehicle details ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T("veh_make")}</Label><Input className="mt-1" placeholder="Toyota" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} /></div>
              <div><Label>{T("veh_model")}</Label><Input className="mt-1" placeholder="Camry" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T("veh_year")}</Label><Input type="number" className="mt-1" placeholder="2023" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div>
              <div><Label>{T("veh_color")}</Label><Input className="mt-1" placeholder="Silver" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T("veh_plate")}</Label><Input className="mt-1" placeholder="ABC-1234" value={form.plateNumber} onChange={e => setForm(f => ({ ...f, plateNumber: e.target.value }))} /></div>
              <div><Label>{T("veh_istimara")} <span className="text-slate-400 text-xs">({T("common_optional")})</span></Label><Input className="mt-1" value={form.istimaraNumber} onChange={e => setForm(f => ({ ...f, istimaraNumber: e.target.value }))} /></div>
            </div>

            {/* ── Basement parking checkbox ─────────────────────────── */}
            <div className={cn(
              "rounded-lg border p-3 space-y-2",
              basementError ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
            )}>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="basement-parking"
                  checked={form.isBasementParking}
                  onCheckedChange={(checked) => {
                    setForm(f => ({ ...f, isBasementParking: !!checked }));
                    if (!checked) setBasementError(false);
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="basement-parking" className="text-sm font-medium cursor-pointer">
                    {T("veh_basement_parking")}
                  </Label>
                  <p className="text-xs text-slate-500 mt-0.5">{T("veh_basement_desc")}</p>
                </div>
              </div>
              {basementError && (
                <div className="flex items-start gap-1.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{T("veh_no_basement_lot")}</span>
                </div>
              )}
            </div>

            {/* ── Registration document (required for additional) ────── */}
            {isAdditional && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  {T("veh_doc_required_label")}
                  <span className="text-red-500 text-xs">*</span>
                </Label>
                <p className="text-xs text-slate-500">{T("veh_doc_required_hint")}</p>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {docUploading ? (
                    <>
                      <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                      <p className="text-xs text-slate-500">{T("veh_doc_uploading")}</p>
                    </>
                  ) : docKey ? (
                    <>
                      <FileText className="h-5 w-5 text-green-500" />
                      <p className="text-xs text-green-700 font-medium">{docFile?.name ?? "Document attached"}</p>
                      <p className="text-[10px] text-slate-400">{T("common_click_change")}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-slate-400" />
                      <p className="text-xs text-slate-600 font-medium">{T("common_upload_file")}</p>
                      <p className="text-[10px] text-slate-400">PDF, JPG, PNG</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={isSubmitDisabled}
            >
              {docUploading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{T("veh_doc_uploading")}</>
                : createMutation.isPending
                  ? T("common_saving")
                  : activeVehicles.length === 0
                    ? T("veh_register")
                    : T("veh_submit_request")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
