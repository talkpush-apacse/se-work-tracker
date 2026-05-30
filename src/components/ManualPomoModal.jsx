import { useMemo, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import Modal from './Modal';
import WorkTypeSelector from './WorkTypeSelector';
import { AUTO_TRACK_RATE, POMODORO_CONFIG, WORK_TYPE_LABELS } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function formatDateTimeLocal(date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export default function ManualPomoModal({ onClose, initialDateTime }) {
  const { addPoint, addTimeLog, customers, okrs } = useAppStore();
  const [form, setForm] = useState(() => ({
    loggedAt: formatDateTimeLocal(initialDateTime ? new Date(initialDateTime) : new Date()),
    cycles: '',
    workType: '',
    customerId: '',
    okrId: '',
    note: '',
  }));
  const [errors, setErrors] = useState({});

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    }),
    [customers],
  );

  const cyclesNumber = Number(form.cycles);
  const previewHours = Number.isFinite(cyclesNumber) && cyclesNumber > 0
    ? roundToTwo((cyclesNumber * POMODORO_CONFIG.WORK_MINUTES) / 60)
    : 0;
  const previewPoints = roundToTwo(previewHours * AUTO_TRACK_RATE);

  const setField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.loggedAt) {
      nextErrors.loggedAt = 'Choose when the Pomo happened';
    } else if (Number.isNaN(new Date(form.loggedAt).getTime())) {
      nextErrors.loggedAt = 'Enter a valid date and time';
    }

    if (!form.workType) nextErrors.workType = 'Select a work type';

    if (!form.cycles) {
      nextErrors.cycles = 'Enter the number of cycles';
    } else if (!Number.isInteger(cyclesNumber) || cyclesNumber <= 0) {
      nextErrors.cycles = 'Cycles must be a whole number greater than 0';
    }

    return nextErrors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const loggedAtDate = new Date(form.loggedAt);
    const loggedAt = loggedAtDate.toISOString();
    const hours = roundToTwo((cyclesNumber * POMODORO_CONFIG.WORK_MINUTES) / 60);
    const points = roundToTwo(hours * AUTO_TRACK_RATE);
    const weekStart = format(startOfWeek(loggedAtDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const customerId = form.customerId || null;
    const okrId = form.okrId || null;
    const note = form.note.trim();

    addTimeLog({
      workType: form.workType,
      hours,
      clientIds: customerId ? [customerId] : [],
      okrId,
      taskId: null,
      note,
      loggedAt,
      weekStart,
      source: 'pomodoro',
      pomodoroCycles: cyclesNumber,
    });

    addPoint({
      customerId,
      okrId,
      points,
      hours,
      activityType: '',
      interactionType: WORK_TYPE_LABELS[form.workType],
      comment: note,
      source: 'pomodoro',
      pomodoroCycles: cyclesNumber,
      timestamp: loggedAt,
    });

    onClose();
  };

  return (
    <Modal title="Log Manual Pomo" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">When *</label>
          <Input
            type="datetime-local"
            value={form.loggedAt}
            onChange={(event) => setField('loggedAt', event.target.value)}
          />
          {errors.loggedAt && <p className="mt-1 text-xs text-destructive">{errors.loggedAt}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Work Type *</label>
          <WorkTypeSelector
            value={form.workType}
            onChange={(value) => setField('workType', value)}
            size="sm"
          />
          {errors.workType && <p className="mt-1 text-xs text-destructive">{errors.workType}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cycles *</label>
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 4"
            value={form.cycles}
            onChange={(event) => setField('cycles', event.target.value)}
          />
          {errors.cycles && <p className="mt-1 text-xs text-destructive">{errors.cycles}</p>}
        </div>

        <div className="rounded-xl border border-brand-sage/30 bg-brand-sage/10 px-4 py-3">
          <p className="text-xs font-medium text-brand-sage mb-0.5">Derived from {POMODORO_CONFIG.WORK_MINUTES}-minute focus cycles</p>
          <p className="font-mono text-2xl font-bold text-brand-sage tabular-nums">
            {previewHours.toFixed(2)}h / {previewPoints.toFixed(2)} pts
          </p>
        </div>

        {sortedCustomers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Client <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <select
              value={form.customerId}
              onChange={(event) => setField('customerId', event.target.value)}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">No client</option>
              {sortedCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>
        )}

        {okrs.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              OKR <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <select
              value={form.okrId}
              onChange={(event) => setField('okrId', event.target.value)}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">No OKR</option>
              {okrs.map((okr) => (
                <option key={okr.id} value={okr.id}>{okr.quarter} — {okr.title}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Note <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={form.note}
            onChange={(event) => setField('note', event.target.value)}
            placeholder="What did you work on?"
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
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
            type="submit"
            variant="sage"
            size="sm"
            className="flex-1"
          >
            Log Pomo
          </Button>
        </div>
      </form>
    </Modal>
  );
}
