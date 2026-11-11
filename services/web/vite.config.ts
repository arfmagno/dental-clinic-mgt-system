import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The PWA plugin turns the build into an installable, fully offline app: the service worker
// precaches every asset, so after one visit (or install) the app opens with no network.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Magno Dental Clinic',
        short_name: 'Magno Dental',
        description: 'Patient records, dental charts and procedures. Works offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f7f7',
        theme_color: '#0d9488',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  build: {
    chunkSizeWarningLimit: 900,
    // Fonts ship as files: the server's Content-Security-Policy does not allow data: fonts.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
});
