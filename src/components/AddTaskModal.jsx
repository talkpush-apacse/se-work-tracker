import { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import {
  TASK_TYPES, TASK_TYPE_LABELS,
  TASK_STATUSES, TASK_STATUS_LABELS,
  TASK_RECIPIENTS,
} from '../constants';

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
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Check size={13} />
            Task saved! Add another one.
          </div>
        )}

        {/* Running count badge */}
        {savedCount > 0 && !showFlash && (
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-indigo-400">{savedCount}</span> {savedCount === 1 ? 'task' : 'tasks'} added this session
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Task Description *</label>
          <textarea
            ref={textareaRef}
            rows={3}
            autoFocus
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What needs to be done?"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
          />
          {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Task Type</label>
            <select
              value={form.taskType}
              onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              {TASK_STATUSES.map(s => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Recipient <span className="text-gray-600">(optional)</span>
          </label>
          <select
            value={form.assigneeOrTeam}
            onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            <option value="">— Select recipient —</option>
            {TASK_RECIPIENTS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2 pt-1">
          {/* Save & Add Another — full width, secondary style */}
          <button
            type="button"
            onClick={handleSaveAndAnother}
            className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 border border-gray-600 text-sm font-semibold text-gray-200 transition-colors"
          >
            + Save & Add Another
          </button>

          {/* Cancel + Done row */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-400 transition-colors"
            >
              {savedCount > 0 ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors"
            >
              Add Task
            </button>
          </div>
        </div>

      </form>
    </Modal>
  );
}
