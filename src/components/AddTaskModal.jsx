import { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import {
  TASK_TYPES, TASK_TYPE_LABELS,
  TASK_STATUSES, TASK_STATUS_LABELS,
  TASK_RECIPIENTS,
} from '../constants';
import { Button } from './ui/button';

const BLANK_FORM = {
  description: '',
  taskType: 'mine',
  assigneeOrTeam: '',
  status: 'open',
};

export default function AddTaskModal({ project, onClose }) {
  const { addTask } = useAppStore();
  const [form, setForm] = useState(BLANK_FORM);
  const [errors, setErrors] = useState({});
  const [savedCount, setSavedCount] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const textareaRef = useRef(null);

  // Refocus textarea when flash appears (after "Save & Add Another")
  useEffect(() => {
    if (showFlash) {
      const t = setTimeout(() => setShowFlash(false), 1800);
      return () => clearTimeout(t);
    }
  }, [showFlash]);

  const validate = () => {
    const e = {};
    if (!form.description.trim()) e.description = 'Required';
    return e;
  };

  const saveTask = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return false; }
    addTask({
      projectId: project.id,
      meetingEntryId: null,
      description: form.description.trim(),
      taskType: form.taskType,
      assigneeOrTeam: form.assigneeOrTeam || null,
      status: form.status,
    });
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saveTask()) onClose();
  };

  const handleSaveAndAnother = () => {
    if (!saveTask()) return;
    setSavedCount(n => n + 1);
    setForm(BLANK_FORM);
    setErrors({});
    setShowFlash(true);
    // Refocus after state settles
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <Modal title="Add Task" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Saved confirmation flash */}
        {showFlash && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-sage/15 border border-brand-sage/20 text-brand-sage text-xs font-semibold">
            <Check size={13} />
            Task saved! Add another one.
          </div>
        )}

        {/* Running count badge */}
        {savedCount > 0 && !showFlash && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-brand-lavender">{savedCount}</span> {savedCount === 1 ? 'task' : 'tasks'} added this session
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Task Description *</label>
          <textarea
            ref={textareaRef}
            rows={3}
            autoFocus
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What needs to be done?"
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
          {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Task Type</label>
            <select
              value={form.taskType}
              onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              {TASK_STATUSES.map(s => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Recipient <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            value={form.assigneeOrTeam}
            onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">— Select recipient —</option>
            {TASK_RECIPIENTS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2 pt-1">
          {/* Save & Add Another — full width, secondary style */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSaveAndAnother}
            className="w-full"
          >
            + Save & Add Another
          </Button>

          {/* Cancel + Done row */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="flex-1"
            >
              {savedCount > 0 ? 'Done' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="flex-1"
            >
              Add Task
            </Button>
          </div>
        </div>

      </form>
    </Modal>
  );
}
