import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ListRenderItemInfo,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { scanSector } from "@/api/patterns";
import { ScoreBar } from "@/components/ScoreBar";
import { SignalBadge } from "@/components/SignalBadge";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ErrorView } from "@/components/ErrorView";
import type { PatternSignal, PatternStackParamList } from "@/types";

type Nav = NativeStackNavigationProp<PatternStackParamList, "PatternScreen">;

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
] as const;

interface PatternCardProps {
  item: PatternSignal;
  onPress: (symbol: string, sector?: string) => void;
}

function PatternCard({ item, onPress }: PatternCardProps) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item.symbol, item.sector ?? undefined)}
      activeOpacity={0.7}
      className="mx-4 mb-3 bg-card rounded-xl p-4 border border-border"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View>
          <Text className="text-text text-lg font-bold">{item.symbol}</Text>
          {item.sector && (
            <Text className="text-subtext text-xs">{item.sector}</Text>
          )}
        </View>
        <SignalBadge signal={item.signal} />
      </View>

      <ScoreBar score={item.score} />

      {/* Trade levels */}
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
            <Text className="text-subtext text-xs mb-0.5">R:R</Text>
            <Text className="text-warning text-sm font-bold">
              {item.risk_reward != null ? `${item.risk_reward}×` : "—"}
            </Text>
          </View>
        </View>
      )}

      {/* VCP contractions */}
      {(item.vcp_contractions ?? 0) > 0 && (
        <Text className="text-subtext text-xs mt-2">
          VCP contractions: {item.vcp_contractions} · Stage {item.stage}{" "}
          {item.stage_label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function PatternScreen() {
  const navigation = useNavigation<Nav>();
  const [activeSector, setActiveSector] = useState<string>(SECTORS[0]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["patternScan", activeSector],
    queryFn: () => scanSector(activeSector, 55),
    staleTime: 10 * 60 * 1000,
  });

  const handlePress = useCallback(
    (symbol: string, sector?: string) => {
      navigation.navigate("StockDetail", { symbol, sector });
    },
    [navigation]
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="text-text text-2xl font-bold">Pattern Scanner</Text>
        <Text className="text-subtext text-sm mt-1">
          VCP / consolidation setups · score ≥ 55
        </Text>
      </View>

      {/* Sector filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
        className="max-h-12"
      >
        {SECTORS.map((s) => {
          const active = s === activeSector;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setActiveSector(s)}
              activeOpacity={0.7}
              style={{
                backgroundColor: active ? "#00c896" : "#242424",
                borderColor: active ? "#00c896" : "#333333",
              }}
              className="border rounded-full px-3 py-1 mr-2"
            >
              <Text
                style={{ color: active ? "#0d0d0d" : "#f0f0f0" }}
                className="text-xs font-semibold"
                numberOfLines={1}
              >
                {s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results */}
      {isLoading ? (
        <LoadingOverlay message={`Scanning ${activeSector}…`} />
      ) : isError ? (
        <ErrorView
          message={(error as Error)?.message ?? "Scan failed."}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={data?.stocks ?? []}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item }: ListRenderItemInfo<PatternSignal>) => (
            <PatternCard item={item} onPress={handlePress} />
          )}
          ListHeaderComponent={
            data ? (
              <View className="px-4 py-2">
                <Text className="text-subtext text-xs">
                  {data.qualified} of {data.total_scanned} stocks qualified
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="px-4 py-12 items-center">
              <Text className="text-subtext text-sm text-center">
                No setups found with score ≥ 55 in {activeSector}.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor="#00c896"
            />
          }
        />
      )}
    </View>
  );
}
