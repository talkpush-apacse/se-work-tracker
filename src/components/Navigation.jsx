import { LayoutDashboard, FolderKanban, BarChart3, Target, Users, Menu, X, Download, Upload, ListTodo, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { format, startOfDay, endOfDay } from 'date-fns';
import { filterPointsByRange } from '../utils/dateHelpers';

const tabs = [
  { id: 'triage',    label: 'Triage',    icon: ListTodo },
  { id: 'projects',  label: 'Projects',  icon: FolderKanban },
  { id: 'okrs',      label: 'OKRs',      icon: Target },
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
      {/* ── Desktop sidebar — icon-only at md, full labels at lg ── */}
      <aside className="hidden md:flex flex-col md:w-16 lg:w-56 bg-sidebar border-r border-sidebar-border min-h-screen fixed left-0 top-0 z-40">
        {/* Logo / header */}
        <button
          onClick={() => onTabChange('dashboard')}
          className="px-3 lg:px-5 py-5 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors text-left w-full"
          title="Go to Dashboard"
        >
          <div className="flex items-center gap-2 justify-center lg:justify-start">
            <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-brand-lavender flex items-center justify-center text-foreground font-bold text-sm font-nav">
              SE
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-bold text-sidebar-foreground leading-tight font-nav">Work Tracker</p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Solutions Engineer</p>
            </div>
          </div>
        </button>

        <nav className="flex-1 p-2 lg:p-3 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm font-medium font-nav transition-all ${
                activeTab === id
                  ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
              }`}
            >
              <Icon
                size={16}
                className={`flex-shrink-0 ${activeTab === id ? 'text-brand-lavender' : ''}`}
              />
              <span className="hidden lg:block">{label}</span>
            </button>
          ))}
        </nav>

        {/* Today at a glance — only visible on expanded sidebar (lg) */}
        <div className="hidden lg:block px-3 py-3 border-t border-sidebar-border">
          <p className="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-wider mb-2 font-nav">Today</p>
          <p className="text-xs text-sidebar-foreground/60 mb-1.5">{format(now, 'EEEE, MMM d')}</p>
          <p className="text-xs text-sidebar-foreground/50">
            <span className="text-sidebar-foreground font-semibold">{todayPoints}</span> pts logged
          </p>
          {isRunning ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-sage animate-pulse flex-shrink-0" />
              <span className="text-[10px] text-brand-sage font-mono">{fmtTimer(elapsedSeconds)}</span>
              {timerTaskDesc && (
                <span className="text-[10px] text-sidebar-foreground/40 truncate">{timerTaskDesc}</span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-sidebar-foreground/30">No timer running</p>
          )}
        </div>

        <div className="p-2 lg:p-3 border-t border-sidebar-border space-y-1">
          {/* Sync status indicator */}
          <div className="flex items-center justify-center lg:justify-start gap-2 px-2 lg:px-3 py-1.5 text-xs">
            {syncStatus === 'loading' && (
              <><Loader2 size={12} className="animate-spin text-brand-lavender flex-shrink-0" /><span className="hidden lg:block text-brand-lavender">Loading...</span></>
            )}
            {syncStatus === 'saving' && (
              <><Loader2 size={12} className="animate-spin text-brand-amber flex-shrink-0" /><span className="hidden lg:block text-brand-amber">Saving...</span></>
            )}
            {syncStatus === 'synced' && (
              <><Cloud size={12} className="text-brand-sage flex-shrink-0" /><span className="hidden lg:block text-brand-sage">Synced</span></>
            )}
            {syncStatus === 'offline' && (
              <><CloudOff size={12} className="text-sidebar-foreground/40 flex-shrink-0" /><span className="hidden lg:block text-sidebar-foreground/40">Offline</span></>
            )}
            {syncStatus === 'error' && (
              <><CloudOff size={12} className="text-destructive flex-shrink-0" /><span className="hidden lg:block text-destructive">Sync error</span></>
            )}
          </div>
          <button
            onClick={exportData}
            title="Export Data"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2 rounded-xl text-xs font-medium font-nav text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
          >
            <Download size={14} className="flex-shrink-0" />
            <span className="hidden lg:block">Export Data</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="Import Data"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2 rounded-xl text-xs font-medium font-nav text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
          >
            <Upload size={14} className="flex-shrink-0" />
            <span className="hidden lg:block">Import Data</span>
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <button
          onClick={() => { onTabChange('dashboard'); setMenuOpen(false); }}
          className="flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-brand-lavender flex items-center justify-center text-foreground font-bold text-xs font-nav">SE</div>
          <span className="text-sm font-bold text-sidebar-foreground font-nav">Work Tracker</span>
        </button>
        <div className="flex items-center gap-2">
          {syncStatus === 'loading' && <Loader2 size={12} className="animate-spin text-brand-lavender" />}
          {syncStatus === 'saving' && <Loader2 size={12} className="animate-spin text-brand-amber" />}
          {syncStatus === 'synced' && <Cloud size={12} className="text-brand-sage" />}
          {syncStatus === 'offline' && <CloudOff size={12} className="text-sidebar-foreground/40" />}
          {syncStatus === 'error' && <CloudOff size={12} className="text-destructive" />}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1 transition-colors"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile nav drawer — Framer Motion animated ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="md:hidden fixed inset-0 z-30 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="absolute top-14 left-0 right-0 bg-sidebar border-b border-sidebar-border p-3 space-y-1"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { onTabChange(id); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium font-nav transition-all ${
                    activeTab === id
                      ? 'bg-sidebar-accent text-sidebar-foreground'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
                  }`}
                >
                  <Icon size={16} className={activeTab === id ? 'text-brand-lavender' : ''} />
                  {label}
                </button>
              ))}
              <div className="flex gap-2 pt-2 border-t border-sidebar-border">
                <button
                  onClick={() => { exportData(); setMenuOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-nav text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
                >
                  <Download size={13} /> Export
                </button>
                <button
                  onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-nav text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
                >
                  <Upload size={13} /> Import
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
