import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StoreProvider } from './context/StoreContext';
import { TimerProvider } from './context/TimerContext';
import { GoogleAuthProvider } from './context/GoogleAuthContext';
import Navigation from './components/Navigation';
import TimerWidget from './components/TimerWidget';
import QuickStartFAB from './components/QuickStartFAB';
import { UpdateBanner, OfflineBanner } from './components/PWABanners';
import { useServiceWorker } from './hooks/useServiceWorker';
import ErrorBoundary from './components/ErrorBoundary';
import DebugOverlay from './components/DebugOverlay';

// Lazy-load each page so the initial bundle only contains Navigation + TimerWidget.
// Each chunk is downloaded once then cached by the browser / service worker.
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const OKRs         = lazy(() => import('./pages/OKRs'));
const Customers    = lazy(() => import('./pages/Customers'));
const Triage       = lazy(() => import('./pages/Triage'));
const Tickets      = lazy(() => import('./pages/Tickets'));
const Integrations = lazy(() => import('./pages/Integrations'));
const WeeklyReport = lazy(() => import('./pages/WeeklyReport'));
const TimeBudget   = lazy(() => import('./pages/TimeBudget'));
const Knowledge    = lazy(() => import('./pages/Knowledge'));
const Pulse        = lazy(() => import('./pages/Pulse'));

const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

// Minimal fallback shown while a page chunk loads for the first time
function PageFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-5 h-5 rounded-full border-2 border-brand-lavender border-t-transparent animate-spin" />
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState(() => window.location.pathname === '/tickets' ? 'tickets' : 'dashboard');
  const { needsUpdate, isOffline, applyUpdate, dismissUpdate } = useServiceWorker();

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === 'tickets' && window.location.pathname !== '/tickets') {
      window.history.pushState({}, '', '/tickets');
    } else if (tab !== 'tickets' && window.location.pathname === '/tickets') {
      window.history.pushState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(window.location.pathname === '/tickets' ? 'tickets' : 'dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {needsUpdate && <UpdateBanner onReload={applyUpdate} onDismiss={dismissUpdate} />}
      {isOffline && !needsUpdate && <OfflineBanner />}

      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content — offset matches sidebar: icon-only (md:w-16) at md, full (lg:w-56) at lg */}
      {/* md:pt-12 compensates for the fixed update/offline banner on desktop (banner ~48px tall) */}
      <main className={`md:ml-16 lg:ml-56 pt-16 mt-safe md:pt-0 ${(needsUpdate || isOffline) ? 'md:pt-12' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-24">
          {/* TimerWidget: inline on smaller screens, docked in sidebar on lg+.
              Hidden on Dashboard — PomosView is already the timer/analytics home. */}
          {activeTab !== 'dashboard' && <TimerWidget />}

          {/* Suspense catches first-load of each lazy page chunk */}
          <Suspense fallback={<PageFallback />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                variants={pageVariants}
                initial="hidden"
                animate="show"
              >
                {activeTab === 'dashboard'    && <Dashboard onNavigate={handleTabChange} />}
                {activeTab === 'triage'       && <Triage />}
                {activeTab === 'tickets'      && <Tickets />}
                {activeTab === 'okrs'         && <OKRs />}
                {activeTab === 'customers'    && <Customers />}
                {activeTab === 'weekly'       && <WeeklyReport onNavigate={handleTabChange} />}
                {activeTab === 'timebudget'   && <TimeBudget />}
                {activeTab === 'pulse'        && <Pulse />}
                {activeTab === 'knowledge'    && <Knowledge onNavigate={handleTabChange} />}
                {activeTab === 'integrations' && <Integrations />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      <QuickStartFAB />
      <DebugOverlay />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <TimerProvider>
          <GoogleAuthProvider>
            <AppContent />
          </GoogleAuthProvider>
        </TimerProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
