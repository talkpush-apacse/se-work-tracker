import { useState, useEffect, useRef, useCallback } from 'react';
import { POMODORO_CONFIG, POMODORO_INTERVALS, TIMER_MODES } from '../constants';

const TIMER_KEY = 'gpt-active-timer';
const MAX_SECONDS = 8 * 60 * 60; // 8 hours

const VALID_TIMER_MODES = new Set(Object.values(TIMER_MODES));
const VALID_POMODORO_INTERVALS = new Set(Object.values(POMODORO_INTERVALS));

function createDefaultTimerState(overrides = {}) {
  return {
    mode: TIMER_MODES.STOPWATCH,
    isRunning: false,
    workType: null,
    clientIds: [],
    taskId: null,
    taskDescription: null,
    okrId: null,
    notionTaskId: null,
    notionTaskName: null,
    notionAccount: null,
    notionOkr: null,
    pendingTasks: [],
    startedAt: null,
    pomodoroInterval: null,
    pomodoroIntervalEndsAt: null,
    pomodoroCompletedCycles: 0,
    pomodoroAccumulatedWorkSeconds: 0,
    pomodoroStartedAt: null,
    pomodoroPausedAt: null,
    ...overrides,
  };
}

function warnTimerState(message, details) {
  console.warn(`[Timer] ${message}`, details);
}

function getPomodoroIntervalMs(interval) {
  switch (interval) {
    case POMODORO_INTERVALS.WORK:
      return POMODORO_CONFIG.WORK_MINUTES * 60 * 1000;
    case POMODORO_INTERVALS.SHORT_BREAK:
      return POMODORO_CONFIG.SHORT_BREAK_MINUTES * 60 * 1000;
    case POMODORO_INTERVALS.LONG_BREAK:
      return POMODORO_CONFIG.LONG_BREAK_MINUTES * 60 * 1000;
    default:
      return 0;
  }
}

function getPomodoroIntervalSeconds(interval) {
  return Math.floor(getPomodoroIntervalMs(interval) / 1000);
}

function resetPomodoroFields(state, mode = state.mode) {
  return {
    ...state,
    mode,
    pomodoroInterval: null,
    pomodoroIntervalEndsAt: null,
    pomodoroCompletedCycles: 0,
    pomodoroAccumulatedWorkSeconds: 0,
    pomodoroStartedAt: null,
    pomodoroPausedAt: null,
  };
}

