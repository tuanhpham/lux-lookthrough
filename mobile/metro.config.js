// Metro config wired for NativeWind v4 — processes global.css through Tailwind.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// NativeWind's default `cliCommand` is `node <absolute path to tailwind cli>`,
// which it naively splits on spaces. When the project lives under a path that
// contains spaces (e.g. "OneDrive - Allianz"), that split corrupts the command
// and the Tailwind build fails. Passing a relative, space-free command avoids
// it — Metro runs from the project root so the relative path resolves.
module.exports = withNativeWind(config, {
  input: "./global.css",
  cliCommand: "node node_modules/tailwindcss/lib/cli.js",
});
