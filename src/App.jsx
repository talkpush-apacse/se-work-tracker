import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StoreProvider } from './context/StoreContext';
import { TimerProvider } from './context/TimerContext';
import Navigation from './components/Navigation';
import TimerWidget from './components/TimerWidget';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Analytics from './pages/Analytics';
import OKRs from './pages/OKRs';
import Customers from './pages/Customers';
import Triage from './pages/Triage';

const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

function AppContent() {
  const [activeTab, setActiveTab] = useState('triage');
  const [projectTarget, setProjectTarget] = useState(null);

  const handleNavigate = (tab, projectId = null) => {
    setActiveTab(tab);
    setProjectTarget(projectId);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setProjectTarget(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content — offset matches sidebar: icon-only (md:w-16) at md, full (lg:w-56) at lg */}
      <main className="md:ml-16 lg:ml-56 pt-16 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* TimerWidget is global — appears on all tabs while a timer is running */}
          <TimerWidget />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={pageVariants}
              initial="hidden"
              animate="show"
            >
              {activeTab === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
              {activeTab === 'projects' && (
                <Projects
                  initialProjectId={projectTarget}
                  onProjectSelect={(id) => setProjectTarget(id)}
                />
              )}
              {activeTab === 'triage' && <Triage />}
              {activeTab === 'analytics' && <Analytics onNavigate={handleNavigate} />}
              {activeTab === 'okrs' && <OKRs />}
              {activeTab === 'customers' && <Customers />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <TimerProvider>
        <AppContent />
      </TimerProvider>
    </StoreProvider>
  );
}
