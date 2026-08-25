import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useTranslations } from "@/hooks/useTranslations";
import { customFetch, useGetMyProfile } from "@workspace/api-client-react";
import { useMobilePagination } from "@/hooks/useMobilePagination";

type Communication = {
  id: number;
  userId: number;
  type: "complaint" | "suggestion";
  subject: string;
  body: string;
  status: "pending" | "read" | "resolved" | "rejected" | "deferred_to_maintenance";
  adminNote: string | null;
  createdAt: string;
  senderEmail: string | null;
  senderPhone: string | null;
  senderFirstName: string | null;
  senderLastName: string | null;
  senderUnit: string | null;
  senderBuilding: string | null;
  senderApartment: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pending",  color: "#64748b", bg: "#f1f5f9" },
  read:     { label: "Read",     color: "#2563eb", bg: "#dbeafe" },
  resolved: { label: "Resolved", color: "#16a34a", bg: "#dcfce7" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2" },
  deferred_to_maintenance: { label: "Sent to maintenance", color: "#b45309", bg: "#fef3c7" },
};

function senderDisplayName(c: Communication): string {
  return [c.senderFirstName, c.senderLastName].filter(Boolean).join(" ") || c.senderEmail || "Unknown";
}

function unitLabel(c: Communication): string {
  if (c.senderBuilding && c.senderApartment) {
    return `Bldg ${c.senderBuilding} · Apt ${c.senderApartment}`;
  }
  if (c.senderBuilding) {
    return `Bldg ${c.senderBuilding}`;
  }
  if (c.senderApartment) {
    return `Apt ${c.senderApartment}`;
  }
  if (c.senderUnit) {
    return `Unit ${c.senderUnit}`;
  }
  return "";
}

function DetailModal({
  comm,
  onClose,
  onUpdate,
  colors,
}: {
  comm: Communication | null;
  onClose: () => void;
  onUpdate: (id: number, status: Communication["status"], adminNote: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [note, setNote] = useState(comm?.adminNote ?? "");

  React.useEffect(() => {
    if (comm) setNote(comm.adminNote ?? "");
  }, [comm?.id]);

  if (!comm) return null;

  const unit = unitLabel(comm);
  const typeColor = comm.type === "complaint" ? "#dc2626" : "#d97706";
  const typeBg = comm.type === "complaint" ? "#fef2f2" : "#fffbeb";
  const statusCfg = STATUS_CONFIG[comm.status] ?? STATUS_CONFIG.pending;

  const formattedDate = new Date(comm.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  } as Intl.DateTimeFormatOptions);

  return (
    <Modal visible={!!comm} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[md.container, { backgroundColor: colors.background }]}>
        <View style={[md.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={md.closeBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[md.title, { color: colors.foreground }]}>Communication</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={md.body} keyboardShouldPersistTaps="handled">
          {/* Type badge + status */}
          <View style={md.badgeRow}>
            <View style={[md.typeBadge, { backgroundColor: typeBg }]}>
              <Feather
                name={comm.type === "complaint" ? "alert-circle" : "zap"}
                size={12}
                color={typeColor}
              />
              <Text style={[md.typeBadgeText, { color: typeColor }]}>
                {comm.type === "complaint" ? "Complaint" : "Suggestion"}
              </Text>
            </View>
            <View style={[md.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[md.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          </View>

          {/* Subject */}
          <Text style={[md.subject, { color: colors.foreground }]}>{comm.subject}</Text>

          {/* Sender info */}
          <View style={[md.senderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={md.senderRow}>
              <Feather name="user" size={13} color={colors.mutedForeground} />
              <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>From</Text>
              <Text style={[md.senderValue, { color: colors.foreground }]}>
                {senderDisplayName(comm)}
              </Text>
            </View>
            {comm.senderEmail && (
              <View style={md.senderRow}>
                <Feather name="mail" size={13} color={colors.mutedForeground} />
                <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>Email</Text>
                <Text style={[md.senderValue, { color: colors.foreground }]} numberOfLines={1}>
                  {comm.senderEmail}
                </Text>
              </View>
            )}
            {comm.senderPhone && (
              <View style={md.senderRow}>
                <Feather name="phone" size={13} color={colors.mutedForeground} />
                <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>Mobile</Text>
                <Text style={[md.senderValue, { color: colors.foreground }]}>{comm.senderPhone}</Text>
              </View>
            )}
            {unit ? (
              <View style={md.senderRow}>
                <Feather name="home" size={13} color={colors.mutedForeground} />
                {comm.senderBuilding ? (
                  <>
                    <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>Building</Text>
                    <Text style={[md.senderValue, { color: colors.foreground }]}>
                      {comm.senderBuilding}
                    </Text>
                    {comm.senderApartment ? (
                      <>
                        <Text style={[md.senderLabel, { color: colors.mutedForeground, marginLeft: 12 }]}>Apt</Text>
                        <Text style={[md.senderValue, { color: colors.foreground }]}>
                          {comm.senderApartment}
                        </Text>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>Unit</Text>
                    <Text style={[md.senderValue, { color: colors.foreground }]}>{comm.senderUnit}</Text>
                  </>
                )}
              </View>
            ) : null}
            <View style={md.senderRow}>
              <Feather name="clock" size={13} color={colors.mutedForeground} />
              <Text style={[md.senderLabel, { color: colors.mutedForeground }]}>Sent</Text>
              <Text style={[md.senderValue, { color: colors.foreground }]}>{formattedDate}</Text>
            </View>
          </View>

          {/* Body */}
          <View style={[md.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[md.bodyText, { color: colors.foreground }]}>{comm.body}</Text>
          </View>

          {/* Admin response */}
          <Text style={[md.responseLabel, { color: colors.foreground }]}>Admin Note</Text>
          <TextInput
            style={[md.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder="Add a note or response…"
            placeholderTextColor={colors.mutedForeground}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Action buttons */}
          <View style={md.actions}>
            {comm.status !== "read" && (
              <Pressable
                style={({ pressed }) => [md.actionBtn, { borderColor: "#2563eb", backgroundColor: pressed ? "#dbeafe" : "#eff6ff" }]}
                onPress={() => onUpdate(comm.id, "read", note)}
              >
                <Feather name="eye" size={14} color="#2563eb" />
                <Text style={[md.actionBtnText, { color: "#2563eb" }]}>Mark Read</Text>
              </Pressable>
            )}
            {comm.status !== "resolved" && (
              <Pressable
                style={({ pressed }) => [md.actionBtn, { borderColor: "#16a34a", backgroundColor: pressed ? "#dcfce7" : "#f0fdf4" }]}
                onPress={() => onUpdate(comm.id, "resolved", note)}
              >
                <Feather name="check-circle" size={14} color="#16a34a" />
                <Text style={[md.actionBtnText, { color: "#16a34a" }]}>Resolve</Text>
              </Pressable>
            )}
            {!["resolved", "rejected", "deferred_to_maintenance"].includes(comm.status) && (
              <>
                <Pressable
                  style={({ pressed }) => [md.actionBtn, { borderColor: "#dc2626", backgroundColor: pressed ? "#fee2e2" : "#fff1f2" }]}
                  onPress={() => onUpdate(comm.id, "rejected", note)}
                >
                  <Feather name="x-circle" size={14} color="#dc2626" />
                  <Text style={[md.actionBtnText, { color: "#dc2626" }]}>Reject</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [md.actionBtn, { borderColor: "#b45309", backgroundColor: pressed ? "#fef3c7" : "#fffbeb" }]}
                  onPress={() => onUpdate(comm.id, "deferred_to_maintenance", note)}
                >
                  <Feather name="tool" size={14} color="#b45309" />
                  <Text style={[md.actionBtnText, { color: "#b45309" }]}>Send to maintenance</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 32, alignItems: "flex-start" },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  badgeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  subject: { fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 24 },
  senderCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  senderLabel: { fontSize: 12, fontFamily: "Inter_500Medium", minWidth: 40 },
  senderValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  bodyCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  responseLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
  },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

function CommCard({
  item,
  colors,
  onPress,
}: {
  item: Communication;
  colors: ReturnType<typeof useColors>;
  onPress: (c: Communication) => void;
}) {
  const typeColor = item.type === "complaint" ? "#dc2626" : "#d97706";
  const typeBg = item.type === "complaint" ? "#fef2f2" : "#fffbeb";
  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
  const name = senderDisplayName(item);
  const unit = unitLabel(item);

  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: colors.card,
          borderColor: item.status === "pending" ? colors.primary + "44" : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={() => onPress(item)}
    >
      <View style={s.cardTop}>
        <View style={[s.typePill, { backgroundColor: typeBg }]}>
          <Feather
            name={item.type === "complaint" ? "alert-circle" : "zap"}
            size={11}
            color={typeColor}
          />
          <Text style={[s.typePillText, { color: typeColor }]}>
            {item.type === "complaint" ? "Complaint" : "Suggestion"}
          </Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[s.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <Text style={[s.cardSubject, { color: colors.foreground }]} numberOfLines={1}>
        {item.subject}
      </Text>

      <View style={s.cardMeta}>
        <Feather name="user" size={12} color={colors.mutedForeground} />
        <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>{name}</Text>
        {unit ? (
          <>
            <Text style={[s.cardMetaDot, { color: colors.mutedForeground }]}>·</Text>
            <Feather name="home" size={12} color={colors.mutedForeground} />
            <Text style={[s.cardMetaUnit, { color: colors.foreground }]}>{unit}</Text>
          </>
        ) : null}
      </View>

      <Text style={[s.cardDate, { color: colors.mutedForeground }]}>
        {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </Text>
    </Pressable>
  );
}

export default function CommunicationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const t = useTranslations();
  const [selected, setSelected] = useState<Communication | null>(null);
  const [filter, setFilter] = useState<"all" | Communication["status"]>("all");

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();

  const isAdmin = profile?.role === "admin";

  // H4: every paginated mobile list uses the shared pattern. Counts derive from
  // the API `total`, never from the length of the current page.
  const {
    items: comms,
    total: commsTotal,
    isLoading,
    refetch,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useMobilePagination<Communication>({
    queryKey: ["admin-communications"],
    fetchPage: (page) =>
      customFetch(`/api/communications?page=${page}&limit=50`) as Promise<{
        data: Communication[];
        total: number;
        page: number;
        limit: number;
      }>,
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: number; status: Communication["status"]; adminNote: string }) =>
      customFetch(`/api/communications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-communications"] });
      setSelected(null);
    },
    onError: () => {
      Alert.alert("Error", "Failed to update communication. Please try again.");
    },
  });

  const handleUpdate = (id: number, status: Communication["status"], adminNote: string) => {
    updateMutation.mutate({ id, status, adminNote });
  };

  const filtered = comms.filter((c) => filter === "all" || c.status === filter);

  const paddingTop = Platform.OS === "web" ? 67 + 16 : insets.top + 16;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;

  if (profileLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop, paddingBottom }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[s.noAccessTitle, { color: colors.foreground }]}>Admin Only</Text>
        <Text style={[s.noAccessSub, { color: colors.mutedForeground }]}>
          This section is only available to administrators.
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Screen header */}
      <View style={[s.screenHeader, { paddingTop }]}>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>Communications Inbox</Text>
        <Text style={[s.screenSub, { color: colors.mutedForeground }]}>
          Owner complaints &amp; suggestions
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterRow, { borderBottomColor: colors.border }]}>
        {(["all", "pending", "read", "resolved", "rejected", "deferred_to_maintenance"] as const).map((f) => (
          <Pressable
            key={f}
            style={[
              s.filterTab,
              filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                s.filterTabText,
                { color: filter === f ? colors.primary : colors.mutedForeground },
              ]}
            >
              {f === "all"
                ? `All${commsTotal > 0 ? ` (${commsTotal})` : ""}`
                : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filtered.length === 0 && !hasNextPage ? (
        <View style={[s.center, { paddingBottom }]}>
          <Feather name="inbox" size={36} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            {filter === "all" ? "No communications yet" : `No ${filter} communications`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <CommCard item={item} colors={colors} onPress={setSelected} />
          )}
          ListFooterComponent={
            <View>
              {isFetchNextPageError && (
                <View style={[s.bannerRow, { backgroundColor: colors.muted }]}>
                  <Feather name="alert-triangle" size={14} color={colors.destructive} />
                  <Text style={[s.bannerText, { color: colors.destructive }]}>
                    {t("comms_load_error")}
                  </Text>
                </View>
              )}
              {hasNextPage && (
                <Pressable
                  testID="load-more-comms"
                  style={[s.loadMoreBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}
                  onPress={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={[s.loadMoreText, { color: colors.primary }]}>{t("comms_load_more")}</Text>
                  }
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {/* Detail modal */}
      <DetailModal
        comm={selected}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
        colors={colors}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  screenHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  screenTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  screenSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  noAccessTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginTop: 12 },
  noAccessSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  filterRow: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  filterTab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  filterTabText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: "row", gap: 6, alignItems: "center" },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardSubject: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  cardMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardMetaDot: { fontSize: 12 },
  cardMetaUnit: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, marginTop: 8, marginHorizontal: 0 },
  bannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  loadMoreBtn: { margin: 8, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
