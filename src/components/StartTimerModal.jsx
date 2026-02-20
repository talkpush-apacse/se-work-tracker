import { useState } from 'react';
import { Timer } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';

export default function StartTimerModal({ onClose, preselectedProjectId = null }) {
  const { projects, customers } = useAppStore();
  const { startTimer } = useTimerContext();
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || '');
  const [error, setError] = useState('');

  const activeProjects = projects.filter(p => p.status === 'Active');

  const getCustomer = (project) => customers.find(c => c.id === project.customerId);

  const handleStart = () => {
    if (!selectedProjectId) {
      setError('Please select a project to time');
      return;
    }
    startTimer(selectedProjectId);
    onClose();
  };

  return (
    <Modal title="Start Stopwatch" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Project *</label>
          <select
            value={selectedProjectId}
            onChange={(e) => { setSelectedProjectId(e.target.value); setError(''); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
          >
            <option value="">Select project...</option>
            {activeProjects.map(p => {
              const c = getCustomer(p);
              return (
                <option key={p.id} value={p.id}>
                  {c ? `[${c.name}] ` : ''}{p.name}
                </option>
              );
            })}
          </select>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          {activeProjects.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">No active projects. Create one first.</p>
          )}
        </div>

        <div className="rounded-xl bg-gray-800/60 border border-gray-700/50 px-3 py-2.5">
          <p className="text-xs text-gray-400 leading-relaxed">
            ⏱ Timer runs until you click Stop (max 12 hours). Survives page refresh. You can edit the time before saving.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={activeProjects.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-white transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
          >
            <Timer size={15} />
            Start Timer
          </button>
        </div>
      </div>
    </Modal>
  );
}
