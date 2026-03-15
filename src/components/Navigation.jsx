import { LayoutDashboard, Target, Users, Menu, X, Download, Upload, ListTodo, Cloud, CloudOff, Loader2, Plug, Mail, Brain, Clock, GripVertical, Heart } from 'lucide-react';
import { useState, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { format, startOfDay, endOfDay } from 'date-fns';
import { filterPointsByRange } from '../utils/dateHelpers';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_TABS = [
  { id: 'triage',       label: 'Triage',         icon: ListTodo },
  { id: 'customers',    label: 'Customers',      icon: Users },
  { id: 'okrs',         label: 'OKRs',           icon: Target },
  { id: 'dashboard',    label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'weekly',       label: 'Weekly Report',  icon: Mail },
  { id: 'timebudget',   label: 'Time Budget',   icon: Clock },
  { id: 'pulse',        label: 'Pulse',          icon: Heart },
  { id: 'knowledge',    label: 'Knowledge',      icon: Brain },
  { id: 'integrations', label: 'Integrations',   icon: Plug },
];

const STORAGE_KEY = 'gpt-sidebar-order';

function loadTabOrder() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_TABS;
    const order = JSON.parse(saved);
    // Reorder DEFAULT_TABS according to saved order, appending any new tabs at the end
    const ordered = [];
    order.forEach(id => {
      const tab = DEFAULT_TABS.find(t => t.id === id);
      if (tab) ordered.push(tab);
    });
    // Add any tabs not in the saved order (new tabs added since last save)
    DEFAULT_TABS.forEach(t => {
      if (!ordered.find(o => o.id === t.id)) ordered.push(t);
    });
    return ordered;
  } catch {
    return DEFAULT_TABS;
  }
}

function saveTabOrder(tabs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map(t => t.id)));
}

// ── Sortable nav item for desktop sidebar ──
function SortableDesktopNavItem({ tab, activeTab, onTabChange }) {
  const { id, label, icon: Icon } = tab;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group">
      {/* Drag handle — only visible on lg (expanded sidebar) */}
      <button
        {...attributes}
        {...listeners}
        className="hidden lg:flex items-center justify-center w-5 h-5 flex-shrink-0 cursor-grab active:cursor-grabbing text-sidebar-foreground/20 hover:text-sidebar-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity"
        tabIndex={-1}
        aria-label={`Reorder ${label}`}
      >
        <GripVertical size={12} />
      </button>
      <button
        onClick={() => onTabChange(id)}
        title={label}
        className={`flex-1 flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm font-medium font-nav transition-all ${
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
    </div>
  );
}

// ── Sortable nav item for mobile drawer ──
function SortableMobileNavItem({ tab, activeTab, onTabChange, onClose }) {
  const { id, label, icon: Icon } = tab;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-6 h-6 flex-shrink-0 cursor-grab active:cursor-grabbing text-sidebar-foreground/25 hover:text-sidebar-foreground/50"
        tabIndex={-1}
        aria-label={`Reorder ${label}`}
      >
        <GripVertical size={13} />
      </button>
      <button
        onClick={() => { onTabChange(id); onClose(); }}
        className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium font-nav transition-all ${
          activeTab === id
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
        }`}
      >
        <Icon size={16} className={activeTab === id ? 'text-brand-lavender' : ''} />
        {label}
      </button>
    </div>
  );
}

export default function Navigation({ activeTab, onTabChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { exportData, importData, syncStatus, points, tasks } = useAppStore();
  const { isRunning, taskId: runningTaskId } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const fileRef = useRef();
  const [orderedTabs, setOrderedTabs] = useState(loadTabOrder);

  // Sensors: pointer (desktop) + touch (mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedTabs(prev => {
      const oldIndex = prev.findIndex(t => t.id === active.id);
      const newIndex = prev.findIndex(t => t.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      saveTabOrder(reordered);
      return reordered;
    });
  }, []);

  // Today at a glance — memoized so it only recalculates when `points` changes,
  // not on every tab switch or timer tick that re-renders Navigation.
  const now = new Date();
  const todayPoints = useMemo(
    () => filterPointsByRange(points, startOfDay(now), endOfDay(now))
            .reduce((sum, p) => sum + p.points, 0),
    [points] // eslint-disable-line react-hooks/exhaustive-deps
  );
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedTabs.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {orderedTabs.map(tab => (
                <SortableDesktopNavItem
                  key={tab.id}
                  tab={tab}
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        {/* Today at a glance — only visible on expanded sidebar (lg) */}
        <div className="hidden lg:block px-3 py-3 border-t border-sidebar-border bg-sidebar-accent/20">
          <p className="text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 font-nav">Today</p>
          <p className="text-sm font-medium text-sidebar-foreground mb-0.5">{format(now, 'EEEE, MMM d')}</p>
          <p className="text-xs text-sidebar-foreground/50">
            <span className="text-sidebar-foreground font-bold">{todayPoints}</span> pts logged
          </p>
          {isRunning ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-sage animate-pulse flex-shrink-0" />
              <span className="text-[10px] text-brand-sage font-mono tabular-nums">{fmtTimer(elapsedSeconds)}</span>
              {timerTaskDesc && (
                <span className="text-[10px] text-sidebar-foreground/40 truncate">{timerTaskDesc}</span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-sidebar-foreground/30">No timer running</p>
          )}
        </div>

        <div className="p-2 lg:p-3 border-t border-sidebar-border space-y-1">
          {/* Utilities label — lg only */}
          <p className="hidden lg:block text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-wider px-3 pt-1 pb-0.5 font-nav">Utilities</p>
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
          <p className="text-[10px] text-sidebar-foreground/25 text-center lg:text-left lg:px-3 py-1">
            v{__APP_VERSION__}
          </p>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3 pt-safe pr-safe pl-safe">
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
              className="absolute left-0 right-0 bg-sidebar border-b border-sidebar-border p-3 pr-safe pl-safe space-y-1"
              style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedTabs.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {orderedTabs.map(tab => (
                    <SortableMobileNavItem
                      key={tab.id}
                      tab={tab}
                      activeTab={activeTab}
                      onTabChange={onTabChange}
                      onClose={() => setMenuOpen(false)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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
              <p className="text-[10px] text-sidebar-foreground/25 text-center pt-1">
                v{__APP_VERSION__}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
