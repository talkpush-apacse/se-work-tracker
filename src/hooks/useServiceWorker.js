import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Registers the service worker, detects waiting updates, and tracks online/offline.
 *
 * Returns:
 *   needsUpdate  — true when a new SW is waiting to activate
 *   isOffline    — true when navigator.onLine is false
 *   applyUpdate  — sends SKIP_WAITING to the waiting SW (triggers controllerchange → reload)
 *   dismissUpdate — hides the banner (re-appears if still pending after 60s)
 */
export function useServiceWorker() {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const waitingSW = useRef(null);
  const dismissTimer = useRef(null);

  // ── Online / Offline ──
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // ── Service Worker Registration ──
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Check if there's already a waiting worker (e.g. from a previous visit)
        if (reg.waiting) {
          waitingSW.current = reg.waiting;
          setNeedsUpdate(true);
        }

        // Listen for new service workers that finish installing
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener('statechange', () => {
            // installed + waiting = new version ready, old one still active
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              waitingSW.current = newSW;
              setNeedsUpdate(true);
            }
          });
        });

        // Periodically check for updates (every 60s in standalone PWA mode)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
          || navigator.standalone === true;
        const interval = setInterval(() => reg.update(), isStandalone ? 60_000 : 300_000);
        return () => clearInterval(interval);
      } catch (err) {
        console.warn('[SW] Registration failed:', err);
      }
    }

    // Capture the cleanup function from the async register() — it returns
    // () => clearInterval(interval) once registration succeeds. Without this,
    // the update-check interval leaks and runs forever after unmount.
    let swCleanup = null;
    register().then(fn => { swCleanup = fn; });

    // When the new SW activates (after skipWaiting), reload the page
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    return () => swCleanup?.();
  }, []);

  // ── Apply Update ──
  const applyUpdate = useCallback(() => {
    if (waitingSW.current) {
      waitingSW.current.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  // ── Dismiss Update (re-shows after 60s if still pending) ──
  const dismissUpdate = useCallback(() => {
    setNeedsUpdate(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      if (waitingSW.current) setNeedsUpdate(true);
    }, 60_000);
  }, []);

  return { needsUpdate, isOffline, applyUpdate, dismissUpdate };
}
