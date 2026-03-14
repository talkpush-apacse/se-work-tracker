import { useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StoreProvider } from './context/StoreContext';
import { TimerProvider } from './context/TimerContext';
import { GoogleAuthProvider } from './context/GoogleAuthContext';
import Navigation from './components/Navigation';
import TimerWidget from './components/TimerWidget';
import QuickStartFAB from './components/QuickStartFAB';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-load each page so the initial bundle only contains Navigation + TimerWidget.
// Each chunk is downloaded once then cached by the browser / service worker.
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const OKRs         = lazy(() => import('./pages/OKRs'));
const Customers    = lazy(() => import('./pages/Customers'));
const Triage       = lazy(() => import('./pages/Triage'));
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
  const [activeTab, setActiveTab] = useState('triage');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content — offset matches sidebar: icon-only (md:w-16) at md, full (lg:w-56) at lg */}
      <main className="md:ml-16 lg:ml-56 pt-16 mt-safe md:pt-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* TimerWidget is global — appears on all tabs while a timer is running */}
          <TimerWidget />

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
                {activeTab === 'okrs'         && <OKRs />}
                {activeTab === 'customers'    && <Customers />}
                {activeTab === 'weekly'       && <WeeklyReport onNavigate={handleTabChange} />}
                {activeTab === 'timebudget'   && <TimeBudget />}
                {activeTab === 'pulse'        && <Pulse />}
                {activeTab === 'knowledge'    && <Knowledge />}
                {activeTab === 'integrations' && <Integrations />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      <QuickStartFAB />
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
