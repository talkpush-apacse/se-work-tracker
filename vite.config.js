import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Automatically update the service worker when a new build is deployed
      registerType: 'autoUpdate',

      // Pre-cache all static assets produced by the build
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Ensure old caches are cleaned up on update (fixes stale iOS PWA)
        cleanupOutdatedCaches: true,
        // Never intercept API calls — let them go straight to the network
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
      },

      // Web App Manifest
      manifest: {
        name: 'Personal Work Tracker',
        short_name: 'Work Tracker',
        description: 'Track your personal work tasks and projects',
        theme_color: '#00BFA5',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            // maskable variant required for Android adaptive icons
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // Keep dev mode disabled — test PWA with `npm run build && npm run preview`
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
