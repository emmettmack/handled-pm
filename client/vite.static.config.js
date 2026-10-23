// Builds the dashboard as a backend-free demo into site/app (served by GitHub Pages).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const demo = (f) => path.join(root, 'src', 'demo', f);

// server/*.js import './db.js' (native SQLite files) and './accounts.js' (Node-only); swap in browser versions for this build only.
const swaps = { './db.js': 'browserDb.js', './accounts.js': 'browserAccounts.js' };
const browserDb = {
  name: 'browser-db',
  enforce: 'pre',
  resolveId(source, importer) {
    if (swaps[source] && importer && importer.includes(`${path.sep}server${path.sep}`)) return demo(swaps[source]);
    if (source === './backend.js' && importer?.endsWith(`${path.sep}src${path.sep}api.js`)) return demo('backend.js');
  },
};

export default defineConfig({
  root,
  base: './',
  plugins: [browserDb, react()],
  define: { 'process.env': '{}', 'process.argv': '[]', 'import.meta.env.VITE_STATIC': '"1"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': 'undefined' },
  resolve: { alias: { '@anthropic-ai/sdk': demo('anthropicStub.js') } },
  build: { outDir: path.join(root, '..', 'site', 'app'), emptyOutDir: true, target: 'esnext' },
});
