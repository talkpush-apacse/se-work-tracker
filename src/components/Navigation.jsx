import { LayoutDashboard, FolderKanban, BarChart3, Target, Users, Menu, X, Download, Upload, ListTodo, MoreHorizontal } from 'lucide-react';
import { useState, useRef } from 'react';
import { useAppStore } from '../context/StoreContext';

const tabs = [
  { id: 'triage', label: 'Triage', icon: ListTodo },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'okrs', label: 'OKRs', icon: Target },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

// Primary tabs shown in the bottom bar (max 5 for iPhone)
const primaryTabs = ['triage', 'projects', 'dashboard', 'analytics'];
const secondaryTabs = ['okrs', 'customers'];

export default function Navigation({ activeTab, onTabChange, keyboardVisible }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { exportData, importData } = useAppStore();
  const fileRef = useRef();

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  };

  const isSecondaryActive = secondaryTabs.includes(activeTab);

  return (
    <>
      {/* Desktop sidebar — icon-only at md, full labels at lg */}
      <aside className="hidden md:flex flex-col md:w-16 lg:w-56 bg-gray-900 border-r border-gray-800 min-h-screen fixed left-0 top-0 z-40">
        {/* Logo / header — click navigates to Dashboard */}
        <button
          onClick={() => onTabChange('dashboard')}
          className="px-3 lg:px-5 py-5 border-b border-gray-800 hover:bg-gray-800/50 transition-colors text-left w-full"
          title="Go to Dashboard"
        >
          <div className="flex items-center gap-2 justify-center lg:justify-start">
            <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">SE</div>
            <div className="hidden lg:block">
              <p className="text-sm font-bold text-white leading-tight">Work Tracker</p>
              <p className="text-[10px] text-gray-500 leading-tight">Solutions Engineer</p>
            </div>
          </div>
        </button>

        <nav className="flex-1 p-2 lg:p-3 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 lg:p-3 border-t border-gray-800 space-y-1">
          <button
            onClick={exportData}
            title="Export Data"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <Download size={14} className="flex-shrink-0" />
            <span className="hidden lg:block">Export Data</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="Import Data"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <Upload size={14} className="flex-shrink-0" />
            <span className="hidden lg:block">Import Data</span>
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </aside>

      {/* ============================================= */}
      {/* Mobile bottom tab bar (iOS-native style)      */}
      {/* ============================================= */}
      {!keyboardVisible && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
          <div className="flex items-center justify-around px-2 pt-1.5">
            {primaryTabs.map((tabId) => {
              const tab = tabs.find(t => t.id === tabId);
              const Icon = tab.icon;
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  onClick={() => { onTabChange(tabId); setMoreOpen(false); }}
                  className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 transition-colors ${
                    isActive ? 'text-indigo-400' : 'text-gray-500 active:text-gray-300'
                  }`}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                  <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                </button>
              );
            })}

            {/* More button for secondary tabs */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 transition-colors ${
                isSecondaryActive || moreOpen ? 'text-indigo-400' : 'text-gray-500 active:text-gray-300'
              }`}
            >
              <MoreHorizontal size={22} strokeWidth={isSecondaryActive ? 2.5 : 1.5} />
              <span className={`text-[10px] mt-0.5 ${isSecondaryActive ? 'font-semibold' : 'font-medium'}`}>More</span>
            </button>
          </div>

          {/* "More" popover */}
          {moreOpen && (
            <div className="absolute bottom-full left-0 right-0 bg-gray-900 border-t border-gray-800 p-3 space-y-1 animate-slide-up">
              {secondaryTabs.map((tabId) => {
                const tab = tabs.find(t => t.id === tabId);
                const Icon = tab.icon;
                return (
                  <button
                    key={tabId}
                    onClick={() => { onTabChange(tabId); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      activeTab === tabId
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <Icon size={18} /> {tab.label}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={() => { exportData(); setMoreOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
                >
                  <Download size={14} /> Export
                </button>
                <button
                  onClick={() => { fileRef.current?.click(); setMoreOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
                >
                  <Upload size={14} /> Import
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            </div>
          )}
        </nav>
      )}

      {/* Close "more" overlay when tapping outside */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
      )}
    </>
  );
}
