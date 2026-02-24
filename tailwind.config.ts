import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f8f6ef",
          100: "#efe9da",
          500: "#3f6a50",
          600: "#345942",
          700: "#2b4a36"
        },
        clay: {
          50: "#faf3ed",
          100: "#f2e1d2",
          500: "#bf6e47",
          600: "#a65d3a"
        },
        moss: {
          100: "#e6efe9",
          500: "#507159",
          700: "#3c5643"
        }
      }
    }
  },
  plugins: []
};

export default config;
