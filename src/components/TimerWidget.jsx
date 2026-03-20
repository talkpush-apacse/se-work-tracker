import { useState, useEffect, useRef } from 'react';
import { Timer, Square, Brain, Users, MessageSquare, ClipboardList, Plus, X, Check } from 'lucide-react';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { useAppStore } from '../context/StoreContext';
import { WORK_TYPE_LABELS, WORK_TYPE_COLORS } from '../constants';
import SaveSessionModal from './SaveSessionModal';

const WORK_TYPE_ICONS = {
  deep_work: Brain,
  meetings:  Users,
  comms:     MessageSquare,
  admin:     ClipboardList,
};

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function TimerWidget() {
  const {
    isRunning,
    workType,
    clientIds,
    pendingTasks,
    stoppedSession,
    clearStoppedSession,
    stopTimer,
    addPendingTask,
  } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const { customers } = useAppStore();
  const [showSave, setShowSave] = useState(false);

  // Popover state
  const [showPopover, setShowPopover] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const inputRef = useRef(null);
  const popoverRef = useRef(null);

  // Open save modal when timer stops
  useEffect(() => {
    if (stoppedSession) {
      setShowSave(true);
      setShowPopover(false);
    }
  }, [stoppedSession]);

  // Pre-fill client when popover opens (if timer has exactly one client)
  useEffect(() => {
    if (showPopover) {
      setNewClientId(clientIds.length === 1 ? String(clientIds[0]) : '');
      setNewDesc('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showPopover]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  const handleSaveClose = () => {
    setShowSave(false);
    clearStoppedSession();
  };

  const handleAddTask = () => {
    const desc = newDesc.trim();
    if (!desc) return;
    addPendingTask({ description: desc, clientId: newClientId || '', okrId: '' });
    setNewDesc('');
    setNewClientId(clientIds.length === 1 ? String(clientIds[0]) : '');
    // Show brief ✓ feedback then refocus for rapid entry
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      inputRef.current?.focus();
    }, 800);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
    if (e.key === 'Escape') setShowPopover(false);
  };

  // Nothing to render when not running and no pending save
  if (!isRunning && !showSave) return null;

  const activeWorkType = isRunning ? workType : stoppedSession?.workType;
  const activeClientIds = isRunning ? clientIds : (stoppedSession?.clientIds || []);
  const Icon = WORK_TYPE_ICONS[activeWorkType] || Timer;
  const colors = WORK_TYPE_COLORS[activeWorkType];
  const label = WORK_TYPE_LABELS[activeWorkType] || 'Timer';

  // Build client suffix
  const clientCount = activeClientIds.length;
  const clientLabel = clientCount === 1
    ? customers.find(c => c.id === activeClientIds[0])?.name || '1 client'
    : clientCount > 1
      ? `${clientCount} clients`
      : null;

  // Sorted customers for popover selector
  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {isRunning && (
        <div className="relative mb-4" ref={popoverRef}>
          {/* Main widget bar */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm animate-fade-in">
            {/* Pulsing indicator + work type info */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-success" />
              </span>

              <Icon size={15} className="text-status-success flex-shrink-0" />

              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate leading-tight">
                  {label}
                </p>
                {clientLabel && (
                  <span className="text-[10px] text-muted-foreground">
                    {clientLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Live elapsed clock */}
            <span className="font-mono text-lg font-bold text-foreground tabular-nums flex-shrink-0">
              {formatHMS(elapsedSeconds)}
            </span>

            {/* Add Task button + badge */}
            <button
              onClick={() => setShowPopover(p => !p)}
              title="Add task note"
              className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors flex-shrink-0 border cursor-pointer ${
                showPopover
                  ? 'bg-secondary border-border text-foreground'
                  : 'bg-secondary/60 border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Plus size={11} />
              Task
              {pendingTasks.length > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-status-success text-[9px] font-bold text-white">
                  {pendingTasks.length}
                </span>
              )}
            </button>

            {/* Stop button */}
            <button
              onClick={stopTimer}
              className="flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 flex-shrink-0 border border-destructive/20 cursor-pointer"
            >
              <Square size={11} fill="currentColor" />
              Stop
            </button>
          </div>

          {/* Task popover */}
          {showPopover && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-2xl border border-border bg-card shadow-lg p-3 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Log a task
                  {pendingTasks.length > 0 && (
                    <span className="ml-2 text-status-success normal-case font-normal">
                      {pendingTasks.length} queued
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setShowPopover(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Queued tasks preview */}
              {pendingTasks.length > 0 && (
                <div className="mb-2 space-y-1">
                  {pendingTasks.map((t, i) => (
                    <div key={i} className="flex items-start gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1.5">
                      <Check size={10} className="text-status-success mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground leading-snug line-clamp-1">{t.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What are you working on?"
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                />
                <button
                  onClick={handleAddTask}
                  disabled={!newDesc.trim()}
                  className={`flex-shrink-0 flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                    justAdded
                      ? 'bg-status-success text-white'
                      : newDesc.trim()
                        ? 'bg-secondary text-foreground hover:bg-secondary/80'
                        : 'bg-secondary/40 text-muted-foreground/40 cursor-not-allowed'
                  }`}
                >
                  {justAdded ? <Check size={13} /> : <Plus size={13} />}
                </button>
              </div>

              {/* Optional client selector */}
              {customers.length > 0 && (
                <select
                  value={newClientId}
                  onChange={e => setNewClientId(e.target.value)}
                  className="mt-2 w-full h-7 bg-background border border-border rounded-xl px-2.5 text-[11px] text-foreground focus:outline-none focus:border-ring cursor-pointer"
                >
                  <option value="">No client</option>
                  {sortedCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              <p className="mt-2 text-[10px] text-muted-foreground/60">
                Press Enter to add · tasks will be pre-filled when you stop
              </p>
            </div>
          )}
        </div>
      )}

      {showSave && stoppedSession && (
        <SaveSessionModal
          session={stoppedSession}
          onClose={handleSaveClose}
        />
      )}
    </>
  );
}
