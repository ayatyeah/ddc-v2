import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Фронт собирается в ../public, откуда его раздаёт Express (server.js).
// В режиме разработки /api проксируется на бэкенд (node server.js на :3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
