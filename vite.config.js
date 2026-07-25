import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the same bundle works on GitHub Pages (/skiply-scan/)
// today and on Vercel (/) later — no per-host config.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Skiply Scan",
        short_name: "Skiply",
        description: "Identify · Value · Route — on-device footwear scanning. No cloud, no per-scan cost.",
        theme_color: "#04070d",
        background_color: "#04070d",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // Transformers.js runtime + onnxruntime-web wasm from jsdelivr
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "skiply-cdn",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // ONNX model weights + tokenizer/config JSONs. Transformers.js
            // keeps its own Cache API copy too; this catches every host the
            // Hub redirects to (cdn-lfs*.huggingface.co, *.hf.co bridges).
            urlPattern: /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "skiply-model",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
