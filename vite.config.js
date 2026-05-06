import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite config for the dart tournament app.
 *
 * React plugin enables JSX and Fast Refresh during development.
 * VitePWA plugin generates the service worker using the injectManifest
 * strategy, which takes our custom sw-src.js and injects the precache
 * manifest into it at build time.
 *
 * WHY injectManifest instead of generateSW:
 * The generateSW strategy uses importScripts('/sw-push.js') to add push
 * handlers, which causes a blocking network fetch every time the service
 * worker restarts (~30s idle timeout). This was causing 16-second load
 * delays. With injectManifest, all code lives in a single self-contained
 * sw.js with no external dependencies.
 */
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // 'autoUpdate' silently updates the SW in the background
      registerType: 'autoUpdate',

      // Use injectManifest so we can write a fully custom SW source file.
      // vite-plugin-pwa will inject the precache manifest into self.__WB_MANIFEST
      // and output the final sw.js to dist/.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-src.js',

      // Include key static assets in the service worker precache
      includeAssets: [
        'favicon.ico',
        'icons/apple-touch-icon.png',
        'icons/icon-192x192.png',
        'icons/icon-512x512.png',
      ],

      // Web App Manifest - controls how the app appears when installed on a device
      manifest: {
        name: 'Darts @ LIT',
        short_name: 'LIT Darts',
        description: 'Weekly soft-tip dart tournament tracker with live brackets and season standings',
        theme_color: '#FF4500',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },

      // injectManifest config: tell Workbox which files to precache
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
