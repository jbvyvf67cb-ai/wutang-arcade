import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "assets",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  server: {
    host: true,
  },
});
