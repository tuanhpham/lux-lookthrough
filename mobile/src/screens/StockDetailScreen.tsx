import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { CandlestickChart } from "react-native-wagmi-charts";

import { fetchOHLCV } from "@/api/stocks";
import { scanSymbol } from "@/api/patterns";
import { ScoreBar } from "@/components/ScoreBar";
import { SignalBadge } from "@/components/SignalBadge";
import { StatRow } from "@/components/StatRow";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ErrorView } from "@/components/ErrorView";
import type { HomeStackParamList, Candle } from "@/types";

type Route = RouteProp<HomeStackParamList, "StockDetail">;

const PERIODS = ["1mo", "3mo", "6mo", "1y"] as const;
type Period = (typeof PERIODS)[number];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatMillions(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  return v.toFixed(2);
}

export function StockDetailScreen() {
  const route = useRoute<Route>();
  const { symbol, sector } = route.params;

  const [period, setPeriod] = useState<Period>("6mo");

  // OHLCV for chart
  const {
    data: ohlcv,
    isLoading: ohlcvLoading,
    isError: ohlcvError,
    refetch: refetchOHLCV,
    error: ohlcvErr,
  } = useQuery({
    queryKey: ["ohlcv", symbol, period],
    queryFn: () => fetchOHLCV(symbol, period),
    staleTime: 5 * 60 * 1000,
  });

  // Pattern signal
  const {
    data: signal,
    isLoading: signalLoading,
    isError: signalError,
    error: signalErr,
  } = useQuery({
    queryKey: ["signal", symbol],
    queryFn: () => scanSymbol(symbol, sector),
    staleTime: 10 * 60 * 1000,
  });

  if (ohlcvLoading) {
    return <LoadingOverlay message={`Loading ${symbol}…`} />;
  }

  if (ohlcvError) {
    return (
      <ErrorView
        message={(ohlcvErr as Error)?.message ?? "Failed to load chart data."}
        onRetry={refetchOHLCV}
      />
    );
  }

  // Convert candles to wagmi-charts format
  const chartData = (ohlcv?.candles ?? []).map((c: Candle) => ({
    timestamp: new Date(c.date).getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

  const lastCandle = ohlcv?.candles.at(-1);
  const firstCandle = ohlcv?.candles.at(0);
  const periodChange =
    lastCandle && firstCandle
      ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
      : null;

  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
      {/* Symbol header */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-text text-3xl font-bold">{symbol}</Text>
          {lastCandle && (
            <Text className="text-text text-xl font-semibold">
              ${lastCandle.close.toFixed(2)}
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-x-3 mt-1">
          {sector && <Text className="text-subtext text-sm">{sector}</Text>}
          {periodChange != null && (
            <Text
              style={{ color: periodChange >= 0 ? "#00c896" : "#ff4d4d" }}
              className="text-sm font-semibold"
            >
              {periodChange >= 0 ? "+" : ""}
              {periodChange.toFixed(1)}% ({period})
            </Text>
          )}
        </View>
      </View>

      {/* Period selector */}
      <View className="flex-row px-4 mb-3 gap-x-2">
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            style={{
              backgroundColor: period === p ? "#00c896" : "#242424",
              borderColor: period === p ? "#00c896" : "#333333",
            }}
            className="border rounded-lg px-3 py-1"
          >
            <Text
              style={{ color: period === p ? "#0d0d0d" : "#f0f0f0" }}
              className="text-xs font-semibold"
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Candlestick chart */}
      {chartData.length > 0 && (
        <View className="mx-4 mb-4 bg-card rounded-xl overflow-hidden border border-border">
          <CandlestickChart.Provider data={chartData}>
            <CandlestickChart width={SCREEN_WIDTH - 32} height={240}>
              <CandlestickChart.Candles
                positiveColor="#00c896"
                negativeColor="#ff4d4d"
              />
              <CandlestickChart.Crosshair>
                <CandlestickChart.Tooltip />
              </CandlestickChart.Crosshair>
            </CandlestickChart>
          </CandlestickChart.Provider>
        </View>
      )}

      {/* Pattern signal section */}
      <View className="mx-4 mb-4 bg-card rounded-xl p-4 border border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-text font-bold text-base">Pattern Analysis</Text>
          {signalLoading && (
            <ActivityIndicator size="small" color="#00c896" />
          )}
          {signal && <SignalBadge signal={signal.signal} />}
        </View>

        {signalError && (
          <Text className="text-danger text-sm">
            {(signalErr as Error)?.message ?? "Analysis unavailable."}
          </Text>
        )}

        {signal && (
          <>
            <ScoreBar score={signal.score} />

            <View className="mt-3">
              <StatRow label="Stage" value={`${signal.stage} — ${signal.stage_label}`} />
              <StatRow label="Days in Base" value={signal.days_in_base} />
              <StatRow
                label="Price Range %"
                value={
                  signal.price_range_pct != null
                    ? `${signal.price_range_pct.toFixed(1)}%`
                    : null
                }
              />
              <StatRow
                label="ATR Contraction"
                value={
                  signal.atr_contraction_pct != null
                    ? `${signal.atr_contraction_pct.toFixed(1)}%`
                    : null
                }
                valueColor={
                  (signal.atr_contraction_pct ?? 0) > 15 ? "#00c896" : undefined
                }
              />
              <StatRow
                label="Volume Dry-up"
                value={
                  signal.volume_dry_up_pct != null
                    ? `${signal.volume_dry_up_pct.toFixed(1)}%`
                    : null
                }
                valueColor={
                  (signal.volume_dry_up_pct ?? 0) > 20 ? "#00c896" : undefined
                }
              />
              <StatRow label="VCP Contractions" value={signal.vcp_contractions} />
              <StatRow
                label="Pivot High"
                value={
                  signal.pivot_high != null
                    ? `$${signal.pivot_high.toFixed(2)}`
                    : null
                }
              />
            </View>

            {/* Trade plan */}
            {signal.entry_price != null && (
              <View className="mt-4">
                <Text className="text-text font-bold text-sm mb-2">
                  Trade Plan
                </Text>
                <View className="flex-row gap-x-2">
                  <View className="flex-1 bg-surface rounded-lg p-3">
                    <Text className="text-subtext text-xs mb-1">Entry</Text>
                    <Text className="text-primary text-base font-bold">
                      ${signal.entry_price.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-1 bg-surface rounded-lg p-3">
                    <Text className="text-subtext text-xs mb-1">Stop Loss</Text>
                    <Text className="text-danger text-base font-bold">
                      ${signal.stop_loss?.toFixed(2) ?? "—"}
                    </Text>
                  </View>
                  <View className="flex-1 bg-surface rounded-lg p-3">
                    <Text className="text-subtext text-xs mb-1">Target</Text>
                    <Text className="text-warning text-base font-bold">
                      {signal.target_price != null
                        ? `$${signal.target_price.toFixed(2)}`
                        : "—"}
                    </Text>
                  </View>
                </View>
                {signal.risk_reward != null && (
                  <View className="mt-2 bg-primary-dim rounded-lg p-3">
                    <Text className="text-primary text-center font-bold">
                      R:R Ratio — {signal.risk_reward}× reward per 1× risk
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>

      <View className="h-8" />
    </ScrollView>
  );
}
