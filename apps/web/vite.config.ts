import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  // Load CRYPTOGATE / VITE_CRYPTOGATE from monorepo root `.env` (single source of truth).
  envDir: repoRoot,
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
