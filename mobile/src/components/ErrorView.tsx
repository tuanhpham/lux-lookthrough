import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

interface ErrorViewProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorView({
  message = "Something went wrong.",
  onRetry,
}: ErrorViewProps) {
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-danger text-base text-center mb-4">{message}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          className="bg-surface border border-border px-5 py-2 rounded-lg"
        >
          <Text className="text-text">Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
