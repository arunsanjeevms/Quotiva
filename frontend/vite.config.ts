import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Served from the root on Render (and in dev). Deep links are handled by the
  // host rewriting every path to index.html — see render.yaml — not by any
  // client-side path rewriting.
  base: '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
});
