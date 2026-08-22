import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = import.meta.dirname;

export default defineConfig({
  base: '/',
  server: {
    port: 8000,
    // Rapier ships as WASM; make sure it isn't pre-bundled in a way that breaks init.
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        // Multi-page app: the homepage and the frozen /manybody demo.
        main: resolve(root, 'index.html'),
        manybody: resolve(root, 'manybody/index.html'),
      },
    },
  },
});
