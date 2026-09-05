import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  useListAnnouncements,
  useListBookings,
  customFetch,
} from "@workspace/api-client-react";
import { useTranslations } from "@/hooks/useTranslations";
import { displayUnitReference } from "@/lib/unitReference";

type FullProfile = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  unitNumber: string | null;
  role: string;
  verificationStatus: string;
};

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const t = useTranslations();

  const { data: profile } = useQuery<FullProfile>({
    queryKey: ["profile"],
    queryFn: () => customFetch("/api/users/me"),
  });
  const { data: announcements, isLoading: loadingAnn, refetch: refetchAnn } = useListAnnouncements({ pinned: true });
  const { data: bookings, isLoading: loadingBook, refetch: refetchBook } = useListBookings({ upcoming: true });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAnn(), refetchBook()]);
    setRefreshing(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const displayName = profile?.firstName || "Resident";

  const pinnedAnn = (announcements?.data ?? []).filter((a) => a.pinned && a.status === "published" && !a.isExpired).slice(0, 2);
  const upcomingBookings = (bookings?.data ?? []).filter((b) => b.status !== "cancelled").slice(0, 3);

  const s = styles(colors);
  return (
    <>
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        s.content,
        {
          paddingTop: Platform.OS === "web" ? 67 + 16 : insets.top + 16,
          paddingBottom: Platform.OS === "web" ? 34 + 80 : insets.bottom + 80,
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting()},</Text>
          <Text style={s.name}>{displayName}</Text>
        </View>
        <View style={s.avatar}>
          <Ionicons name="person" size={20} color={colors.brandForeground} />
        </View>
      </View>

      {/* Unit badge */}
      {profile?.unitNumber && (
        <View style={s.unitBadge}>
          <Feather name="home" size={14} color={colors.brandForeground} />
          <Text style={s.unitText}>Unit {displayUnitReference(profile.unitNumber)}</Text>
          <View style={[s.rolePill, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[s.roleText, { color: colors.primary }]}>{profile.role}</Text>
          </View>
        </View>
      )}

      {/* Unit verification banner */}
      {profile && profile.verificationStatus !== "verified_owner" && profile.verificationStatus !== "verified_tenant" && (
        <Pressable
          style={({ pressed }) => [
            s.uvBanner,
            profile.verificationStatus === "unverified"
              ? { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }
              : { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => router.push("/(home)/unit-verification" as any)}
        >
          <View style={[s.uvBannerIcon, {
            backgroundColor: profile.verificationStatus === "unverified" ? "#fef3c7" : "#ffedd5",
          }]}>
            <Feather
              name={profile.verificationStatus === "unverified" ? "alert-triangle" : "clock"}
              size={18}
              color={profile.verificationStatus === "unverified" ? "#d97706" : "#ea580c"}
            />
          </View>
          <View style={s.uvBannerText}>
            <Text style={[s.uvBannerTitle, { color: profile.verificationStatus === "unverified" ? "#92400e" : "#7c2d12" }]}>
              {profile.verificationStatus === "unverified"
                ? t("uv_banner_unverified_title")
                : profile.verificationStatus === "pending_manual"
                ? t("uv_banner_pending_title")
                : t("uv_banner_awaiting_title")}
            </Text>
            <Text style={[s.uvBannerDesc, { color: "#78350f" }]}>
              {profile.verificationStatus === "unverified"
                ? t("uv_banner_unverified_desc")
                : profile.verificationStatus === "pending_manual"
                ? t("uv_banner_pending_desc")
                : t("uv_banner_awaiting_desc")}
            </Text>
          </View>
          {profile.verificationStatus === "unverified" && (
            <View style={[s.uvBannerCta, { backgroundColor: "#d97706" }]}>
              <Text style={s.uvBannerCtaText}>{t("uv_banner_cta")}</Text>
            </View>
          )}
          {profile.verificationStatus !== "unverified" && (
            <Feather name="chevron-right" size={16} color="#92400e" />
          )}
        </Pressable>
      )}

      {/* Quick actions */}
      <Text style={s.sectionTitle}>Quick Actions</Text>
      <View style={s.quickActions}>
        {[
          { icon: "calendar" as const, label: "Book Facility", tab: "/(home)/(tabs)/bookings" },
          { icon: "bell" as const, label: "Announcements", tab: "/(home)/(tabs)/announcements" },
          { icon: "user-plus" as const, label: "Register Guest", tab: "/(home)/(tabs)/guests" },
          { icon: "message-circle" as const, label: "Ask AI", tab: "/(home)/(tabs)/chat" },
        ].map((item) => (
          <Pressable
            key={item.tab}
            style={({ pressed }) => [s.quickAction, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.75 }]}
            onPress={() => router.push(item.tab as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name={item.icon} size={20} color={colors.primary} />
            </View>
            <Text style={s.quickActionLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Pinned announcements */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Pinned Notices</Text>
        <Pressable onPress={() => router.push("/(home)/(tabs)/announcements")}>
          <Text style={[s.seeAll, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>

      {loadingAnn ? (
        <View style={s.loadingCard}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : pinnedAnn.length === 0 ? (
        <View style={[s.emptyCard, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <Feather name="bell-off" size={22} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No pinned notices</Text>
        </View>
      ) : (
        pinnedAnn.map((ann) => (
          <View key={ann.id} style={[s.announcementCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.pinnedDot, { backgroundColor: colors.primary }]} />
            <View style={s.annContent}>
              <Text style={[s.annTitle, { color: colors.foreground }]} numberOfLines={2}>{ann.title}</Text>
              <Text style={[s.annDate, { color: colors.mutedForeground }]}>
                {ann.publishedAt ? new Date(ann.publishedAt).toLocaleDateString() : ""}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Upcoming bookings */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>My Bookings</Text>
        <Pressable onPress={() => router.push("/(home)/(tabs)/bookings")}>
          <Text style={[s.seeAll, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>

      {loadingBook ? (
        <View style={s.loadingCard}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : upcomingBookings.length === 0 ? (
        <View style={[s.emptyCard, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <Feather name="calendar" size={22} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No upcoming bookings</Text>
        </View>
      ) : (
        upcomingBookings.map((b) => (
          <View key={b.id} style={[s.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.bookingStatus, {
              backgroundColor:
                b.status === "confirmed" ? "#16a34a22" :
                b.status === "pending" ? colors.primary + "22" : "#8a827822",
            }]}>
              <Text style={[s.bookingStatusText, {
                color:
                  b.status === "confirmed" ? "#16a34a" :
                  b.status === "pending" ? colors.primary : colors.mutedForeground,
              }]}>{b.status}</Text>
            </View>
            <View style={s.bookingDetails}>
              <Text style={[s.bookingFacility, { color: colors.foreground }]}>{b.facilityName ?? `Facility #${b.facilityId}`}</Text>
              <Text style={[s.bookingTime, { color: colors.mutedForeground }]}>
                {new Date(b.startTime).toLocaleDateString()} · {new Date(b.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
    </>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    greeting: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    name: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    unitBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 24,
    },
    unitText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.brandForeground, flex: 1 },
    rolePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12, marginTop: 8 },
    seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
    quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
    quickAction: {
      width: "47%",
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
      alignItems: "center",
      gap: 10,
    },
    quickActionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    quickActionLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, textAlign: "center" },
    loadingCard: { height: 72, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    emptyCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
    announcementCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    pinnedDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    annContent: { flex: 1 },
    annTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
    annDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
    bookingCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    bookingStatus: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    bookingStatusText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
    bookingDetails: { flex: 1 },
    bookingFacility: { fontSize: 14, fontFamily: "Inter_500Medium" },
    bookingTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

    // Verification banner
    uvBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
    },
    uvBannerIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    uvBannerText: { flex: 1 },
    uvBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
    uvBannerDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
    uvBannerCta: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    uvBannerCtaText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  });
