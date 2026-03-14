import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── PWA stale-chunk guard ─────────────────────────────────────────────────────
// SW registration + controllerchange reload is handled by useServiceWorker hook.
// This is a defensive fallback — if a dynamic import still fails (e.g. tab was open
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
