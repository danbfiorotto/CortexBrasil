import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "charcoal-bg": "#18181b",
        "graphite-card": "#232326",
        "graphite-border": "#3f3f46",
        "emerald-vibrant": "#10b981",
        "crimson-bright": "#f43f5e",
        "royal-purple": "#8b5cf6",
        "crisp-white": "#ffffff",
        "slate-low": "#a1a1aa",
        "carbon-950": "#0a0a0a",
        "carbon-900": "#121214",
        "carbon-800": "#1c1c1f",
        "graphite-700": "#2d2d30",
        "graphite-600": "#3f3f43",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
    },
  },
  plugins: [require("@headlessui/tailwindcss")],
};

export default config;