function sanitizeTimerState(rawState) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    warnTimerState('Invalid timer state shape. Resetting to defaults.', rawState);
    return { state: createDefaultTimerState(), shouldPersist: true };
  }

  const next = createDefaultTimerState();
  let shouldPersist = false;

  const legacyState = { ...rawState };

  // V3 backward-compat: migrate old customerId-based format to clientIds.
  if (legacyState.customerId !== undefined && !legacyState.clientIds) {
    legacyState.clientIds = legacyState.customerId ? [legacyState.customerId] : [];
    delete legacyState.customerId;
    shouldPersist = true;
  }

  // Legacy stopwatch payloads did not have a mode field.
  if (!legacyState.mode) {
    legacyState.mode = TIMER_MODES.STOPWATCH;
    shouldPersist = true;
  }

  if (!VALID_TIMER_MODES.has(legacyState.mode)) {
    warnTimerState('Unknown timer mode. Resetting to stopwatch defaults.', legacyState.mode);
    legacyState.mode = TIMER_MODES.STOPWATCH;
    legacyState.isRunning = false;
    shouldPersist = true;
  }

  next.mode = legacyState.mode;
  next.isRunning = Boolean(legacyState.isRunning);
  next.workType = typeof legacyState.workType === 'string' && legacyState.workType
    ? legacyState.workType
    : null;
  next.clientIds = Array.isArray(legacyState.clientIds) ? legacyState.clientIds.filter(Boolean) : [];
  next.taskId = legacyState.taskId ?? null;
  next.taskDescription = legacyState.taskDescription ?? null;
  next.okrId = legacyState.okrId ?? null;
  next.notionTaskId = legacyState.notionTaskId ?? null;
  next.notionTaskName = legacyState.notionTaskName ?? null;
  next.notionAccount = legacyState.notionAccount ?? null;
  next.notionOkr = typeof legacyState.notionOkr === 'string' ? legacyState.notionOkr : null;
  next.pendingTasks = Array.isArray(legacyState.pendingTasks) ? legacyState.pendingTasks : [];
  next.startedAt = typeof legacyState.startedAt === 'string' && !Number.isNaN(Date.parse(legacyState.startedAt))
    ? legacyState.startedAt
    : null;

  next.pomodoroInterval = VALID_POMODORO_INTERVALS.has(legacyState.pomodoroInterval)
    ? legacyState.pomodoroInterval
    : null;
  next.pomodoroIntervalEndsAt = Number.isFinite(legacyState.pomodoroIntervalEndsAt)
    ? legacyState.pomodoroIntervalEndsAt
    : null;
  next.pomodoroCompletedCycles = Number.isFinite(legacyState.pomodoroCompletedCycles) && legacyState.pomodoroCompletedCycles >= 0
    ? Math.floor(legacyState.pomodoroCompletedCycles)
    : 0;
  next.pomodoroAccumulatedWorkSeconds = Number.isFinite(legacyState.pomodoroAccumulatedWorkSeconds) && legacyState.pomodoroAccumulatedWorkSeconds >= 0
    ? Math.floor(legacyState.pomodoroAccumulatedWorkSeconds)
    : 0;
  next.pomodoroStartedAt = Number.isFinite(legacyState.pomodoroStartedAt)
    ? legacyState.pomodoroStartedAt
    : null;
  next.pomodoroPausedAt = Number.isFinite(legacyState.pomodoroPausedAt)
    ? legacyState.pomodoroPausedAt
    : null;

  if (next.mode === TIMER_MODES.STOPWATCH) {
    if (next.isRunning && !next.startedAt) {
      warnTimerState('Stopwatch state is missing startedAt. Resetting timer state.', legacyState);
      return { state: createDefaultTimerState({ mode: TIMER_MODES.STOPWATCH }), shouldPersist: true };
    }
    return { state: resetPomodoroFields(next, TIMER_MODES.STOPWATCH), shouldPersist };
  }

  if (!next.startedAt && next.pomodoroStartedAt) {
    next.startedAt = new Date(next.pomodoroStartedAt).toISOString();
    shouldPersist = true;
  }

  if (next.isRunning && (!next.pomodoroInterval || !next.pomodoroIntervalEndsAt || !next.pomodoroStartedAt || !next.startedAt)) {
    warnTimerState('Pomodoro state is incomplete. Resetting to pomodoro defaults.', legacyState);
    return { state: createDefaultTimerState({ mode: TIMER_MODES.POMODORO }), shouldPersist: true };
  }

  if (!next.isRunning) {
    next.pomodoroPausedAt = null;
  }

  return { state: next, shouldPersist };
}

function readTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) {
      return { state: createDefaultTimerState(), shouldPersist: true };
    }
    return sanitizeTimerState(JSON.parse(raw));
  } catch (error) {
    warnTimerState('Failed to read timer state from localStorage. Resetting to defaults.', error);
    return { state: createDefaultTimerState(), shouldPersist: true };
  }
}

function loadTimerState() {
  const { state, shouldPersist } = readTimerState();
  if (shouldPersist) saveTimerState(state);
  return state;
}

function saveTimerState(state) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function calcStopwatchElapsed(startedAt) {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
}

function getSessionWallClockSeconds(state, now = Date.now()) {
  if (!state?.isRunning) return 0;

  if (state.mode === TIMER_MODES.POMODORO) {
    if (!state.pomodoroStartedAt) return 0;
    return Math.floor((now - state.pomodoroStartedAt) / 1000);
  }

  if (!state.startedAt) return 0;
  return calcStopwatchElapsed(state.startedAt);
}

