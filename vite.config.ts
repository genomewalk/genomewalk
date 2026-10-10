import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { CHAPTER_COUNT } from "./src/lib/navigation/journey.ts";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: false, failOnError: true },
      pages: Array.from({ length: CHAPTER_COUNT }, (_, i) => ({ path: `/chapter/${i + 1}` })),
    }),
    react(),
  ],
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
  // Prerendering must use the same loopback address for listening and fetching.
  preview: { host: "127.0.0.1" },
  server: {
    port: 5282,
    strictPort: true,
    // Native file events can miss edits made from the separate Codex workspace.
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ["**/data/**", "**/dist/**"],
    },
  },
});
