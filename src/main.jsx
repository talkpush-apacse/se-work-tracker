import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── PWA stale-chunk guard ─────────────────────────────────────────────────────
// Layer 1: when the SW updates and claims this client (skipWaiting + clientsClaim),
// reload immediately so lazy-import URLs reference the new build's hashed filenames.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Layer 2: defensive fallback — if a dynamic import still fails (e.g. tab was open
// before the SW first registered), reload once. sessionStorage flag prevents loops.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (msg.includes('dynamically imported module') || msg.includes('Failed to fetch')) {
    if (!sessionStorage.getItem('__chunkReloaded')) {
      sessionStorage.setItem('__chunkReloaded', '1');
      window.location.reload();
    }
  }
});
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
