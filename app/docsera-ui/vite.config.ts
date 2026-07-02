import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    lib: {
      entry: "src/main.tsx",
      name: "DocseraDirectUiPageRuntime",
      formats: ["iife"],
      fileName: () => "docsera-runtime.js"
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name === "style.css" ? "docsera-runtime.css" : "assets/[name][extname]"
      }
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts"
  }
});
