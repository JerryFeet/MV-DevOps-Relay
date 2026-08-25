import React, { useState, useRef, useEffect } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useTranslations } from "@/hooks/useTranslations";
import { customFetch, listVehicles } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useMobilePagination } from "@/hooks/useMobilePagination";

const isRTL = I18nManager.isRTL;
const VEHICLE_PAGE_SIZE = 50;

type Vehicle = {
  id: number;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  plateNumber: string;
  istimaraNumber: string | null;
  isAdditional: boolean;
  status: string;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  active:           { color: "#16a34a", label: "Active" },
  pending_approval: { color: "#f59e0b", label: "Pending Approval" },
  inactive:         { color: "#64748b", label: "Inactive" },
};

function VehicleCard({ item, colors }: { item: Vehicle; colors: ReturnType<typeof useColors> }) {
  const statusCfg = STATUS_CONFIG[item.status] ?? { color: colors.mutedForeground, label: item.status };

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.cardRow, isRTL && s.rowRTL]}>
        <View style={[s.carIcon, { backgroundColor: colors.brand }]}>
          <Feather name="truck" size={18} color={colors.brandForeground} />
        </View>
        <View style={s.vehicleInfo}>
          <View style={[s.nameRow, isRTL && s.rowRTL]}>
            <Text style={[s.vehicleName, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
              {item.make} {item.model}
              {item.year ? ` (${item.year})` : ""}
            </Text>
            {item.isAdditional && (
              <View style={[s.additionalPill, { backgroundColor: colors.accent + "22" }]}>
                <Text style={[s.additionalText, { color: colors.accent }]}>+1</Text>
              </View>
            )}
          </View>

          <View style={[s.plateRow, isRTL && s.rowRTL]}>
            <View style={[s.plateBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[s.plateText, { color: colors.foreground }]}>{item.plateNumber}</Text>
            </View>
            {item.color ? (
              <Text style={[s.colorText, { color: colors.mutedForeground }]}>{item.color}</Text>
            ) : null}
          </View>

          <View style={[s.statusRow, { backgroundColor: statusCfg.color + "18" }, isRTL && s.rowRTL]}>
            <View style={[s.statusDot, { backgroundColor: statusCfg.color }]} />
            <Text style={[s.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>
      </View>
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
        style={[s.sheet, { backgroundColor: colors.background, transform: [{ translateY }] }]}
      >
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

export default function VehiclesScreen() {
  const colors = useColors();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showSheet, setShowSheet] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [istimaraNumber, setIstimaraNumber] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const {
    items: vehicles,
    total: vehicleTotal,
    loadedCount: loadedVehicleCount,
    isLoading,
    refetch,
    hasNextPage: hasMoreVehicles,
    fetchNextPage: fetchMoreVehicles,
    isFetchingNextPage: isLoadingMoreVehicles,
    isFetchNextPageError: isMoreVehiclesError,
    hasUnloadedItems: hasUnloadedVehicles,
  } = useMobilePagination<Vehicle>({
    queryKey: ["vehicles"],
    fetchPage: (page) => listVehicles({ page, limit: VEHICLE_PAGE_SIZE }) as Promise<{ data: Vehicle[]; total: number; page: number; limit: number }>,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch("/api/vehicles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const resetForm = () => {
    setPlateNumber("");
    setMake("");
    setModel("");
    setColor("");
    setYear("");
    setIstimaraNumber("");
  };

  const handleClose = () => {
    setShowSheet(false);
    resetForm();
  };

  const handleRegister = async () => {
    if (!plateNumber || !make || !model) return;
    const parsedYear = year ? parseInt(year, 10) : undefined;
    if (year && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      Alert.alert("Invalid Year", "Please enter a valid 4-digit year.");
      return;
    }

    const body: Record<string, unknown> = { plateNumber, make, model };
    if (color) body.color = color;
    if (parsedYear) body.year = parsedYear;
    if (istimaraNumber) body.istimaraNumber = istimaraNumber;

    try {
      const vehicle = await createMutation.mutateAsync(body) as Vehicle;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      if (vehicle?.isAdditional) {
        Alert.alert("Request Submitted", "Your additional vehicle request has been submitted for approval.");
      }
    } catch (err: any) {
      Alert.alert("Registration Failed", err?.message ?? "Unable to register vehicle.");
    }
  };

  const paddingTop = Platform.OS === "web" ? 67 : insets.top;
  const paddingBottom = Platform.OS === "web" ? 34 + 80 : insets.bottom + 80;
  const vehiclesFooter = vehicleTotal > 0 ? (
    <View style={s.paginationFooter}>
      <Text style={[s.paginationStatus, { color: colors.mutedForeground }]}>
        {t("vehicle_history_showing")
          .replace("{{shown}}", String(loadedVehicleCount))
          .replace("{{total}}", String(vehicleTotal))}
      </Text>
      {hasUnloadedVehicles && (
        <View style={[s.paginationWarning, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <Feather name="info" size={15} color={colors.primary} />
          <Text style={[s.paginationWarningText, { color: colors.foreground }]}>
            {isMoreVehiclesError ? t("vehicle_history_load_error") : t("vehicle_history_more_available")}
          </Text>
        </View>
      )}
      {hasMoreVehicles && (
        <Pressable
          style={({ pressed }) => [
            s.loadMoreButton,
            { borderColor: colors.primary, backgroundColor: colors.card },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => fetchMoreVehicles()}
          disabled={isLoadingMoreVehicles}
          testID="load-more-vehicles"
        >
          {isLoadingMoreVehicles ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.loadMoreButtonText, { color: colors.primary }]}>
              {t("vehicle_history_load_more")}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  ) : null;

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
            Vehicles
          </Text>
          <Text style={[s.pageSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
            Registered unit vehicles
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.addButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
          onPress={() => setShowSheet(true)}
          testID="register-vehicle-button"
        >
          <Feather name="plus" size={20} color="#ffffff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <VehicleCard item={item} colors={colors} />}
          contentContainerStyle={[s.listContent, { paddingBottom }]}
          scrollEnabled={vehicles.length > 0 || hasMoreVehicles}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListFooterComponent={vehiclesFooter}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="truck" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>
                {hasMoreVehicles ? t("vehicle_history_more_available") : "No vehicles registered"}
              </Text>
              {!hasMoreVehicles && (
                <Text style={[s.emptySubtitle, { color: colors.mutedForeground }]}>
                  Tap + to register a vehicle
                </Text>
              )}
            </View>
          }
        />
      )}

      <BottomSheet visible={showSheet} onClose={handleClose} colors={colors}>
        <View style={[s.sheetHeader, { borderBottomColor: colors.border }, isRTL && s.rowRTL]}>
          <Text style={[s.sheetTitle, { color: colors.foreground }]} testID="veh-form-sheet-title">{t("veh_form_register_title")}</Text>
          <Pressable onPress={handleClose}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false}>
          {(
            [
              { tKey: "veh_form_plate_label" as const, phKey: "veh_placeholder_plate" as const, testID: "veh-label-plate", value: plateNumber, set: setPlateNumber, capitalize: "characters" as const },
              { tKey: "veh_form_make_label" as const, phKey: "veh_placeholder_make" as const, testID: "veh-label-make", value: make, set: setMake, capitalize: "words" as const },
              { tKey: "veh_form_model_label" as const, phKey: "veh_placeholder_model" as const, testID: "veh-label-model", value: model, set: setModel, capitalize: "words" as const },
              { tKey: "veh_form_color_label" as const, phKey: "veh_placeholder_color" as const, testID: "veh-label-color", value: color, set: setColor, capitalize: "words" as const },
              { tKey: "veh_form_istimara_label" as const, phKey: "form_placeholder_optional" as const, testID: "veh-label-istimara", value: istimaraNumber, set: setIstimaraNumber, capitalize: "characters" as const },
            ] as Array<{ tKey: "veh_form_plate_label" | "veh_form_make_label" | "veh_form_model_label" | "veh_form_color_label" | "veh_form_istimara_label"; phKey: "veh_placeholder_plate" | "veh_placeholder_make" | "veh_placeholder_model" | "veh_placeholder_color" | "form_placeholder_optional"; testID: string; value: string; set: (v: string) => void; capitalize: "characters" | "words" }>
          ).map((field) => (
            <View key={field.testID}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]} testID={field.testID}>{t(field.tKey)}</Text>
              <TextInput
                style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                testID={field.testID.replace("veh-label-", "veh-input-")}
                value={field.value}
                onChangeText={field.set}
                placeholder={t(field.phKey)}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize={field.capitalize}
              />
            </View>
          ))}

          <Text style={[s.fieldLabel, { color: colors.foreground }]} testID="veh-label-year">{t("veh_form_year_label")}</Text>
          <TextInput
            style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
            testID="veh-input-year"
            value={year}
            onChangeText={setYear}
            placeholder={t("veh_placeholder_year")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={4}
          />

          <Pressable
            style={({ pressed }) => [
              s.submitButton,
              { backgroundColor: colors.primary },
              (!plateNumber || !make || !model || createMutation.isPending) && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleRegister}
            disabled={!plateNumber || !make || !model || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={s.submitText} testID="veh-form-submit-text">{t("veh_form_register_btn")}</Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>
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
  addButton: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  carIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  vehicleInfo: { flex: 1, gap: 7 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vehicleName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  additionalPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  additionalText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  plateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  plateBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  plateText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  colorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  paginationFooter: { paddingTop: 4, paddingBottom: 8, gap: 10 },
  paginationStatus: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  paginationWarning: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 12 },
  paginationWarningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  loadMoreButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  loadMoreButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
  sheetTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 4, maxHeight: "80%" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 14 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  submitButton: {
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  submitText: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
