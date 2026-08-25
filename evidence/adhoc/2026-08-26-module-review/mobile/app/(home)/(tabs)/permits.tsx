import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  Platform,
  Animated,
  I18nManager,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTranslations } from "@/hooks/useTranslations";
import { DatePickerField } from "@/components/DatePickerField";
import { normalizePhone } from "@/lib/phoneUtils";
import { useRef, useEffect } from "react";

type UserProfile = { role: string; firstName?: string | null; lastName?: string | null };

const isRTL = I18nManager.isRTL;

type Segment = "move" | "renovation";
type MoveType = "move_in" | "move_out";

type RenovationPermit = {
  id: number;
  type: string;
  status: string;
  description: string | null;
  unitNumber: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  movingCompanyName?: string | null;
  elevatorSlot?: string | null;
  contractorName?: string | null;
  createdAt: string;
};

const RENO_STATUS_COLORS: Record<string, string> = {
  draft:                    "#64748b",
  submitted:                "#3b82f6",
  under_review:             "#8b5cf6",
  approved:                 "#16a34a",
  approved_with_conditions: "#0d9488",
  rejected:                 "#ef4444",
  in_progress:              "#f59e0b",
  completed:                "#475569",
  deposit_refunded:         "#16a34a",
  deposit_forfeited:        "#ef4444",
};

// Keep these API identifiers aligned with VALID_RENOVATION_SCOPES on the server.
const RENOVATION_SCOPES = [
  { value: "major_plumbing_electrical", labelKey: "reno_scope_major_plumbing_electrical" },
  { value: "structural_modifications", labelKey: "reno_scope_structural_modifications" },
  { value: "major_interior_upgrades", labelKey: "reno_scope_major_interior_upgrades" },
  { value: "flooring", labelKey: "reno_scope_flooring" },
  { value: "exterior_affecting", labelKey: "reno_scope_exterior_affecting" },
] as const;

function MoveFormCard({ item, colors }: { item: RenovationPermit; colors: ReturnType<typeof useColors> }) {
  const sc = RENO_STATUS_COLORS[item.status] ?? colors.primary;
  const typeLabel = item.type === "move_in" ? "Move-In" : "Move-Out";
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.cardTop}>
        <View style={[s.typePill, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[s.typePillText, { color: colors.primary }]}>{typeLabel}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: sc + "20" }]}>
          <Text style={[s.statusText, { color: sc }]}>{item.status.replace(/_/g, " ")}</Text>
        </View>
      </View>
      {item.unitNumber ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="home" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>Unit {item.unitNumber}</Text>
        </View>
      ) : null}
      {item.requestedStartDate ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>
            {new Date(item.requestedStartDate).toLocaleDateString()}
            {item.requestedEndDate ? ` – ${new Date(item.requestedEndDate).toLocaleDateString()}` : ""}
          </Text>
        </View>
      ) : null}
      {item.elevatorSlot ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="clock" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>{item.elevatorSlot}</Text>
        </View>
      ) : null}
      {item.movingCompanyName ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="truck" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>{item.movingCompanyName}</Text>
        </View>
      ) : null}
      {item.description ? (
        <Text style={[s.cardNote, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
      ) : null}
      <Text style={[s.dateText, { color: colors.mutedForeground }]}>
        Submitted {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </View>
  );
}

function RenoPermitCard({
  item,
  colors,
}: {
  item: RenovationPermit;
  colors: ReturnType<typeof useColors>;
}) {
  const sc = RENO_STATUS_COLORS[item.status] ?? colors.primary;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.cardTop}>
        <View style={[s.typePill, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[s.typePillText, { color: colors.primary }]}>Renovation</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: sc + "20" }]}>
          <Text style={[s.statusText, { color: sc }]}>{item.status.replace(/_/g, " ")}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={[s.cardTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      {item.unitNumber ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="home" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>Unit {item.unitNumber}</Text>
        </View>
      ) : null}
      {item.requestedStartDate ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>
            {new Date(item.requestedStartDate).toLocaleDateString()}
            {item.requestedEndDate ? ` – ${new Date(item.requestedEndDate).toLocaleDateString()}` : ""}
          </Text>
        </View>
      ) : null}
      {item.contractorName ? (
        <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
          <Feather name="tool" size={13} color={colors.mutedForeground} />
          <Text style={[s.metaText, { color: colors.mutedForeground }]}>{item.contractorName}</Text>
        </View>
      ) : null}
      <Text style={[s.dateText, { color: colors.mutedForeground }]}>
        Submitted {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </View>
  );
}

