import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = import.meta.dirname;

// The content pages live at /research/, /people/, /about/ (directory + index).
// In dev, requesting the slash-less form (/people) falls through to the root
// index.html instead of the page. This plugin redirects /people -> /people/ so
// dev matches GitHub Pages, which auto-adds the trailing slash in production.
const PAGE_DIRS = ['research', 'people', 'about', 'manybody', 'spritelab', 'froggame'];
function trailingSlashRedirect() {
  return {
    name: 'trailing-slash-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        const name = url.replace(/^\//, '');
        if (PAGE_DIRS.includes(name)) {
          res.statusCode = 301;
          res.setHeader('Location', url + '/');
          return res.end();
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [trailingSlashRedirect()],
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
        // Multi-page app: the WebGL homepage, the content pages, and the
        // frozen /manybody demo.
        main: resolve(root, 'index.html'),
        research: resolve(root, 'research/index.html'),
        people: resolve(root, 'people/index.html'),
        about: resolve(root, 'about/index.html'),
        manybody: resolve(root, 'manybody/index.html'),
        // Unlinked builder tool for the cube sprites.
        spritelab: resolve(root, 'spritelab/index.html'),
        // Dev harness for the frog game.
        froggame: resolve(root, 'froggame/index.html'),
      },
    },
  },
});
