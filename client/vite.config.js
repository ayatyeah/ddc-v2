import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';

// Фронт собирается в ../public, откуда его раздаёт Express (server.js).
// В режиме разработки /api проксируется на бэкенд (node server.js на :3000).
export default defineConfig({
  plugins: [
    react(),
    // PWA / Service Worker: офлайн + мгновенная повторная загрузка («как приложение»).
    // • injectRegister: 'script-defer' — регистрация внешним /registerSW.js (инлайн-скрипт
    //   запрещён нашим строгим CSP scriptSrc 'self').
    // • manifest: false — используем уже существующий /manifest.webmanifest.
    // • /api никогда не кэшируется; autoUpdate тихо обновляет SW при новом деплое.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: false,
      includeAssets: ['favicon.svg', 'logo_ddc.svg', 'manifest.webmanifest'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
    // Предсжатие ассетов: сервер отдаёт .br/.gz (express-static-gzip) — меньше трафик.
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Стабильные vendor-чанки кэшируются браузером между деплоями: при обновлении
        // нашего кода большие библиотеки (three/react) повторно не качаются.
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
