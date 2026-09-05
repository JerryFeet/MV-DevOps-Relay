import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import type { useColors } from "@/hooks/useColors";

type Props = {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  colors: ReturnType<typeof useColors>;
  testID?: string;
  maximumDate?: Date;
};

function toDate(str: string): Date {
  if (!str) return new Date();
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePickerField({ value, onChange, placeholder = "Select date", colors, testID, maximumDate }: Props) {
  const [show, setShow] = useState(false);

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (selected) onChange(toYMD(selected));
  };

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => setShow(true)}
        style={({ pressed }) => [
          styles.button,
          { borderColor: colors.border, backgroundColor: colors.muted },
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={[styles.text, { color: value ? colors.foreground : colors.mutedForeground }]}>
          {value || placeholder}
        </Text>
        <Feather name="calendar" size={16} color={colors.mutedForeground} />
      </Pressable>
      {show && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleChange}
          maximumDate={maximumDate}
        />
      )}
      {show && Platform.OS === "ios" && (
        <Pressable onPress={() => setShow(false)} style={styles.iosDone}>
          <Text style={[styles.iosDoneText, { color: colors.primary }]}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { fontSize: 15, fontFamily: "Inter_400Regular" },
  iosDone: { alignItems: "flex-end", paddingTop: 4 },
  iosDoneText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
