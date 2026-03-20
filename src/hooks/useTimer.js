import { useState, useEffect, useRef, useCallback } from 'react';

const TIMER_KEY = 'gpt-active-timer';
const MAX_SECONDS = 12 * 60 * 60; // 12 hours

function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // V3 backward-compat: migrate old customerId-based format to workType-based
    if (state && state.customerId !== undefined && !state.workType) {
      state.workType = 'deep_work';
      state.clientIds = state.customerId ? [state.customerId] : [];
      delete state.customerId;
      localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    }
    return state;
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
  // Read localStorage once and derive both initial values from the same read.
  // Using useRef ensures the initializer runs exactly once (on first render)
  // without triggering extra re-renders.
  const initRef = useRef(undefined);
  if (initRef.current === undefined) {
    const saved = loadTimerState();
    const active = saved?.isRunning ? saved : null;
    initRef.current = { timerState: active, elapsed: active ? calcElapsed(active.startedAt) : 0 };
  }

  const [timerState, setTimerState] = useState(initRef.current.timerState);
  const [elapsedSeconds, setElapsedSeconds] = useState(initRef.current.elapsed);

  // stoppedSession is set when the timer stops; TimerWidget watches it to open SaveSessionModal
  const [stoppedSession, setStoppedSession] = useState(null);

  const intervalRef = useRef(null);

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // silent: true skips setting stoppedSession (no SaveSessionModal), returns session data for auto-save
  const stopTimer = useCallback(({ silent = false } = {}) => {
    clearInterval_();
    // Read directly from localStorage for accuracy (React state may be stale)
    const current = loadTimerState();
    if (!current) return null;
    const elapsed = Math.min(calcElapsed(current.startedAt), MAX_SECONDS);
    const session = {
      workType: current.workType || 'deep_work',
      clientIds: current.clientIds || [],
      taskId: current.taskId ?? null,
      taskDescription: current.taskDescription ?? null,
      okrId: current.okrId ?? null,
      pendingTasks: current.pendingTasks || [],
      elapsedSeconds: elapsed,
      startedAt: current.startedAt,
    };
    if (!silent) setStoppedSession(session);
    saveTimerState(null);
    setTimerState(null);
    setElapsedSeconds(0);
    return session;
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
        let newState = null;
        try { newState = e.newValue ? JSON.parse(e.newValue) : null; } catch {}
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

  // workType is required, options object is optional
  const startTimer = useCallback((workType, { clientIds = [], taskId = null, taskDescription = null, okrId = null } = {}) => {
    // Guard against double-start
    const existing = loadTimerState();
    if (existing && existing.isRunning) return;

    const startedAt = new Date().toISOString();
    const state = { workType, clientIds, taskId, taskDescription, okrId, pendingTasks: [], startedAt, isRunning: true };
    saveTimerState(state);
    setTimerState(state);
    setElapsedSeconds(0);
    startInterval(startedAt);
  }, [startInterval]);

  // Append a task note to the running timer without stopping it
  const addPendingTask = useCallback((task) => {
    const current = loadTimerState();
    if (!current) return;
    const updated = { ...current, pendingTasks: [...(current.pendingTasks || []), task] };
    saveTimerState(updated);
    setTimerState(updated);
  }, []);

  const clearStoppedSession = useCallback(() => {
    setStoppedSession(null);
  }, []);

  return {
    isRunning: !!timerState,
    workType: timerState?.workType ?? null,
    clientIds: timerState?.clientIds ?? [],
    taskId: timerState?.taskId ?? null,
    pendingTasks: timerState?.pendingTasks ?? [],
    elapsedSeconds,
    startedAt: timerState?.startedAt ?? null,
    stoppedSession,
    clearStoppedSession,
    startTimer,
    stopTimer,
    addPendingTask,
  };
}
