/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (uvicorn on :8000, or the `backend` service in
// docker compose); Vite proxies /api to it so the browser only ever talks to one origin.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
