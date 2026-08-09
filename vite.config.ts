import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "app"),
  publicDir: resolve(import.meta.dirname, "app/public"),
  plugins: [svelte({ configFile: resolve(import.meta.dirname, "svelte.config.js") })],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
  },
});
