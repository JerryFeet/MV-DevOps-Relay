import React, { useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
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

function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerField({ value, onChange, placeholder = "Select date", colors, testID, maximumDate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => {
          if (inputRef.current) {
            try {
              inputRef.current.showPicker();
            } catch {
              inputRef.current.click();
            }
          }
        }}
        testID={testID}
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
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={maximumDate ? toYMD(maximumDate) : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={hiddenInputStyle}
      />
    </View>
  );
}

const hiddenInputStyle: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  width: 1,
  height: 1,
  pointerEvents: "none",
  border: "none",
  padding: 0,
};

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
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
});
