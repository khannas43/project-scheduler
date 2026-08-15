import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Allow ngrok / similar tunnels for temporary public demos.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      // Cookie path is /api/auth — same-origin in dev via this proxy.
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
      // Liveness / readiness for login API-down hint (not under /api).
      '/health': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
