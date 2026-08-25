import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTranslations } from "@/hooks/useTranslations";
import { listAnnouncements, type Announcement } from "@workspace/api-client-react";
import { useMobilePagination } from "@/hooks/useMobilePagination";

const ANNOUNCEMENTS_PAGE_SIZE = 50;

function AnnouncementCard({ item, colors }: { item: Announcement; colors: ReturnType<typeof useColors> }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Pressable
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={s.cardTop}>
        {item.pinned && (
          <View style={[s.pinnedBadge, { backgroundColor: colors.primary + "20" }]}>
            <Feather name="bookmark" size={11} color={colors.primary} />
            <Text style={[s.pinnedText, { color: colors.primary }]}>Pinned</Text>
          </View>
        )}
        <Text style={[s.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
        <View style={s.cardMeta}>
          {item.authorName && (
            <Text style={[s.metaText, { color: colors.mutedForeground }]}>
              {item.authorName}
            </Text>
          )}
          {item.publishedAt && (
            <Text style={[s.metaText, { color: colors.mutedForeground }]}>
              {new Date(item.publishedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
      </View>

      <Text
        style={[s.cardBody, { color: colors.foreground }]}
        numberOfLines={expanded ? undefined : 3}
      >
        {item.body}
      </Text>

      <View style={s.cardFooter}>
        <Text style={[s.readMore, { color: colors.primary }]}>
          {expanded ? "Show less" : "Read more"}
        </Text>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.primary}
        />
      </View>
    </Pressable>
  );
}

export default function AnnouncementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useTranslations();
  const [refreshing, setRefreshing] = React.useState(false);

  // H4: every paginated mobile list uses the shared pattern. The server already
  // filters expired and deleted announcements for non-admin users, so `total`
  // accurately reflects what the resident can see.
  const {
    items: announcements,
    total: announcementsTotal,
    isLoading,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useMobilePagination<Announcement>({
    queryKey: ["announcements"],
    fetchPage: (page) => listAnnouncements({ page, limit: ANNOUNCEMENTS_PAGE_SIZE }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const paddingTop = Platform.OS === "web" ? 67 : insets.top;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && announcements.length === 0) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop }]}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[s.errorText, { color: colors.destructive }]}>
          Failed to load announcements
        </Text>
        <Pressable
          style={[s.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => refetch()}
        >
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const subtitle = (() => {
    if (announcementsTotal === 0) return null;
    if (hasNextPage) {
      return t("announcements_showing")
        .replace("{{shown}}", String(announcements.length))
        .replace("{{total}}", String(announcementsTotal));
    }
    return `${announcementsTotal} notice${announcementsTotal !== 1 ? "s" : ""}`;
  })();

  const listFooter = (
    <View>
      {isFetchNextPageError && (
        <View style={[s.bannerRow, { backgroundColor: colors.muted }]}>
          <Feather name="alert-triangle" size={14} color={colors.destructive} />
          <Text style={[s.bannerText, { color: colors.destructive }]}>
            {t("announcements_load_error")}
          </Text>
        </View>
      )}
      {hasNextPage && (
        <Pressable
          testID="load-more-announcements"
          style={[
            s.loadMoreBtn,
            {
              backgroundColor: colors.primary + "15",
              borderColor: colors.primary + "40",
            },
          ]}
          onPress={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.loadMoreText, { color: colors.primary }]}>
              {t("announcements_load_more")}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          s.pageHeader,
          { paddingTop: paddingTop + 16, backgroundColor: colors.background },
        ]}
      >
        <Text style={[s.pageTitle, { color: colors.foreground }]}>Announcements</Text>
        {subtitle !== null && (
          <Text style={[s.pageSubtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        )}
      </View>

      <FlatList
        data={announcements}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <AnnouncementCard item={item} colors={colors} />}
        contentContainerStyle={[s.listContent, { paddingBottom }]}
        scrollEnabled={announcements.length > 0 || hasNextPage}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="bell-off" size={40} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>
              No announcements
            </Text>
            <Text style={[s.emptySubtitle, { color: colors.mutedForeground }]}>
              Check back later for community updates
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  pageHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  pageSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  cardTop: { gap: 6 },
  pinnedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  pinnedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  cardMeta: { flexDirection: "row", gap: 12 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 4 },
  readMore: { fontSize: 13, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  retryButton: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: "#ffffff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  bannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  loadMoreBtn: {
    margin: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
