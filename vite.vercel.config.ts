import tailwindcss from "@tailwindcss/postcss";
import { resolve } from "node:path";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Rolldown's current production minifier can rewrite Vinext's module
    // identity helper incorrectly in the generated Vercel SSR function.
    minify: false,
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    alias: {
      tailwindcss: resolve(import.meta.dirname, "node_modules/tailwindcss/index.css"),
    },
  },
  plugins: [
    vinext(),
    nitro({
      preset: "vercel",
      compatibilityDate: "2026-09-02",
      vercel: {
        functions: {
          runtime: "nodejs22.x",
        },
      },
    }),
  ],
});
