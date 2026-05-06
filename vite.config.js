import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite config for the dart tournament app.
 *
 * React plugin enables JSX and Fast Refresh during development.
 * VitePWA plugin auto-generates the service worker and injects the web app manifest.
 */
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // 'autoUpdate' means the service worker updates silently in the background
      // and the new version activates the next time the user opens the app.
      registerType: 'autoUpdate',

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

      // Workbox configuration - controls how assets and API responses are cached
      workbox: {
        // Precache all built JS/CSS/HTML assets so the app shell loads offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Runtime caching rules for live network requests
        runtimeCaching: [
          {
            // Cache Supabase REST API responses (bracket data, standings, etc.)
            // NetworkFirst: try network first, fall back to cache if offline.
            // Players see live data when online and last-known data when offline.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Cache Google Fonts if used in the future
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
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
