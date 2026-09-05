import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useTranslations } from "@/hooks/useTranslations";
import { normalizePhone } from "@/lib/phoneUtils";
import * as DocumentPicker from "expo-document-picker";
import { APARTMENT_OPTIONS, BUILDING_OPTIONS, composeUnitReference } from "@workspace/unit-reference";
import { displayUnitReference } from "@/lib/unitReference";
import { DatePickerField } from "@/components/DatePickerField";
import { isValidDateOfBirth } from "@/lib/dateValidation";

type FullProfile = {
  id: number;
  verificationStatus: string;
  unitNumber: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
};

type VerifyResult = {
  result: "auto_approved" | "pre_approved" | "pending_manual_review" | "pending_owner_approval" | "unit_has_owner";
  verificationId?: number;
};

type UploadedDoc = {
  objectPath: string;
  originalFilename: string;
  contentHash: string;
};

type TenantRequest = {
  id: number;
  ejarReference: string | null;
  requester: { firstName: string | null; lastName: string | null; email: string } | null;
};

function UnitOptionPicker({ options, value, onChange, colors, testID }: {
  options: readonly string[]; value: string; onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>; testID: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map(option => (
          <Pressable key={option} onPress={() => onChange(option)}
            style={{ minWidth: 38, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
              borderColor: value === option ? colors.primary : colors.border,
              backgroundColor: value === option ? colors.primary : colors.background }}>
            <Text style={{ color: value === option ? "#ffffff" : colors.foreground, textAlign: "center" }}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Document picker + private upload helper ────────────────────────────────────
async function pickAndUploadDocument(endpoint: string): Promise<UploadedDoc> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) {
    throw new Error("No file selected");
  }
  const asset = result.assets[0];

  // Fetch file as blob then POST as multipart/form-data to the private server-side upload endpoint
  const fileRes = await fetch(asset.uri);
  const blob = await fileRes.blob();

  const formData = new FormData();
  formData.append("file", blob, asset.name);

  const uploaded = await customFetch<UploadedDoc>(endpoint, {
    method: "POST",
    body: formData as any,
  });
  return uploaded;
}

export default function UnitVerificationScreen() {
  const colors = useColors();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [role, setRole] = useState<"owner" | "tenant" | null>(null);

  // ── Shared fields ──────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [building, setBuilding] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female">("");

  // ── Owner-specific ─────────────────────────────────────────────────────────
  const [titleDeedNumber, setTitleDeedNumber] = useState("");

  // ── Tenant-specific ────────────────────────────────────────────────────────
  const [ownerNationalId, setOwnerNationalId] = useState("");
  const [ejarReference, setEjarReference] = useState("");
  const [ejarDoc, setEjarDoc] = useState<UploadedDoc | null>(null);
  const [ejarDocLoading, setEjarDocLoading] = useState(false);
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");

  const [submitted, setSubmitted] = useState<VerifyResult | null>(null);
  const [tenantApproval, setTenantApproval] = useState<{ id: number; bases: string[]; otherText: string } | null>(null);

  const { data: profile } = useQuery<FullProfile>({
    queryKey: ["profile"],
    queryFn: () => customFetch("/api/users/me"),
  });
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
  }, [profile?.firstName, profile?.lastName]);

  const vs = profile?.verificationStatus;
  const { data: tenantRequests = [] } = useQuery<TenantRequest[]>({
    queryKey: ["tenantRequests"],
    queryFn: () => customFetch("/api/unit-verify/pending-tenant-requests"),
    enabled: vs === "verified_owner",
  });

  const approveTenantMutation = useMutation({
    mutationFn: ({ id, approvalBases, otherText }: { id: number; approvalBases: string[]; otherText?: string }) =>
      customFetch(`/api/unit-verify/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvalBases, otherText }),
      }),
    onSuccess: () => {
      setTenantApproval(null);
      qc.invalidateQueries({ queryKey: ["tenantRequests"] });
    },
    onError: (e: any) => Alert.alert(t("sg11_error_title"), e.message ?? t("uv_tenant_approval_error")),
  });

  const ownerMutation = useMutation({
    mutationFn: () =>
      customFetch<VerifyResult>("/api/unit-verify/owner", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          mobile: normalizePhone(mobile) || "",
          building,
          unitNumber,
          nationalId,
          gender,
          titleDeedNumber,
        }),
      }),
    onSuccess: (data: VerifyResult) => {
      setSubmitted(data);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => {
      Alert.alert("Error", e.message ?? "Submission failed. Please try again.");
    },
  });

  const tenantMutation = useMutation({
    mutationFn: () =>
      customFetch<VerifyResult>("/api/unit-verify/tenant", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          mobile: normalizePhone(mobile) || "",
          dateOfBirth,
          building,
          unitNumber,
          nationalId,
          gender,
          ownerNationalId,
          ejarReference,
          ejarDocumentKey: ejarDoc!.objectPath,
          ejarOriginalFilename: ejarDoc!.originalFilename,
          ejarContentHash: ejarDoc!.contentHash,
          leaseStartDate,
          leaseEndDate,
        }),
      }),
    onSuccess: (data: VerifyResult) => {
      setSubmitted(data);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => {
      Alert.alert("Error", e.message ?? "Submission failed. Please try again.");
    },
  });

  const handlePickEjarDoc = async () => {
    setEjarDocLoading(true);
    try {
      const doc = await pickAndUploadDocument("/api/unit-verify/ejar-upload");
      setEjarDoc(doc);
    } catch (e: any) {
      if (e.message !== "No file selected") {
        Alert.alert("Upload Error", e.message ?? "Failed to upload Ejar document");
      }
    } finally {
      setEjarDocLoading(false);
    }
  };

  const handleSubmit = () => {
    // B6: format validation retained client-side, no /api/unit-registry/validate call
    if (!/^[12]\d{9}$/.test(nationalId)) {
      Alert.alert("Error", t("uv_invalid_national_id"));
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Error", "First and last name are required.");
      return;
    }
    if (gender !== "male" && gender !== "female") {
      Alert.alert("Error", "Gender is required. Please select Male or Female.");
      return;
    }
    // B3: mobile mandatory
    if (!normalizePhone(mobile)) {
      Alert.alert("Error", "A valid Saudi mobile number is required (e.g. 05XXXXXXXX).");
      return;
    }
    if (role === "owner") {
      if (!/^[0-9]{16}$/.test(titleDeedNumber)) {
        Alert.alert("Error", "Mullak title deed number must be exactly 16 digits.");
        return;
      }
      ownerMutation.mutate();
    } else {
      if (!dateOfBirth) {
        Alert.alert("Error", "Date of birth is required.");
        return;
      }
      if (!isValidDateOfBirth(dateOfBirth)) {
        Alert.alert("Invalid Date of Birth", "Date of birth must be a valid date that is not in the future.");
        return;
      }
      if (!ownerNationalId.trim() || !/^[12]\d{9}$/.test(ownerNationalId)) {
        Alert.alert("Error", "Owner National ID must start with 1 or 2 and be exactly 10 digits.");
        return;
      }
      if (!ejarReference.trim()) {
        Alert.alert("Error", "Ejar reference number is required.");
        return;
      }
      if (!ejarDoc) {
        Alert.alert("Error", "Please upload the Ejar document before submitting.");
        return;
      }
      if (!leaseStartDate || !leaseEndDate) {
        Alert.alert("Error", "Lease start and end dates are required.");
        return;
      }
      if (leaseEndDate <= leaseStartDate) {
        Alert.alert("Error", "Lease end date must be after the start date.");
        return;
      }
      tenantMutation.mutate();
    }
  };

  const isPending = ownerMutation.isPending || tenantMutation.isPending || ejarDocLoading;
  const paddingTop = Platform.OS === "web" ? 67 + 16 : insets.top + 16;
  const paddingBottom = Platform.OS === "web" ? 34 + 40 : insets.bottom + 40;
  const s = styles(colors);

  // ── Guard: already verified ──────────────────────────────────────────────────
  if (vs === "verified_owner" || vs === "verified_tenant") {
    if (vs === "verified_owner") {
      const selected = tenantApproval;
      const toggleBasis = (basis: string) => {
        if (!selected) return;
        setTenantApproval({
          ...selected,
          bases: selected.bases.includes(basis)
            ? selected.bases.filter((value) => value !== basis)
            : [...selected.bases, basis],
        });
      };
      const approvalIsInvalid = !selected || selected.bases.length === 0
        || (selected.bases.includes("other") && !selected.otherText.trim());
      return (
        <ScrollView style={[s.root, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 20 }}>
          <Text style={[s.screenTitle, { color: colors.foreground }]}>{t("uv_verified_state")}</Text>
          {!!profile?.unitNumber && <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>Unit {displayUnitReference(profile.unitNumber)}</Text>}
          <Text style={[s.sectionLabel, { color: colors.foreground, marginTop: 24 }]}>{t("sg11_tenant_requests")}</Text>
          {tenantRequests.length === 0 ? (
            <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>{t("sg11_no_tenant_requests")}</Text>
          ) : tenantRequests.map((request) => {
            const isSelected = selected?.id === request.id;
            return (
              <View key={request.id} style={[s.formCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
                <Text style={[s.cardTitle, { color: colors.foreground }]}>{request.requester?.firstName} {request.requester?.lastName}</Text>
                {!!request.ejarReference && <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>{t("uv_ejar")}: {request.ejarReference}</Text>}
                <Text style={[s.cardDesc, { color: colors.foreground, marginTop: 12 }]}>{t("sg11_tenant_approval_basis")}</Text>
                {[
                  ["ejar_contract_verified", "sg11_ejar_contract_verified"],
                  ["tenant_known_to_me", "sg11_tenant_known_to_me"],
                  ["other", "sg11_other"],
                ].map(([value, label]) => (
                  <Pressable key={value} onPress={() => {
                    if (!isSelected) setTenantApproval({ id: request.id, bases: [value], otherText: "" });
                    else toggleBasis(value);
                  }} style={s.basisRow}>
                    <Feather name={isSelected && selected.bases.includes(value) ? "check-square" : "square"} size={18} color={colors.primary} />
                    <Text style={[s.cardDesc, { color: colors.foreground }]}>{t(label as any)}</Text>
                  </Pressable>
                ))}
                {isSelected && selected.bases.includes("other") && (
                  <TextInput value={selected.otherText} onChangeText={(otherText) => setTenantApproval({ ...selected, otherText })}
                    placeholder={t("sg11_other_placeholder")} placeholderTextColor={colors.mutedForeground}
                    style={[s.input, { color: colors.foreground, borderColor: colors.border }]} />
                )}
                <Pressable disabled={approvalIsInvalid || approveTenantMutation.isPending}
                  onPress={() => approveTenantMutation.mutate({ id: request.id, approvalBases: selected!.bases, otherText: selected!.otherText.trim() || undefined })}
                  style={[s.primaryBtn, { backgroundColor: approvalIsInvalid ? colors.muted : colors.primary, marginTop: 12 }]}>
                  <Text style={s.primaryBtnText}>{t("sg11_approve")}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      );
    }
    return (
      <View style={[s.root, { paddingTop }]}>
        <View style={s.centeredCard}>
          <View style={[s.iconCircle, { backgroundColor: "#16a34a22" }]}>
            <Feather name="check-circle" size={32} color="#16a34a" />
          </View>
          <Text style={[s.cardTitle, { color: "#16a34a" }]}>{t("uv_verified_state")}</Text>
          {!!profile?.unitNumber && (
            <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>Unit {displayUnitReference(profile.unitNumber)}</Text>
          )}
          <Pressable
            style={[s.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={s.primaryBtnText}>{t("uv_back")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Status-only view for pending states (before any form submission) ─────────
  if (!submitted && (vs === "pending_manual" || vs === "pending_owner_approval")) {
    return (
      <View style={[s.root, { paddingTop }]}>
        <View style={[s.headerRow, { paddingHorizontal: 20 }]}>
          <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.muted }]}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[s.screenTitle, { color: colors.foreground }]}>{t("uv_screen_title")}</Text>
        </View>
        <View style={[s.centeredCard, { paddingTop: 32 }]}>
          <View style={[s.iconCircle, { backgroundColor: "#fef3c722" }]}>
            <Feather name="clock" size={32} color="#d97706" />
          </View>
          <Text style={[s.cardTitle, { color: "#92400e" }]}>
            {vs === "pending_manual" ? t("uv_status_pending_manual") : t("uv_status_pending_owner")}
          </Text>
          <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>
            {vs === "pending_manual" ? t("uv_banner_pending_desc") : t("uv_banner_awaiting_desc")}
          </Text>
        </View>
      </View>
    );
  }

  // ── Result screen after form submission ──────────────────────────────────────
  if (submitted) {
    const isApproved =
      submitted.result === "auto_approved" || submitted.result === "pre_approved";
    const isOwnerApproval = submitted.result === "pending_owner_approval";

    return (
      <View style={[s.root, { paddingTop }]}>
        <View style={s.centeredCard}>
          <View
            style={[
              s.iconCircle,
              { backgroundColor: isApproved ? "#16a34a22" : "#fef3c722" },
            ]}
          >
            <Feather
              name={isApproved ? "check-circle" : "clock"}
              size={32}
              color={isApproved ? "#16a34a" : "#d97706"}
            />
          </View>
          <Text style={[s.cardTitle, { color: isApproved ? "#16a34a" : "#92400e" }]}>
            {isApproved
              ? t("uv_result_approved_title")
              : isOwnerApproval
              ? t("uv_result_owner_approval_title")
              : t("uv_result_pending_title")}
          </Text>
          <Text style={[s.cardDesc, { color: colors.mutedForeground }]}>
            {isApproved
              ? t("uv_result_approved_desc")
              : isOwnerApproval
              ? t("uv_result_owner_approval_desc")
              : t("uv_result_pending_desc")}
          </Text>
          <Pressable
            style={[s.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={s.primaryBtnText}>{t("uv_back")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Role selection ───────────────────────────────────────────────────────────
  if (!role) {
    return (
      <ScrollView
        style={[s.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.muted }]}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[s.screenTitle, { color: colors.foreground }]}>{t("uv_screen_title")}</Text>
        </View>

        <View style={[s.infoCard, { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }]}>
          <Feather name="alert-triangle" size={16} color="#d97706" />
          <Text style={[s.infoText, { color: "#92400e" }]}>{t("uv_banner_unverified_desc")}</Text>
        </View>

        <Text style={[s.sectionLabel, { color: colors.foreground }]}>{t("uv_i_am")}</Text>

        <View style={s.roleRow}>
          <Pressable
            style={({ pressed }) => [
              s.roleCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            onPress={() => setRole("owner")}
          >
            <View style={[s.roleIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="key" size={24} color={colors.primary} />
            </View>
            <Text style={[s.roleTitle, { color: colors.foreground }]}>{t("uv_role_owner")}</Text>
            <Text style={[s.roleDesc, { color: colors.mutedForeground }]}>{t("uv_role_owner_desc")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.roleCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.75 },
            ]}
            onPress={() => setRole("tenant")}
          >
            <View style={[s.roleIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="users" size={24} color={colors.primary} />
            </View>
            <Text style={[s.roleTitle, { color: colors.foreground }]}>{t("uv_role_tenant")}</Text>
            <Text style={[s.roleDesc, { color: colors.mutedForeground }]}>{t("uv_role_tenant_desc")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Verification form ────────────────────────────────────────────────────────
  const isOwner = role === "owner";
  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.headerRow}>
        <Pressable onPress={() => setRole(null)} style={[s.backBtn, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>
          {isOwner ? t("uv_role_owner") : t("uv_role_tenant")}
        </Text>
      </View>

      <View style={[s.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* First + Last name */}
        <View style={s.fieldRow}>
          <View style={s.fieldHalf}>
            <Text style={[s.label, { color: colors.foreground }]}>First Name *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              value={firstName}
              editable={!isOwner}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>
          <View style={s.fieldHalf}>
            <Text style={[s.label, { color: colors.foreground }]}>Last Name *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Last name"
              placeholderTextColor={colors.mutedForeground}
              value={lastName}
              editable={!isOwner}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
        </View>
        {!!building && !!unitNumber && (
          <Text style={[s.hint, { color: colors.mutedForeground }]}>
            {t("uv_unit_num")}: {composeUnitReference(building, unitNumber)}
          </Text>
        )}

        {/* Mobile (B3: mandatory) */}
        <View>
          <Text style={[s.label, { color: colors.foreground }]}>Gender / الجنس *</Text>
          <View style={s.genderRow}>
            {(["male", "female"] as const).map(value => (
              <Pressable
                key={value}
                style={[
                  s.genderOption,
                  { borderColor: gender === value ? colors.primary : colors.border, backgroundColor: gender === value ? colors.primary + "16" : colors.background },
                ]}
                onPress={() => setGender(value)}
              >
                <Text style={[s.genderOptionText, { color: gender === value ? colors.primary : colors.foreground }]}>
                  {value === "male" ? "Male / ذكر" : "Female / أنثى"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Mobile (B3: mandatory) */}
        <View>
          <Text style={[s.label, { color: colors.foreground }]}>Mobile *</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="05XXXXXXXX"
            placeholderTextColor={colors.mutedForeground}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
          />
        </View>

        {!isOwner && (
          <>
            <View>
              <Text style={[s.label, { color: colors.foreground }]}>Date of Birth *</Text>
              <DatePickerField
                testID="date-of-birth"
                placeholder="YYYY-MM-DD"
                value={dateOfBirth}
                onChange={setDateOfBirth}
                maximumDate={new Date()}
                colors={colors}
              />
            </View>
          </>
        )}

        {/* Building + Unit */}
        <View style={s.fieldRow}>
          <View style={s.fieldHalf}>
            <Text style={[s.label, { color: colors.foreground }]}>{t("uv_building")}</Text>
            <UnitOptionPicker options={BUILDING_OPTIONS} value={building} onChange={setBuilding}
              colors={colors} testID="unit-building-selector" />
          </View>
          <View style={s.fieldHalf}>
            <Text style={[s.label, { color: colors.foreground }]}>{t("uv_unit_num")}</Text>
            <UnitOptionPicker options={APARTMENT_OPTIONS} value={unitNumber} onChange={setUnitNumber}
              colors={colors} testID="unit-apartment-selector" />
          </View>
        </View>

        {/* National ID */}
        <View>
          <Text style={[s.label, { color: colors.foreground }]}>{t("uv_national_id")} *</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder={t("uv_national_id_ph")}
            placeholderTextColor={colors.mutedForeground}
            value={nationalId}
            onChangeText={setNationalId}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        {/* Owner: exact 16-digit Mullak title deed number */}
        {isOwner && (
          <View>
            <Text style={[s.label, { color: colors.foreground }]}>Mullak Title Deed Number *</Text>
            <Text style={[s.hint, { color: colors.mutedForeground }]}>
              Enter the exact 16-digit number shown in Mullak. Leading zeroes are kept.
            </Text>
            <TextInput testID="title-deed-number" style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={titleDeedNumber} onChangeText={value => setTitleDeedNumber(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad" maxLength={16} placeholder="0000000000000000" placeholderTextColor={colors.mutedForeground} />
          </View>
        )}

        {/* Auto-match note (owner only) */}
        {isOwner && (
          <View style={[s.noteCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Feather name="info" size={13} color={colors.primary} />
            <Text style={[s.noteText, { color: colors.primary }]}>{t("uv_auto_match_note")}</Text>
          </View>
        )}

        {/* Tenant: owner NID */}
        {!isOwner && (
          <View>
            <Text style={[s.label, { color: colors.foreground }]}>Owner National ID *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="10-digit Owner National ID"
              placeholderTextColor={colors.mutedForeground}
              value={ownerNationalId}
              onChangeText={setOwnerNationalId}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
        )}

        {/* Tenant: Ejar reference */}
        {!isOwner && (
          <View>
            <Text style={[s.label, { color: colors.foreground }]}>{t("uv_ejar")} *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ejar contract reference"
              placeholderTextColor={colors.mutedForeground}
              value={ejarReference}
              onChangeText={setEjarReference}
            />
          </View>
        )}

        {/* Tenant: Ejar document upload */}
        {!isOwner && (
          <View>
            <Text style={[s.label, { color: colors.foreground }]}>Ejar Document *</Text>
            <Text style={[s.hint, { color: colors.mutedForeground }]}>
              Upload your Ejar contract document (PDF, JPG, or PNG, max 10 MB).
            </Text>
            <Pressable
              style={({ pressed }) => [
                s.uploadBtn,
                { borderColor: ejarDoc ? "#16a34a" : colors.border, backgroundColor: ejarDoc ? "#f0fdf4" : colors.background },
                pressed && { opacity: 0.75 },
              ]}
              onPress={handlePickEjarDoc}
              disabled={ejarDocLoading}
            >
              {ejarDocLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Feather
                    name={ejarDoc ? "check-circle" : "upload"}
                    size={16}
                    color={ejarDoc ? "#16a34a" : colors.mutedForeground}
                  />
                  <Text style={[s.uploadBtnText, { color: ejarDoc ? "#16a34a" : colors.mutedForeground }]}>
                    {ejarDoc ? ejarDoc.originalFilename : "Choose Ejar document file…"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Tenant: lease dates */}
        {!isOwner && (
          <View style={s.fieldRow}>
            <View style={s.fieldHalf}>
              <Text style={[s.label, { color: colors.foreground }]}>Lease Start *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={leaseStartDate}
                onChangeText={setLeaseStartDate}
              />
            </View>
            <View style={s.fieldHalf}>
              <Text style={[s.label, { color: colors.foreground }]}>Lease End *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={leaseEndDate}
                onChangeText={setLeaseEndDate}
              />
            </View>
          </View>
        )}

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            { backgroundColor: colors.primary },
            isPending && { opacity: 0.55 },
            pressed && !isPending && { opacity: 0.8 },
          ]}
          onPress={handleSubmit}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.submitBtnText}>
              {isOwner ? t("uv_submit_owner") : t("uv_submit_tenant")}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    // Header
    headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
    backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    screenTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },

    // Centered status card (verified / result / pending states)
    centeredCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
    iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    cardTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
    cardDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 4 },
    primaryBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

    // Info banner
    infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 24 },
    infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

    // Role selection
    sectionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
    roleRow: { flexDirection: "row", gap: 12 },
    roleCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 18, alignItems: "center", gap: 10 },
    roleIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    roleTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    roleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },
    basisRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },

    // Form
    formCard: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
    fieldRow: { flexDirection: "row", gap: 12 },
    fieldHalf: { flex: 1 },
    genderRow: { flexDirection: "row", gap: 10 },
    genderOption: { flex: 1, alignItems: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 11 },
    genderOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
    hint: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 8, lineHeight: 16 },
    input: {
      borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 10,
      fontSize: 14, fontFamily: "Inter_400Regular",
    },
    uploadBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      borderWidth: 1, borderRadius: 10, borderStyle: "dashed",
      paddingHorizontal: 12, paddingVertical: 10, minHeight: 44,
    },
    uploadBtnText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
    noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
    noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
    submitBtn: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4 },
    submitBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  });
