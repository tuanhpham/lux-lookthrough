import React from "react";
import { View, Text } from "react-native";

interface ScoreBarProps {
  score: number; // 0-100
}

function scoreColor(score: number): string {
  if (score >= 70) return "#00c896";
  if (score >= 50) return "#f5a623";
  return "#ff4d4d";
}

export function ScoreBar({ score }: ScoreBarProps) {
  const color = scoreColor(score);
  const pct = Math.min(Math.max(score, 0), 100);

  return (
    <View className="mt-1">
      <View className="flex-row justify-between mb-1">
        <Text className="text-subtext text-xs">Score</Text>
        <Text style={{ color }} className="text-xs font-bold">
          {score.toFixed(0)}/100
        </Text>
      </View>
      <View className="h-1.5 bg-border rounded-full overflow-hidden">
        <View
          style={{ width: `${pct}%`, backgroundColor: color }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}
