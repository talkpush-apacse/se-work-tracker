import { createContext, useContext, useEffect, useMemo } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useAppStore } from './StoreContext';

// Control context — stable values that only change on start / stop
const TimerControlContext = createContext(null);

// Display context — volatile value that updates every second while running
const TimerDisplayContext = createContext(0);

export function TimerProvider({ children }) {
  const timer = useTimer();
  const { customers } = useAppStore();

  // If tagged clients are deleted while timer is running, remove them from timer state
  // (but don't stop the timer — work type is the primary dimension now)
  useEffect(() => {
    if (timer.isRunning && timer.clientIds.length > 0) {
      const stillExist = timer.clientIds.filter(id => customers.some(c => c.id === id));
      if (stillExist.length < timer.clientIds.length) {
        // Some clients were deleted — update timer state in localStorage
        try {
          const raw = localStorage.getItem('gpt-active-timer');
          if (raw) {
            const state = JSON.parse(raw);
            state.clientIds = stillExist;
            localStorage.setItem('gpt-active-timer', JSON.stringify(state));
          }
        } catch { /* ignore */ }
      }
    }
  }, [customers, timer.isRunning, timer.clientIds]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;

    window.setMode = timer.setMode;
    window.startPomodoro = timer.startPomodoro;
    window.stopPomodoro = timer.stopPomodoro;
    window.pausePomodoro = timer.pausePomodoro;
    window.resumePomodoro = timer.resumePomodoro;
    window.skipPomodoroInterval = timer.skipInterval;
    window.getTimerState = () => ({
      mode: timer.mode,
      isRunning: timer.isRunning,
      isPaused: timer.isPaused,
      workType: timer.workType,
      clientIds: timer.clientIds,
      taskId: timer.taskId,
      okrId: timer.okrId,
      notionTaskId: timer.notionTaskId,
      notionTaskName: timer.notionTaskName,
      notionAccount: timer.notionAccount,
      pendingTasks: timer.pendingTasks,
      startedAt: timer.startedAt,
      pomodoroInterval: timer.pomodoroInterval,
      pomodoroIntervalEndsAt: timer.pomodoroIntervalEndsAt,
      pomodoroCompletedCycles: timer.pomodoroCompletedCycles,
      pomodoroAccumulatedWorkSeconds: timer.pomodoroAccumulatedWorkSeconds,
      pomodoroStartedAt: timer.pomodoroStartedAt,
      pomodoroPausedAt: timer.pomodoroPausedAt,
      elapsedSeconds: timer.elapsedSeconds,
      stoppedSession: timer.stoppedSession,
    });

    return () => {
      delete window.setMode;
      delete window.startPomodoro;
      delete window.stopPomodoro;
      delete window.pausePomodoro;
      delete window.resumePomodoro;
      delete window.skipPomodoroInterval;
      delete window.getTimerState;
    };
  }, [
    timer.mode, timer.isRunning, timer.isPaused, timer.workType, timer.clientIds, timer.taskId,
    timer.okrId, timer.notionTaskId, timer.notionTaskName, timer.notionAccount,
    timer.pendingTasks, timer.startedAt, timer.pomodoroInterval, timer.pomodoroIntervalEndsAt,
    timer.pomodoroCompletedCycles, timer.pomodoroAccumulatedWorkSeconds, timer.pomodoroStartedAt,
    timer.pomodoroPausedAt, timer.elapsedSeconds, timer.stoppedSession, timer.setMode,
    timer.startPomodoro, timer.stopPomodoro, timer.pausePomodoro, timer.resumePomodoro,
    timer.skipInterval,
  ]);

  // Memoised control value — reference stays stable between every 1-second tick,
  // so components that only need start/stop/state don't re-render every second.
  const controlValue = useMemo(
    () => ({
      mode: timer.mode,
      isRunning: timer.isRunning,
      isPaused: timer.isPaused,
      workType: timer.workType,
      clientIds: timer.clientIds,
      taskId: timer.taskId,
      okrId: timer.okrId,
      notionTaskId: timer.notionTaskId,
      notionTaskName: timer.notionTaskName,
      notionAccount: timer.notionAccount,
      notionOkr: timer.notionOkr,
      notionOkrPageId: timer.notionOkrPageId,
      pendingTasks: timer.pendingTasks,
      startedAt: timer.startedAt,
      stoppedSession: timer.stoppedSession,
      pomodoroInterval: timer.pomodoroInterval,
      pomodoroIntervalEndsAt: timer.pomodoroIntervalEndsAt,
      pomodoroCompletedCycles: timer.pomodoroCompletedCycles,
      pomodoroAccumulatedWorkSeconds: timer.pomodoroAccumulatedWorkSeconds,
      pomodoroStartedAt: timer.pomodoroStartedAt,
      pomodoroPausedAt: timer.pomodoroPausedAt,
      clearStoppedSession: timer.clearStoppedSession,
      setMode: timer.setMode,
      setOnIntervalEnd: timer.setOnIntervalEnd,
      startTimer: timer.startTimer,
      stopTimer: timer.stopTimer,
      addPendingTask: timer.addPendingTask,
      startPomodoro: timer.startPomodoro,
      stopPomodoro: timer.stopPomodoro,
      pausePomodoro: timer.pausePomodoro,
      resumePomodoro: timer.resumePomodoro,
      skipInterval: timer.skipInterval,
    }),
    [
      timer.mode, timer.isRunning, timer.isPaused, timer.workType, timer.clientIds, timer.taskId,
      timer.okrId, timer.notionTaskId, timer.notionTaskName, timer.notionAccount, timer.notionOkr, timer.notionOkrPageId,
      timer.pendingTasks, timer.startedAt, timer.stoppedSession, timer.pomodoroInterval,
      timer.pomodoroIntervalEndsAt, timer.pomodoroCompletedCycles, timer.pomodoroAccumulatedWorkSeconds,
      timer.pomodoroStartedAt, timer.pomodoroPausedAt, timer.clearStoppedSession, timer.setMode,
      timer.setOnIntervalEnd, timer.startTimer, timer.stopTimer, timer.addPendingTask,
      timer.startPomodoro, timer.stopPomodoro, timer.pausePomodoro, timer.resumePomodoro,
      timer.skipInterval,
    ]
  );

  return (
    <TimerControlContext.Provider value={controlValue}>
      <TimerDisplayContext.Provider value={timer.elapsedSeconds}>
        {children}
      </TimerDisplayContext.Provider>
    </TimerControlContext.Provider>
  );
}

/**
 * Returns stable control values and actions for stopwatch + pomodoro state.
 * Does NOT re-render on every timer tick — only on start/stop/session events.
 */
export function useTimerContext() {
  return useContext(TimerControlContext);
}

/**
 * Returns the live elapsed seconds (updates every second while running).
 * Use this only in components that need to display the running clock.
 */
export function useTimerDisplay() {
  return useContext(TimerDisplayContext);
}
