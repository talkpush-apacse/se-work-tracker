import { useState } from 'react';
import Modal from './Modal';
import { ACTIVITY_TYPES } from '../constants';
import { useAppStore } from '../context/StoreContext';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function SaveSessionModal({ session, onClose }) {
  const { addPoint, projects } = useAppStore();

  const project = projects.find(p => p.id === session.projectId);
  const prefilledHours = parseFloat((session.elapsedSeconds / 3600).toFixed(2));

  const [form, setForm] = useState({
    points: '',
    hours: String(prefilledHours),
    activityType: '',
    comment: '',
  });
  const [errors, setErrors] = useState({});
  const [showDiscard, setShowDiscard] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.points || isNaN(form.points) || Number(form.points) <= 0)
      e.points = 'Enter a valid positive number';
    if (!form.hours || isNaN(form.hours) || Number(form.hours) < 0)
      e.hours = 'Enter a valid number';
    if (!form.activityType) e.activityType = 'Select an activity type';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    addPoint({
      projectId: session.projectId,
      points: Number(form.points),
      hours: Number(form.hours),
      activityType: form.activityType,
      comment: form.comment.trim(),
    });
    onClose();
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  const projectName = project?.name ?? 'Unknown Project';

  return (
    <Modal title={`Save Session — ${projectName}`} onClose={() => setShowDiscard(true)} size="md">
      {/* Orphaned project warning */}
      {!project && (
        <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2.5">
          <p className="text-xs text-amber-400 font-medium">⚠️ The project for this session was deleted. The entry will be saved but will appear as "Unknown" in your history.</p>
        </div>
      )}

      {/* Elapsed time summary */}
      <div className="mb-4 rounded-xl border border-emerald-700/40 bg-emerald-950/40 px-4 py-3">
        <p className="text-xs text-emerald-400 font-medium mb-0.5">Session Duration</p>
        <p className="font-mono text-2xl font-bold text-emerald-300 tabular-nums">
          {formatHMS(session.elapsedSeconds)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          = {prefilledHours}h · pre-filled below, edit if needed
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Points *</label>
            <input
              type="number"
              step="1"
              min="1"
              placeholder="e.g. 5"
              autoFocus
              {...field('points')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.points && <p className="mt-1 text-xs text-red-400">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Hours Invested *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...field('hours')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.hours && <p className="mt-1 text-xs text-red-400">{errors.hours}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Activity Type *</label>
          <select
            {...field('activityType')}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            <option value="">Select activity...</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {errors.activityType && <p className="mt-1 text-xs text-red-400">{errors.activityType}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Comment <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            placeholder="What did you accomplish in this session?"
            rows={2}
            {...field('comment')}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowDiscard(true)}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-300 transition-colors"
          >
            Discard
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors shadow-lg shadow-indigo-600/30"
          >
            Save Points
          </button>
        </div>
      </form>

      {/* Discard confirmation — z-60 to sit above this z-50 modal */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 animate-slide-up">
            <h3 className="text-base font-semibold text-white mb-2">Discard this session?</h3>
            <p className="text-sm text-gray-400 mb-5">
              The recorded time will be lost and no points will be saved. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDiscard(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
              >
                Keep Editing
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