function getDisplaySeconds(state) {
  if (!state?.isRunning) return 0;

  if (state.mode === TIMER_MODES.POMODORO) {
    if (!state.pomodoroIntervalEndsAt) return 0;
    const now = state.pomodoroPausedAt ?? Date.now();
    return Math.max(0, Math.ceil((state.pomodoroIntervalEndsAt - now) / 1000));
  }

  if (!state.startedAt) return 0;
  return Math.min(calcStopwatchElapsed(state.startedAt), MAX_SECONDS);
}

function getCurrentWorkElapsedSeconds(state, now = Date.now()) {
  if (!state || state.mode !== TIMER_MODES.POMODORO || state.pomodoroInterval !== POMODORO_INTERVALS.WORK || !state.pomodoroIntervalEndsAt) {
    return 0;
  }

  const durationMs = getPomodoroIntervalMs(POMODORO_INTERVALS.WORK);
  const effectiveNow = state.pomodoroPausedAt ?? now;
  const remainingMs = Math.max(0, state.pomodoroIntervalEndsAt - effectiveNow);
  const elapsedMs = Math.min(durationMs, Math.max(0, durationMs - remainingMs));

  return Math.floor(elapsedMs / 1000);
}

function advancePomodoroState(state, { transitionAt, completeCurrentWork = true }) {
  const prevInterval = state.pomodoroInterval;

  if (prevInterval === POMODORO_INTERVALS.WORK) {
    const nextCompletedCycles = state.pomodoroCompletedCycles + (completeCurrentWork ? 1 : 0);
    const nextAccumulatedWorkSeconds = state.pomodoroAccumulatedWorkSeconds
      + (completeCurrentWork ? getPomodoroIntervalSeconds(POMODORO_INTERVALS.WORK) : 0);
    const shouldUseLongBreak = completeCurrentWork
      && nextCompletedCycles > 0
      && nextCompletedCycles % POMODORO_CONFIG.CYCLES_BEFORE_LONG_BREAK === 0;
    const nextInterval = shouldUseLongBreak ? POMODORO_INTERVALS.LONG_BREAK : POMODORO_INTERVALS.SHORT_BREAK;

    return {
      ...state,
      pomodoroCompletedCycles: nextCompletedCycles,
      pomodoroAccumulatedWorkSeconds: nextAccumulatedWorkSeconds,
      pomodoroInterval: nextInterval,
      pomodoroIntervalEndsAt: transitionAt + getPomodoroIntervalMs(nextInterval),
      pomodoroPausedAt: null,
    };
  }

  return {
    ...state,
    pomodoroInterval: POMODORO_INTERVALS.WORK,
    pomodoroIntervalEndsAt: transitionAt + getPomodoroIntervalMs(POMODORO_INTERVALS.WORK),
    pomodoroPausedAt: null,
  };
}

function resolvePomodoroTransitions(state, now, onIntervalEnd) {
  if (
    !state
    || state.mode !== TIMER_MODES.POMODORO
    || !state.isRunning
    || state.pomodoroPausedAt
    || !state.pomodoroInterval
    || !state.pomodoroIntervalEndsAt
  ) {
    return { state, transitioned: false };
  }

  let nextState = state;
  let transitioned = false;

  while (nextState.pomodoroIntervalEndsAt && now >= nextState.pomodoroIntervalEndsAt) {
    const prevInterval = nextState.pomodoroInterval;
    nextState = advancePomodoroState(nextState, {
      transitionAt: nextState.pomodoroIntervalEndsAt,
      completeCurrentWork: true,
    });
    transitioned = true;
    onIntervalEnd?.(prevInterval, nextState.pomodoroInterval);
  }

  return { state: nextState, transitioned };
}

function buildStoppedSession(state, elapsedSeconds) {
  return {
    workType: state.workType || 'deep_work',
    clientIds: state.clientIds || [],
    taskId: state.taskId ?? null,
    taskDescription: state.taskDescription ?? null,
    okrId: state.okrId ?? null,
    notionTaskId: state.notionTaskId ?? null,
    notionTaskName: state.notionTaskName ?? null,
    notionAccount: state.notionAccount ?? null,
    notionOkr: state.notionOkr ?? null,
    pendingTasks: state.pendingTasks || [],
    elapsedSeconds,
    startedAt: state.startedAt,
    mode: state.mode,
    pomodoroCompletedCycles: state.pomodoroCompletedCycles ?? 0,
  };
}

