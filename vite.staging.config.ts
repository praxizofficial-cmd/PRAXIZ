import { defineConfig, mergeConfig } from "vite";
import vercelConfig from "./vite.vercel.config";

// Keep staging's dependency optimizer separate from the Cloudflare dev runner.
export default mergeConfig(vercelConfig, defineConfig({
  cacheDir: "node_modules/.vite-staging-v26",
  resolve: { dedupe: ["react", "react-dom"] },
}));
