import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  // Load PAYMENTGATE / VITE_PAYMENTGATE from monorepo root `.env` (single source of truth).
  envDir: repoRoot,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react";
          }
          if (id.includes("react-router")) {
            return "router";
          }
          if (id.includes("qrcode")) {
            return "qrcode";
          }
          if (id.includes("@paymentgate/domain")) {
            return "domain";
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
