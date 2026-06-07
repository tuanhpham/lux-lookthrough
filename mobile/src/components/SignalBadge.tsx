import React from "react";
import { View, Text } from "react-native";
import type { SignalType } from "@/types";

interface SignalBadgeProps {
  signal: SignalType;
}

const SIGNAL_STYLES: Record<SignalType, { bg: string; text: string; label: string }> = {
  BREAKOUT_IMMINENT: { bg: "#00c89630", text: "#00c896", label: "Breakout" },
  CONSOLIDATING:     { bg: "#f5a62330", text: "#f5a623", label: "Basing" },
  NO_SIGNAL:         { bg: "#33333380", text: "#666666", label: "No Signal" },
};

export function SignalBadge({ signal }: SignalBadgeProps) {
  const style = SIGNAL_STYLES[signal] ?? SIGNAL_STYLES.NO_SIGNAL;
  return (
    <View
      style={{ backgroundColor: style.bg }}
      className="px-2 py-0.5 rounded-full self-start"
    >
      <Text style={{ color: style.text }} className="text-xs font-semibold">
        {style.label}
      </Text>
    </View>
  );
}
