import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#fcf9f4",
        "surface-container": "#f0ede8",
        "surface-container-low": "#f6f3ee",
        "surface-container-high": "#ebe8e3",
        primary: "#004c22",
        "primary-container": "#166534",
        secondary: "#ac3400",
        "on-surface": "#1c1c19",
        "on-surface-variant": "#404940",
        outline: "#707a6f",
      },
      fontFamily: {
        heading: ["Epilogue", "system-ui", "sans-serif"],
        body: ["Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
