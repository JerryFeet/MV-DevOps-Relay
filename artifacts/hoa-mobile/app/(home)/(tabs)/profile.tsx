import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
  Animated,
  I18nManager,
  Switch,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useTranslations } from "@/hooks/useTranslations";
import { displayUnitReference } from "@/lib/unitReference";
import type { TranslationKey } from "@/hooks/useTranslations";
import { customFetch } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@clerk/expo";
import { normalizePhone, e164ToSubscriber } from "@/lib/phoneUtils";

const isRTL = I18nManager.isRTL;

type UserProfile = {
  id: number;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  unitNumber: string | null;
  unitId: number | null;
  role: string;
  status: string;
  verificationStatus: string;
  createdAt: string;
};

type NotificationPreferences = {
  announcements: boolean;
  bookings: boolean;
  guestPasses: boolean;
};

const ROLE_CONFIG: Record<string, { color: string; label: string }> = {
  admin:      { color: "#7c3aed", label: "Admin" },
  owner:      { color: "#0369a1", label: "Owner" },
  tenant:     { color: "#0891b2", label: "Tenant" },
  supervisor: { color: "#b45309", label: "Supervisor" },
  guard:      { color: "#374151", label: "Security" },
};

const VERIFICATION_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  verified:   { color: "#16a34a", icon: "check-circle", label: "Verified" },
  pending:    { color: "#f59e0b", icon: "clock",        label: "Pending Verification" },
  unverified: { color: "#64748b", icon: "alert-circle", label: "Unverified" },
};

type ProfileEditField = {
  tKey: TranslationKey;
  phKey: TranslationKey;
  value: string;
  set: (v: string) => void;
  keyboard?: "phone-pad";
  labelTestID: string;
  inputTestID: string;
};

function InfoRow({ label, value, colors }: { label: string; value: string | null | undefined; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[s.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[s.infoValue, { color: colors.foreground }]} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );
}

function SaveFeedback({ colors }: { colors: ReturnType<typeof useColors> }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[s.saveFeedback, { backgroundColor: colors.primary, opacity }]}>
      <Feather name="check" size={14} color="#fff" />
      <Text style={s.saveFeedbackText}>Saved</Text>
    </Animated.View>
  );
}

