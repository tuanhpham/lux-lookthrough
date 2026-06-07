import React from "react";
import { View, Text } from "react-native";

interface StatRowProps {
  label: string;
  value: string | number | null | undefined;
  valueColor?: string;
}

export function StatRow({ label, value, valueColor }: StatRowProps) {
  const display = value == null ? "—" : String(value);
  return (
    <View className="flex-row justify-between py-1 border-b border-border">
      <Text className="text-subtext text-sm">{label}</Text>
      <Text
        style={valueColor ? { color: valueColor } : undefined}
        className="text-text text-sm font-medium"
      >
        {display}
      </Text>
    </View>
  );
}
