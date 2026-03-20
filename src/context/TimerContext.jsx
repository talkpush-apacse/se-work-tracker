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

  // Memoised control value — reference stays stable between every 1-second tick,
  // so components that only need start/stop/state don't re-render every second.
  const controlValue = useMemo(
    () => ({
      isRunning: timer.isRunning,
      workType: timer.workType,
      clientIds: timer.clientIds,
      taskId: timer.taskId,
      pendingTasks: timer.pendingTasks,
      startedAt: timer.startedAt,
      stoppedSession: timer.stoppedSession,
      clearStoppedSession: timer.clearStoppedSession,
      startTimer: timer.startTimer,
      stopTimer: timer.stopTimer,
      addPendingTask: timer.addPendingTask,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      timer.isRunning, timer.workType, timer.clientIds, timer.taskId, timer.pendingTasks,
      timer.startedAt, timer.stoppedSession, timer.clearStoppedSession,
      timer.startTimer, timer.stopTimer, timer.addPendingTask,
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
 * Returns stable control values (isRunning, workType, clientIds, taskId, startedAt,
 * stoppedSession, clearStoppedSession, startTimer, stopTimer).
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
