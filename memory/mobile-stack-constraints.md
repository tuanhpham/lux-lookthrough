---
name: mobile-stack-constraints
description: lux-lookthrough mobile app — Expo SDK 51 version pins and the NativeWind-path-with-spaces gotcha
metadata:
  type: project
---

The `mobile/` app is Expo SDK 51 (React Native 0.74, reanimated ~3.14). Two hard constraints learned while making it run:

1. **NativeWind must be 4.0.36 + react-native-css-interop 0.0.36** (pinned exact). NativeWind 4.2.5 pulls css-interop 0.2.5, whose `babel.js` unconditionally requires `react-native-worklets/plugin` (reanimated 4 only) — which doesn't exist in this stack, so Metro bundling fails.

2. **NativeWind's Tailwind CLI breaks on paths with spaces.** The repo lives under `C:\Users\PHAMT\OneDrive - Allianz\Documents\...`. NativeWind builds `cliCommand = "node <absolute path>"` then does `.split(" ")`, shattering the path → "Error running TailwindCSS CLI". Fix is in `mobile/metro.config.js`: pass `cliCommand: "node node_modules/tailwindcss/lib/cli.js"` (relative, space-free).

**Why:** These are non-obvious — the errors point at babel/Tailwind internals, not the real cause.

**How to apply:** Don't bump nativewind/css-interop without matching the SDK. Keep the relative `cliCommand` override. Entry point is `index.js` (imports `./global.css` then registerRootComponent) with `"main": "index.js"` — NOT expo-router. Verify changes with `node node_modules/expo/bin/cli export --platform android` (yfinance/network-free). See [[yfinance-ssl-blocked-on-corp-network]].
