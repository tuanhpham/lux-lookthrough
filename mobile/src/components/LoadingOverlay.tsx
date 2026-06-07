import React from "react";
import { View, ActivityIndicator, Text } from "react-native";

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = "Loading…" }: LoadingOverlayProps) {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator size="large" color="#00c896" />
      <Text className="text-subtext mt-3 text-sm">{message}</Text>
    </View>
  );
}
