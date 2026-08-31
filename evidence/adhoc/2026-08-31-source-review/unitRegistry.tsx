    </div>
  );
}

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
      const msg = err?.message ?? "";
      const isDuplicate = msg.includes("already exists") || msg.includes("409");
      toast({
        title: isDuplicate ? T("unit_reg_parking_error_duplicate") : t(lang, "common_error"),
        description: isDuplicate ? undefined : msg,
        variant: "destructive",
      });
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
      toast({ title: T("unit_reg_parking_deleted") });
    },
    onError: (err: any) =>
      toast({ title: t(lang, "common_error"), description: err?.message, variant: "destructive" }),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<NormalizedParkingLot | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleSaved() {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["admin-units-full"] });
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
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Users className="h-4 w-4 text-green-600" /> {T("unit_reg_residents_section")} ({unit.residents.length})
            </h3>
            {unit.residents.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_residents")}</p>
            ) : (
              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-start px-3 py-2">{T("unit_reg_name")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_relationship")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_national_id")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unit.residents.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-medium text-slate-900">{r.firstName} {r.lastName}</td>
                        <td className="px-3 py-2 text-slate-500">{r.relationship ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-xs">{r.idNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Vehicles */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Car className="h-4 w-4 text-amber-600" /> {T("unit_reg_vehicles_section")} ({unit.vehicles.length})
            </h3>
            {unit.vehicles.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_vehicles")}</p>
            ) : (
              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-start px-3 py-2">{T("unit_reg_plate")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_vehicle_desc")}</th>
                      <th className="text-start px-3 py-2">{T("unit_reg_status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unit.vehicles.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-mono font-bold text-slate-900">{v.plateNumber}</td>
                        <td className="px-3 py-2 text-slate-600">{v.year} {v.make} {v.model}{v.color ? ` · ${v.color}` : ""}</td>
                        <td className="px-3 py-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full",
                            v.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                          )}>{v.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Waha Passes */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <KeyRound className="h-4 w-4 text-teal-600" /> {T("unit_reg_passes_section")} ({unit.wahaPasses.length})
            </h3>
            {unit.wahaPasses.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_passes")}</p>
            ) : (
              <div className="space-y-3">
                {unit.wahaPasses.map(p => (
                  <div key={p.id} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-700 capitalize">{p.occupancyTrack} {T("unit_reg_pass_track")}</span>
                      {passStatusBadge(p.status)}
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
          </section>

          {/* Parking — read-only view (all roles) */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <ParkingSquare className="h-4 w-4 text-slate-600" /> {T("unit_reg_parking_section")}
            </h3>
            {parkingLots.length === 0 ? (
              <p className="text-sm text-slate-400 italic">{T("unit_reg_no_parking")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {parkingLots.map((lot, i) => (
                  <span key={i} className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
                    {lot.building} – {lot.lotNumber}{lot.isInside ? " (indoor)" : ""}
                  </span>
                ))}
              </div>
            )}
          </section>

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
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-amber-600" />
        <h1 className="text-2xl font-bold text-slate-900">{T("unit_reg_title")}</h1>
      </div>

      {/* Search mode tabs + filters */}
      <div className="space-y-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          {(["unit", "name"] as SearchMode[]).map(mode => (
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
              {mode === "unit" ? T("unit_reg_search_by_unit") : T("unit_reg_search_by_name")}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {searchMode === "name" ? (
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={T("unit_reg_name_search_placeholder")} className="ps-9" />
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
