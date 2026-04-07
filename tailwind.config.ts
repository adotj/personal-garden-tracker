import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#cec5b8",
        "surface-container": "#b5aca0",
        "surface-container-low": "#c4bbb0",
        "surface-container-high": "#a69d90",
        primary: "#0d4f27",
        "primary-container": "#145e32",
        secondary: "#ac3400",
        "on-surface": "#252219",
        "on-surface-variant": "#3d4540",
        outline: "#5e5a51",
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
