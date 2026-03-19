import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Drop console.log and console.debug calls from production bundles.
  // console.warn and console.error are preserved for runtime error visibility.
  // This uses esbuild's native pure-function elimination — no extra dependencies needed.
  esbuild: {
    pure: ['console.log', 'console.debug'],
  },
  plugins: [
    react(),
    VitePWA({
      // Use our custom service worker (src/sw.js) instead of auto-generated one
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // We handle registration manually via useServiceWorker hook
      injectRegister: false,

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },

      // Web App Manifest
      manifest: {
        name: 'Personal Work Tracker',
        short_name: 'Work Tracker',
        description: 'Track your personal work tasks and projects',
        theme_color: '#FAF6F1',
        background_color: '#FAF6F1',
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
