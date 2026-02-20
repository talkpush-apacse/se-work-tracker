import { useState } from 'react';
import { StoreProvider } from './context/StoreContext';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Analytics from './pages/Analytics';
import OKRs from './pages/OKRs';
import Customers from './pages/Customers';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
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
    <div className="min-h-screen bg-gray-950">
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content */}
      <main className="md:ml-56 pt-16 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {activeTab === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
          {activeTab === 'projects' && (
            <Projects
              initialProjectId={projectTarget}
              onProjectSelect={(id) => setProjectTarget(id)}
            />
          )}
          {activeTab === 'analytics' && <Analytics />}
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
      <AppContent />
    </StoreProvider>
  );
}
