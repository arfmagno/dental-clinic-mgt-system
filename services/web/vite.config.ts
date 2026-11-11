import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The PWA plugin turns the build into an installable, fully offline app: the service worker
// precaches every asset, so after one visit (or install) the app opens with no network.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  // The demo is a static site that may live in a sub-folder (GitHub Pages: /<repo>/).
  const base = demo ? (process.env.DEMO_BASE ?? '/') : '/';
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: demo ? 'Magno Dental Clinic (demo)' : 'Magno Dental Clinic',
          short_name: demo ? 'Dental demo' : 'Magno Dental',
          description: 'Patient records, dental charts and procedures. Works offline.',
          start_url: base,
          scope: base,
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
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
      ...(demo ? [spaFallback()] : []),
    ],
    server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      chunkSizeWarningLimit: 900,
      // Fonts ship as files: the server's Content-Security-Policy does not allow data: fonts.
      assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
    },
  };
});

/** Static hosts serve 404.html for unknown paths; a copy of the app makes deep links work there. */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html'));
    },
  };
}
