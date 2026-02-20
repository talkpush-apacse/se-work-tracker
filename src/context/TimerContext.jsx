import { createContext, useContext, useEffect, useRef } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useAppStore } from './StoreContext';

const TimerContext = createContext(null);

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

  return (
    <TimerContext.Provider value={timer}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimerContext() {
  return useContext(TimerContext);
}
