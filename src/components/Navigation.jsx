import { LayoutDashboard, FolderKanban, BarChart3, Target, Users, Menu, X, Download, Upload, ListTodo } from 'lucide-react';
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

export default function Navigation({ activeTab, onTabChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { exportData, importData } = useAppStore();
  const fileRef = useRef();

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 min-h-screen fixed left-0 top-0 z-40">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">SE</div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Work Tracker</p>
              <p className="text-[10px] text-gray-500 leading-tight">Solutions Engineer</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 space-y-1">
          <button
            onClick={exportData}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <Download size={14} /> Export Data
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <Upload size={14} /> Import Data
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">SE</div>
          <span className="text-sm font-bold text-white">Work Tracker</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-400 hover:text-white p-1">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute top-14 left-0 right-0 bg-gray-900 border-b border-gray-800 p-3 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { onTabChange(id); setMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
            <div className="flex gap-2 pt-2 border-t border-gray-800">
              <button
                onClick={() => { exportData(); setMenuOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
              >
                <Download size={13} /> Export
              </button>
              <button
                onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
              >
                <Upload size={13} /> Import
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
        </div>
      )}
    </>
  );
}
