import { defineConfig } from "vite";

// Relative base so the same bundle works on GitHub Pages (/skiply-scan/)
// today and on Vercel (/) later — no per-host config.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
