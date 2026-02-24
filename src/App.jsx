import { useState } from 'react';
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
import useCapacitor from './hooks/useCapacitor';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projectTarget, setProjectTarget] = useState(null);
  const { isNative, keyboardVisible } = useCapacitor();

  const handleNavigate = (tab, projectId = null) => {
    setActiveTab(tab);
    setProjectTarget(projectId);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setProjectTarget(null);
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} keyboardVisible={keyboardVisible} />

      {/* Main content — offset matches sidebar on desktop; bottom-padded for mobile tab bar */}
      <main
        className="md:ml-16 lg:ml-56 md:pt-0"
        style={{
          paddingTop: isNative ? 'max(env(safe-area-inset-top), 12px)' : undefined,
          paddingBottom: isNative ? 'calc(72px + env(safe-area-inset-bottom))' : undefined,
        }}
      >
        {/* On mobile web (non-native), keep original top padding for the old top bar space */}
        <div className={`max-w-6xl mx-auto px-4 py-6 ${!isNative ? 'pt-16 md:pt-6' : ''}`} style={{ paddingBottom: !isNative ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : undefined }}>
          {/* TimerWidget is global — appears on all tabs while a timer is running */}
          <TimerWidget />
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
