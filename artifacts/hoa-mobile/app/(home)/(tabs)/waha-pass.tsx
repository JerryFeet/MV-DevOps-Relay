import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
  Linking,
  Alert,
  I18nManager,
  Platform,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import { customFetch } from "@workspace/api-client-react";
import { useTranslations } from "@/hooks/useTranslations";
import { displayUnitReference } from "@/lib/unitReference";

const isRTL = I18nManager.isRTL;
const PASS_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "madain-village.com";

function wahaQrUrl(token: string): string {
  return `https://${PASS_DOMAIN}/api/verify/waha?token=${token}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type WahaCredential = {
  id: number;
  applicationId: number;
  credentialIndex: number;
  passNumber: string | null;
  verificationToken: string | null;
  holderName: string;
  heldByUserId: number | null;
  status: string;
  revocationReason: string | null;
  revokedAt: string | null;
  replacedByCredentialId: number | null;
  chargeId: string | null;
  paymentUrl: string | null;
  createdAt: string;
};

type WahaPassData = {
  id: number;
  unitId: number;
  applicantUserId: number;
  occupancyTrack: string;
  status: string;
  isApplicant: boolean;
  credentials: WahaCredential[];
  applicant?: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
    unitNumber: string | null;
  } | null;
};

type EligibilityResult = {
  eligible: boolean;
  reason?: string;
};

// ─── BottomSheet ─────────────────────────────────────────────────────────────

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
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      Animated.timing(translateY, { toValue: 800, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <Animated.View style={[s.sheet, { backgroundColor: colors.background, transform: [{ translateY }] }]}>
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

// ─── WahaPassCard ─────────────────────────────────────────────────────────────

function WahaPassCard({
  credential,
  unitNumber,
  colors,
}: {
  credential: WahaCredential;
  unitNumber: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  const t = useTranslations();
  const qrUrl = credential.verificationToken ? wahaQrUrl(credential.verificationToken) : null;

  const statusColor =
    credential.status === "active"  ? "#16a34a" :
    credential.status === "revoked" ? "#ef4444" :
    credential.status === "lost"    ? "#f59e0b" :
    credential.status === "stolen"  ? "#ef4444" :
    credential.status === "damaged" ? "#f59e0b" :
    "#64748b";

  const statusLabel: Record<string, string> = {
    active:  t("waha_status_active"),
    revoked: t("waha_status_revoked"),
    lost:    t("waha_status_lost"),
    stolen:  t("waha_status_stolen"),
    damaged: t("waha_status_damaged"),
  };

  const issuedDate = new Date(credential.createdAt).toLocaleDateString(
    isRTL ? "ar-SA" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardHeaderRow}>
          <View style={s.cardLogoArea}>
            <View style={s.cardLogoCircle}>
              <Text style={s.cardLogoText}>MV</Text>
            </View>
            <View>
              <Text style={s.cardBrandName}>{t("waha_brand_name")}</Text>
              <Text style={s.cardBrandSub}>{t("waha_tab_title")}</Text>
            </View>
          </View>
          <View style={s.credIndexBadge}>
            <Text style={s.credIndexText}>
              {t(credential.credentialIndex === 1 ? "waha_cred_1" : "waha_cred_2")}
            </Text>
          </View>
        </View>
      </View>

      {/* QR code */}
      <View style={s.qrContainer}>
        {qrUrl ? (
          <QRCode
            value={qrUrl}
            size={180}
            backgroundColor="white"
            color="#0F4442"
          />
        ) : (
          <View style={s.qrPlaceholder}>
            <Feather name="help-circle" size={32} color="#94a3b8" />
            <Text style={s.qrPlaceholderText}>{t("waha_no_qr")}</Text>
          </View>
        )}
      </View>

      {/* Card details */}
      <View style={s.cardDetails}>
        <View style={s.cardDetailRow}>
          <Text style={s.cardDetailLabel}>{t("waha_holder_name")}</Text>
          <Text style={s.cardDetailValue}>{credential.holderName}</Text>
        </View>
        {unitNumber ? (
          <View style={s.cardDetailRow}>
            <Text style={s.cardDetailLabel}>{t("waha_unit")}</Text>
            <Text style={s.cardDetailValue}>{displayUnitReference(unitNumber)}</Text>
          </View>
        ) : null}
        {credential.passNumber ? (
          <View style={s.cardDetailRow}>
            <Text style={s.cardDetailLabel}>{t("waha_pass_number")}</Text>
            <Text style={s.cardDetailValue}>{credential.passNumber}</Text>
          </View>
        ) : null}
        <View style={s.cardDetailRow}>
          <Text style={s.cardDetailLabel}>{t("waha_issued")}</Text>
          <Text style={s.cardDetailValue}>{issuedDate}</Text>
        </View>
        <View style={s.cardDetailRow}>
          <Text style={s.cardDetailLabel}>{t("waha_status")}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[s.statusText, { color: statusColor }]}>
              {statusLabel[credential.status] ?? credential.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>
      </View>

      {/* Disclaimer */}
      <View style={s.disclaimerBox}>
        <Feather name="info" size={12} color="#b45309" style={s.disclaimerIcon} />
        <Text style={s.disclaimerText}>{t("waha_disclaimer")}</Text>
      </View>
    </View>
  );
}

// ─── ReportLostSheet ──────────────────────────────────────────────────────────

type LostReason = "lost" | "stolen" | "damaged";

function ReportLostSheet({
  credential,
  applicationId,
  visible,
  onClose,
  colors,
  onReported,
}: {
  credential: WahaCredential | null;
  applicationId: number | null;
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  onReported: (paymentUrl: string | null) => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState<LostReason>("lost");
  const [acknowledged, setAcknowledged] = useState(false);

  const REASONS: { value: LostReason; label: string; labelAr: string }[] = [
    { value: "lost",    label: "Lost",    labelAr: "مفقود" },
    { value: "stolen",  label: "Stolen",  labelAr: "مسروق" },
    { value: "damaged", label: "Damaged", labelAr: "تالف" },
  ];

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!credential || !applicationId) throw new Error("Missing data");

      // Step 1 — mark credential as lost/stolen/damaged
      await customFetch(`/api/waha-pass/${applicationId}/report-lost`, {
        method: "POST",
        body: JSON.stringify({ credentialId: credential.id, reason }),
      }) as { credentialId: number; status: string; replacementRequired: boolean };

      // Step 2 — initiate SAR 100 replacement payment
      const payResult = await customFetch(`/api/waha-pass/${applicationId}/replacement-pay`, {
        method: "POST",
        body: JSON.stringify({ credentialId: credential.id }),
      }) as { paymentUrl: string | null; chargeId: string | null };

      return { paymentUrl: payResult.paymentUrl ?? null };
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      onReported(data.paymentUrl);
    },
    onError: (err: any) => {
      Alert.alert(t("waha_report_error_title"), err?.message ?? t("waha_report_error_msg"));
    },
  });

  const handleClose = () => {
    setReason("lost");
    setAcknowledged(false);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} colors={colors}>
      <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
        <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t("waha_report_title")}</Text>
        <Pressable onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
        <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t("waha_report_reason")}</Text>
        <View style={s.reasonRow}>
          {REASONS.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => setReason(r.value)}
              style={({ pressed }) => [
                s.reasonChip,
                {
                  backgroundColor: reason === r.value ? NAVY : colors.muted,
                  borderColor:     reason === r.value ? NAVY : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.reasonChipText, { color: reason === r.value ? GOLD : colors.foreground }]}>
                {isRTL ? r.labelAr : r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[s.ackRow, isRTL && { flexDirection: "row-reverse" }]}
          onPress={() => setAcknowledged(!acknowledged)}
        >
          <View style={[s.checkbox, { borderColor: colors.border, backgroundColor: acknowledged ? NAVY : colors.muted }]}>
            {acknowledged && <Feather name="check" size={12} color={GOLD} />}
          </View>
          <Text style={[s.ackText, { color: colors.foreground }]}>{t("waha_report_disclaimer")}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            s.reportBtn,
            (!acknowledged || reportMutation.isPending) && { opacity: 0.5 },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => reportMutation.mutate()}
          disabled={!acknowledged || reportMutation.isPending}
        >
          {reportMutation.isPending ? (
            <ActivityIndicator color={GOLD} size="small" />
          ) : (
            <>
              <Feather name="alert-triangle" size={16} color={GOLD} />
              <Text style={s.reportBtnText}>{t("waha_report_confirm")}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WahaPassScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useTranslations();

  const [refreshing, setRefreshing] = useState(false);
  const [reportCredential, setReportCredential] = useState<WahaCredential | null>(null);
  const [showReport, setShowReport] = useState(false);

  const paddingTop    = Platform.OS === "web" ? 67 : insets.top;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;

  const { data: mine, isLoading, isError, refetch } = useQuery<WahaPassData | null>({
    queryKey: ["waha-pass-mine"],
    queryFn: () => customFetch("/api/waha-pass/mine"),
  });

  // Only fetch eligibility when there is no application — used to show verification gate
  const { data: eligibility } = useQuery<EligibilityResult>({
    queryKey: ["waha-pass-eligibility"],
    queryFn: () => customFetch("/api/waha-pass/eligibility"),
    enabled: !isLoading && mine === null,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleReportLost = (credential: WahaCredential) => {
    setReportCredential(credential);
    setShowReport(true);
  };

  const handleReported = (paymentUrl: string | null) => {
    refetch();
    if (paymentUrl) {
      Alert.alert(
        t("waha_replacement_ready_title"),
        t("waha_replacement_ready_msg"),
        [
          { text: t("waha_replacement_cancel"), style: "cancel" },
          {
            text: t("waha_replacement_pay"),
            onPress: () => Linking.openURL(paymentUrl).catch(() => {}),
          },
        ],
      );
    }
  };

  // Credentials: filter out superseded ones
  const activeCredentials = mine?.credentials.filter((c) => !c.replacedByCredentialId) ?? [];
  const unitNumber = mine?.applicant?.unitNumber ?? null;

  // Credential 1 for applicant's report-lost button
  const cred1 = mine?.isApplicant
    ? activeCredentials.find((c) => c.credentialIndex === 1) ?? null
    : null;

  // Determine gating state when there is no application
  const isUnitNotVerified = mine === null && !isLoading &&
    (eligibility?.reason === "unit_not_verified" || eligibility?.reason === "no_unit_linked");

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Page header */}
      <View style={[s.pageHeader, { paddingTop: paddingTop + 16 }]}>
        <Text style={[s.pageTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {t("waha_tab_title")}
        </Text>
        <Text style={[s.pageSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
          {t("waha_tab_subtitle")}
        </Text>
      </View>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : isError ? (
        <View style={s.centered}>
          <Feather name="wifi-off" size={36} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t("waha_error_title")}</Text>
          <Text style={[s.emptySubtitle, { color: colors.mutedForeground }]}>{t("waha_error_msg")}</Text>
          <Pressable
            style={({ pressed }) => [s.retryBtn, { backgroundColor: NAVY }, pressed && { opacity: 0.8 }]}
            onPress={() => refetch()}
          >
            <Text style={s.retryBtnText}>{t("waha_retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingBottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
        >
          {/* ── Unit verification gate ── */}
          {isUnitNotVerified && (
            <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.stateIconCircle, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="shield" size={28} color="#d97706" />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("waha_gate_title")}</Text>
              <Text style={[s.stateDesc, { color: colors.mutedForeground }]}>{t("waha_gate_desc")}</Text>
            </View>
          )}

          {/* ── No application (verified, but hasn't applied) ── */}
          {!mine && !isUnitNotVerified && (
            <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.stateIconCircle, { backgroundColor: NAVY + "18" }]}>
                <Feather name="credit-card" size={28} color={NAVY} />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("waha_no_pass")}</Text>
              <Text style={[s.stateDesc, { color: colors.mutedForeground }]}>{t("waha_no_pass_desc")}</Text>
            </View>
          )}

          {/* ── Pending review ── */}
          {mine?.status === "pending_review" && (
            <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.stateIconCircle, { backgroundColor: "#3b82f615" }]}>
                <Feather name="clock" size={28} color="#3b82f6" />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("waha_pending")}</Text>
              <Text style={[s.stateDesc, { color: colors.mutedForeground }]}>{t("waha_pending_desc")}</Text>
            </View>
          )}

          {/* ── Rejected ── */}
          {mine?.status === "rejected" && (
            <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.stateIconCircle, { backgroundColor: "#ef444415" }]}>
                <Feather name="x-circle" size={28} color="#ef4444" />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("waha_rejected")}</Text>
              <Text style={[s.stateDesc, { color: colors.mutedForeground }]}>{t("waha_rejected_desc")}</Text>
            </View>
          )}

          {/* ── Revoked ── */}
          {mine?.status === "revoked" && (
            <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.stateIconCircle, { backgroundColor: "#ef444415" }]}>
                <Feather name="slash" size={28} color="#ef4444" />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("waha_revoked")}</Text>
              <Text style={[s.stateDesc, { color: colors.mutedForeground }]}>{t("waha_revoked_desc")}</Text>
            </View>
          )}

          {/* ── Active credential cards ── */}
          {mine?.status === "active" && activeCredentials.map((cred) => (
            <WahaPassCard
              key={cred.id}
              credential={cred}
              unitNumber={unitNumber}
              colors={colors}
            />
          ))}

          {/* ── Report lost button (applicant only, cred 1 must still be active) ── */}
          {mine?.status === "active" && mine.isApplicant && cred1?.status === "active" && (
            <Pressable
              style={({ pressed }) => [s.reportLostBtn, { borderColor: "#ef4444" }, pressed && { opacity: 0.75 }]}
              onPress={() => handleReportLost(cred1)}
            >
              <Feather name="alert-triangle" size={16} color="#ef4444" />
              <Text style={s.reportLostText}>{t("waha_report_lost")}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* Report Lost Sheet */}
      <ReportLostSheet
        credential={reportCredential}
        applicationId={mine?.id ?? null}
        visible={showReport}
        onClose={() => { setShowReport(false); setReportCredential(null); }}
        colors={colors}
        onReported={handleReported}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAVY = "#0F4442";
const GOLD = "#F59E0B";

const s = StyleSheet.create({
  container:    { flex: 1 },
  pageHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  pageTitle:    { fontSize: 28, fontFamily: "Inter_700Bold" },
  pageSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  // State cards
  stateCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  stateIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  stateTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  stateDesc:  { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  // Waha Pass Card
  card: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
    backgroundColor: NAVY,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLogoArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLogoText:  { fontFamily: "Inter_700Bold", fontSize: 12, color: NAVY },
  cardBrandName: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#ffffff" },
  cardBrandSub:  { fontFamily: "Inter_400Regular", fontSize: 11, color: GOLD },
  credIndexBadge: {
    backgroundColor: GOLD + "30",
    borderWidth: 1,
    borderColor: GOLD + "60",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  credIndexText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: GOLD },

  qrContainer: {
    backgroundColor: "#ffffff",
    margin: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  qrPlaceholder: { width: 180, height: 180, alignItems: "center", justifyContent: "center", gap: 8 },
  qrPlaceholderText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#94a3b8" },

  cardDetails: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  cardDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDetailLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#94a3b8",
  },
  cardDetailValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#ffffff",
    maxWidth: "60%",
    textAlign: "right",
  },

  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#92400e30",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 10,
  },
  disclaimerIcon: { marginTop: 1 },
  disclaimerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#fcd34d",
    lineHeight: 17,
  },

  // Report lost button
  reportLostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 12,
  },
  reportLostText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#ef4444" },

  // Empty / error states
  emptyTitle:    { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 12, textAlign: "center" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" },
  retryBtn: { marginTop: 16, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },

  // Bottom sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 6 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sheetBody:  { paddingHorizontal: 20 },

  // Report lost sheet
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 16, marginBottom: 8 },
  reasonRow:  { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  reasonChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  reasonChipText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  ackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
    marginBottom: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  ackText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },

  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 8,
  },
  reportBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD },
});
