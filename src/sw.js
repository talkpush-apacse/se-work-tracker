import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ─── Precache static assets (injected by vite-plugin-pwa at build time) ───
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── SPA navigation fallback ───
const navHandler = createHandlerBoundToURL('/index.html');
const navRoute = new NavigationRoute(navHandler, {
  denylist: [/^\/api\//],
});
registerRoute(navRoute);

// ─── Stale-while-revalidate for API responses (30s TTL) ───
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache-v2',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30,
      }),
    ],
  })
);

// ─── Listen for skipWaiting messages from the client ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
