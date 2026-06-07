import React from "react";
import { View, Text } from "react-native";

export interface BarDatum {
  label: string;
  value: number | null;
}

interface MiniBarChartProps {
  data: BarDatum[];
  /** Format a value for the axis/labels (e.g. money or plain number). */
  format: (v: number) => string;
  height?: number;
}

/**
 * A dependency-free vertical bar chart for fundamentals trends (revenue, net
 * income, EPS). Bars are scaled to the max absolute value; negatives render
 * below a zero baseline in red.
 */
export function MiniBarChart({ data, format, height = 160 }: MiniBarChartProps) {
  const points = data.filter(
    (d): d is { label: string; value: number } => d.value != null
  );
  if (!points.length) {
    return (
      <View style={{ height }} className="items-center justify-center">
        <Text className="text-subtext text-sm">No data available.</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const plotH = height - 28; // leave room for labels
  const zeroFromTop = (max / span) * plotH;

  return (
    <View style={{ height }}>
      <View className="flex-1 flex-row items-stretch justify-around">
        {points.map((p, i) => {
          const positive = p.value >= 0;
          const barH = (Math.abs(p.value) / span) * plotH;
          return (
            <View key={i} className="flex-1 items-center justify-end mx-0.5">
              {/* value label */}
              <Text className="text-subtext text-[9px] mb-0.5" numberOfLines={1}>
                {format(p.value)}
              </Text>
              {/* plot area with zero baseline */}
              <View style={{ height: plotH, width: "100%" }} className="justify-start">
                <View
                  style={{
                    position: "absolute",
                    top: positive ? zeroFromTop - barH : zeroFromTop,
                    height: barH,
                    left: "15%",
                    right: "15%",
                    backgroundColor: positive ? "#00c896" : "#ff4d4d",
                    borderRadius: 3,
                  }}
                />
              </View>
              {/* period label */}
              <Text className="text-subtext text-[9px] mt-1" numberOfLines={1}>
                {p.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
