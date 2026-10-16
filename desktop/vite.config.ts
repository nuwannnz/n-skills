// Builds the renderer (src/renderer, React) into dist/renderer, which the main process loads from disk.
// `npm run dev` serves it with hot reload instead (scripts/dev.js).
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The built page only runs its own files. The dev server needs inline scripts for hot reload, so the policy is added at build time only.
const CSP = "default-src 'none'; script-src file:; style-src file: 'unsafe-inline'; img-src file: data:";
const csp = (): Plugin => ({
  name: 'scrumo-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), csp()],
  build: { outDir: '../../dist/renderer', emptyOutDir: true, target: 'chrome130' },
  server: { port: 5183, strictPort: true },
});
