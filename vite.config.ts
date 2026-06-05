// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves a project site under `/<repo>/`, so a relative base keeps
// asset URLs working without hard-coding the deployment path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // The app makes zero network requests at runtime — user PDFs are read in
      // memory and never fetched — so precaching the app shell is all that is
      // needed for full offline use, and there is no user data to cache.
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,wasm,webmanifest}'],
        // The bundled pdf.js worker is ~1.2 MB; raise the cap so it precaches.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'PDF → CBZ',
        short_name: 'PDF → CBZ',
        description: 'Convert a PDF into a CBZ comic archive entirely in your browser.',
        theme_color: '#4338ca',
        background_color: '#4338ca',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
