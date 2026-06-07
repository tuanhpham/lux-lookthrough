import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  ListRenderItemInfo,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  fetchWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  screenWatchlist,
} from "@/api/screener";
import { ResultCard } from "@/components/ResultCard";
import { ErrorView } from "@/components/ErrorView";
import type {
  ScreenRow,
  WatchlistCollection,
  WatchlistStackParamList,
} from "@/types";

type Nav = NativeStackNavigationProp<WatchlistStackParamList, "WatchlistScreen">;

export function WatchlistScreen() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [symbolText, setSymbolText] = useState("");
  const [nameModal, setNameModal] = useState<{
    mode: "create" | "rename";
    value: string;
    id?: number;
  } | null>(null);

  const { data: lists = [], isLoading, isError, error, refetch } = useQuery<
    WatchlistCollection[]
  >({
    queryKey: ["watchlists"],
    queryFn: fetchWatchlists,
  });

  // Keep an active list selected as data loads / changes.
  useEffect(() => {
    if (!lists.length) return;
    if (!lists.some((l: WatchlistCollection) => l.id === activeId))
      setActiveId(lists[0].id);
  }, [lists, activeId]);

  const active: WatchlistCollection | undefined =
    lists.find((l: WatchlistCollection) => l.id === activeId) ?? lists[0];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlists"] });

  const addSym = useMutation({
    mutationFn: (symbol: string) => addWatchlistSymbol(symbol, active!.id),
    onSuccess: () => {
      setSymbolText("");
      invalidate();
    },
    onError: (e: Error) => Alert.alert("Couldn't add symbol", e.message),
  });

  const removeSym = useMutation({
    mutationFn: (symbol: string) => removeWatchlistSymbol(symbol, active!.id),
    onSuccess: invalidate,
  });

  const createList = useMutation({
    mutationFn: createWatchlist,
    onSuccess: (wl) => {
      setActiveId(wl.id);
      invalidate();
    },
    onError: (e: Error) => Alert.alert("Couldn't create list", e.message),
  });

  const renameList = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameWatchlist(id, name),
    onSuccess: invalidate,
    onError: (e: Error) => Alert.alert("Couldn't rename", e.message),
  });

  const deleteList = useMutation({
    mutationFn: deleteWatchlist,
    onSuccess: () => {
      setActiveId(null);
      invalidate();
    },
  });

  const screen = useMutation({
    mutationFn: () => screenWatchlist(active!.id, { sort_by: "score", limit: 200 }),
  });

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

  const submitName = () => {
    if (!nameModal) return;
    const name = nameModal.value.trim();
    if (!name) return;
    if (nameModal.mode === "create") createList.mutate(name);
    else if (nameModal.id != null) renameList.mutate({ id: nameModal.id, name });
    setNameModal(null);
  };

  const confirmDelete = (list: WatchlistCollection) => {
    Alert.alert("Delete watchlist", `Delete "${list.name}" and its symbols?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteList.mutate(list.id),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#00c896" />
      </View>
    );
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as Error)?.message ?? "Failed to load watchlists."}
        onRetry={refetch}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={screen.data?.results ?? []}
        keyExtractor={(item) => item.symbol}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="px-4 pt-4">
            <Text className="text-text text-2xl font-bold">My Watchlists</Text>
            <Text className="text-subtext text-sm mt-1 mb-3">
              Organize favorites into multiple lists and screen each in one tap.
            </Text>

            {/* List tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
              className="mb-3"
            >
              {lists.map((l: WatchlistCollection) => {
                const isActive = l.id === active?.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    onPress={() => {
                      setActiveId(l.id);
                      screen.reset();
                    }}
                    onLongPress={() =>
                      setNameModal({ mode: "rename", value: l.name, id: l.id })
                    }
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: isActive ? "#00c89620" : "#1a1a1a",
                      borderColor: isActive ? "#00c896" : "#333333",
                    }}
                    className="border rounded-xl px-3 py-2 mr-2 flex-row items-center"
                  >
                    <Text
                      style={{ color: isActive ? "#00c896" : "#f0f0f0" }}
                      className="text-sm font-semibold"
                    >
                      {l.name}
                    </Text>
                    <View
                      style={{ backgroundColor: isActive ? "#00c89633" : "#333333" }}
                      className="ml-2 rounded-full px-2 py-0.5"
                    >
                      <Text
                        style={{ color: isActive ? "#00c896" : "#999999" }}
                        className="text-[10px] font-bold"
                      >
                        {l.count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setNameModal({ mode: "create", value: "" })}
                activeOpacity={0.7}
                className="border border-dashed border-muted rounded-xl px-3 py-2 flex-row items-center"
              >
                <Text className="text-subtext text-sm font-semibold">＋ New</Text>
              </TouchableOpacity>
            </ScrollView>

            {active && lists.length > 1 && (
              <View className="flex-row gap-x-4 mb-3">
                <TouchableOpacity
                  onPress={() =>
                    setNameModal({ mode: "rename", value: active.name, id: active.id })
                  }
                >
                  <Text className="text-subtext text-xs">✎ Rename "{active.name}"</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDelete(active)}>
                  <Text className="text-danger text-xs">× Delete list</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Add symbol */}
            <View className="flex-row gap-x-2 mb-3">
              <TextInput
                value={symbolText}
                onChangeText={setSymbolText}
                placeholder="Add symbol e.g. AMD"
                placeholderTextColor="#666666"
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={() =>
                  symbolText.trim() && addSym.mutate(symbolText.trim().toUpperCase())
                }
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2.5 text-text"
              />
              <TouchableOpacity
                onPress={() =>
                  symbolText.trim() && addSym.mutate(symbolText.trim().toUpperCase())
                }
                disabled={!symbolText.trim() || !active}
                style={{ opacity: !symbolText.trim() || !active ? 0.5 : 1 }}
                className="bg-primary rounded-lg px-4 justify-center"
              >
                <Text className="text-background font-bold">Add</Text>
              </TouchableOpacity>
            </View>

            {/* Symbol chips */}
            <View className="flex-row flex-wrap gap-2 mb-3">
              {(active?.items ?? []).length === 0 ? (
                <Text className="text-subtext text-sm">
                  No symbols yet — add some above.
                </Text>
              ) : (
                active!.items.map((i) => (
                  <View
                    key={i.id}
                    className="flex-row items-center bg-surface border border-border rounded-full pl-3 pr-1.5 py-1"
                  >
                    <TouchableOpacity onPress={() => openStock(i.symbol)}>
                      <Text className="text-text text-sm font-semibold">
                        {i.symbol}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeSym.mutate(i.symbol)}
                      className="ml-1.5 w-5 h-5 items-center justify-center"
                    >
                      <Text className="text-danger font-bold">×</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* Screen all */}
            <TouchableOpacity
              onPress={() => screen.mutate()}
              disabled={!active?.items?.length || screen.isPending}
              activeOpacity={0.8}
              style={{
                opacity: !active?.items?.length || screen.isPending ? 0.5 : 1,
              }}
              className="border border-primary rounded-lg py-3 mb-2 flex-row items-center justify-center"
            >
              {screen.isPending && (
                <ActivityIndicator size="small" color="#00c896" className="mr-2" />
              )}
              <Text className="text-primary font-bold">
                {screen.isPending ? "Screening…" : "Screen All"}
              </Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      {/* Name input modal (create / rename) */}
      <Modal
        visible={nameModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModal(null)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-8">
          <View className="w-full bg-card border border-border rounded-2xl p-5">
            <Text className="text-text font-bold text-base mb-3">
              {nameModal?.mode === "create" ? "New watchlist" : "Rename watchlist"}
            </Text>
            <TextInput
              value={nameModal?.value ?? ""}
              onChangeText={(v) =>
                setNameModal((m) => (m ? { ...m, value: v } : m))
              }
              placeholder="Watchlist name"
              placeholderTextColor="#666666"
              autoFocus
              onSubmitEditing={submitName}
              className="bg-surface border border-border rounded-lg px-3 py-2.5 text-text mb-4"
            />
            <View className="flex-row justify-end gap-x-3">
              <TouchableOpacity onPress={() => setNameModal(null)} className="px-4 py-2">
                <Text className="text-subtext font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitName}
                className="bg-primary rounded-lg px-4 py-2"
              >
                <Text className="text-background font-bold">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
