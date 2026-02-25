import { useState } from 'react';
import Modal from './Modal';
import { ACTIVITY_TYPES } from '../constants';
import { useAppStore } from '../context/StoreContext';

export default function AddPointsModal({ project, onClose, onSuccess }) {
  const { addPoint } = useAppStore();
  const [form, setForm] = useState({
    points: '',
    hours: '',
    activityType: '',
    comment: '',
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.points || isNaN(form.points) || Number(form.points) <= 0) e.points = 'Enter a valid positive number';
    if (!form.hours || isNaN(form.hours) || Number(form.hours) < 0) e.hours = 'Enter a valid number';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const entry = addPoint({
      projectId: project.id,
      points: Number(form.points),
      hours: Number(form.hours),
      activityType: form.activityType,
      comment: form.comment.trim(),
    });
    onSuccess?.(entry);
    onClose();
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <Modal title={`Add Points — ${project.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Points *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 5"
              {...field('points')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.points && <p className="mt-1 text-xs text-red-400">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Hours Invested *</label>
            <input
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 1.5"
              {...field('hours')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.hours && <p className="mt-1 text-xs text-red-400">{errors.hours}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Activity Type <span className="text-gray-600">(optional)</span></label>
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
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Comment <span className="text-gray-600">(optional)</span></label>
          <textarea
            placeholder="What did you do? e.g. Helped debug Workday sync issue"
            rows={2}
            {...field('comment')}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
          />
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
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors shadow-lg shadow-indigo-600/30"
          >
            Add Points
          </button>
        </div>
      </form>
    </Modal>
  );
}
