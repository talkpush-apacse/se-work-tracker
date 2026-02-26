import { LayoutDashboard, FolderKanban, BarChart3, Target, Users, Menu, X, Download, Upload, ListTodo, Cloud, CloudOff, Loader2, Timer } from 'lucide-react';
import { useState, useRef } from 'react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { format, startOfDay, endOfDay } from 'date-fns';
import { filterPointsByRange } from '../utils/dateHelpers';

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
  const { exportData, importData, syncStatus, points, tasks } = useAppStore();
  const { isRunning, taskId: runningTaskId } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const fileRef = useRef();

  // Today at a glance
  const now = new Date();
  const todayPoints = filterPointsByRange(points, startOfDay(now), endOfDay(now))
    .reduce((sum, p) => sum + p.points, 0);
  const timerTaskDesc = isRunning && runningTaskId
    ? tasks.find(t => t.id === runningTaskId)?.description
    : null;
  const fmtTimer = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  };

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

        {/* Today at a glance — only visible on expanded sidebar (lg) */}
        <div className="hidden lg:block px-3 py-3 border-t border-gray-800">
          <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mb-2">Today</p>
          <p className="text-xs text-gray-400 mb-1.5">{format(now, 'EEEE, MMM d')}</p>
          <p className="text-xs text-gray-500">
            <span className="text-white font-semibold">{todayPoints}</span> pts logged
          </p>
          {isRunning ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-[10px] text-emerald-400 font-mono">{fmtTimer(elapsedSeconds)}</span>
              {timerTaskDesc && (
                <span className="text-[10px] text-gray-500 truncate">{timerTaskDesc}</span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-gray-600">No timer running</p>
          )}
        </div>

        <div className="p-2 lg:p-3 border-t border-gray-800 space-y-1">
          {/* Sync status indicator */}
          <div className="flex items-center justify-center lg:justify-start gap-2 px-2 lg:px-3 py-1.5 text-xs">
            {syncStatus === 'loading' && (
              <><Loader2 size={12} className="animate-spin text-blue-400 flex-shrink-0" /><span className="hidden lg:block text-blue-400">Loading...</span></>
            )}
            {syncStatus === 'saving' && (
              <><Loader2 size={12} className="animate-spin text-amber-400 flex-shrink-0" /><span className="hidden lg:block text-amber-400">Saving...</span></>
            )}
            {syncStatus === 'synced' && (
              <><Cloud size={12} className="text-emerald-400 flex-shrink-0" /><span className="hidden lg:block text-emerald-400">Synced</span></>
            )}
            {syncStatus === 'offline' && (
              <><CloudOff size={12} className="text-gray-500 flex-shrink-0" /><span className="hidden lg:block text-gray-500">Offline</span></>
            )}
            {syncStatus === 'error' && (
              <><CloudOff size={12} className="text-red-400 flex-shrink-0" /><span className="hidden lg:block text-red-400">Sync error</span></>
            )}
          </div>
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

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 py-3">
        {/* Logo — click navigates to Dashboard */}
        <button
          onClick={() => { onTabChange('dashboard'); setMenuOpen(false); }}
          className="flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">SE</div>
          <span className="text-sm font-bold text-white">Work Tracker</span>
        </button>
        {/* Mobile sync dot */}
        <div className="flex items-center gap-2">
          {syncStatus === 'loading' && <Loader2 size={12} className="animate-spin text-blue-400" />}
          {syncStatus === 'saving' && <Loader2 size={12} className="animate-spin text-amber-400" />}
          {syncStatus === 'synced' && <Cloud size={12} className="text-emerald-400" />}
          {syncStatus === 'offline' && <CloudOff size={12} className="text-gray-500" />}
          {syncStatus === 'error' && <CloudOff size={12} className="text-red-400" />}
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-400 hover:text-white p-1">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        </div>
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
