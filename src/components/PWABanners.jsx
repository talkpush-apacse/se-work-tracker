import { RefreshCw, WifiOff, X } from 'lucide-react';

/**
 * Fixed banners for PWA update detection and offline state.
 * Rendered at the top of the viewport, above all other content.
 */
export function UpdateBanner({ onReload, onDismiss }) {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 bg-card border-b border-border px-4 py-3 pt-safe shadow-[0_4px_12px_rgba(0,0,0,0.08)] text-sm animate-in slide-in-from-top duration-300">
      <RefreshCw size={14} className="shrink-0 text-primary" />
      <span className="font-medium text-foreground">New update available</span>
      <button
        onClick={onReload}
        className="ml-1 rounded-full bg-primary hover:bg-primary/85 active:bg-primary/75 text-primary-foreground px-4 py-2 min-h-[44px] min-w-[44px] text-xs font-semibold transition-colors"
      >
        Reload
      </button>
      <button
        onClick={onDismiss}
        className="ml-auto p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:bg-card-hover active:bg-card-hover/80 transition-colors"
        aria-label="Dismiss update banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-status-warning/90 text-white px-4 py-3 pt-safe shadow-lg text-sm">
      <WifiOff size={14} className="shrink-0" />
      <span className="font-medium">You're offline</span>
    </div>
  );
}
