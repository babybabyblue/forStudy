/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages（https://<user>.github.io/forStudy/）で公開する場合は BASE_PATH=/forStudy/ でビルド
const base = process.env.BASE_PATH ?? "./";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["figures/*.png", "icon.svg", "apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "鑑定評価理論 暗記トレーナー",
        short_name: "鑑定暗記",
        description: "不動産鑑定評価基準・留意事項を6か月で覚えるための学習アプリ",
        lang: "ja",
        theme_color: "#1f4e79",
        background_color: "#ffffff",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
