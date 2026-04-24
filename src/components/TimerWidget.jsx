import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Timer,
  Square,
  Brain,
  Users,
  MessageSquare,
  ClipboardList,
  Plus,
  X,
  Check,
  Play,
  Pause,
  SkipForward,
  Coffee,
  Sparkles,
} from 'lucide-react';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { useAppStore } from '../context/StoreContext';
import {
  POMODORO_CONFIG,
  POMODORO_INTERVALS,
  TIMER_MODES,
  WORK_TYPE_LABELS,
  WORK_TYPE_COLORS,
} from '../constants';
import SaveSessionModal from './SaveSessionModal';
import StartTimerModal from './StartTimerModal';
import { Button } from './ui/button';

const WORK_TYPE_ICONS = {
  deep_work: Brain,
  meetings: Users,
  comms: MessageSquare,
  admin: ClipboardList,
};

const NOTIFICATION_PROMPT_KEY = 'gpt-pomodoro-notification-prompted';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function formatMMSS(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getPomodoroMeta(interval) {
  switch (interval) {
    case POMODORO_INTERVALS.SHORT_BREAK:
      return {
        label: 'Short Break',
        hint: `${POMODORO_CONFIG.SHORT_BREAK_MINUTES} min reset`,
        pill: 'bg-brand-sage/15 text-brand-sage border-brand-sage/25',
        accent: 'text-brand-sage',
        dot: 'bg-brand-sage',
        Icon: Coffee,
      };
    case POMODORO_INTERVALS.LONG_BREAK:
      return {
        label: 'Long Break',
        hint: `${POMODORO_CONFIG.LONG_BREAK_MINUTES} min reset`,
        pill: 'bg-brand-pink/15 text-brand-pink-darker border-brand-pink/25',
        accent: 'text-brand-pink-darker',
        dot: 'bg-brand-pink',
        Icon: Sparkles,
      };
    case POMODORO_INTERVALS.WORK:
    default:
      return {
        label: 'Focus',
        hint: `${POMODORO_CONFIG.WORK_MINUTES} min sprint`,
        pill: 'bg-brand-lavender/15 text-brand-lavender border-brand-lavender/25',
        accent: 'text-brand-lavender',
        dot: 'bg-brand-lavender',
        Icon: Timer,
      };
  }
}

function getPomodoroAlertCopy(prevInterval, nextInterval) {
  if (prevInterval === POMODORO_INTERVALS.WORK && nextInterval === POMODORO_INTERVALS.LONG_BREAK) {
    return {
      title: 'Long Break Time',
      body: `Long break time! Take ${POMODORO_CONFIG.LONG_BREAK_MINUTES} min.`,
      pulseTitle: '🔔 Break Time!',
    };
  }

  if (prevInterval === POMODORO_INTERVALS.WORK) {
    return {
      title: 'Break Time',
      body: `Time for a break! Take ${POMODORO_CONFIG.SHORT_BREAK_MINUTES} min.`,
      pulseTitle: '🔔 Break Time!',
    };
  }

  return {
    title: 'Focus Time',
    body: `Back to focus. ${POMODORO_CONFIG.WORK_MINUTES} min.`,
    pulseTitle: '🍅 Focus Time!',
  };
}

export default function TimerWidget() {
  const {
    mode,
    isRunning,
    isPaused,
    workType,
    clientIds,
    pendingTasks,
    stoppedSession,
    clearStoppedSession,
    stopTimer,
    addPendingTask,
    setMode,
    setOnIntervalEnd,
    startPomodoro,
    stopPomodoro,
    pausePomodoro,
    resumePomodoro,
    skipInterval,
    pomodoroInterval,
    pomodoroCompletedCycles,
  } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const { customers } = useAppStore();

  const [showSave, setShowSave] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [showStopwatchStart, setShowStopwatchStart] = useState(false);
  const [showPomodoroStart, setShowPomodoroStart] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState(null);

  const inputRef = useRef(null);
  const popoverRef = useRef(null);
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const titlePulseRef = useRef(null);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'Personal Work Tracker');

  const activeWorkType = isRunning ? workType : stoppedSession?.workType;
  const activeClientIds = isRunning ? clientIds : (stoppedSession?.clientIds || []);
  const Icon = WORK_TYPE_ICONS[activeWorkType] || Timer;
  const colors = WORK_TYPE_COLORS[activeWorkType] || WORK_TYPE_COLORS.deep_work;
  const stopwatchLabel = WORK_TYPE_LABELS[activeWorkType] || 'Stopwatch';

  const clientCount = activeClientIds.length;
  const clientLabel = clientCount === 1
    ? customers.find(c => c.id === activeClientIds[0])?.name || '1 client'
    : clientCount > 1
      ? `${clientCount} clients`
      : null;

  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.name.localeCompare(b.name);
  });

  const pomodoroMeta = getPomodoroMeta(pomodoroInterval || POMODORO_INTERVALS.WORK);
  const cycleFillCount = pomodoroCompletedCycles > 0 && pomodoroCompletedCycles % POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK === 0
    ? (pomodoroInterval === POMODORO_INTERVALS.LONG_BREAK ? POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK : 0)
    : pomodoroCompletedCycles % POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK;

  const stopTitlePulse = useCallback(() => {
    if (titlePulseRef.current) {
      clearInterval(titlePulseRef.current);
      titlePulseRef.current = null;
    }

    if (typeof document !== 'undefined') {
      document.title = originalTitleRef.current;
    }
  }, []);

  const startTitlePulse = useCallback((alertTitle) => {
    if (typeof document === 'undefined') return;

    stopTitlePulse();
    let showAlert = true;
    document.title = alertTitle;

    titlePulseRef.current = window.setInterval(() => {
      document.title = showAlert ? alertTitle : originalTitleRef.current;
      showAlert = !showAlert;
    }, 1500);
  }, [stopTitlePulse]);

  const playBell = useCallback(async () => {
    if (!audioRef.current) return;

    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      // Ignore playback failures; browser gesture policies vary by platform.
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    if (!audioRef.current || audioUnlockedRef.current) return;

    try {
      audioRef.current.muted = true;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      audioUnlockedRef.current = true;
    } catch {
      audioRef.current.muted = false;
    }
  }, []);

  const maybeRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const alreadyPrompted = localStorage.getItem(NOTIFICATION_PROMPT_KEY);
    if (alreadyPrompted) return;

    localStorage.setItem(NOTIFICATION_PROMPT_KEY, '1');

    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore prompt failures.
      }
    }
  }, []);

  const showBrowserNotification = useCallback((title, body) => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      new Notification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag: 'pomodoro-transition',
      });
    } catch {
      // Ignore notification failures on unsupported platforms.
    }
  }, []);

  const handleIntervalEnd = useCallback((prevInterval, nextInterval) => {
    const alertCopy = getPomodoroAlertCopy(prevInterval, nextInterval);
    startTitlePulse(alertCopy.pulseTitle);
    showBrowserNotification(alertCopy.title, alertCopy.body);
    playBell();
  }, [playBell, showBrowserNotification, startTitlePulse]);

  useEffect(() => {
    setOnIntervalEnd(handleIntervalEnd);
    return () => setOnIntervalEnd(null);
  }, [handleIntervalEnd, setOnIntervalEnd]);

  useEffect(() => {
    const audio = new Audio('/sounds/pomodoro-bell.mp3');
    audio.preload = 'auto';
    audio.load();
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (stoppedSession) {
      setShowSave(true);
      setShowPopover(false);
      stopTitlePulse();
    }
  }, [stopTitlePulse, stoppedSession]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) stopTitlePulse();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopTitlePulse]);

  useEffect(() => {
    if (showPopover) {
      setNewClientId(clientIds.length === 1 ? String(clientIds[0]) : '');
      setNewDesc('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [clientIds, showPopover]);

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

  useEffect(() => stopTitlePulse, [stopTitlePulse]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setSidebarSlot(document.getElementById('sidebar-timer-slot'));
  }, []);

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
    setJustAdded(true);

    setTimeout(() => {
      setJustAdded(false);
      inputRef.current?.focus();
    }, 800);
  };

  const handleTaskKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
    if (e.key === 'Escape') setShowPopover(false);
  };

  const handleModeChange = async (nextMode) => {
    if (isRunning || nextMode === mode) return;

    stopTitlePulse();

    if (nextMode === TIMER_MODES.POMODORO) {
      await maybeRequestNotificationPermission();
    }

    setMode(nextMode);
  };

  const handlePomodoroStart = async ({ workType: nextWorkType, clientIds: nextClientIds, okrId }) => {
    stopTitlePulse();
    await unlockAudio();
    startPomodoro({
      workType: nextWorkType,
      clientIds: nextClientIds,
      okrId,
    });
  };

  const handlePomodoroStop = () => {
    stopTitlePulse();
    stopPomodoro();
  };

  const handlePauseResume = () => {
    stopTitlePulse();

    if (isPaused) {
      resumePomodoro();
    } else {
      pausePomodoro();
    }
  };

  const handleSkip = () => {
    stopTitlePulse();
    skipInterval();
  };

  const handleStopwatchStop = () => {
    stopTitlePulse();
    stopTimer();
  };

  const renderModeToggle = () => (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/70 p-1">
      <button
        type="button"
        onClick={() => handleModeChange(TIMER_MODES.STOPWATCH)}
        disabled={isRunning}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
          mode === TIMER_MODES.STOPWATCH
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Stopwatch
      </button>
      <button
        type="button"
        onClick={() => handleModeChange(TIMER_MODES.POMODORO)}
        disabled={isRunning}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
          mode === TIMER_MODES.POMODORO
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Pomodoro
      </button>
    </div>
  );

  const renderStopwatchBody = () => {
    if (!isRunning) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary/35 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stopwatch</p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-foreground">00:00:00</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Use the regular timer for open-ended work. You can still start it from task cards, quick start, or here.
            </p>
          </div>

          <Button
            size="sm"
            className="w-full rounded-xl"
            onClick={() => {
              stopTitlePulse();
              setShowStopwatchStart(true);
            }}
          >
            <Play size={14} />
            Start Stopwatch
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-secondary/35 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-success" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stopwatch</p>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{stopwatchLabel}</p>
              {clientLabel && <p className="mt-0.5 text-xs text-muted-foreground">{clientLabel}</p>}
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
              Live
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
              {formatHMS(elapsedSeconds)}
            </span>
            <Icon size={16} className="text-muted-foreground" />
          </div>
        </div>

        <div className="relative" ref={popoverRef}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                stopTitlePulse();
                setShowPopover(prev => !prev);
              }}
            >
              <Plus size={14} />
              Task{pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ''}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl"
              onClick={handleStopwatchStop}
            >
              <Square size={14} fill="currentColor" />
              Stop
            </Button>
          </div>

          {showPopover && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Log A Task
                </p>
                <button
                  type="button"
                  onClick={() => setShowPopover(false)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X size={13} />
                </button>
              </div>

              {pendingTasks.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {pendingTasks.map((task, index) => (
                    <div key={`${task.description}-${index}`} className="flex items-start gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1.5">
                      <Check size={10} className="mt-0.5 flex-shrink-0 text-status-success" />
                      <span className="line-clamp-1 text-[11px] leading-snug text-muted-foreground">{task.description}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={handleTaskKeyDown}
                  placeholder="What are you working on?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                />
                <button
                  type="button"
                  onClick={handleAddTask}
                  disabled={!newDesc.trim()}
                  className={`flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    justAdded
                      ? 'bg-status-success text-white'
                      : newDesc.trim()
                        ? 'bg-secondary text-foreground hover:bg-secondary/80'
                        : 'cursor-not-allowed bg-secondary/40 text-muted-foreground/40'
                  }`}
                >
                  {justAdded ? <Check size={13} /> : <Plus size={13} />}
                </button>
              </div>

              {customers.length > 0 && (
                <select
                  value={newClientId}
                  onChange={e => setNewClientId(e.target.value)}
                  className="mt-2 h-8 w-full rounded-xl border border-border bg-background px-2.5 text-[11px] text-foreground focus:border-ring focus:outline-none"
                >
                  <option value="">No client</option>
                  {sortedCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              )}

              <p className="mt-2 text-[10px] text-muted-foreground/70">
                Press Enter to queue a task note for the save modal.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPomodoroBody = () => {
    if (!isRunning) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-brand-lavender/15 bg-brand-lavender/5 px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lavender/12 text-brand-lavender">
                <Timer size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Ready</p>
                <p className="text-xs text-muted-foreground">Auto-advance is on</p>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
                {formatMMSS(POMODORO_CONFIG.WORK_MINUTES * 60)}
              </span>
              <span className="rounded-full border border-brand-lavender/20 bg-brand-lavender/10 px-2.5 py-1 text-[10px] font-semibold text-brand-lavender">
                25 / 5 / 15
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Work time is logged. Breaks are excluded. Every 4th completed focus block becomes a long break.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK }).map((_, index) => (
              <span key={index} className="h-2.5 w-2.5 rounded-full bg-border" />
            ))}
          </div>

          <Button
            size="sm"
            className="w-full rounded-xl"
            onClick={() => {
              stopTitlePulse();
              setShowPomodoroStart(true);
            }}
          >
            <Play size={14} />
            Start Pomodoro
          </Button>
        </div>
      );
    }

    const PomodoroIcon = pomodoroMeta.Icon;

    return (
      <div className="space-y-3">
        <div className={`rounded-xl border px-4 py-4 ${pomodoroMeta.pill}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${pomodoroMeta.pill}`}>
                  <PomodoroIcon size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{pomodoroMeta.label}</p>
                  <p className="text-xs text-muted-foreground">{pomodoroMeta.hint}</p>
                </div>
              </div>
              {clientLabel && <p className="mt-3 text-xs text-muted-foreground">{clientLabel}</p>}
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${pomodoroMeta.pill}`}>
              {isPaused ? 'Paused' : 'Running'}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <span className={`font-mono text-4xl font-bold tabular-nums ${pomodoroMeta.accent}`}>
              {formatMMSS(elapsedSeconds)}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Breaks not logged
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-secondary/35 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cycle</p>
            <p className="text-[11px] text-muted-foreground">
              {pomodoroCompletedCycles} completed
            </p>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            {Array.from({ length: POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK }).map((_, index) => (
              <span
                key={index}
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  index < cycleFillCount ? pomodoroMeta.dot : 'bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl"
            onClick={handlePauseResume}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl"
            onClick={handleSkip}
          >
            <SkipForward size={14} />
            Skip
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-xl"
            onClick={handlePomodoroStop}
          >
            <Square size={14} fill="currentColor" />
            Stop
          </Button>
        </div>
      </div>
    );
  };

  const renderCard = () => (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Focus Timer</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mode === TIMER_MODES.POMODORO ? 'Structured focus cycles' : 'Freeform time tracking'}
          </p>
        </div>
        {mode === TIMER_MODES.POMODORO && (
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getPomodoroMeta(isRunning ? pomodoroInterval : POMODORO_INTERVALS.WORK).pill}`}>
            Pomodoro
          </span>
        )}
      </div>

      {renderModeToggle()}
      {isRunning && (
        <p className="text-[11px] text-muted-foreground">
          Stop the current timer to switch modes.
        </p>
      )}
      {mode === TIMER_MODES.POMODORO ? renderPomodoroBody() : renderStopwatchBody()}
    </div>
  );

  return (
    <>
      <div className="lg:hidden mb-4">
        {renderCard()}
      </div>

      {sidebarSlot && createPortal(
        <div className="hidden lg:block fixed bottom-4 left-3 z-50 w-[212px]">
          {renderCard()}
        </div>,
        sidebarSlot
      )}

      {showStopwatchStart && (
        <StartTimerModal
          title="Start Stopwatch"
          submitLabel="Start Stopwatch"
          onClose={() => setShowStopwatchStart(false)}
        />
      )}

      {showPomodoroStart && (
        <StartTimerModal
          title="Start Pomodoro"
          submitLabel="Start Pomodoro"
          helperText="Pomodoro uses the 25 / 5 / 15 cadence, auto-advances between intervals, and only work time is saved."
          preselectedWorkType="deep_work"
          onStart={handlePomodoroStart}
          onClose={() => setShowPomodoroStart(false)}
        />
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