function BottomSheet({
  visible,
  onClose,
  children,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  const translateY = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 800,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          s.sheet,
          { backgroundColor: colors.background, transform: [{ translateY }] },
        ]}
      >
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

function MoveFormSheet({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [moveType, setMoveType] = useState<MoveType>("move_in");
  const [unitNumber, setUnitNumber] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [moversCompany, setMoversCompany] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch("/api/permits", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permits"] });
    },
  });

  const reset = () => {
    setMoveType("move_in");
    setUnitNumber("");
    setScheduledDate("");
    setTimeSlot("");
    setMoversCompany("");
    setNotes("");
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const isValid = !!scheduledDate && !!unitNumber;

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        permitType: moveType,
        requestedStartDate: scheduledDate,
        ...(unitNumber ? { unitNumber } : {}),
        ...(moversCompany ? { movingCompanyName: moversCompany } : {}),
        ...(timeSlot ? { elevatorSlot: timeSlot } : {}),
        ...(notes ? { description: notes } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch (err: any) {
      Alert.alert("Submission Failed", err?.message ?? "Could not submit your move form.");
    }
  };

  const MOVE_OPTIONS: { label: string; value: MoveType }[] = [
    { label: t("move_form_type_move_in"),  value: "move_in" },
    { label: t("move_form_type_move_out"), value: "move_out" },
  ];

  return (
    <BottomSheet visible={visible} onClose={handleClose} colors={colors}>
      <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
        <Text testID="move-form-sheet-title" style={[s.sheetTitle, { color: colors.foreground }]}>{t("move_form_title")}</Text>
        <Pressable onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
      </View>
      <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
        <Text testID="move-label-type" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_type_label")}</Text>
        <View style={s.typeRow}>
          {MOVE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setMoveType(opt.value)}
              style={({ pressed }) => [
                s.typeChip,
                {
                  backgroundColor: moveType === opt.value ? colors.primary : colors.muted,
                  borderColor: moveType === opt.value ? colors.primary : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.typeChipText, { color: moveType === opt.value ? "#ffffff" : colors.foreground }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text testID="move-label-unit" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_unit_label")}</Text>
        <TextInput
          testID="move-input-unit"
          style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
          value={unitNumber}
          onChangeText={setUnitNumber}
          placeholder={t("move_form_unit_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />

        <Text testID="move-label-date" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_date_label")}</Text>
        <DatePickerField
          value={scheduledDate}
          onChange={setScheduledDate}
          placeholder={t("move_form_date_placeholder")}
          colors={colors}
        />

        <Text testID="move-label-time-slot" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_time_slot_label")}</Text>
        <TextInput
          testID="move-input-time-slot"
          style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
          value={timeSlot}
          onChangeText={setTimeSlot}
          placeholder={t("move_form_time_slot_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />

        <Text testID="move-label-company" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_company_label")}</Text>
        <TextInput
          testID="move-input-company"
          style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
          value={moversCompany}
          onChangeText={setMoversCompany}
          placeholder={t("move_form_company_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />

        <Text testID="move-label-notes" style={[s.fieldLabel, { color: colors.foreground }]}>{t("move_form_notes_label")}</Text>
        <TextInput
          testID="move-input-notes"
          style={[s.textInput, s.textArea, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("move_form_notes_placeholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />

        <Pressable
          style={({ pressed }) => [
            s.submitButton,
            { backgroundColor: colors.primary },
            (!isValid || createMutation.isPending) && { opacity: 0.5 },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text testID="move-form-submit-text" style={s.submitText}>{t("move_form_submit_btn")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

function RenoPermitSheet({
  visible,
  onClose,
  colors,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  onSuccess: () => void;
}) {
  const t = useTranslations();
  const [description, setDescription] = useState("");
  const [requestedStartDate, setRequestedStartDate] = useState("");
  const [requestedEndDate, setRequestedEndDate] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [contractorName, setContractorName] = useState("");
  const [contractorContact, setContractorContact] = useState("");
  const [workingHoursRequested, setWorkingHoursRequested] = useState("");
  const [commonAreaImpact, setCommonAreaImpact] = useState<boolean | null>(null);
  const [commonAreaImpactDetails, setCommonAreaImpactDetails] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch("/api/permits", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => onSuccess(),
  });

  const reset = () => {
    setDescription("");
    setRequestedStartDate("");
    setRequestedEndDate("");
    setSelectedScopes([]);
    setContractorName("");
    setContractorContact("");
    setWorkingHoursRequested("");
    setCommonAreaImpact(null);
    setCommonAreaImpactDetails("");
    setFieldErrors({});
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  function toggleScope(value: string) {
    setSelectedScopes(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value],
    );
    setFieldErrors(e => ({ ...e, renovationScope: "" }));
  }

  const dateRangeError =
    !!requestedStartDate &&
    !!requestedEndDate &&
    requestedEndDate < requestedStartDate;

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!description.trim()) errors.description = "Description is required.";
    if (!requestedStartDate) errors.requestedStartDate = "Start date is required.";
    if (!requestedEndDate) errors.requestedEndDate = "End date is required.";
    if (dateRangeError) errors.requestedEndDate = "End date cannot be before start date.";
    if (selectedScopes.length === 0) errors.renovationScope = "Select at least one scope category.";
    if (!contractorName.trim()) errors.contractorName = "Contractor name is required.";
    const normalizedContact = normalizePhone(contractorContact);
    if (!contractorContact.trim()) {
      errors.contractorContact = "Contractor mobile is required.";
    } else if (!normalizedContact) {
      errors.contractorContact = "Enter a valid Saudi mobile number (e.g. 5XXXXXXXX).";
    }
    if (!workingHoursRequested.trim()) errors.workingHoursRequested = "Working hours are required.";
    if (commonAreaImpact === null) errors.commonAreaImpact = "Please state whether the work affects a common area.";
    if (commonAreaImpact && !commonAreaImpactDetails.trim()) {
      errors.commonAreaImpactDetails = "Please describe the common-area impact.";
    }
    return errors;
  }

  const handleSubmit = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const normalizedContact = normalizePhone(contractorContact);
    if (!normalizedContact || commonAreaImpact === null) return;

    const body: Record<string, unknown> = {
      permitType: "renovation",
      description,
      requestedStartDate,
      requestedEndDate,
      renovationScope: selectedScopes,
      contractorName,
      contractorContact: normalizedContact,
      workingHoursRequested,
      commonAreaImpact,
      ...(commonAreaImpact ? { commonAreaImpactDetails: commonAreaImpactDetails.trim() } : {}),
    };

    try {
      await createMutation.mutateAsync(body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch (err: any) {
      Alert.alert("Submission Failed", err?.message ?? "Could not submit your renovation permit.");
    }
  };

  const isSubmitEnabled = !createMutation.isPending;

  return (
    <BottomSheet visible={visible} onClose={handleClose} colors={colors}>
      <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
        <Text testID="reno-form-sheet-title" style={[s.sheetTitle, { color: colors.foreground }]}>{t("reno_form_title")}</Text>
        <Pressable onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
      </View>
      <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
        {/* Description — mandatory */}
        <Text testID="reno-label-desc" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_desc_label")} *</Text>
        <TextInput
          testID="reno-input-desc"
          style={[
            s.textInput, s.textArea,
            { borderColor: fieldErrors.description ? "#ef4444" : colors.border, backgroundColor: colors.muted, color: colors.foreground },
          ]}
          value={description}
          onChangeText={v => { setDescription(v); setFieldErrors(e => ({ ...e, description: "" })); }}
          placeholder={t("reno_form_desc_placeholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />
        {fieldErrors.description ? <Text style={s.fieldError}>{fieldErrors.description}</Text> : null}

        {/* Start Date — mandatory */}
        <Text testID="reno-label-start-date" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_start_date_label")}</Text>
        <DatePickerField
          testID="reno-input-start-date"
          value={requestedStartDate}
          onChange={v => { setRequestedStartDate(v); setFieldErrors(e => ({ ...e, requestedStartDate: "" })); }}
          placeholder={t("reno_form_start_date_placeholder")}
          colors={colors}
        />
        {fieldErrors.requestedStartDate ? <Text style={s.fieldError}>{fieldErrors.requestedStartDate}</Text> : null}

        {/* End Date — mandatory */}
        <Text testID="reno-label-end-date" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_end_date_label")} *</Text>
        <DatePickerField
          testID="reno-input-end-date"
          value={requestedEndDate}
          onChange={v => { setRequestedEndDate(v); setFieldErrors(e => ({ ...e, requestedEndDate: "" })); }}
          placeholder={t("reno_form_end_date_placeholder")}
          colors={colors}
        />
        {(dateRangeError || fieldErrors.requestedEndDate) ? (
          <Text style={s.dateError}>{fieldErrors.requestedEndDate || "End date cannot be earlier than start date"}</Text>
        ) : null}

        {/* Renovation Scope — mandatory multi-select with all 5 categories */}
        <Text testID="reno-label-scope" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_scope_label")} *</Text>
        <View style={s.scopeGrid}>
          {RENOVATION_SCOPES.map((sc) => (
            <Pressable
              key={sc.value}
              testID={`reno-scope-chip-${sc.value}`}
              onPress={() => toggleScope(sc.value)}
              style={({ pressed }) => [
                s.scopeChip,
                {
                  backgroundColor: selectedScopes.includes(sc.value) ? colors.primary : colors.muted,
                  borderColor: selectedScopes.includes(sc.value) ? colors.primary : (fieldErrors.renovationScope ? "#ef4444" : colors.border),
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.scopeChipText, { color: selectedScopes.includes(sc.value) ? "#ffffff" : colors.foreground }]}>
                {t(sc.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        {fieldErrors.renovationScope ? <Text style={s.fieldError}>{fieldErrors.renovationScope}</Text> : null}

        <Text testID="reno-label-common-area-impact" style={[s.fieldLabel, { color: colors.foreground }]}>
          {t("reno_form_common_area_impact_label")} *
        </Text>
        <View style={s.typeRow}>
          {[
            { value: true, label: t("reno_form_common_area_yes") },
            { value: false, label: t("reno_form_common_area_no") },
          ].map((option) => (
            <Pressable
              key={String(option.value)}
              testID={`reno-common-area-${option.value ? "yes" : "no"}`}
              onPress={() => {
                setCommonAreaImpact(option.value);
                if (!option.value) setCommonAreaImpactDetails("");
                setFieldErrors(e => ({ ...e, commonAreaImpact: "", commonAreaImpactDetails: "" }));
              }}
              style={({ pressed }) => [
                s.typeChip,
                {
                  backgroundColor: commonAreaImpact === option.value ? colors.primary : colors.muted,
                  borderColor: commonAreaImpact === option.value ? colors.primary : (fieldErrors.commonAreaImpact ? "#ef4444" : colors.border),
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.typeChipText, { color: commonAreaImpact === option.value ? "#ffffff" : colors.foreground }]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {fieldErrors.commonAreaImpact ? <Text style={s.fieldError}>{fieldErrors.commonAreaImpact}</Text> : null}

        {commonAreaImpact ? (
          <>
            <Text testID="reno-label-common-area-details" style={[s.fieldLabel, { color: colors.foreground }]}>
              {t("reno_form_common_area_details_label")} *
            </Text>
            <TextInput
              testID="reno-input-common-area-details"
              style={[
                s.textInput, s.textArea,
                { borderColor: fieldErrors.commonAreaImpactDetails ? "#ef4444" : colors.border, backgroundColor: colors.muted, color: colors.foreground },
              ]}
              value={commonAreaImpactDetails}
              onChangeText={v => { setCommonAreaImpactDetails(v); setFieldErrors(e => ({ ...e, commonAreaImpactDetails: "" })); }}
              placeholder={t("reno_form_common_area_details_placeholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
            {fieldErrors.commonAreaImpactDetails ? <Text style={s.fieldError}>{fieldErrors.commonAreaImpactDetails}</Text> : null}
          </>
        ) : null}

        {/* Contractor Name — mandatory */}
        <Text testID="reno-label-contractor-name" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_contractor_name_label")} *</Text>
        <TextInput
          testID="reno-input-contractor-name"
          style={[
            s.textInput,
            { borderColor: fieldErrors.contractorName ? "#ef4444" : colors.border, backgroundColor: colors.muted, color: colors.foreground },
          ]}
          value={contractorName}
          onChangeText={v => { setContractorName(v); setFieldErrors(e => ({ ...e, contractorName: "" })); }}
          placeholder={t("reno_form_contractor_name_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />
        {fieldErrors.contractorName ? <Text style={s.fieldError}>{fieldErrors.contractorName}</Text> : null}

        {/* Contractor Mobile — Saudi default and normalized to E.164 before submission. */}
        <Text testID="reno-label-contractor-contact" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_contractor_contact_label")} *</Text>
        <View style={[s.phoneInputRow, { borderColor: fieldErrors.contractorContact ? "#ef4444" : colors.border, backgroundColor: colors.muted }]}>
          <Text style={[s.phonePrefix, { color: colors.mutedForeground }]}>+966</Text>
          <TextInput
            testID="reno-input-contractor-contact"
            style={[s.phoneInput, { color: colors.foreground }]}
            value={contractorContact.replace(/^\+966/, "")}
            onChangeText={v => { setContractorContact(v); setFieldErrors(e => ({ ...e, contractorContact: "" })); }}
            placeholder={t("reno_form_contractor_contact_placeholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
          />
        </View>
        {fieldErrors.contractorContact ? <Text style={s.fieldError}>{fieldErrors.contractorContact}</Text> : null}

        {/* Working Hours — mandatory */}
        <Text testID="reno-label-working-hours" style={[s.fieldLabel, { color: colors.foreground }]}>{t("reno_form_working_hours_label")} *</Text>
        <TextInput
          testID="reno-input-working-hours"
          style={[
            s.textInput,
            { borderColor: fieldErrors.workingHoursRequested ? "#ef4444" : colors.border, backgroundColor: colors.muted, color: colors.foreground },
          ]}
          value={workingHoursRequested}
          onChangeText={v => { setWorkingHoursRequested(v); setFieldErrors(e => ({ ...e, workingHoursRequested: "" })); }}
          placeholder={t("reno_form_working_hours_placeholder")}
          placeholderTextColor={colors.mutedForeground}
        />
        {fieldErrors.workingHoursRequested ? <Text style={s.fieldError}>{fieldErrors.workingHoursRequested}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            s.submitButton,
            { backgroundColor: colors.primary },
            (!isSubmitEnabled) && { opacity: 0.5 },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSubmit}
          disabled={!isSubmitEnabled}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text testID="reno-form-submit-text" style={s.submitText}>{t("reno_form_submit_btn")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

export default function PermitsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [segment, setSegment] = useState<Segment>("move");
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [showRenoSheet, setShowRenoSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["users", "me"],
    queryFn: () => customFetch("/api/users/me"),
  });

  const isTenant = profile?.role === "tenant";

  const { data: allPermitsResult, refetch: refetchPermits } = useQuery<{ data: RenovationPermit[]; total: number }>({
    queryKey: ["permits"],
    // H4 P2 — accepted boundary: limit=200 is the server maximum. Data loss begins at record 201.
    // Unreachable for a 452-unit compound; recorded as closed per H4. Revisit only if the compound
    // grows substantially enough that any single household could accumulate 201+ permit records.
    queryFn: () => customFetch("/api/permits?limit=200"),
  });
  const allPermits = allPermitsResult?.data ?? [];
  const moveForms = allPermits.filter(p => p.type === "move_in" || p.type === "move_out");
  const renoPermits = allPermits.filter(p => p.type === "renovation");

  const t = useTranslations();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchPermits();
    setRefreshing(false);
  };

  const paddingTop = Platform.OS === "web" ? 67 : insets.top;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          s.pageHeader,
          { paddingTop: paddingTop + 16, backgroundColor: colors.background },
          isRTL && s.rowRTL,
        ]}
      >
        <View>
          <Text style={[s.pageTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
            Forms & Permits
          </Text>
          <Text style={[s.pageSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
            Move forms & renovation requests
          </Text>
        </View>
        {!isTenant && (
          <Pressable
            testID="permits-add-button"
            style={({ pressed }) => [s.addButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
            onPress={() => {
              if (segment === "move") setShowMoveSheet(true);
              else setShowRenoSheet(true);
            }}
          >
            <Feather name="plus" size={20} color="#ffffff" />
          </Pressable>
        )}
      </View>

      <View style={[s.segmentRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {(["move", "renovation"] as const).map((seg) => (
          <Pressable
            key={seg}
            testID={`segment-tab-${seg}`}
            onPress={() => setSegment(seg)}
            style={[
              s.segmentTab,
              segment === seg && [s.segmentTabActive, { backgroundColor: colors.background, shadowColor: colors.foreground }],
            ]}
          >
            <Text
              style={[
                s.segmentLabel,
                { color: segment === seg ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {seg === "move" ? "Move Forms" : "Renovation"}
            </Text>
          </Pressable>
        ))}
      </View>

      {segment === "move" ? (
        isTenant ? (
          <View style={s.ownersOnlyWrap}>
            <View style={[s.ownersOnlyBanner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="lock" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
              <Text style={[s.ownersOnlyTitle, { color: colors.foreground }]}>Owners Only</Text>
              <Text style={[s.ownersOnlyBody, { color: colors.mutedForeground }]}>
                Move forms can only be submitted by unit owners. Please contact your property manager if you need to arrange a move.
              </Text>
            </View>
          </View>
        ) : (
        <FlatList
          data={moveForms}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <MoveFormCard item={item} colors={colors} />}
          contentContainerStyle={[s.list, { paddingBottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="truck" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>No move forms yet</Text>
              <Text style={[s.emptySubtitle, { color: colors.mutedForeground }]}>
                Tap + to submit a move-in or move-out form
              </Text>
            </View>
          }
        />
        )
      ) : (
        isTenant ? (
          <View style={s.ownersOnlyWrap}>
            <View style={[s.ownersOnlyBanner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="lock" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
              <Text style={[s.ownersOnlyTitle, { color: colors.foreground }]}>Owners Only</Text>
              <Text style={[s.ownersOnlyBody, { color: colors.mutedForeground }]}>
                Renovation permits can only be submitted by unit owners. Please contact your property manager if you need to arrange renovations.
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={renoPermits}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <RenoPermitCard
                item={item}
                colors={colors}
              />
            )}
            contentContainerStyle={[s.list, { paddingBottom }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Feather name="file-text" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No renovation permits</Text>
                <Text style={[s.emptySubtitle, { color: colors.mutedForeground }]}>
                  Tap + to apply for a renovation permit
                </Text>
              </View>
            }
          />
        )
      )}

      <MoveFormSheet
        visible={showMoveSheet}
        onClose={() => setShowMoveSheet(false)}
        colors={colors}
      />
      <RenoPermitSheet
        visible={showRenoSheet}
        onClose={() => setShowRenoSheet(false)}
        colors={colors}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["permits"] })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  rowRTL: { flexDirection: "row-reverse" },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  pageSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  addButton: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentTabActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 20, paddingTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTopRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  typePill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#dcfce7", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  paidText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#16a34a" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  cardNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaRowRTL: { flexDirection: "row-reverse" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  dateError: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#ef4444", marginTop: 4 },
  fieldError: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#ef4444", marginTop: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 24 },
  backdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  phoneInputRow: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  phonePrefix: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginEnd: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
  },
  textArea: { height: 80, textAlignVertical: "top", paddingTop: 10 },
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  scopeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ownersOnlyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 },
  ownersOnlyBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  ownersOnlyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  ownersOnlyBody: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  scopeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  submitButton: {
    marginTop: 24,
    marginBottom: 32,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
});
