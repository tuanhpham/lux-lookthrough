import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ListRenderItemInfo,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchSectors } from "@/api/industries";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ErrorView } from "@/components/ErrorView";
import type { SectorVolume, HomeStackParamList } from "@/types";

type Nav = NativeStackNavigationProp<HomeStackParamList, "HomeScreen">;

function volumeColor(pct: number): string {
  if (pct > 10) return "#00c896";
  if (pct > 0) return "#7dcfb6";
  if (pct > -10) return "#f5a623";
  return "#ff4d4d";
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

interface SectorRowProps {
  item: SectorVolume;
  onPress: (sector: string) => void;
}

function SectorRow({ item, onPress }: SectorRowProps) {
  const color = volumeColor(item.volume_change_pct);
  const isPositive = item.volume_change_pct >= 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(item.sector)}
      activeOpacity={0.7}
      className="mx-4 mb-2 bg-card rounded-xl p-4 border border-border"
    >
      <View className="flex-row items-center justify-between">
        {/* Rank + sector name */}
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-7 h-7 rounded-full bg-surface items-center justify-center mr-3">
            <Text className="text-subtext text-xs font-bold">#{item.rank}</Text>
          </View>
          <Text className="text-text font-semibold flex-shrink" numberOfLines={1}>
            {item.sector}
          </Text>
        </View>

        {/* Volume change badge */}
        <View
          style={{ backgroundColor: color + "25" }}
          className="px-3 py-1 rounded-full"
        >
          <Text style={{ color }} className="text-sm font-bold">
            {isPositive ? "+" : ""}
            {item.volume_change_pct.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Volume bar */}
      <View className="mt-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-subtext text-xs">
            3m avg: {formatVolume(item.avg_volume_3m)}
          </Text>
          <Text className="text-subtext text-xs">
            6m avg: {formatVolume(item.avg_volume_6m)}
          </Text>
        </View>
        <View className="h-1 bg-border rounded-full overflow-hidden">
          <View
            style={{
              width: `${Math.min(100, 50 + item.volume_change_pct / 2)}%`,
              backgroundColor: color,
            }}
            className="h-full rounded-full"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["sectors"],
    queryFn: fetchSectors,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const handleSectorPress = useCallback(
    (sector: string) => {
      navigation.navigate("SectorScreen", { sector });
    },
    [navigation]
  );

  // MOVED UP: this hook must run on every render, before any early return
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SectorVolume>) => (
      <SectorRow item={item} onPress={handleSectorPress} />
    ),
    [handleSectorPress]
  );

  if (isLoading) {
    return (
      <LoadingOverlay message="Scanning all 11 sectors… this may take 15-20s" />
    );
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as Error)?.message ?? "Failed to load sectors."}
        onRetry={refetch}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.sector}
        renderItem={renderItem}
        ListHeaderComponent={
          <View className="px-4 pt-4 pb-2">
            <Text className="text-text text-2xl font-bold">Industry Scanner</Text>
            <Text className="text-subtext text-sm mt-1">
              S&amp;P 500 sectors ranked by volume change (3m vs 6m)
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
    </View>
  );
}
