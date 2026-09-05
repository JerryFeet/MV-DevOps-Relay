import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, CheckCircle2, Clock, AlertTriangle, ChevronRight, Users, Key,
  FileUp, Loader2, ArrowLeftRight, Plus, Trash2, Info,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { PhoneInput } from "@/components/PhoneInput";
import { TenancyLifecyclePanel } from "@/components/TenancyLifecyclePanel";
import { APARTMENT_OPTIONS, BUILDING_OPTIONS, composeUnitReference } from "@workspace/unit-reference";
import { displayUnitReference } from "@/lib/unitReference";

type ParkingLot = { building: string; lotNumber: string; isInside: boolean };

type VerificationResult = {
  result: "auto_approved" | "pending_manual_review" | "pending_owner_approval" | "unit_has_owner";
  verificationId?: number;
  unit?: unknown;
};

type TenantRequest = {
  id: number;
  unitId: number;
  userId: number;
  nationalId: string | null;
  ejarReference: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  expiresAt: string | null;
  requester: { firstName: string | null; lastName: string | null; email: string; nationalId: string | null } | null;
};

function TenantApprovalCard({
  request, lang, T, approving, onApprove, onReject,
}: {
  request: TenantRequest;
  lang: "en" | "ar";
  T: (key: string) => string;
  approving: boolean;
  onApprove: (approvalBases: string[], otherText?: string) => void;
  onReject: () => void;
}) {
  const [approvalBases, setApprovalBases] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const options = [
    { value: "ejar_contract_verified", label: T("sg11_ejar_contract_verified") },
    { value: "tenant_known_to_me", label: T("sg11_tenant_known_to_me") },
    { value: "other", label: T("sg11_other") },
  ];
  const toggleBasis = (value: string) => setApprovalBases((current) =>
    current.includes(value) ? current.filter((basis) => basis !== value) : [...current, value],
  );
  const cannotApprove = approvalBases.length === 0 || (approvalBases.includes("other") && !otherText.trim());

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">
            {request.requester?.firstName} {request.requester?.lastName}
            <span className="text-slate-400 font-normal text-sm ms-2">{request.requester?.email}</span>
          </p>
          {request.requester?.nationalId && <p className="text-slate-500 text-xs mt-0.5">{T("uv_national_id")}: {request.requester.nationalId}</p>}
          {request.ejarReference && <p className="text-slate-500 text-xs">{T("uv_ejar")}: {request.ejarReference}</p>}
          {request.expiresAt && <p className="text-slate-400 text-xs mt-1">{T("uv_expires")}: {new Date(request.expiresAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}</p>}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-slate-700">{T("sg11_tenant_approval_basis")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={approvalBases.includes(option.value)} onChange={() => toggleBasis(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
        {approvalBases.includes("other") && (
          <Input className="h-8 text-xs" placeholder={T("sg11_other_placeholder")} value={otherText} onChange={(event) => setOtherText(event.target.value)} />
        )}
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700"
            onClick={() => onApprove(approvalBases, otherText.trim() || undefined)}
            disabled={approving || cannotApprove}>
            {T("common_approve")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
            onClick={onReject} disabled={approving}>
            {T("common_decline")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Parking lot editor sub-component
function ParkingLotsEditor({
  lots, maxLots = 3, onChange, T,
}: {
  lots: ParkingLot[];
  maxLots?: number;
  onChange: (lots: ParkingLot[]) => void;
  T: (k: string) => string;
}) {
  function addLot() {
    if (lots.length < maxLots) onChange([...lots, { building: "", lotNumber: "", isInside: false }]);
  }
  function removeLot(i: number) {
    onChange(lots.filter((_, idx) => idx !== i));
  }
  function updateLot(i: number, field: keyof ParkingLot, value: string | boolean) {
    onChange(lots.map((lot, idx) => idx === i ? { ...lot, [field]: value } : lot));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{T("uv_parking_lots")}</Label>
        {lots.length < maxLots && (
          <button type="button" onClick={addLot}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <Plus className="h-3 w-3" />{T("uv_parking_add")}
          </button>
        )}
      </div>
      {lots.length === 0 && (
        <p className="text-xs text-slate-400">{T("uv_parking_up_to_3")}</p>
      )}
      {lots.map((lot, i) => (
        <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Lot {i + 1}</span>
            <button type="button" onClick={() => removeLot(i)} className="text-red-400 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{T("uv_parking_building")}</Label>
              <Input className="mt-0.5 h-8 text-sm" value={lot.building}
                onChange={e => updateLot(i, "building", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{T("uv_parking_lot_number")}</Label>
              <Input className="mt-0.5 h-8 text-sm" value={lot.lotNumber}
                onChange={e => updateLot(i, "lotNumber", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded" checked={lot.isInside}
              onChange={e => updateLot(i, "isInside", e.target.checked)} />
            <span className="text-xs text-slate-600">{T("uv_parking_covered")}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

export default function UnitVerificationPage() {
  const { data: user, refetch: refetchUser } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  const [role, setRole] = useState<"owner" | "tenant" | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // ── Owner form state ──────────────────────────────────────────────────────
  const [ownerForm, setOwnerForm] = useState({
    firstName: "", middleName: "", lastName: "",
    mobile: "",
    building: "", unitNumber: "",
    nationalId: "",
    gender: "",
    parkingLots: [] as ParkingLot[],
    titleDeedNumber: "",
  });
  useEffect(() => {
    if (!user) return;
    setOwnerForm(form => ({
      ...form,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    }));
  }, [user?.firstName, user?.lastName]);
  const ejarInputRef = useRef<HTMLInputElement>(null);
  const [ejarStatus, setEjarStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [ownerIdMatch, setOwnerIdMatch] = useState<boolean | null>(null);
  const [checkingOwnerId, setCheckingOwnerId] = useState(false);

  // ── Tenant form state ─────────────────────────────────────────────────────
  const [tenantForm, setTenantForm] = useState({
    firstName: "", middleName: "", lastName: "",
    mobile: "",
    dateOfBirth: "",
    building: "", unitNumber: "",
    tenantNationalId: "",
    gender: "",
    ownerNationalId: "",
    ejarReference: "",
    ejarDocumentKey: null as string | null,
    ejarOriginalFilename: null as string | null,
    ejarContentHash: null as string | null,
    leaseStartDate: "",
    leaseEndDate: "",
  });

  // ── Path B claim state (unchanged) ───────────────────────────────────────
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [claimForm, setClaimForm] = useState({ newOwnerName: "", newOwnerNationalId: "", oldOwnerName: "", oldOwnerNationalId: "", notes: "" });
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [proofUploadStatus, setProofUploadStatus] = useState<"idle" | "uploading" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: tenantRequests } = useQuery<TenantRequest[]>({
    queryKey: ["tenantRequests"],
    queryFn: () => apiRequest("/unit-verify/pending-tenant-requests"),
    enabled: user?.verificationStatus === "verified_owner",
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const verifyOwnerMutation = useMutation({
    mutationFn: () => apiRequest("/unit-verify/owner", {
      method: "POST",
      body: JSON.stringify({
        firstName: ownerForm.firstName,
        middleName: ownerForm.middleName || undefined,
        lastName: ownerForm.lastName,
        mobile: ownerForm.mobile || undefined,
        building: ownerForm.building,
        unitNumber: ownerForm.unitNumber,
        nationalId: ownerForm.nationalId,
        gender: ownerForm.gender,
        parkingLots: ownerForm.parkingLots.length > 0 ? ownerForm.parkingLots : undefined,
        titleDeedNumber: ownerForm.titleDeedNumber,
      }),
    }),
    onSuccess: (data: VerificationResult) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["currentUser"] });
      refetchUser();
      toast({ title: data.result === "auto_approved" ? T("uv_verified_toast") : T("uv_submitted_toast") });
    },
    onError: (e: Error) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const verifyTenantMutation = useMutation({
    mutationFn: () => apiRequest("/unit-verify/tenant", {
      method: "POST",
      body: JSON.stringify({
        firstName: tenantForm.firstName,
        middleName: tenantForm.middleName || undefined,
        lastName: tenantForm.lastName,
        mobile: tenantForm.mobile || undefined,
        dateOfBirth: tenantForm.dateOfBirth,
        building: tenantForm.building,
        unitNumber: tenantForm.unitNumber,
        nationalId: tenantForm.tenantNationalId || undefined,
        gender: tenantForm.gender,
        ownerNationalId: tenantForm.ownerNationalId,
        ejarReference: tenantForm.ejarReference,
        ejarDocumentKey: tenantForm.ejarDocumentKey,
        ejarOriginalFilename: tenantForm.ejarOriginalFilename,
        ejarContentHash: tenantForm.ejarContentHash,
        leaseStartDate: tenantForm.leaseStartDate,
        leaseEndDate: tenantForm.leaseEndDate,
      }),
    }),
    onSuccess: (data: VerificationResult) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["currentUser"] });
      refetchUser();
      toast({ title: T("uv_sent_to_owner_toast") });
    },
    onError: (e: Error) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const approveTenantMutation = useMutation({
    mutationFn: ({ id, approvalBases, otherText }: { id: number; approvalBases: string[]; otherText?: string }) =>
      apiRequest(`/unit-verify/${id}/approve`, { method: "POST", body: JSON.stringify({ approvalBases, otherText }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenantRequests"] }); toast({ title: T("uv_tenant_approved") }); },
    onError: (e: Error) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const rejectTenantMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => apiRequest(`/unit-verify/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenantRequests"] }); toast({ title: T("uv_tenant_rejected") }); },
  });

  // ── File uploads ─────────────────────────────────────────────────────────
  async function handleEjarUpload(file: File) {
    setEjarStatus("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const upload: { objectPath: string; originalFilename: string; contentHash: string } =
        await apiRequest("/unit-verify/ejar-upload", { method: "POST", body: formData });
      setTenantForm(f => ({
        ...f,
        ejarDocumentKey: upload.objectPath,
        ejarOriginalFilename: upload.originalFilename,
        ejarContentHash: upload.contentHash,
      }));
      setEjarStatus("done");
    } catch (e: unknown) {
      setEjarStatus("idle");
      toast({ title: T("common_error"), description: (e as Error).message, variant: "destructive" });
    }
  }

  async function checkOwnerId() {
    if (!tenantForm.building.trim() || !tenantForm.unitNumber.trim() || !tenantForm.ownerNationalId.trim()) {
      setOwnerIdMatch(null);
      return;
    }
    setCheckingOwnerId(true);
    try {
      const response: { match: boolean } = await apiRequest("/unit-verify/check-owner", {
        method: "POST",
        body: JSON.stringify({
          building: tenantForm.building,
          unitNumber: tenantForm.unitNumber,
          ownerNationalId: tenantForm.ownerNationalId,
        }),
      });
      setOwnerIdMatch(response.match);
    } catch (e: unknown) {
      setOwnerIdMatch(false);
      toast({ title: T("common_error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setCheckingOwnerId(false);
    }
  }

  async function handleProofUpload(file: File) {
    setProofUploadStatus("uploading");
    try {
      const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
      const { uploadURL, objectPath }: { uploadURL: string; objectPath: string } =
        await apiRequest("/ownership-changes/proof-upload", { method: "POST", body: JSON.stringify({ ext }) });
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      setProofKey(objectPath);
      setProofUploadStatus("done");
    } catch (e: unknown) {
      setProofUploadStatus("idle");
      toast({ title: T("common_error"), description: (e as Error).message, variant: "destructive" });
    }
  }

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("/ownership-changes/claim", {
      method: "POST",
      body: JSON.stringify({
        building: ownerForm.building,
        unitNumber: ownerForm.unitNumber,
        newOwnerName: claimForm.newOwnerName,
        newOwnerNationalId: claimForm.newOwnerNationalId,
        ...(claimForm.oldOwnerName ? { outgoingOwnerName: claimForm.oldOwnerName } : {}),
        ...(claimForm.oldOwnerNationalId ? { outgoingOwnerNationalId: claimForm.oldOwnerNationalId } : {}),
        ...(proofKey ? { proofDocumentKey: proofKey } : {}),
        ...(claimForm.notes ? { notes: claimForm.notes } : {}),
      }),
    }),
    onSuccess: () => { setClaimSubmitted(true); setShowClaimForm(false); },
    onError: (e: Error) => toast({ title: T("common_error"), description: e.message, variant: "destructive" }),
  });

  const vs = user?.verificationStatus;

  // ── Verified state ────────────────────────────────────────────────────────
  if (vs === "verified_owner" || vs === "verified_tenant") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{T("uv_title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{T("uv_subtitle")}</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-4 mb-6">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900">
              {vs === "verified_owner" ? T("uv_verified_owner") : T("uv_verified_tenant")}
            </p>
            <p className="text-green-700 text-sm mt-0.5">
              {T("uv_unit_label")}: <strong>{displayUnitReference(user?.unitNumber)}</strong>
            </p>
            <p className="text-green-600 text-xs mt-1">
              {vs === "verified_owner" ? T("uv_owner_confirmed") : T("uv_tenant_confirmed")}
            </p>
          </div>
        </div>

        <TenancyLifecyclePanel role={user?.role} lang={lang} T={T} />

        {vs === "verified_owner" && (
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">{T("uv_tenant_requests")}</h2>
            {(!tenantRequests || tenantRequests.length === 0) ? (
              <p className="text-slate-400 text-sm bg-white border border-slate-200 rounded-xl p-4">{T("uv_no_tenant_requests")}</p>
            ) : (
              <div className="space-y-3">
                {tenantRequests.map(r => (
                  <TenantApprovalCard key={r.id} request={r} lang={lang} T={T}
                    approving={approveTenantMutation.isPending}
                    onApprove={(approvalBases, otherText) => approveTenantMutation.mutate({ id: r.id, approvalBases, otherText })}
                    onReject={() => rejectTenantMutation.mutate({ id: r.id })} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Pending state ─────────────────────────────────────────────────────────
  if (vs === "pending_manual" || vs === "pending_owner_approval") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{T("uv_title")}</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <Clock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">
              {vs === "pending_manual" ? T("uv_awaiting_manual") : T("uv_awaiting_owner")}
            </p>
            <p className="text-amber-700 text-sm mt-1">
              {vs === "pending_manual" ? T("uv_pending_manual_desc") : T("uv_pending_owner_desc")}
            </p>
            <p className="text-amber-600 text-xs mt-2">{T("uv_unit_label")}: <strong>{displayUnitReference(user?.unitNumber)}</strong></p>
          </div>
        </div>
      </div>
    );
  }

  // ── Result state ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6"><h1 className="text-2xl font-bold text-slate-900">{T("uv_title")}</h1></div>

        {result.result === "auto_approved" ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-xl font-bold text-green-900">{T("uv_ownership_verified")}</p>
            <p className="text-green-700 text-sm mt-2">{T("uv_auto_approved_desc")}</p>
          </div>
        ) : result.result === "unit_has_owner" ? (
          claimSubmitted ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-blue-500 mx-auto mb-3" />
              <p className="text-xl font-bold text-blue-900">{T("uv_claim_success_title")}</p>
              <p className="text-blue-700 text-sm mt-2">{T("uv_claim_success_desc")}</p>
            </div>
          ) : showClaimForm ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowLeftRight className="h-5 w-5 text-slate-600" />
                <h2 className="font-semibold text-slate-900">{T("uv_claim_this_unit")}</h2>
              </div>
              <p className="text-slate-600 text-sm">{T("uv_claim_intro")}</p>
              <div>
                <Label>{T("uv_claim_your_name")}</Label>
                <Input className="mt-1" value={claimForm.newOwnerName} onChange={e => setClaimForm(f => ({ ...f, newOwnerName: e.target.value }))} />
              </div>
              <div>
                <Label>{T("uv_claim_your_nid")}</Label>
                <Input className="mt-1" value={claimForm.newOwnerNationalId} onChange={e => setClaimForm(f => ({ ...f, newOwnerNationalId: e.target.value }))} />
              </div>
              <div>
                <Label>{T("uv_claim_old_owner_name")}</Label>
                <Input className="mt-1" value={claimForm.oldOwnerName} onChange={e => setClaimForm(f => ({ ...f, oldOwnerName: e.target.value }))} />
              </div>
              <div>
                <Label>{T("uv_claim_old_owner_nid")}</Label>
                <Input className="mt-1" value={claimForm.oldOwnerNationalId} onChange={e => setClaimForm(f => ({ ...f, oldOwnerNationalId: e.target.value }))} />
              </div>
              <div>
                <Label>{T("uv_claim_upload_title_deed")}</Label>
                <p className="text-xs text-slate-400 mb-2">{T("uv_claim_upload_hint")}</p>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => e.target.files?.[0] && handleProofUpload(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" disabled={proofUploadStatus === "uploading"} onClick={() => fileInputRef.current?.click()}>
                  {proofUploadStatus === "uploading" ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{T("uv_claim_uploading")}</> :
                   proofUploadStatus === "done" ? <><CheckCircle2 className="h-4 w-4 text-green-500 mr-1" />{T("uv_claim_uploaded")}</> :
                   <><FileUp className="h-4 w-4 mr-1" />{T("uv_claim_choose_file")}</>}
                </Button>
              </div>
              <div>
                <Label>{T("coo_notes_label")}</Label>
                <Input className="mt-1" placeholder={T("coo_notes_placeholder")} value={claimForm.notes}
                  onChange={e => setClaimForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowClaimForm(false)}>{T("common_cancel")}</Button>
                <Button disabled={!claimForm.newOwnerName || !claimForm.newOwnerNationalId || claimMutation.isPending} onClick={() => claimMutation.mutate()}>
                  {claimMutation.isPending ? T("uv_claim_submitting") : T("uv_claim_submit_btn")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                <p className="text-xl font-bold text-amber-900">{T("uv_unit_has_owner_msg")}</p>
                <p className="text-amber-700 text-sm mt-2">{T("uv_claim_intro")}</p>
              </div>
              <Button className="w-full" onClick={() => setShowClaimForm(true)}>
                <ArrowLeftRight className="h-4 w-4 mr-2" />{T("uv_claim_this_unit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setResult(null);
                  setShowClaimForm(false);
                }}
              >
                {T("uv_go_back_to_verification")}
              </Button>
            </div>
          )
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-xl font-bold text-amber-900">
              {result.result === "pending_manual_review" ? T("uv_submitted_review") : T("uv_sent_to_owner_result")}
            </p>
            <p className="text-amber-700 text-sm mt-2">
              {result.result === "pending_manual_review" ? T("uv_pending_manual_result_desc") : T("uv_pending_owner_result_desc")}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Role selection ────────────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{T("uv_title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{T("uv_link_desc")}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-8">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">{T("uv_not_linked_warning")}</p>
        </div>
        <h2 className="text-base font-semibold text-slate-800 mb-4">{T("uv_i_am")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setRole("owner")}
            className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-xl p-6 text-start transition-all hover:shadow-md">
            <Key className="h-8 w-8 text-blue-500 mb-3" />
            <p className="font-semibold text-slate-900">{T("uv_owner")}</p>
            <p className="text-slate-500 text-xs mt-1">{T("uv_owner_desc")}</p>
          </button>
          <button onClick={() => setRole("tenant")}
            className="bg-white border-2 border-slate-200 hover:border-blue-400 rounded-xl p-6 text-start transition-all hover:shadow-md">
            <Users className="h-8 w-8 text-blue-500 mb-3" />
            <p className="font-semibold text-slate-900">{T("uv_tenant")}</p>
            <p className="text-slate-500 text-xs mt-1">{T("uv_tenant_desc")}</p>
          </button>
        </div>
      </div>
    );
  }

  const isOwner = role === "owner";
  const isPending = verifyOwnerMutation.isPending || verifyTenantMutation.isPending;

  // ── Parking lot completeness check ───────────────────────────────────────
  // Every entered lot must have both building AND lot number filled in.
  function hasIncompleteParkingLot(lots: ParkingLot[]): boolean {
    return lots.some(lot => !lot.building.trim() || !lot.lotNumber.trim());
  }

  const ownerParkingError = hasIncompleteParkingLot(ownerForm.parkingLots);

  // ── Owner can submit? ─────────────────────────────────────────────────────
  const ownerCanSubmit = !isPending &&
    ownerForm.firstName.trim() !== "" &&
    ownerForm.lastName.trim() !== "" &&
    ownerForm.mobile.trim() !== "" &&
    ownerForm.building.trim() !== "" &&
    ownerForm.unitNumber.trim() !== "" &&
    ownerForm.nationalId.trim() !== "" &&
    (ownerForm.gender === "male" || ownerForm.gender === "female") &&
    /^[0-9]{16}$/.test(ownerForm.titleDeedNumber) &&
    !ownerParkingError;

  // ── Tenant can submit? ────────────────────────────────────────────────────
  const tenantCanSubmit = !isPending &&
    tenantForm.firstName.trim() !== "" &&
    tenantForm.lastName.trim() !== "" &&
    tenantForm.building.trim() !== "" &&
    tenantForm.unitNumber.trim() !== "" &&
    tenantForm.tenantNationalId.trim() !== "" &&
    (tenantForm.gender === "male" || tenantForm.gender === "female") &&
    tenantForm.mobile.trim() !== "" &&
    tenantForm.dateOfBirth !== "" &&
    tenantForm.ownerNationalId.trim() !== "" &&
    tenantForm.ejarReference.trim() !== "" &&
    tenantForm.ejarDocumentKey !== null &&
    tenantForm.leaseStartDate !== "" &&
    tenantForm.leaseEndDate !== "" &&
    tenantForm.leaseEndDate >= tenantForm.leaseStartDate &&
    ownerIdMatch === true &&
    tenantForm.ownerNationalId.trim().length >= 10 &&
    true;

  // ── Form view ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <button onClick={() => setRole(null)} className="text-slate-400 hover:text-slate-600 text-sm mb-2 flex items-center gap-1">
          ← {T("common_back")}
        </button>
        <h1 className="text-2xl font-bold text-slate-900">
          {isOwner ? T("uv_owner_verification") : T("uv_tenant_linkage")}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {isOwner ? T("uv_owner_form_desc") : T("uv_tenant_form_desc")}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">

        {/* ── Name fields (shared) ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{T("uv_first_name")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1"
              value={isOwner ? ownerForm.firstName : tenantForm.firstName}
              readOnly={isOwner}
              aria-readonly={isOwner}
              onChange={e => isOwner
                ? setOwnerForm(f => ({ ...f, firstName: e.target.value }))
                : setTenantForm(f => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div>
            <Label>{T("uv_last_name")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1"
              value={isOwner ? ownerForm.lastName : tenantForm.lastName}
              readOnly={isOwner}
              aria-readonly={isOwner}
              onChange={e => isOwner
                ? setOwnerForm(f => ({ ...f, lastName: e.target.value }))
                : setTenantForm(f => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        {(isOwner ? ownerForm.building : tenantForm.building) && (isOwner ? ownerForm.unitNumber : tenantForm.unitNumber) && (
          <p className="text-xs text-slate-500">
            {T("uv_unit_label")}: <strong>{composeUnitReference(
              isOwner ? ownerForm.building : tenantForm.building,
              isOwner ? ownerForm.unitNumber : tenantForm.unitNumber,
            )}</strong>
          </p>
        )}
        {!isOwner && <div>
          <Label>{T("uv_middle_name")}</Label>
          <Input className="mt-1"
            value={tenantForm.middleName}
            onChange={e => setTenantForm(f => ({ ...f, middleName: e.target.value }))} />
        </div>}
        <div>
          <Label>{T("gender")} <span className="text-red-500">*</span></Label>
          <select
            className="w-full border border-input bg-white rounded-md px-3 py-2 text-sm mt-1"
            value={isOwner ? ownerForm.gender : tenantForm.gender}
            onChange={e => isOwner
              ? setOwnerForm(f => ({ ...f, gender: e.target.value }))
              : setTenantForm(f => ({ ...f, gender: e.target.value }))}
          >
            <option value="">{T("gender")}</option>
            <option value="male">{T("gender_male")}</option>
            <option value="female">{T("gender_female")}</option>
          </select>
        </div>

        {/* ── Mobile ── */}
        <div>
          <Label>{T("uv_mobile")}<span className="text-red-500"> *</span></Label>
          <PhoneInput
            className="mt-1"
            value={isOwner ? ownerForm.mobile : tenantForm.mobile}
            onChange={canonical =>
              isOwner
                ? setOwnerForm(f => ({ ...f, mobile: canonical }))
                : setTenantForm(f => ({ ...f, mobile: canonical }))
            }
            T={T}
          />
        </div>

        {!isOwner && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T("uv_date_of_birth")} <span className="text-red-500">*</span></Label>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1"
                value={tenantForm.dateOfBirth}
                onChange={e => setTenantForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
            </div>
          </div>
        )}

        {/* ── Building + Unit ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{T("uv_building")} <span className="text-red-500">*</span></Label>
            <select className="mt-1 w-full border border-input bg-white rounded-md px-3 py-2 text-sm"
              value={isOwner ? ownerForm.building : tenantForm.building}
              onChange={e => isOwner
                ? setOwnerForm(f => ({ ...f, building: e.target.value }))
                : setTenantForm(f => ({ ...f, building: e.target.value }))}>
              <option value="">{T("uv_building_placeholder")}</option>
              {BUILDING_OPTIONS.map(building => <option key={building} value={building}>{building}</option>)}
            </select>
          </div>
          <div>
            <Label>{T("uv_unit_number")} <span className="text-red-500">*</span></Label>
            <select className="mt-1 w-full border border-input bg-white rounded-md px-3 py-2 text-sm"
              value={isOwner ? ownerForm.unitNumber : tenantForm.unitNumber}
              onChange={e => isOwner
                ? setOwnerForm(f => ({ ...f, unitNumber: e.target.value }))
                : setTenantForm(f => ({ ...f, unitNumber: e.target.value }))}>
              <option value="">{T("uv_unit_placeholder")}</option>
              {APARTMENT_OPTIONS.map(apartment => <option key={apartment} value={apartment}>{apartment}</option>)}
            </select>
          </div>
        </div>

        {/* ── Owner: National ID + auto-match note ── */}
        {isOwner && (
          <>
            <div>
              <Label>{T("uv_national_id")} <span className="text-red-500">*</span></Label>
              <Input className="mt-1" placeholder={T("uv_national_id_placeholder")} maxLength={15}
                value={ownerForm.nationalId}
                onChange={e => setOwnerForm(f => ({ ...f, nationalId: e.target.value }))} />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              {T("uv_auto_match_note")}
            </div>
          </>
        )}

        {/* ── Tenant: Owner NID checked through a non-disclosing endpoint ─── */}
        {!isOwner && (
          <div>
            <Label>{T("uv_owner_nid")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder={T("uv_owner_nid_placeholder")} maxLength={15}
              value={tenantForm.ownerNationalId}
              onChange={e => {
                setOwnerIdMatch(null);
                setTenantForm(f => ({ ...f, ownerNationalId: e.target.value }));
              }}
              onBlur={checkOwnerId} />
            <p className={ownerIdMatch === false ? "text-xs text-red-600 mt-1" : "text-xs text-slate-500 mt-1"}>
              {checkingOwnerId
                ? T("uv_owner_nid_checking")
                : ownerIdMatch === true
                  ? T("uv_owner_nid_valid")
                  : ownerIdMatch === false
                    ? T("uv_owner_nid_invalid")
                    : T("uv_owner_nid_server_check")}
            </p>
          </div>
        )}

        {/* ── Tenant: Tenant NID ── */}
        {!isOwner && (
          <div>
            <Label>{T("uv_tenant_nid")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder={T("uv_national_id_placeholder")} maxLength={15}
              value={tenantForm.tenantNationalId}
              onChange={e => setTenantForm(f => ({ ...f, tenantNationalId: e.target.value }))} />
          </div>
        )}

        {/* ── Tenant: Ejar (required) ── */}
        {!isOwner && (
          <div>
            <Label>{T("uv_ejar_required")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder={T("uv_ejar_placeholder")}
              value={tenantForm.ejarReference}
              onChange={e => setTenantForm(f => ({ ...f, ejarReference: e.target.value }))} />
          </div>
        )}

        {!isOwner && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{T("uv_lease_start")} <span className="text-red-500">*</span></Label>
                <Input type="date" className="mt-1" value={tenantForm.leaseStartDate}
                  onChange={e => setTenantForm(f => ({ ...f, leaseStartDate: e.target.value }))} />
              </div>
              <div>
                <Label>{T("uv_lease_end")} <span className="text-red-500">*</span></Label>
                <Input type="date" min={tenantForm.leaseStartDate || undefined} className="mt-1" value={tenantForm.leaseEndDate}
                  onChange={e => setTenantForm(f => ({ ...f, leaseEndDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{T("uv_ejar_document")} <span className="text-red-500">*</span></Label>
              <p className="text-xs text-slate-500">{T("uv_ejar_document_hint")}</p>
              <input ref={ejarInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => e.target.files?.[0] && handleEjarUpload(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" disabled={ejarStatus === "uploading"}
                onClick={() => ejarInputRef.current?.click()}>
                {ejarStatus === "uploading" ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{T("uv_claim_uploading")}</> :
                  ejarStatus === "done" ? <><CheckCircle2 className="h-4 w-4 text-green-500 mr-1" />{T("uv_claim_uploaded")}</> :
                    <><FileUp className="h-4 w-4 mr-1" />{T("uv_claim_choose_file")}</>}
              </Button>
              {tenantForm.ejarDocumentKey && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {T("uv_document_deletion_notice")}
                </div>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {T("uv_move_out_gate_notice")}
            </div>
          </>
        )}

        {/* ── Parking lots are declared only by owners. ── */}
        {isOwner && <ParkingLotsEditor
          lots={ownerForm.parkingLots}
          onChange={lots => setOwnerForm(f => ({ ...f, parkingLots: lots }))}
          T={T}
        />}
        {isOwner && ownerParkingError && (
          <p role="alert" className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {T("uv_parking_lot_incomplete")}
          </p>
        )}

        {/* ── Owner: Mullak title deed number (mandatory) ── */}
        {isOwner && (
          <div className="space-y-2">
            <Label>{T("uv_title_deed_number")} <span className="text-red-500">*</span></Label>
            <Input className="mt-1" inputMode="numeric" maxLength={16} value={ownerForm.titleDeedNumber}
              onChange={e => setOwnerForm(f => ({ ...f, titleDeedNumber: e.target.value.replace(/[^0-9]/g, "") }))}
              aria-invalid={ownerForm.titleDeedNumber.length > 0 && !/^[0-9]{16}$/.test(ownerForm.titleDeedNumber)}
              placeholder="0000000000000000" />
            <p className="text-xs text-slate-500">{T("uv_title_deed_mullak_hint")}</p>
          </div>
        )}

        {/* ── Email spam notice ── */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {T("uv_email_spam_notice")}
        </div>

        <Button className="w-full"
          disabled={isOwner ? !ownerCanSubmit : !tenantCanSubmit}
          onClick={() => isOwner ? verifyOwnerMutation.mutate() : verifyTenantMutation.mutate()}>
          {isPending ? T("common_submitting") : isOwner ? T("uv_verify_ownership") : T("uv_send_to_owner")}
          <ChevronRight className="h-4 w-4 ms-1" />
        </Button>
      </div>
    </div>
  );
}
