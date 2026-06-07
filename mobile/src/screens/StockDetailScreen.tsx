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

import { fetchOHLCV, fetchFundamentals, fetchFinancials } from "@/api/stocks";
import { scanSymbol } from "@/api/patterns";
import { ScoreBar } from "@/components/ScoreBar";
import { SignalBadge } from "@/components/SignalBadge";
import { StatRow } from "@/components/StatRow";
import { MiniBarChart } from "@/components/MiniBarChart";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ErrorView } from "@/components/ErrorView";
import type { HomeStackParamList, Candle, FinancialPoint } from "@/types";

type Route = RouteProp<HomeStackParamList, "StockDetail">;

const PERIODS = [
  { label: "6M", period: "6mo" },
  { label: "1Y", period: "1y" },
  { label: "2Y", period: "2y" },
  { label: "5Y", period: "5y" },
] as const;
type Period = (typeof PERIODS)[number]["period"];

type Metric = "revenue" | "net_income" | "eps";
type Freq = "annual" | "quarterly";

const METRICS: { key: Metric; label: string; money: boolean }[] = [
  { key: "revenue", label: "Revenue", money: true },
  { key: "net_income", label: "Profit", money: true },
  { key: "eps", label: "EPS", money: false },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatBig(v: number | null | undefined): string {
  if (v == null) return "—";
  return formatMoney(v);
}

// Period-end date -> compact axis label (e.g. "2024", "Q3 '24").
function periodLabel(period: string, freq: Freq): string {
  const d = new Date(period);
  if (isNaN(d.getTime())) return period;
  const year = String(d.getFullYear()).slice(2);
  if (freq === "annual") return String(d.getFullYear());
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} '${year}`;
}

export function StockDetailScreen() {
  const route = useRoute<Route>();
  const { symbol, sector } = route.params;

  const [period, setPeriod] = useState<Period>("1y");
  const [metric, setMetric] = useState<Metric>("revenue");
  const [freq, setFreq] = useState<Freq>("annual");

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

  const { data: fundamentals } = useQuery({
    queryKey: ["fundamentals", symbol],
    queryFn: () => fetchFundamentals(symbol),
    staleTime: 30 * 60 * 1000,
  });

  const { data: financials } = useQuery({
    queryKey: ["financials", symbol],
    queryFn: () => fetchFinancials(symbol),
    staleTime: 30 * 60 * 1000,
  });

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

  const series: FinancialPoint[] = financials?.[freq] ?? [];
  const barData = series.map((pt) => ({
    label: periodLabel(pt.period, freq),
    value: pt[metric],
  }));
  const activeMetric = METRICS.find((m) => m.key === metric)!;

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
          {(fundamentals?.sector || sector) && (
            <Text className="text-subtext text-sm">
              {fundamentals?.sector ?? sector}
            </Text>
          )}
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
            key={p.period}
            onPress={() => setPeriod(p.period)}
            style={{
              backgroundColor: period === p.period ? "#00c896" : "#242424",
              borderColor: period === p.period ? "#00c896" : "#333333",
            }}
            className="border rounded-lg px-3 py-1"
          >
            <Text
              style={{ color: period === p.period ? "#0d0d0d" : "#f0f0f0" }}
              className="text-xs font-semibold"
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Candlestick chart */}
      {chartData.length > 0 ? (
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
      ) : (
        <View className="mx-4 mb-4 bg-card rounded-xl border border-border py-16 items-center">
          <Text className="text-subtext text-sm">No chart data.</Text>
        </View>
      )}

      {/* Fundamentals trend chart */}
      <View className="mx-4 mb-4 bg-card rounded-xl p-4 border border-border">
        <Text className="text-text font-bold text-base mb-3">Fundamentals Trend</Text>

        <View className="flex-row justify-between mb-3">
          <View className="flex-row gap-x-1">
            {METRICS.map((m) => {
              const active = metric === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setMetric(m.key)}
                  style={{
                    backgroundColor: active ? "#00c89620" : "#1a1a1a",
                    borderColor: active ? "#00c896" : "#333333",
                  }}
                  className="border rounded-lg px-2.5 py-1"
                >
                  <Text
                    style={{ color: active ? "#00c896" : "#999999" }}
                    className="text-[11px] font-semibold"
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View className="flex-row gap-x-1">
            {(["annual", "quarterly"] as Freq[]).map((f) => {
              const active = freq === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFreq(f)}
                  style={{
                    backgroundColor: active ? "#00c89620" : "#1a1a1a",
                    borderColor: active ? "#00c896" : "#333333",
                  }}
                  className="border rounded-lg px-2.5 py-1"
                >
                  <Text
                    style={{ color: active ? "#00c896" : "#999999" }}
                    className="text-[11px] font-semibold capitalize"
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <MiniBarChart
          data={barData}
          format={(v) => (activeMetric.money ? formatMoney(v) : v.toFixed(2))}
        />
      </View>

      {/* Fundamentals stats */}
      {fundamentals && (
        <View className="mx-4 mb-4 bg-card rounded-xl p-4 border border-border">
          <Text className="text-text font-bold text-base mb-2">Fundamentals</Text>
          <StatRow label="Market Cap" value={formatBig(fundamentals.market_cap)} />
          <StatRow
            label="P/E"
            value={fundamentals.pe_ratio != null ? fundamentals.pe_ratio.toFixed(1) : null}
          />
          <StatRow
            label="EPS"
            value={fundamentals.eps != null ? `$${fundamentals.eps.toFixed(2)}` : null}
          />
          <StatRow
            label="ROE"
            value={
              fundamentals.roe != null
                ? `${(fundamentals.roe * 100).toFixed(1)}%`
                : null
            }
          />
          <StatRow
            label="Profit Margin"
            value={
              fundamentals.profit_margin != null
                ? `${(fundamentals.profit_margin * 100).toFixed(1)}%`
                : null
            }
          />
          <StatRow
            label="Beta"
            value={fundamentals.beta != null ? fundamentals.beta.toFixed(2) : null}
          />
          <StatRow
            label="52w Range"
            value={
              fundamentals.week52_low != null && fundamentals.week52_high != null
                ? `$${fundamentals.week52_low.toFixed(0)}–${fundamentals.week52_high.toFixed(0)}`
                : null
            }
          />
        </View>
      )}

      {/* Pattern signal section */}
      <View className="mx-4 mb-4 bg-card rounded-xl p-4 border border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-text font-bold text-base">Pattern Analysis</Text>
          {signalLoading && <ActivityIndicator size="small" color="#00c896" />}
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

            {signal.entry_price != null && (
              <View className="mt-4">
                <Text className="text-text font-bold text-sm mb-2">Trade Plan</Text>
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

      {/* About */}
      {fundamentals?.summary && (
        <View className="mx-4 mb-4 bg-card rounded-xl p-4 border border-border">
          <Text className="text-text font-bold text-base mb-2">About</Text>
          <Text className="text-subtext text-sm leading-relaxed">
            {fundamentals.summary}
          </Text>
        </View>
      )}

      <View className="h-8" />
    </ScrollView>
  );
}
