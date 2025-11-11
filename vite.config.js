import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        content: "src/content.jsx",
        openpanel: "src/openpanel.js",
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "assets/[name].[ext]",
        format: "es",
        inlineDynamicImports: false,
      },
    },
  },
});
