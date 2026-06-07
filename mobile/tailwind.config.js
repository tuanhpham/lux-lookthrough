/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0d0d0d",
        surface: "#1a1a1a",
        card: "#242424",
        border: "#333333",
        primary: "#00c896",
        "primary-dim": "#00c89620",
        danger: "#ff4d4d",
        "danger-dim": "#ff4d4d20",
        warning: "#f5a623",
        muted: "#666666",
        text: "#f0f0f0",
        subtext: "#999999",
      },
    },
  },
  plugins: [],
};
