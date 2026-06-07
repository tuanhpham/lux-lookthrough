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
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

import { fetchTopStocks } from "@/api/industries";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ErrorView } from "@/components/ErrorView";
import type { TopStock, HomeStackParamList } from "@/types";

type Nav = NativeStackNavigationProp<HomeStackParamList, "SectorScreen">;
type Route = RouteProp<HomeStackParamList, "SectorScreen">;

function pctColor(pct: number): string {
  return pct >= 0 ? "#00c896" : "#ff4d4d";
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

interface StockCardProps {
  item: TopStock;
  rank: number;
  onPress: (symbol: string, sector: string) => void;
}

function StockCard({ item, rank, onPress }: StockCardProps) {
  const surgeColor = pctColor(item.volume_surge_pct);
  const priceColor = pctColor(item.price_change_pct);

  return (
    <TouchableOpacity
      onPress={() => onPress(item.symbol, item.sector)}
      activeOpacity={0.7}
      className="mx-4 mb-3 bg-card rounded-xl p-4 border border-border"
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="text-subtext text-xs mr-2">#{rank}</Text>
          <Text className="text-text text-lg font-bold">{item.symbol}</Text>
        </View>
        <Text className="text-text text-base font-semibold">
          ${item.current_price.toFixed(2)}
        </Text>
      </View>

      {/* Stats row */}
      <View className="flex-row mt-3 gap-x-4">
        <View className="flex-1">
          <Text className="text-subtext text-xs mb-0.5">Volume Surge</Text>
          <Text style={{ color: surgeColor }} className="text-sm font-bold">
            {item.volume_surge_pct >= 0 ? "+" : ""}
            {item.volume_surge_pct.toFixed(1)}%
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-subtext text-xs mb-0.5">Price 20d</Text>
          <Text style={{ color: priceColor }} className="text-sm font-bold">
            {item.price_change_pct >= 0 ? "+" : ""}
            {item.price_change_pct.toFixed(1)}%
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-subtext text-xs mb-0.5">Avg Vol (20d)</Text>
          <Text className="text-text text-sm font-medium">
            {formatVolume(item.avg_volume_20d)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function SectorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { sector } = route.params;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["topStocks", sector],
    queryFn: () => fetchTopStocks(sector),
    staleTime: 5 * 60 * 1000,
  });

  const handleStockPress = useCallback(
    (symbol: string, sec: string) => {
      navigation.navigate("StockDetail", { symbol, sector: sec });
    },
    [navigation]
  );

  if (isLoading) {
    return <LoadingOverlay message={`Loading top stocks for ${sector}…`} />;
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as Error)?.message ?? "Failed to load stocks."}
        onRetry={refetch}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item, index }: ListRenderItemInfo<TopStock>) => (
          <StockCard
            item={item}
            rank={index + 1}
            onPress={handleStockPress}
          />
        )}
        ListHeaderComponent={
          <View className="px-4 pt-4 pb-2">
            <Text className="text-text text-2xl font-bold">{sector}</Text>
            <Text className="text-subtext text-sm mt-1">
              Top stocks by volume surge (20d vs 3m avg)
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="px-4 py-8 items-center">
            <Text className="text-subtext text-sm">No data available.</Text>
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
