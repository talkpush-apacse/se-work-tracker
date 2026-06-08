import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Timer,
  Square,
  Play,
  Pause,
  SkipForward,
  Coffee,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { useAppStore } from '../context/StoreContext';
import {
  POMODORO_CONFIG,
  POMODORO_INTERVALS,
} from '../constants';
import SaveSessionModal from './SaveSessionModal';
import StartTimerModal from './StartTimerModal';
import { Button } from './ui/button';

const NOTIFICATION_PROMPT_KEY = 'gpt-pomodoro-notification-prompted';
const CHECK_IN_INTERVAL_SECONDS = 2 * 3600; // show check-in modal every 2 hours
const CHECK_IN_AUTO_STOP_SECONDS = 5 * 60;  // auto-stop after 5 min with no response

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
    isRunning,
    isPaused,
    clientIds,
    stoppedSession,
    clearStoppedSession,
    stopTimer,
    setOnIntervalEnd,
    startPomodoro,
    stopPomodoro,
    pausePomodoro,
    resumePomodoro,
    skipInterval,
    pomodoroInterval,
    pomodoroCompletedCycles,
    pomodoroStartedAt,
  } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const { customers } = useAppStore();

  const [showSave, setShowSave] = useState(false);
  const [showPomodoroStart, setShowPomodoroStart] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInCountdown, setCheckInCountdown] = useState(5 * 60);

  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const titlePulseRef = useRef(null);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'Personal Work Tracker');
  const lastCheckInBoundaryRef = useRef(0);
  const checkInCountdownRef = useRef(null);

  const activeClientIds = isRunning ? clientIds : (stoppedSession?.clientIds || []);

  const clientCount = activeClientIds.length;
  const clientLabel = clientCount === 1
    ? customers.find(c => c.id === activeClientIds[0])?.name || '1 client'
    : clientCount > 1
      ? `${clientCount} clients`
      : null;

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

  const clearCheckInCountdown = useCallback(() => {
    if (checkInCountdownRef.current) {
      clearInterval(checkInCountdownRef.current);
      checkInCountdownRef.current = null;
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

    console.warn('[pomo] unlockAudio: start', {
      hasAudio: !!audioRef.current,
      alreadyUnlocked: audioUnlockedRef.current,
    });
    try {
      audioRef.current.muted = true;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      audioUnlockedRef.current = true;
      console.warn('[pomo] unlockAudio: success');
    } catch (err) {
      audioRef.current.muted = false;
      console.warn('[pomo] unlockAudio: caught error', err?.name, err?.message);
    }
  }, []);

  const maybeRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('[pomo] maybeRequestNotificationPermission: Notification API not available');
      return;
    }

    console.warn('[pomo] maybeRequestNotificationPermission: start', {
      permission: Notification.permission,
      alreadyPrompted: !!localStorage.getItem(NOTIFICATION_PROMPT_KEY),
    });
    const alreadyPrompted = localStorage.getItem(NOTIFICATION_PROMPT_KEY);
    if (alreadyPrompted) {
      console.warn('[pomo] maybeRequestNotificationPermission: skip (already prompted)');
      return;
    }

    localStorage.setItem(NOTIFICATION_PROMPT_KEY, '1');

    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
        console.warn('[pomo] maybeRequestNotificationPermission: resolved', Notification.permission);
      } catch (err) {
        console.warn('[pomo] maybeRequestNotificationPermission: threw', err?.message ?? err);
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

  const handleCheckInConfirm = useCallback(() => {
    clearCheckInCountdown();
    setShowCheckIn(false);
    stopTitlePulse();
  }, [clearCheckInCountdown, stopTitlePulse]);

  const handleCheckInStop = useCallback(() => {
    clearCheckInCountdown();
    setShowCheckIn(false);
    stopTitlePulse();
    stopTimer();
  }, [clearCheckInCountdown, stopTitlePulse, stopTimer]);

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

  // Reset check-in boundary tracker whenever a new session starts or ends
  useEffect(() => {
    lastCheckInBoundaryRef.current = 0;
    if (showCheckIn) {
      clearCheckInCountdown();
      setShowCheckIn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoroStartedAt]);

  // Fire check-in modal at every 2-hour wall-clock boundary (2h, 4h, 6h)
  useEffect(() => {
    if (!isRunning || showCheckIn) return;

    let wallClockSeconds = 0;
    if (pomodoroStartedAt) wallClockSeconds = Math.floor((Date.now() - pomodoroStartedAt) / 1000);

    const boundary = Math.floor(wallClockSeconds / CHECK_IN_INTERVAL_SECONDS);
    if (boundary < 1 || boundary > 3) return;
    if (boundary <= lastCheckInBoundaryRef.current) return;

    lastCheckInBoundaryRef.current = boundary;
    setShowCheckIn(true);
    setCheckInCountdown(CHECK_IN_AUTO_STOP_SECONDS);
    startTitlePulse('⏰ Still working?');
    playBell();
    showBrowserNotification(
      'Still working?',
      `You've been running for ${boundary * 2} hours. Confirm you're still active.`
    );

    checkInCountdownRef.current = setInterval(() => {
      setCheckInCountdown(prev => {
        if (prev <= 1) {
          clearInterval(checkInCountdownRef.current);
          checkInCountdownRef.current = null;
          setShowCheckIn(false);
          stopTitlePulse();
          stopTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [
    isRunning, elapsedSeconds, showCheckIn,
    pomodoroStartedAt,
    startTitlePulse, playBell, showBrowserNotification, stopTitlePulse, stopTimer,
  ]);

  // Cleanup check-in countdown on unmount
  useEffect(() => {
    return () => clearCheckInCountdown();
  }, [clearCheckInCountdown]);

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
      stopTitlePulse();
      clearCheckInCountdown();
      setShowCheckIn(false);
    }
  }, [stopTitlePulse, stoppedSession, clearCheckInCountdown]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) stopTitlePulse();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopTitlePulse]);

  useEffect(() => stopTitlePulse, [stopTitlePulse]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setSidebarSlot(document.getElementById('sidebar-timer-slot'));
  }, []);

  const handleSaveClose = () => {
    setShowSave(false);
    clearStoppedSession();
  };

  const handlePomodoroStart = async ({ workType: nextWorkType, clientIds: nextClientIds, okrId, notionTask }) => {
    console.warn('[pomo] handlePomodoroStart: called', {
      workType: nextWorkType,
      clientIds: nextClientIds,
      okrId,
      notionTaskId: notionTask?.id ?? null,
    });
    try {
      stopTitlePulse();
      console.warn('[pomo] handlePomodoroStart: stopTitlePulse done');
      await unlockAudio();
      console.warn('[pomo] handlePomodoroStart: unlockAudio done');
      startPomodoro({
        workType: nextWorkType,
        clientIds: nextClientIds,
        okrId,
        notionTaskId: notionTask?.id ?? null,
        notionTaskName: notionTask?.task_name ?? null,
        notionAccount: notionTask?.account ?? null,
        notionOkr: notionTask?.okr ?? null,
        notionOkrPageId: notionTask?.okrPageId ?? null,
      });
      console.warn('[pomo] handlePomodoroStart: startPomodoro called');
    } catch (err) {
      console.error('[pomo] handlePomodoroStart: threw', err?.message ?? err, err?.stack ?? '');
      throw err;
    }
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

  const handleNotificationPrompt = async () => {
    console.warn('[pomo] requesting notification permission');
    await maybeRequestNotificationPermission();
    console.warn('[pomo] notification permission done');
  };

  const renderPomodoroBody = (compact = false) => {
    if (!isRunning) {
      return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          <div className={`rounded-xl border border-brand-lavender/15 bg-brand-lavender/5 ${compact ? 'px-3 py-3' : 'px-4 py-4'}`}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lavender/12 text-brand-lavender">
                <Timer size={18} />
              </span>
              <div>
                <p className={`font-semibold text-foreground ${compact ? 'text-[13px]' : 'text-sm'}`}>Ready</p>
                <p className={`text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>Auto-advance is on</p>
              </div>
            </div>

            <div className={`flex items-end justify-between gap-3 ${compact ? 'mt-3' : 'mt-4'}`}>
              <span className={`font-mono font-bold tabular-nums text-foreground ${compact ? 'text-2xl' : 'text-3xl'}`}>
                {formatMMSS(POMODORO_CONFIG.WORK_MINUTES * 60)}
              </span>
              <span className={`rounded-full border border-brand-lavender/20 bg-brand-lavender/10 font-semibold text-brand-lavender ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
                25 / 5 / 15
              </span>
            </div>

            <p className={`mt-3 leading-relaxed text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>
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
            onClick={async () => {
              stopTitlePulse();
              await handleNotificationPrompt();
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
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <div className={`rounded-xl border ${compact ? 'px-3 py-3' : 'px-4 py-4'} ${pomodoroMeta.pill}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${pomodoroMeta.pill}`}>
                  <PomodoroIcon size={16} />
                </span>
                <div>
                  <p className={`font-semibold text-foreground ${compact ? 'text-[13px]' : 'text-sm'}`}>{pomodoroMeta.label}</p>
                  <p className={`text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>{pomodoroMeta.hint}</p>
                </div>
              </div>
              {clientLabel && <p className={`mt-3 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>{clientLabel}</p>}
            </div>
            <span className={`rounded-full border font-semibold ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${pomodoroMeta.pill}`}>
              {isPaused ? 'Paused' : 'Running'}
            </span>
          </div>

          <div className={`flex items-end justify-between gap-3 ${compact ? 'mt-3' : 'mt-4'}`}>
            <span className={`font-mono font-bold tabular-nums ${pomodoroMeta.accent} ${compact ? 'text-[2.3rem]' : 'text-4xl'}`}>
              {formatMMSS(elapsedSeconds)}
            </span>
            <span className={`font-medium text-muted-foreground ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
              Breaks not logged
            </span>
          </div>
        </div>

        <div className={`rounded-xl border border-border bg-secondary/35 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className={`font-semibold uppercase tracking-[0.18em] text-muted-foreground ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Cycle</p>
            <p className={`text-muted-foreground ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
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

        <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
          <Button
            variant="secondary"
            size="sm"
            className={`rounded-xl ${compact ? 'px-2 text-[11px]' : ''}`}
            onClick={handlePauseResume}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={`rounded-xl ${compact ? 'px-2 text-[11px]' : ''}`}
            onClick={handleSkip}
          >
            <SkipForward size={14} />
            Skip
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className={`rounded-xl ${compact ? 'px-2 text-[11px]' : ''}`}
            onClick={handlePomodoroStop}
          >
            <Square size={14} fill="currentColor" />
            Stop
          </Button>
        </div>
      </div>
    );
  };

  const renderCard = (compact = false) => (
    <div className={`rounded-2xl border border-border bg-card shadow-lg shadow-black/5 ${compact ? 'space-y-2 p-3' : 'space-y-3 p-4'}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className={`font-semibold uppercase tracking-[0.18em] text-muted-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}>Focus Timer</p>
          <p className={`mt-0.5 text-muted-foreground ${compact ? 'text-[11px]' : 'text-sm'}`}>
            Structured focus cycles
          </p>
        </div>
        <span className={`rounded-full border font-semibold ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${getPomodoroMeta(isRunning ? pomodoroInterval : POMODORO_INTERVALS.WORK).pill}`}>
          Pomodoro
        </span>
      </div>

      {renderPomodoroBody(compact)}
    </div>
  );

  return (
    <>
      <div className="lg:hidden mb-4">
        {renderCard()}
      </div>

      {sidebarSlot && createPortal(
        <div className="hidden lg:block fixed bottom-4 left-3 z-50 w-[212px]">
          {renderCard(true)}
        </div>,
        sidebarSlot
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

      {showCheckIn && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-amber/15 text-brand-amber-darker">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h2 id="checkin-title" className="text-base font-semibold text-foreground">
                  Still working?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your timer has been running for a while. Let us know you&apos;re still active.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Auto-stopping in
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                {String(Math.floor(checkInCountdown / 60)).padStart(2, '0')}:
                {String(checkInCountdown % 60).padStart(2, '0')}
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="destructive" size="sm" className="flex-1 rounded-xl" onClick={handleCheckInStop}>
                <Square size={14} fill="currentColor" />
                Stop timer
              </Button>
              <Button size="sm" className="flex-1 rounded-xl" onClick={handleCheckInConfirm}>
                Yes, keep going
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
