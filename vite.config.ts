import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { CHAPTER_COUNT } from "./src/lib/navigation/journey.ts";

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_RELEASE": JSON.stringify(`genomewalk@${new Date().toISOString()}`),
  },
  plugins: [
    {
      name: "raw-compressed-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (/^\/(?:samples|ref)\/[^?]*\.gz(?:\?|$)/.test(req.url || "")) {
            // These are gzip files read by the app, including exact BGZF ranges.
            // Override Vite's inferred encoding so fetch keeps their raw bytes.
            res.setHeader("Content-Encoding", "identity");
            res.setHeader("Content-Type", "application/gzip");
          }
          next();
        });
      },
    },
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
