import { Play } from 'lucide-react';
import { useTimerContext } from '../context/TimerContext';

export default function QuickStartFAB() {
  const { isRunning, stoppedSession, startTimer } = useTimerContext();

  // Hide when a timer is running or the save modal is pending
  if (isRunning || stoppedSession) return null;

  return (
    <button
      onClick={() => startTimer('deep_work')}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-900/30 px-5 py-3.5 transition-all md:bottom-8 md:right-8"
      title="Quick start Deep Work timer"
    >
      <Play size={18} fill="currentColor" />
      <span className="text-sm font-semibold">Start</span>
    </button>
  );
}
