import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 100000000 },
  test: { include: ["tests/unit/**/*.test.ts"] },
} as any);
