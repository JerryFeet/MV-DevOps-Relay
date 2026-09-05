import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocation } from "wouter";
import { useListHistoricalRecords } from "@workspace/api-client-react";
import type { HistoricalResident, ListHistoricalRecordsRecordType } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/translations";
import { SELECTABLE_UNIT_REFERENCES } from "@workspace/unit-reference";
import { displayUnitReference } from "@/lib/unitReference";

const RELATIONSHIP_OPTIONS = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "relative",
  "domestic_worker",
  "other",
];

const RECORD_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "moved_out_residents", labelKey: "hist_moved_out_residents" },
];

type ActiveFilters = {
  recordType: string;
  name?: string;
  nationalId?: string;
  unitNumber?: string;
  relationship?: string;
  movedOutAfter?: string;
  movedOutBefore?: string;
  page: number;
};

export default function HistoricalRecordsPage() {
  const { data: appUser, isLoading: userLoading } = useCurrentUser();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const T = (key: string) => t(lang, key);

  // Form controls — "all" is the sentinel for "no filter" on selects
  const [recordType, setRecordType] = useState("moved_out_residents");
  const [name, setName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [relationship, setRelationship] = useState("all");
  const [movedOutAfter, setMovedOutAfter] = useState("");
  const [movedOutBefore, setMovedOutBefore] = useState("");

  // Active filters — only committed when the user clicks Search
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    recordType: "moved_out_residents",
    page: 1,
  });

  const { data, isLoading } = useListHistoricalRecords({
    recordType: activeFilters.recordType as ListHistoricalRecordsRecordType,
    ...(activeFilters.name ? { name: activeFilters.name } : {}),
    ...(activeFilters.nationalId ? { nationalId: activeFilters.nationalId } : {}),
    ...(activeFilters.unitNumber ? { unitNumber: activeFilters.unitNumber } : {}),
    ...(activeFilters.relationship ? { relationship: activeFilters.relationship } : {}),
    ...(activeFilters.movedOutAfter ? { movedOutAfter: activeFilters.movedOutAfter } : {}),
    ...(activeFilters.movedOutBefore ? { movedOutBefore: activeFilters.movedOutBefore } : {}),
    page: activeFilters.page,
    limit: 20,
  });

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{T("loading")}</div>
    );
  }

  if (!appUser || appUser.role !== "admin") {
    setLocation("/portal");
    return null;
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveFilters({
      recordType,
      name: name.trim() || undefined,
      nationalId: nationalId.trim() || undefined,
      unitNumber: unitNumber.trim() || undefined,
      // "all" sentinel means no filter
      relationship: relationship !== "all" ? relationship : undefined,
      movedOutAfter: movedOutAfter || undefined,
      movedOutBefore: movedOutBefore || undefined,
      page: 1,
    });
  }

  function handleReset() {
    setRecordType("moved_out_residents");
    setName("");
    setNationalId("");
    setUnitNumber("");
    setRelationship("all");
    setMovedOutAfter("");
    setMovedOutBefore("");
    setActiveFilters({ recordType: "moved_out_residents", page: 1 });
  }

  function goToPage(p: number) {
    setActiveFilters((prev) => ({ ...prev, page: p }));
  }

  const pagination = data?.pagination;
  const records = data?.data ?? [];
  const activeTypeLabelKey = RECORD_TYPE_OPTIONS.find((o) => o.value === activeFilters.recordType)?.labelKey ?? "hist_moved_out_residents";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
            <Archive className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{T("hist_title")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{T("hist_subtitle")}</p>
          </div>
        </div>

        {/* Search form */}
        <form
          onSubmit={handleSearch}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{T("hist_filter_title")}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Record Type selector — extensibility hook */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_record_type")}</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {T(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={T("hist_filter_name_ph")}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_national_id")}</Label>
              <Input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder={T("hist_filter_national_id_ph")}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_unit")}</Label>
              <Select value={unitNumber || "all"} onValueChange={(value) => setUnitNumber(value === "all" ? "" : value)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={T("hist_filter_unit_ph")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T("all")}</SelectItem>
                  {SELECTABLE_UNIT_REFERENCES.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_relationship")}</Label>
              {/* "all" is the sentinel value — Radix Select requires non-empty strings */}
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T("all")}</SelectItem>
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_from")}</Label>
              <Input
                type="date"
                value={movedOutAfter}
                onChange={(e) => setMovedOutAfter(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{T("hist_filter_to")}</Label>
              <Input
                type="date"
                value={movedOutBefore}
                onChange={(e) => setMovedOutBefore(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" className="bg-[#0F4442] hover:bg-[#1c5250] text-white gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {T("search")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              {T("cancel")}
            </Button>
          </div>
        </form>

        {/* Results */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {T("hist_results_title")}
              {pagination && (
                <span className="ms-2 text-xs font-normal text-slate-400">
                  {T("hist_total").replace("{n}", String(pagination.total))}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400">
              {T("hist_record_type_label")}: {T(activeTypeLabelKey)}
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">{T("loading")}</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <Archive className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">{T("hist_no_results")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((r: HistoricalResident) => (
                <div key={r.id} className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {r.firstName} {r.lastName}
                      {r.idNumber && (
                        <span className="ms-2 text-xs text-slate-400 font-normal">ID: {r.idNumber}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {T("hist_col_unit")}: <strong>{displayUnitReference(r.unitNumber)}</strong>
                      {r.relationship && <> · {T("hist_col_relationship")}: {r.relationship}</>}
                      {r.type && <> · {T("hist_col_type")}: {r.type}</>}
                    </p>
                    {r.email && (
                      <p className="text-xs text-slate-400 mt-0.5">{r.email}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                      {T("hist_status_moved_out")}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {new Date(r.updatedAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-SA")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {T("hist_page_of")
                  .replace("{page}", String(pagination.page))
                  .replace("{total}", String(pagination.totalPages))}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