function createIdleState(mode) {
  return createDefaultTimerState({ mode });
}

function clearStoppedPomodoroState(state) {
  return resetPomodoroFields(
    {
      ...state,
      isRunning: false,
      workType: null,
      clientIds: [],
      taskId: null,
      taskDescription: null,
      okrId: null,
      notionTaskId: null,
      notionTaskName: null,
      notionAccount: null,
      notionOkr: null,
      pendingTasks: [],
      startedAt: null,
    },
    TIMER_MODES.POMODORO
  );
}

export function useTimer() {
  const initRef = useRef(undefined);
  if (initRef.current === undefined) {
    const { state, shouldPersist } = readTimerState();
    initRef.current = {
      timerState: state,
      displaySeconds: getDisplaySeconds(state),
      shouldPersist,
    };
  }

  const [timerState, setTimerState] = useState(initRef.current.timerState);
  const [elapsedSeconds, setElapsedSeconds] = useState(initRef.current.displaySeconds);
  const [stoppedSession, setStoppedSession] = useState(null);

  const intervalRef = useRef(null);
  const onIntervalEndRef = useRef(() => {});

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const syncState = useCallback((nextState) => {
    setTimerState(nextState);
    setElapsedSeconds(getDisplaySeconds(nextState));
  }, []);

  const stopStopwatch = useCallback(({ silent = false } = {}) => {
    clearInterval_();

    const current = loadTimerState();
    if (!current.isRunning || current.mode !== TIMER_MODES.STOPWATCH) return null;

    const elapsed = Math.min(calcStopwatchElapsed(current.startedAt), MAX_SECONDS);
    const session = buildStoppedSession(current, elapsed);
    const nextState = createIdleState(TIMER_MODES.STOPWATCH);

    saveTimerState(nextState);
    syncState(nextState);

    if (!silent) setStoppedSession(session);
    return session;
  }, [clearInterval_, syncState]);

  const stopPomodoro = useCallback(({ silent = false } = {}) => {
    clearInterval_();

    const current = loadTimerState();
    if (!current.isRunning || current.mode !== TIMER_MODES.POMODORO) return null;

    const now = Date.now();
    const { state: resolvedState, transitioned } = resolvePomodoroTransitions(current, now, onIntervalEndRef.current);
    const normalizedState = transitioned ? resolvedState : current;

    if (transitioned) {
      saveTimerState(normalizedState);
    }

    let accumulatedSeconds = normalizedState.pomodoroAccumulatedWorkSeconds;
    if (normalizedState.pomodoroInterval === POMODORO_INTERVALS.WORK) {
      accumulatedSeconds += getCurrentWorkElapsedSeconds(normalizedState, now);
    }

    const session = buildStoppedSession(normalizedState, accumulatedSeconds);
    const nextState = silent
      ? createIdleState(TIMER_MODES.POMODORO)
      : {
          ...normalizedState,
          isRunning: false,
          pomodoroPausedAt: null,
        };

    saveTimerState(nextState);
    syncState(nextState);

    if (!silent) setStoppedSession(session);
    return session;
  }, [clearInterval_, syncState]);

  const stopTimer = useCallback((options = {}) => {
    const current = loadTimerState();
    if (!current.isRunning) return null;

    if (current.mode === TIMER_MODES.POMODORO) {
      return stopPomodoro(options);
    }

    return stopStopwatch(options);
  }, [stopPomodoro, stopStopwatch]);

  const tick = useCallback(() => {
    const current = loadTimerState();

    if (!current.isRunning) {
      clearInterval_();
      syncState(current);
      return;
    }

    if (getSessionWallClockSeconds(current) >= MAX_SECONDS) {
      stopTimer();
      return;
    }

    if (current.mode === TIMER_MODES.POMODORO) {
      const { state: nextState, transitioned } = resolvePomodoroTransitions(current, Date.now(), onIntervalEndRef.current);
      if (transitioned) {
        saveTimerState(nextState);
        syncState(nextState);
        return;
      }
    }

    setElapsedSeconds(getDisplaySeconds(current));
  }, [clearInterval_, stopTimer, syncState]);

  const startTick = useCallback(() => {
    clearInterval_();
    tick();
    intervalRef.current = setInterval(tick, 1000);
  }, [clearInterval_, tick]);

  useEffect(() => {
    if (initRef.current.shouldPersist) {
      saveTimerState(initRef.current.timerState);
    }

    if (initRef.current.timerState.isRunning) {
      if (getSessionWallClockSeconds(initRef.current.timerState) >= MAX_SECONDS) {
        stopTimer();
      } else {
        startTick();
      }
    }

    return () => clearInterval_();
  }, [clearInterval_, startTick, stopTimer]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== TIMER_KEY) return;

      let nextState = createDefaultTimerState();
      if (e.newValue) {
        try {
          nextState = sanitizeTimerState(JSON.parse(e.newValue)).state;
        } catch (error) {
          warnTimerState('Failed to sync timer state from another tab. Resetting to defaults.', error);
        }
      }

      if (nextState.isRunning) {
        startTick();
      } else {
        clearInterval_();
      }

      syncState(nextState);
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [clearInterval_, startTick, syncState]);

  const setMode = useCallback((mode) => {
    if (!VALID_TIMER_MODES.has(mode)) {
      warnTimerState('Attempted to set an unknown timer mode.', mode);
      return;
    }

    const current = loadTimerState();
    if (current.isRunning) {
      warnTimerState('Cannot switch timer mode while the timer is running.', current.mode);
      return;
    }

    const nextState = mode === TIMER_MODES.POMODORO
      ? createIdleState(TIMER_MODES.POMODORO)
      : createIdleState(TIMER_MODES.STOPWATCH);

    saveTimerState(nextState);
    syncState(nextState);
  }, [syncState]);

  const startTimer = useCallback((workType, {
    clientIds = [],
    taskId = null,
    taskDescription = null,
    okrId = null,
    notionTaskId = null,
    notionTaskName = null,
    notionAccount = null,
    notionOkr = null,
  } = {}) => {
    const existing = loadTimerState();
    if (existing.isRunning) return;

    const startedAt = new Date().toISOString();
    const nextState = createDefaultTimerState({
      mode: TIMER_MODES.STOPWATCH,
      isRunning: true,
      workType,
      clientIds,
      taskId,
      taskDescription,
      okrId,
      notionTaskId,
      notionTaskName,
      notionAccount,
      notionOkr,
      pendingTasks: [],
      startedAt,
    });

    saveTimerState(nextState);
    syncState(nextState);
    startTick();
  }, [startTick, syncState]);

  const startPomodoro = useCallback(({
    workType = 'deep_work',
    clientIds = [],
    taskId = null,
    taskDescription = null,
    okrId = null,
    notionTaskId = null,
    notionTaskName = null,
    notionAccount = null,
    notionOkr = null,
  } = {}) => {
    console.warn('[pomo] startPomodoro: entered', { workType, clientIds, taskId, okrId, notionTaskId });
    const existing = loadTimerState();
    if (existing.isRunning) {
      console.warn('[pomo] startPomodoro: bailed — timer already running');
      return;
    }

    const now = Date.now();
    const nextState = createDefaultTimerState({
      mode: TIMER_MODES.POMODORO,
      isRunning: true,
      workType,
      clientIds,
      taskId,
      taskDescription,
      okrId,
      notionTaskId,
      notionTaskName,
      notionAccount,
      notionOkr,
      pendingTasks: [],
      startedAt: new Date(now).toISOString(),
      pomodoroInterval: POMODORO_INTERVALS.WORK,
      pomodoroIntervalEndsAt: now + getPomodoroIntervalMs(POMODORO_INTERVALS.WORK),
      pomodoroCompletedCycles: 0,
      pomodoroAccumulatedWorkSeconds: 0,
      pomodoroStartedAt: now,
      pomodoroPausedAt: null,
    });

    saveTimerState(nextState);
    syncState(nextState);
    startTick();
    console.warn('[pomo] startPomodoro: state saved and tick started');
  }, [startTick, syncState]);

  const pausePomodoro = useCallback(() => {
    const current = loadTimerState();
    if (!current.isRunning || current.mode !== TIMER_MODES.POMODORO || current.pomodoroPausedAt) return;

    const nextState = {
      ...current,
      pomodoroPausedAt: Date.now(),
    };

    saveTimerState(nextState);
    syncState(nextState);
  }, [syncState]);

  const resumePomodoro = useCallback(() => {
    const current = loadTimerState();
    if (!current.isRunning || current.mode !== TIMER_MODES.POMODORO || !current.pomodoroPausedAt || !current.pomodoroIntervalEndsAt) return;

    const now = Date.now();
    const pauseDuration = now - current.pomodoroPausedAt;
    const nextState = {
      ...current,
      pomodoroIntervalEndsAt: current.pomodoroIntervalEndsAt + pauseDuration,
      pomodoroPausedAt: null,
    };

    saveTimerState(nextState);
    syncState(nextState);
    startTick();
  }, [startTick, syncState]);

  const skipInterval = useCallback(() => {
    const current = loadTimerState();
    if (!current.isRunning || current.mode !== TIMER_MODES.POMODORO || !current.pomodoroInterval) return;

    const nextState = advancePomodoroState(current, {
      transitionAt: Date.now(),
      completeCurrentWork: current.pomodoroInterval !== POMODORO_INTERVALS.WORK,
    });

    saveTimerState(nextState);
    syncState(nextState);
    onIntervalEndRef.current?.(current.pomodoroInterval, nextState.pomodoroInterval);
    startTick();
  }, [startTick, syncState]);

  const addPendingTask = useCallback((task) => {
    const current = loadTimerState();
    if (!current.isRunning) return;

    const nextState = {
      ...current,
      pendingTasks: [...(current.pendingTasks || []), task],
    };

    saveTimerState(nextState);
    syncState(nextState);
  }, [syncState]);

  const clearStoppedSession = useCallback(() => {
    setStoppedSession(null);

    const current = loadTimerState();
    if (current.mode === TIMER_MODES.POMODORO && !current.isRunning) {
      const nextState = clearStoppedPomodoroState(current);
      saveTimerState(nextState);
      syncState(nextState);
    }
  }, [syncState]);

  const setOnIntervalEnd = useCallback((handler) => {
    onIntervalEndRef.current = typeof handler === 'function' ? handler : () => {};
  }, []);

  return {
    mode: timerState.mode,
    isRunning: timerState.isRunning,
    isPaused: timerState.mode === TIMER_MODES.POMODORO && !!timerState.pomodoroPausedAt,
    workType: timerState.workType ?? null,
    clientIds: timerState.clientIds ?? [],
    taskId: timerState.taskId ?? null,
    okrId: timerState.okrId ?? null,
    notionTaskId: timerState.notionTaskId ?? null,
    notionTaskName: timerState.notionTaskName ?? null,
    notionAccount: timerState.notionAccount ?? null,
    notionOkr: timerState.notionOkr ?? null,
    pendingTasks: timerState.pendingTasks ?? [],
    elapsedSeconds,
    startedAt: timerState.startedAt ?? null,
    stoppedSession,
    pomodoroInterval: timerState.pomodoroInterval ?? null,
    pomodoroIntervalEndsAt: timerState.pomodoroIntervalEndsAt ?? null,
    pomodoroCompletedCycles: timerState.pomodoroCompletedCycles ?? 0,
    pomodoroAccumulatedWorkSeconds: timerState.pomodoroAccumulatedWorkSeconds ?? 0,
    pomodoroStartedAt: timerState.pomodoroStartedAt ?? null,
    pomodoroPausedAt: timerState.pomodoroPausedAt ?? null,
    clearStoppedSession,
    setMode,
    setOnIntervalEnd,
    startTimer,
    stopTimer,
    addPendingTask,
    startPomodoro,
    stopPomodoro,
    pausePomodoro,
    resumePomodoro,
    skipInterval,
  };
}
