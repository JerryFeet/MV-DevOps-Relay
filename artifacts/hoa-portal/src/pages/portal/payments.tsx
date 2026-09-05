import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { displayUnitReference } from "@/lib/unitReference";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Printer, Receipt, CreditCard, RotateCcw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentRecord {
  id: string;
  recordType: "booking" | "permit";
  recordId: number;
  description: string;
  amount: string;
  currency: string;
  transactionType: "payment" | "refund" | "waived";
  paymentStatus: string;
  paidAt: string | null;
  chargeId: string | null;
  paymentMethod: string | null;
  paymentProvider: string | null;
  facilityName: string | null;
  permitType: string | null;
  serviceDate: string | null;
  unitNumber: string | null;
  resident?: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
    unitNumber: string | null;
  } | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  unitNumber: string | null;
}

interface PaymentReconciliationResult {
  status: string;
  attemptId: number;
  purpose: string;
  confirmedAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmount(amount: string): string {
  const n = parseFloat(amount);
  if (isNaN(n)) return "SAR —";
  return `SAR ${n.toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "paid":           return "bg-green-100 text-green-800 border-green-200";
    case "unpaid":         return "bg-gray-100 text-gray-600 border-gray-200";
    case "refund_pending": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "refunded":       return "bg-blue-100 text-blue-800 border-blue-200";
    case "forfeited":      return "bg-red-100 text-red-800 border-red-200";
    case "waived":         return "bg-purple-100 text-purple-800 border-purple-200";
    default:               return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function typeColor(txn: string): string {
  switch (txn) {
    case "payment": return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "refund":  return "bg-amber-100 text-amber-800 border-amber-200";
    case "waived":  return "bg-slate-100 text-slate-700 border-slate-200";
    default:        return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function statusLabel(status: string, T: (k: string) => string): string {
  const map: Record<string, string> = {
    paid: T("pay_paid"),
    unpaid: T("pay_unpaid"),
    refund_pending: T("pay_refund_pending"),
    refunded: T("pay_refunded"),
    forfeited: T("pay_forfeited"),
    waived: T("pay_waived"),
  };
  return map[status] ?? status;
}

function buildDescription(record: PaymentRecord, T: (k: string) => string): string {
  if (record.recordType === "booking") {
    const fac = record.facilityName ?? T("nav_facilities");
    const date = fmtDate(record.serviceDate);
    return `${fac} — ${date}`;
  }
  const permitTypeMap: Record<string, string> = {
    move_in: "per_type_move_in",
    move_out: "per_type_move_out",
    renovation: "per_type_renovation",
  };
  const typeKey = permitTypeMap[record.permitType ?? ""];
  const typeLabel = typeKey ? T(typeKey) : (record.permitType?.replace(/_/g, " ") ?? "Permit");
  return `${typeLabel} #${record.recordId}`;
}

function txnLabel(txn: string, T: (k: string) => string): string {
  const map: Record<string, string> = {
    payment: T("pay_history_type_payment"),
    refund:  T("pay_history_type_refund"),
    waived:  T("pay_history_type_waived"),
  };
  return map[txn] ?? txn;
}

function reconciliationDescription(status: string, T: (key: string) => string): string {
  if (status === "confirmed" || status === "already_confirmed") {
    return T("pay_reconcile_confirmed");
  }
  if (status === "provider_pending") return T("pay_reconcile_pending");
  return T("pay_reconcile_not_paid");
}

// ─── Print helper ─────────────────────────────────────────────────────────────

function printReceipt(record: PaymentRecord, T: (k: string) => string) {
  const residentName = record.resident
    ? [record.resident.firstName, record.resident.lastName].filter(Boolean).join(" ") || record.resident.email
    : null;

  const rows = [
    ["#", record.recordType === "booking" ? `${T("pay_history_booking_id")} ${record.recordId}` : `${T("pay_history_permit_id")} ${record.recordId}`],
    [T("pay_history_item"), buildDescription(record, T)],
    [T("pay_history_amount_col"), fmtAmount(record.amount)],
    [T("pay_history_status_col"), statusLabel(record.paymentStatus, T)],
    [T("pay_history_service_date"), fmtDate(record.serviceDate)],
    [T("pay_history_date_col"), fmtDate(record.paidAt)],
    [T("pay_history_unit"), record.unitNumber ?? "—"],
    ...(residentName ? [[T("pay_history_resident"), residentName]] : []),
    ["", ""],
    [T("pay_history_provider"), record.paymentProvider ?? "—"],
    [T("pay_history_charge_id"), record.chargeId ?? "—"],
    [T("pay_history_method"), record.paymentMethod ?? "—"],
  ];

  const tableRows = rows
    .map(([k, v]) =>
      k === ""
        ? `<tr><td colspan="2"><hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0"></td></tr>`
        : `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;width:40%">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${v}</td></tr>`
    )
    .join("");

  const w = window.open("", "_blank", "width=540,height=700");
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${T("pay_history_receipt")} — ${buildDescription(record, T)}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 2.5rem; color: #111; }
        h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
        p.sub { color: #6b7280; font-size: 0.875rem; margin: 0 0 1.5rem; }
        table { width: 100%; border-collapse: collapse; }
        .footer { margin-top: 2rem; font-size: 0.75rem; color: #9ca3af; text-align: center; }
      </style>
    </head>
    <body>
      <h1>MADAIN Village HOA</h1>
      <p class="sub">${T("pay_history_receipt")}</p>
      <table>${tableRows}</table>
      <div class="footer">Generated ${new Date().toLocaleString()}</div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  w.document.close();
}

// ─── Receipt Panel ────────────────────────────────────────────────────────────

function ReceiptPanel({ record, T }: { record: PaymentRecord; T: (k: string) => string }) {
  const residentName = record.resident
    ? [record.resident.firstName, record.resident.lastName].filter(Boolean).join(" ") || record.resident.email
    : null;
  const residentUnit = record.resident?.unitNumber ?? null;

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Platform data */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            {T("pay_history_platform")}
          </p>
          <dl className="space-y-2 text-sm">
            <Row label={record.recordType === "booking" ? T("pay_history_booking_id") : T("pay_history_permit_id")} value={String(record.recordId)} />
            <Row label={T("pay_history_item")} value={buildDescription(record, T)} />
            <Row label={T("pay_history_service_date")} value={fmtDate(record.serviceDate)} />
            <Row label={T("pay_history_unit")} value={record.unitNumber ?? T("pay_history_none")} />
            {residentName && <Row label={T("pay_history_resident")} value={residentName} />}
            {residentUnit && residentUnit !== record.unitNumber && (
              <Row label={T("pay_history_unit")} value={residentUnit} />
            )}
          </dl>
        </div>

        {/* PSP data */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            {T("pay_history_psp")}
          </p>
          <dl className="space-y-2 text-sm">
            <Row label={T("pay_history_provider")} value={record.paymentProvider ?? T("pay_history_none")} />
            <Row label={T("pay_history_charge_id")} value={record.chargeId ?? T("pay_history_none")} mono />
            <Row label={T("pay_history_method")} value={record.paymentMethod ?? T("pay_history_none")} />
            <Row label={T("pay_history_date_col")} value={fmtDate(record.paidAt)} />
          </dl>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => printReceipt(record, T)}
          className="gap-2 text-xs"
        >
          <Printer className="h-3.5 w-3.5" />
          {T("pay_history_print")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-gray-500">{label}</dt>
      <dd className={`font-medium text-gray-800 break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentHistoryPage() {
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);
  const { data: appUser } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = appUser?.role === "admin";

  const [expanded, setExpanded] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reconcileChargeId, setReconcileChargeId] = useState("");
  const [reconciliationResult, setReconciliationResult] = useState<PaymentReconciliationResult | null>(null);

  // Admin: load users for dropdown
  const { data: allUsers = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list-for-payment-filter"],
    queryFn: () => apiRequest("/users?all=true"),
    enabled: isAdmin,
  });

  const residents = Array.isArray(allUsers) ? allUsers.filter(u => u.id !== undefined) : [];

  // Payment history
  const { data: records = [], isLoading } = useQuery<PaymentRecord[]>({
    queryKey: ["payment-history", adminUserId, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isAdmin && adminUserId !== "all") params.set("userId", adminUserId);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const qs = params.toString();
      return apiRequest(`/payments/history${qs ? `?${qs}` : ""}`);
    },
    enabled: !!appUser,
  });

  const reconciliationMutation = useMutation({
    mutationFn: async (): Promise<PaymentReconciliationResult> => apiRequest("/payments/reconcile", {
      method: "POST",
      body: JSON.stringify({ chargeId: reconcileChargeId.trim() }),
    }),
    onSuccess: (result) => {
      setReconciliationResult(result);
      queryClient.invalidateQueries({ queryKey: ["payment-history"] });
      toast({
        title: T("pay_reconcile_result_title"),
        description: reconciliationDescription(result.status, T),
      });
    },
    onError: (error: Error) => {
      toast({ title: T("common_error"), description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#0F4442]/10 flex items-center justify-center shrink-0">
          <CreditCard className="h-5 w-5 text-[#0F4442]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{T("pay_history_title")}</h1>
        </div>
      </div>

      {/* Admin filters */}
      {isAdmin && (
        <>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">{T("pay_history_filter_resident")}</Label>
                  <Select value={adminUserId} onValueChange={setAdminUserId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{T("pay_history_all_residents")}</SelectItem>
                      {residents.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                          {u.unitNumber ? ` · ${displayUnitReference(u.unitNumber)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">{T("pay_history_date_from")}</Label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">{T("pay_history_date_to")}</Label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{T("pay_reconcile_title")}</h2>
                <p className="mt-1 text-xs leading-5 text-gray-600">{T("pay_reconcile_description")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="moyasar-charge-id" className="text-xs text-gray-600">
                    {T("pay_reconcile_charge_id")}
                  </Label>
                  <Input
                    id="moyasar-charge-id"
                    value={reconcileChargeId}
                    onChange={(event) => setReconcileChargeId(event.target.value)}
                    placeholder={T("pay_reconcile_charge_placeholder")}
                    autoComplete="off"
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <Button
                  type="button"
                  className="mt-auto gap-2"
                  disabled={!reconcileChargeId.trim() || reconciliationMutation.isPending}
                  onClick={() => reconciliationMutation.mutate()}
                >
                  <RotateCcw className="h-4 w-4" />
                  {reconciliationMutation.isPending ? T("loading") : T("pay_reconcile_action")}
                </Button>
              </div>
              {reconciliationResult && (
                <p className="rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700">
                  {reconciliationDescription(reconciliationResult.status, T)}
                  {reconciliationResult.status === "confirmed" || reconciliationResult.status === "already_confirmed"
                    ? ` ${T("pay_reconcile_attempt")} #${reconciliationResult.attemptId}.`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">{T("loading")}</div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Receipt className="h-10 w-10 text-gray-300" />
            <p className="text-gray-500 text-sm">{T("pay_history_empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map(record => {
            const isOpen = expanded === record.id;
            return (
              <Card key={record.id} className="overflow-hidden">
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : record.id)}
                  className="w-full text-left"
                >
                  <CardContent className="py-3.5 px-5">
                    <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {buildDescription(record, T)}
                        </p>
                        {record.resident && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[record.resident.firstName, record.resident.lastName].filter(Boolean).join(" ") || record.resident.email}
                            {record.resident.unitNumber ? ` · ${displayUnitReference(record.resident.unitNumber)}` : ""}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {record.paidAt ? fmtDate(record.paidAt) : "—"}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {fmtAmount(record.amount)}
                        </p>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 border ${typeColor(record.transactionType)}`}
                        >
                          {txnLabel(record.transactionType, T)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 border ${statusColor(record.paymentStatus)}`}
                        >
                          {statusLabel(record.paymentStatus, T)}
                        </Badge>
                      </div>

                      {/* Chevron */}
                      <div className="shrink-0 self-center text-gray-400">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardContent>
                </button>

                {/* Receipt panel */}
                {isOpen && <ReceiptPanel record={record} T={T} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
