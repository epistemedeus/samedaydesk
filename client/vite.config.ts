import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Single-process model: in dev, Vite serves the SPA on :5173 and proxies /api to the
// Express server on :3000. In prod, Express serves the built dist/ and there is no proxy.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // OGL is dynamically imported (its own chunk, loaded after LCP). GSAP is split by
    // route/usage automatically. Keep the config minimal so types stay clean.
  },
});
