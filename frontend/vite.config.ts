import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// GitHub Pages serves this as a project site at /<repo>/, so assets need that
// prefix baked in at build time. Local dev and any other host (Render static
// site, Vercel, Netlify, a custom domain) serve from the root, so this only
// activates when the deploy workflow sets GITHUB_PAGES=true.
const base = process.env['GITHUB_PAGES'] === 'true' ? '/Quotiva/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
});
