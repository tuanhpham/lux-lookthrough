import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

import { ScoreBar } from "./ScoreBar";
import { SignalBadge } from "./SignalBadge";
import type { ScreenRow } from "@/types";

interface ResultCardProps {
  item: ScreenRow;
  onPress: (symbol: string) => void;
}

/** A single screener / watchlist result row, tappable to open the detail view. */
export function ResultCard({ item, onPress }: ResultCardProps) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item.symbol)}
      activeOpacity={0.7}
      className="mx-4 mb-3 bg-card rounded-xl p-4 border border-border"
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-baseline gap-x-2">
          <Text className="text-text text-lg font-bold">{item.symbol}</Text>
          <Text className="text-subtext text-sm">${item.price.toFixed(2)}</Text>
        </View>
        <SignalBadge signal={item.signal} />
      </View>

      <ScoreBar score={item.score} />

      {item.entry_price != null && (
        <View className="flex-row mt-3 gap-x-2">
          <View className="flex-1 bg-surface rounded-lg p-2">
            <Text className="text-subtext text-xs mb-0.5">Entry</Text>
            <Text className="text-primary text-sm font-bold">
              ${item.entry_price.toFixed(2)}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-lg p-2">
            <Text className="text-subtext text-xs mb-0.5">Stop</Text>
            <Text className="text-danger text-sm font-bold">
              ${item.stop_loss?.toFixed(2) ?? "—"}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-lg p-2">
            <Text className="text-subtext text-xs mb-0.5">Target</Text>
            <Text className="text-warning text-sm font-bold">
              {item.target_price != null
                ? `$${item.target_price.toFixed(2)}`
                : "—"}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-lg p-2">
            <Text className="text-subtext text-xs mb-0.5">R:R</Text>
            <Text className="text-text text-sm font-bold">
              {item.risk_reward != null ? `${item.risk_reward}×` : "—"}
            </Text>
          </View>
        </View>
      )}

      <Text className="text-subtext text-xs mt-2">
        Stage {item.stage} · {item.stage_label}
        {item.vcp_contractions ? ` · VCP ${item.vcp_contractions}` : ""}
      </Text>
    </TouchableOpacity>
  );
}
