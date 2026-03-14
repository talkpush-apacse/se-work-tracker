import { RefreshCw, WifiOff, X } from 'lucide-react';

/**
 * Fixed banners for PWA update detection and offline state.
 * Rendered at the top of the viewport, above all other content.
 */
export function UpdateBanner({ onReload, onDismiss }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 bg-brand-lavender/90 backdrop-blur-sm text-white px-4 py-2.5 shadow-lg shadow-brand-lavender/20 text-sm animate-in slide-in-from-top duration-300">
      <RefreshCw size={14} className="shrink-0" />
      <span className="font-medium">New update available</span>
      <button
        onClick={onReload}
        className="ml-1 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
      >
        Reload
      </button>
      <button
        onClick={onDismiss}
        className="ml-auto p-1 rounded-full hover:bg-white/20 transition-colors"
        aria-label="Dismiss update banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-600/90 backdrop-blur-sm text-white px-4 py-2 shadow-lg text-sm">
      <WifiOff size={14} className="shrink-0" />
      <span className="font-medium">You're offline</span>
    </div>
  );
}
