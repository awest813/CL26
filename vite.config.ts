import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Local dev and `npm run build` stay at /. `npm run build:pages` sets
// VITE_PAGES_BASE so the project site is served from /CL26/.
const pagesBase = process.env.VITE_PAGES_BASE || '/'

/**
 * The oldest browsers the game supports (see "Browser support" in the README). Vite 8's
 * default is Chrome 111, Firefox 114, and Safari 16.4; this reaches back to the iPhones that
 * stop at iOS 15. index.html shows a notice to anything older instead of a blank page.
 */
export const SUPPORTED_BROWSERS = ['es2020', 'chrome100', 'edge100', 'firefox100', 'safari15', 'ios15']

export default defineConfig({
  build: {
    target: SUPPORTED_BROWSERS,
  },
  plugins: [
    react(),
    // Installable, and playable offline: the whole app (every lazily loaded page) is
    // precached, and the career already lives in IndexedDB. A new deploy waits for the
    // player to reload (registerType 'prompt'), so code never changes under a running game.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'graphics/*.svg'],
      manifest: {
        name: 'College Lacrosse Head Coach Sim',
        short_name: 'CL26 Coach',
        description: 'Build a college lacrosse program: recruit, call the game plan, and chase a title. Plays offline.',
        // Relative to the manifest, so both / and /CL26/ builds work.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#102018',
        background_color: '#e7eee8',
        categories: ['games', 'sports'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Any route opened offline boots the app, which then routes on the client.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The font stylesheet changes rarely; serve the cached copy and refresh it.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Font files are immutable once fetched.
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  base: pagesBase,
})
