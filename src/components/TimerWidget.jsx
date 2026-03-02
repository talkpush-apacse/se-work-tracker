import { useState, useEffect } from 'react';
import { Timer, Square } from 'lucide-react';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { useAppStore } from '../context/StoreContext';
import SaveSessionModal from './SaveSessionModal';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function TimerWidget() {
  const {
    isRunning,
    customerId,
    stoppedSession,
    clearStoppedSession,
    stopTimer,
  } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();
  const { customers } = useAppStore();
  const [showSave, setShowSave] = useState(false);

  // Open save modal when timer stops
  useEffect(() => {
    if (stoppedSession) {
      setShowSave(true);
    }
  }, [stoppedSession]);

  const handleSaveClose = () => {
    setShowSave(false);
    clearStoppedSession();
  };

  // Nothing to render when not running and no pending save
  if (!isRunning && !showSave) return null;

  const activeCustomerId = isRunning ? customerId : stoppedSession?.customerId;
  const customer = customers.find(c => c.id === activeCustomerId);
  // When customerId is null, it's a General Focus Time session
  const isGeneralFocusTime = !activeCustomerId;

  return (
    <>
      {isRunning && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/60 px-5 py-3 shadow-lg shadow-emerald-900/20 animate-fade-in">
          {/* Pulsing indicator + customer info */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>

            <Timer size={15} className="text-emerald-400 flex-shrink-0" />

            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {isGeneralFocusTime ? 'General Focus Time' : (customer?.name ?? 'Unknown Customer')}
              </p>
              {customer && !isGeneralFocusTime && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-tight"
                  style={{
                    backgroundColor: (customer.color || '#10b981') + '22',
                    color: customer.color || '#10b981',
                    border: `1px solid ${customer.color || '#10b981'}40`,
                  }}
                >
                  {customer.name}
                </span>
              )}
            </div>
          </div>

          {/* Live elapsed clock */}
          <span className="font-mono text-lg font-bold text-emerald-300 tabular-nums flex-shrink-0">
            {formatHMS(elapsedSeconds)}
          </span>

          {/* Stop button */}
          <button
            onClick={stopTimer}
            className="flex items-center gap-1.5 rounded-xl bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-600/40 hover:text-red-300 flex-shrink-0 border border-red-700/30"
          >
            <Square size={11} fill="currentColor" />
            Stop
          </button>
        </div>
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
