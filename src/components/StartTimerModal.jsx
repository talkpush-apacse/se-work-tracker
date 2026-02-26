import { useState } from 'react';
import { Timer } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import { Button } from './ui/button';

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
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Project *</label>
          <select
            value={selectedProjectId}
            onChange={(e) => { setSelectedProjectId(e.target.value); setError(''); }}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
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
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          {activeProjects.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No active projects. Create one first.</p>
          )}
        </div>

        <div className="rounded-xl bg-secondary/50 border border-border/50 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            ⏱ Timer runs until you click Stop (max 12 hours). Survives page refresh. You can edit the time before saving.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="sage"
            size="sm"
            onClick={handleStart}
            disabled={activeProjects.length === 0}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Timer size={15} />
            Start Timer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
