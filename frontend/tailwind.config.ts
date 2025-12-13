import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        heatPrimary: "#FF8A3D",
        heatDanger: "#FF2E63",
        heatCool: "#3AA6FF"
      }
    }
  },
  plugins: []
} satisfies Config;






