import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useAppStore } from './StoreContext';

// Control context — stable values that only change on start / stop
const TimerControlContext = createContext(null);

// Display context — volatile value that updates every second while running
const TimerDisplayContext = createContext(0);

export function TimerProvider({ children }) {
  const timer = useTimer();
  const { projects } = useAppStore();

  // If the project being timed gets deleted, auto-stop the timer
  const stopTimerRef = useRef(timer.stopTimer);
  stopTimerRef.current = timer.stopTimer;

  useEffect(() => {
    if (timer.isRunning && timer.projectId) {
      const stillExists = projects.some(p => p.id === timer.projectId);
      if (!stillExists) {
        stopTimerRef.current();
      }
    }
  }, [projects, timer.isRunning, timer.projectId]);

  // Memoised control value — reference stays stable between every 1-second tick,
  // so components that only need start/stop/state don't re-render every second.
  const controlValue = useMemo(
    () => ({
      isRunning: timer.isRunning,
      projectId: timer.projectId,
      taskId: timer.taskId,
      startedAt: timer.startedAt,
      stoppedSession: timer.stoppedSession,
      clearStoppedSession: timer.clearStoppedSession,
      startTimer: timer.startTimer,
      stopTimer: timer.stopTimer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      timer.isRunning, timer.projectId, timer.taskId, timer.startedAt,
      timer.stoppedSession, timer.clearStoppedSession, timer.startTimer, timer.stopTimer,
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
 * Returns stable control values (isRunning, projectId, taskId, startedAt,
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
