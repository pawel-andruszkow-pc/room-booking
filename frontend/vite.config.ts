import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3021,
    host: true,
    // Proxy API calls to the backend so tablets on the LAN can use the dev
    // server with a relative `/api` base (no CORS, no baked-in URL).
    proxy: {
      '/api': {
        target: 'http://localhost:3020',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3021,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
