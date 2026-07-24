import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, 'benchmark'),
  server: {
    port: 5173,
    open: false,
  },
  resolve: {
    alias: {
      '@pkg/gantt': path.join(root, 'src'),
    },
  },
});
