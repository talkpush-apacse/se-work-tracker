import { useState, useEffect, useRef, useCallback } from 'react';

const TIMER_KEY = 'gpt-active-timer';
const MAX_SECONDS = 12 * 60 * 60; // 12 hours

function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTimerState(state) {
  if (state === null) {
    localStorage.removeItem(TIMER_KEY);
  } else {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  }
}

function calcElapsed(startedAt) {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
}

export function useTimer() {
  // Initialise state from localStorage so page refresh is transparent
  const [timerState, setTimerState] = useState(() => {
    const saved = loadTimerState();
    return saved && saved.isRunning ? saved : null;
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    const saved = loadTimerState();
    return saved && saved.isRunning ? calcElapsed(saved.startedAt) : 0;
  });

  // stoppedSession is set when the timer stops; TimerWidget watches it to open SaveSessionModal
  const [stoppedSession, setStoppedSession] = useState(null);

  const intervalRef = useRef(null);

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval_();
    // Read directly from localStorage for accuracy (React state may be stale)
    const current = loadTimerState();
    if (!current) return;
    const elapsed = Math.min(calcElapsed(current.startedAt), MAX_SECONDS);
    setStoppedSession({
      projectId: current.projectId,
      taskId: current.taskId ?? null,
      taskDescription: current.taskDescription ?? null,
      elapsedSeconds: elapsed,
      startedAt: current.startedAt,
    });
    saveTimerState(null);
    setTimerState(null);
    setElapsedSeconds(0);
  }, [clearInterval_]);

  const startInterval = useCallback((startedAt) => {
    clearInterval_();
    intervalRef.current = setInterval(() => {
      const elapsed = calcElapsed(startedAt);
      setElapsedSeconds(elapsed);
      // Auto-stop at 12 hours — use a custom event to avoid stale-closure issues
      if (elapsed >= MAX_SECONDS) {
        window.dispatchEvent(new CustomEvent('timer-autostop'));
      }
    }, 1000);
  }, [clearInterval_]);

  // Listen for auto-stop event (dispatched from inside the interval)
  useEffect(() => {
    const handler = () => stopTimer();
    window.addEventListener('timer-autostop', handler);
    return () => window.removeEventListener('timer-autostop', handler);
  }, [stopTimer]);

  // Multi-tab sync: if another tab clears gpt-active-timer, stop the local interval
  useEffect(() => {
    const handler = (e) => {
      if (e.key === TIMER_KEY) {
        const newState = e.newValue ? JSON.parse(e.newValue) : null;
        if (!newState) {
          clearInterval_();
          setTimerState(null);
          setElapsedSeconds(0);
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [clearInterval_]);

  // On mount: resume from localStorage if timer is still running
  useEffect(() => {
    const saved = loadTimerState();
    if (saved && saved.isRunning) {
      const elapsed = calcElapsed(saved.startedAt);
      if (elapsed >= MAX_SECONDS) {
        // Already hit the 12h limit while page was closed — stop immediately
        stopTimer();
        return;
      }
      setTimerState(saved);
      setElapsedSeconds(elapsed);
      startInterval(saved.startedAt);
    }
    return () => clearInterval_();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps is intentional: run exactly once on mount

  // taskId and taskDescription are optional — project-level timers pass neither
  const startTimer = useCallback((projectId, taskId = null, taskDescription = null) => {
    // Guard against double-start
    const existing = loadTimerState();
    if (existing && existing.isRunning) return;

    const startedAt = new Date().toISOString();
    const state = { projectId, taskId, taskDescription, startedAt, isRunning: true };
    saveTimerState(state);
    setTimerState(state);
    setElapsedSeconds(0);
    startInterval(startedAt);
  }, [startInterval]);

  const clearStoppedSession = useCallback(() => {
    setStoppedSession(null);
  }, []);

  return {
    isRunning: !!timerState,
    projectId: timerState?.projectId ?? null,
    taskId: timerState?.taskId ?? null,
    elapsedSeconds,
    startedAt: timerState?.startedAt ?? null,
    stoppedSession,
    clearStoppedSession,
    startTimer,
    stopTimer,
  };
}