function NotificationToggleRow({
  label,
  description,
  value,
  onToggle,
  colors,
  isLast,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
  colors: ReturnType<typeof useColors>;
  isLast?: boolean;
}) {
  return (
    <View style={[s.toggleRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={s.toggleLabelGroup}>
        <Text style={[s.toggleLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[s.toggleDesc, { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { getToken } = useAuth();

  const [editMode, setEditMode] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: () => customFetch("/api/users/me"),
  });

  const { data: notifPrefs } = useQuery<NotificationPreferences>({
    queryKey: ["notification-preferences"],
    queryFn: () => customFetch("/api/notification-preferences"),
  });

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      // Display the subscriber portion in the input (strip +966 prefix for SA numbers)
      setPhone(e164ToSubscriber(profile.phone ?? ""));
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch("/api/users/me", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (updated) => {
      qc.setQueryData(["profile"], updated);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const notifPrefsMutation = useMutation<
    NotificationPreferences,
    Error,
    Partial<NotificationPreferences>,
    { previous: NotificationPreferences | undefined }
  >({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      customFetch("/api/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      // Cancel any in-flight refetches so they don't overwrite the optimistic value
      await qc.cancelQueries({ queryKey: ["notification-preferences"] });
      // Snapshot the current server-confirmed state for rollback
      const previous = qc.getQueryData<NotificationPreferences>(["notification-preferences"]);
      // Apply the optimistic update
      qc.setQueryData<NotificationPreferences>(["notification-preferences"], (old) =>
        old
          ? { ...old, ...patch }
          : { announcements: true, bookings: true, guestPasses: true, ...patch }
      );
      return { previous };
    },
    onSuccess: (updated) => {
      qc.setQueryData(["notification-preferences"], updated);
    },
    onError: (_err, _patch, context) => {
      // Always restore the snapshot — even when `previous` is undefined (i.e.
      // the query had never loaded yet), setting undefined clears the optimistic
      // cache entry so the UI reverts to defaults and the query refetches from
      // the server on next render. This prevents the toggle from staying in a
      // false position whether or not the initial fetch had completed.
      qc.setQueryData(["notification-preferences"], context?.previous);
      // Invalidate to guarantee a fresh server-fetch once connectivity returns,
      // restoring server truth without requiring another user action.
      void qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      Alert.alert(
        "Preference Not Saved",
        "Your notification setting could not be saved. Please check your connection and try again.",
      );
    },
  });

  const handleToggle = (key: keyof NotificationPreferences, value: boolean) => {
    notifPrefsMutation.mutate({ [key]: value });
  };

  const handleSave = async () => {
    try {
      // Normalize phone: subscriber input → E.164 canonical (or "" for blank)
      const canonicalPhone = normalizePhone(phone);
      if (phone.trim() !== "" && canonicalPhone === null) {
        Alert.alert("Invalid Phone", "Please enter a valid phone number (e.g. 5XXXXXXXX for Saudi).");
        return;
      }
      await saveMutation.mutateAsync({
        firstName,
        lastName,
        phone: canonicalPhone ?? "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditMode(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err: any) {
      Alert.alert("Save Failed", err?.message ?? "Unable to save changes.");
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setPhone(e164ToSubscriber(profile.phone ?? ""));
    }
    setEditMode(false);
  };

  const handleDocUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      Alert.prompt
        ? Alert.prompt("Document Title", "Enter a title for this document", async (title) => {
            if (!title?.trim()) return;
            await doUpload(asset, title.trim());
          })
        : Alert.alert("Upload Document", `Upload "${asset.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Upload", onPress: () => doUpload(asset, asset.name) },
          ]);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to pick document");
    }
  };

  const doUpload = async (asset: DocumentPicker.DocumentPickerAsset, title: string) => {
    setUploadingDoc(true);
    try {
      const token = await getToken();
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) authHeaders["Authorization"] = `Bearer ${token}`;

      const urlRes = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: asset.name, size: asset.size ?? 0, contentType: asset.mimeType ?? "application/octet-stream" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const putRes = await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": asset.mimeType ?? "application/octet-stream" } });
      if (!putRes.ok) throw new Error("Failed to upload file to storage");

      await customFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title, fileUrl: objectPath, mimeType: asset.mimeType, fileSize: asset.size }),
      });

      qc.invalidateQueries({ queryKey: ["myDocs"] });
      Alert.alert("Success", "Document uploaded successfully");
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message ?? "Please try again");
    } finally {
      setUploadingDoc(false);
    }
  };

  const paddingTop = Platform.OS === "web" ? 67 : insets.top;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;

  const roleCfg = ROLE_CONFIG[profile?.role ?? ""] ?? { color: colors.primary, label: profile?.role ?? "" };
  const verCfg = VERIFICATION_CONFIG[profile?.verificationStatus ?? "unverified"] ?? VERIFICATION_CONFIG.unverified;
  const initials = [(profile?.firstName ?? ""), (profile?.lastName ?? "")].map(p => p[0]).filter(Boolean).join("").toUpperCase() || "?";
  const prefs: NotificationPreferences = notifPrefs ?? { announcements: true, bookings: true, guestPasses: true };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.pageHeader, { paddingTop: paddingTop + 16, backgroundColor: colors.background }, isRTL && s.rowRTL]}>
        <View>
          <Text style={[s.pageTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>Profile</Text>
          <Text style={[s.pageSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
            Your account
          </Text>
        </View>
        {!editMode && (
          <Pressable
            style={({ pressed }) => [s.editButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            onPress={() => setEditMode(true)}
            testID="prof-edit-button"
          >
            <Feather name="edit-2" size={16} color={colors.foreground} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          <View style={s.avatarSection}>
            <View style={[s.avatar, { backgroundColor: colors.primary }]}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={s.badgeRow}>
              <View style={[s.roleBadge, { backgroundColor: roleCfg.color + "20" }]}>
                <Text style={[s.roleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
              </View>
              <View style={[s.verBadge, { backgroundColor: verCfg.color + "18" }]}>
                <Feather name={verCfg.icon as any} size={12} color={verCfg.color} />
                <Text style={[s.verText, { color: verCfg.color }]}>{verCfg.label}</Text>
              </View>
            </View>
          </View>

          {/* Edit form */}
          {editMode ? (
            <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text testID="prof-edit-section-title" style={[s.sectionTitle, { color: colors.foreground }]}>{t("prof_edit_title")}</Text>
              {(
                [
                  { tKey: "prof_label_first_name", phKey: "prof_ph_first_name",  value: firstName, set: setFirstName, labelTestID: "prof-label-first-name", inputTestID: "prof-input-first-name" },
                  { tKey: "prof_label_last_name",  phKey: "prof_ph_last_name",   value: lastName,  set: setLastName,  labelTestID: "prof-label-last-name",  inputTestID: "prof-input-last-name" },
                ] as ProfileEditField[]
              ).map((field) => (
                <View key={field.inputTestID} style={s.fieldGroup}>
                  <Text testID={field.labelTestID} style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t(field.tKey)}</Text>
                  <TextInput
                    testID={field.inputTestID}
                    style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                    value={field.value}
                    onChangeText={field.set}
                    placeholder={t(field.phKey)}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={field.keyboard}
                  />
                </View>
              ))}
              {/* Phone field — Saudi default with +966 prefix badge */}
              <View style={s.fieldGroup}>
                <Text testID="prof-label-phone" style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("prof_label_phone")}</Text>
                <View style={[s.phoneRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <View style={[s.phonePrefix, { borderRightColor: colors.border }]}>
                    <Text style={[s.phonePrefixText, { color: colors.mutedForeground }]}>🇸🇦 +966</Text>
                  </View>
                  <TextInput
                    testID="prof-input-phone"
                    style={[s.phoneInput, { color: colors.foreground }]}
                    value={phone}
                    onChangeText={(raw) => {
                      // Accept Arabic-Indic digits, strip non-digit chars
                      const ascii = raw
                        .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
                        .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
                      setPhone(ascii.replace(/[^\d]/g, ""));
                    }}
                    placeholder="5XXXXXXXX"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
              </View>
              <View style={[s.editActions, isRTL && s.rowRTL]}>
                <Pressable
                  style={({ pressed }) => [s.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                  onPress={handleCancel}
                >
                  <Text testID="prof-cancel-btn-text" style={[s.cancelBtnText, { color: colors.foreground }]}>{t("prof_cancel_btn")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.saveBtn, { backgroundColor: colors.primary }, saveMutation.isPending && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}
                  onPress={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text testID="prof-save-btn-text" style={s.saveBtnText}>{t("prof_save_btn")}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Personal info */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Personal Info</Text>
                <InfoRow label="First Name" value={profile?.firstName} colors={colors} />
                <InfoRow label="Last Name" value={profile?.lastName} colors={colors} />
                <InfoRow label="Email" value={profile?.email} colors={colors} />
                <InfoRow label="Phone" value={profile?.phone} colors={colors} />
              </View>

              {/* Unit info */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Unit Info</Text>
                <InfoRow label="Unit Number" value={displayUnitReference(profile?.unitNumber)} colors={colors} />
                <InfoRow label="Status" value={profile?.status?.replace(/_/g, " ")} colors={colors} />
              </View>

              {/* Notification preferences */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Notifications</Text>
                <NotificationToggleRow
                  label="Announcements"
                  description="Pinned HOA announcements"
                  value={prefs.announcements}
                  onToggle={(val) => handleToggle("announcements", val)}
                  colors={colors}
                />
                <NotificationToggleRow
                  label="Bookings"
                  description="Confirmations and cancellations"
                  value={prefs.bookings}
                  onToggle={(val) => handleToggle("bookings", val)}
                  colors={colors}
                />
                <NotificationToggleRow
                  label="Guest Passes"
                  description="Approved guest pass alerts"
                  value={prefs.guestPasses}
                  onToggle={(val) => handleToggle("guestPasses", val)}
                  colors={colors}
                  isLast
                />
              </View>

              {/* My Documents */}
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.sectionRow, isRTL && s.rowRTL]}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>My Documents</Text>
                  <Pressable
                    style={({ pressed }) => [s.uploadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }, uploadingDoc && { opacity: 0.5 }]}
                    onPress={handleDocUpload}
                    disabled={uploadingDoc}
                  >
                    {uploadingDoc ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="upload" size={14} color="#fff" />
                        <Text style={s.uploadBtnText}>Upload</Text>
                      </>
                    )}
                  </Pressable>
                </View>
                <Text style={[s.sectionDesc, { color: colors.mutedForeground }]}>
                  Upload personal documents to your HOA profile (PDFs and images, max 10 MB).
                </Text>
              </View>
            </>
          )}

          {showSaved && <SaveFeedback colors={colors} />}
        </ScrollView>
      )}
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
    paddingBottom: 16,
  },
  rowRTL: { flexDirection: "row-reverse" },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  pageSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  avatarSection: { alignItems: "center", paddingVertical: 16, gap: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#ffffff" },
  badgeRow: { flexDirection: "row", gap: 8 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  roleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  verBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  verText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  section: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 0 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", maxWidth: "60%", textAlign: "right" },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  phonePrefix: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  phonePrefixText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    flex: 2,
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
  saveFeedback: {
    position: "absolute",
    bottom: 120,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveFeedbackText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  toggleLabelGroup: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  toggleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  uploadBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
});
