import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ListRenderItemInfo,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchUniverse, runScreen } from "@/api/screener";
import { ResultCard } from "@/components/ResultCard";
import { ErrorView } from "@/components/ErrorView";
import type { ScreenRow, ScreenerStackParamList } from "@/types";

type Nav = NativeStackNavigationProp<ScreenerStackParamList, "ScreenerScreen">;

const SIGNALS = [
  { value: "", label: "Any signal" },
  { value: "BREAKOUT_IMMINENT", label: "Breakout" },
  { value: "CONSOLIDATING", label: "Consolidating" },
] as const;

export function ScreenerScreen() {
  const navigation = useNavigation<Nav>();

  const [symbolText, setSymbolText] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState("0");
  const [signal, setSignal] = useState<string>("");

  const { data: sectors = [] } = useQuery<string[]>({
    queryKey: ["universe"],
    queryFn: fetchUniverse,
    staleTime: 60 * 60 * 1000,
  });

  const screen = useMutation({
    mutationFn: runScreen,
  });

  const toggleSector = useCallback((s: string) => {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const handleRun = useCallback(() => {
    const symbols = symbolText
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const sectorList = Array.from(selectedSectors);
    if (!symbols.length && !sectorList.length) return;
    screen.mutate({
      symbols: symbols.length ? symbols : null,
      sectors: sectorList.length ? sectorList : null,
      min_score: parseFloat(minScore) || 0,
      signals: signal ? [signal] : null,
      sort_by: "score",
      descending: true,
      limit: 200,
    });
  }, [symbolText, selectedSectors, minScore, signal, screen]);

  const openStock = useCallback(
    (symbol: string) => navigation.navigate("StockDetail", { symbol }),
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ScreenRow>) => (
      <ResultCard item={item} onPress={openStock} />
    ),
    [openStock]
  );

  const canRun = symbolText.trim().length > 0 || selectedSectors.size > 0;

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={screen.data?.results ?? []}
        keyExtractor={(item) => item.symbol}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="px-4 pt-4">
            <Text className="text-text text-2xl font-bold">Custom Screener</Text>
            <Text className="text-subtext text-sm mt-1 mb-4">
              Find consolidation &amp; breakout setups across any stocks or sectors.
            </Text>

            {/* Symbols */}
            <Text className="text-subtext text-xs font-semibold uppercase mb-1">
              Symbols (comma separated)
            </Text>
            <TextInput
              value={symbolText}
              onChangeText={setSymbolText}
              placeholder="AAPL, MSFT, NVDA"
              placeholderTextColor="#666666"
              autoCapitalize="characters"
              autoCorrect={false}
              className="bg-surface border border-border rounded-lg px-3 py-2.5 text-text mb-4"
            />

            {/* Sector pills */}
            <Text className="text-subtext text-xs font-semibold uppercase mb-2">
              Or pick sectors
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {sectors.map((s: string) => {
                const active = selectedSectors.has(s);
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => toggleSector(s)}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: active ? "#00c89620" : "#1a1a1a",
                      borderColor: active ? "#00c896" : "#333333",
                    }}
                    className="border rounded-full px-3 py-1.5"
                  >
                    <Text
                      style={{ color: active ? "#00c896" : "#999999" }}
                      className="text-xs font-semibold"
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filters */}
            <View className="flex-row gap-x-3 mb-4">
              <View className="flex-1">
                <Text className="text-subtext text-xs font-semibold uppercase mb-1">
                  Min score
                </Text>
                <TextInput
                  value={minScore}
                  onChangeText={setMinScore}
                  keyboardType="number-pad"
                  className="bg-surface border border-border rounded-lg px-3 py-2.5 text-text"
                />
              </View>
              <View className="flex-[2]">
                <Text className="text-subtext text-xs font-semibold uppercase mb-1">
                  Signal
                </Text>
                <View className="flex-row gap-x-2">
                  {SIGNALS.map((s) => {
                    const active = signal === s.value;
                    return (
                      <TouchableOpacity
                        key={s.value || "any"}
                        onPress={() => setSignal(s.value)}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: active ? "#00c89620" : "#1a1a1a",
                          borderColor: active ? "#00c896" : "#333333",
                        }}
                        className="border rounded-lg px-2 py-2.5 flex-1"
                      >
                        <Text
                          style={{ color: active ? "#00c896" : "#999999" }}
                          className="text-[11px] font-semibold text-center"
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Run */}
            <TouchableOpacity
              onPress={handleRun}
              disabled={!canRun || screen.isPending}
              activeOpacity={0.8}
              style={{ opacity: !canRun || screen.isPending ? 0.5 : 1 }}
              className="bg-primary rounded-lg py-3 mb-2 flex-row items-center justify-center"
            >
              {screen.isPending && (
                <ActivityIndicator size="small" color="#0d0d0d" className="mr-2" />
              )}
              <Text className="text-background font-bold">
                {screen.isPending ? "Scanning…" : "Run Screen"}
              </Text>
            </TouchableOpacity>

            {screen.data && (
              <Text className="text-subtext text-xs mb-2">
                {screen.data.matched} match(es) of {screen.data.scanned} scanned.
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          screen.isError ? (
            <ErrorView
              message={(screen.error as Error)?.message ?? "Screen failed."}
              onRetry={handleRun}
            />
          ) : screen.data ? (
            <View className="px-4 py-8 items-center">
              <Text className="text-subtext text-sm text-center">
                No matches. Try lowering the min score or widening filters.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
