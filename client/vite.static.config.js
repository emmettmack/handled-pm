// Builds the dashboard as a backend-free demo into site/app (served by GitHub Pages).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const demo = (f) => path.join(root, 'src', 'demo', f);

// server/*.js import './db.js' (native SQLite file); swap in the browser database for this build only.
const browserDb = {
  name: 'browser-db',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === './db.js' && importer && importer.includes(`${path.sep}server${path.sep}`)) return demo('browserDb.js');
  },
};

export default defineConfig({
  root,
  base: './',
  plugins: [browserDb, react()],
  define: { 'process.env': '{}', 'process.argv': '[]', 'import.meta.env.VITE_STATIC': '"1"' },
  resolve: { alias: { '@anthropic-ai/sdk': demo('anthropicStub.js') } },
  build: { outDir: path.join(root, '..', 'site', 'app'), emptyOutDir: true, target: 'esnext' },
});
