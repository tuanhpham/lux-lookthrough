import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";

import { HomeScreen } from "@/screens/HomeScreen";
import { SectorScreen } from "@/screens/SectorScreen";
import { PatternScreen } from "@/screens/PatternScreen";
import { ScreenerScreen } from "@/screens/ScreenerScreen";
import { WatchlistScreen } from "@/screens/WatchlistScreen";
import { StockDetailScreen } from "@/screens/StockDetailScreen";
import type {
  RootTabParamList,
  HomeStackParamList,
  PatternStackParamList,
  ScreenerStackParamList,
  WatchlistStackParamList,
} from "@/types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const PatternStack = createNativeStackNavigator<PatternStackParamList>();
const ScreenerStack = createNativeStackNavigator<ScreenerStackParamList>();
const WatchlistStack = createNativeStackNavigator<WatchlistStackParamList>();

const DARK_HEADER = {
  headerStyle: { backgroundColor: "#1a1a1a" },
  headerTintColor: "#f0f0f0",
  headerTitleStyle: { fontWeight: "700" as const },
};

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={DARK_HEADER}>
      <HomeStack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{ title: "Industry Scanner" }}
      />
      <HomeStack.Screen
        name="SectorScreen"
        component={SectorScreen}
        options={({ route }) => ({ title: route.params.sector })}
      />
      <HomeStack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={({ route }) => ({ title: route.params.symbol })}
      />
    </HomeStack.Navigator>
  );
}

function ScreenerNavigator() {
  return (
    <ScreenerStack.Navigator screenOptions={{ ...DARK_HEADER, headerShown: false }}>
      <ScreenerStack.Screen name="ScreenerScreen" component={ScreenerScreen} />
      <ScreenerStack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={({ route }) => ({ title: route.params.symbol, headerShown: true })}
      />
    </ScreenerStack.Navigator>
  );
}

function WatchlistNavigator() {
  return (
    <WatchlistStack.Navigator screenOptions={{ ...DARK_HEADER, headerShown: false }}>
      <WatchlistStack.Screen name="WatchlistScreen" component={WatchlistScreen} />
      <WatchlistStack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={({ route }) => ({ title: route.params.symbol, headerShown: true })}
      />
    </WatchlistStack.Navigator>
  );
}

function PatternNavigator() {
  return (
    <PatternStack.Navigator screenOptions={DARK_HEADER}>
      <PatternStack.Screen
        name="PatternScreen"
        component={PatternScreen}
        options={{ title: "Pattern Scanner" }}
      />
      <PatternStack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={({ route }) => ({ title: route.params.symbol })}
      />
    </PatternStack.Navigator>
  );
}

const TAB_META: Record<
  keyof RootTabParamList,
  { label: string; icon: string }
> = {
  Home: { label: "Sectors", icon: "📊" },
  Screener: { label: "Screener", icon: "🔎" },
  Watchlists: { label: "Lists", icon: "⭐" },
  Patterns: { label: "Patterns", icon: "🔍" },
};

export function AppNavigator() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: "#00c896",
          background: "#0d0d0d",
          card: "#1a1a1a",
          text: "#f0f0f0",
          border: "#333333",
          notification: "#00c896",
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => {
          const meta = TAB_META[route.name];
          return {
            headerShown: false,
            tabBarStyle: {
              backgroundColor: "#1a1a1a",
              borderTopColor: "#333333",
            },
            tabBarActiveTintColor: "#00c896",
            tabBarInactiveTintColor: "#666666",
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11, fontWeight: "600" }}>
                {meta.label}
              </Text>
            ),
            tabBarIcon: ({ color }) => (
              <Text style={{ color, fontSize: 20 }}>{meta.icon}</Text>
            ),
          };
        }}
      >
        <Tab.Screen name="Home" component={HomeNavigator} />
        <Tab.Screen name="Screener" component={ScreenerNavigator} />
        <Tab.Screen name="Watchlists" component={WatchlistNavigator} />
        <Tab.Screen name="Patterns" component={PatternNavigator} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
