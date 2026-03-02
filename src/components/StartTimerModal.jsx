import { useState } from 'react';
import { Timer } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import { Button } from './ui/button';

export default function StartTimerModal({ onClose, preselectedCustomerId = null }) {
  const { customers } = useAppStore();
  const { startTimer } = useTimerContext();
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [error, setError] = useState('');

  const handleStart = () => {
    if (!selectedCustomerId) {
      setError('Please select a customer to time');
      return;
    }
    startTimer(selectedCustomerId);
    onClose();
  };

  return (
    <Modal title="Start Stopwatch" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer *</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => { setSelectedCustomerId(e.target.value); setError(''); }}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select customer...</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          {customers.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No customers. Create one first.</p>
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
            disabled={customers.length === 0}
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
