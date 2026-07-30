import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/market-data-proxy/yahoo-finance": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept: "application/json",
        },
        rewrite: (path) => path.replace(/^\/market-data-proxy\/yahoo-finance/u, ""),
      },
    },
  },
});
