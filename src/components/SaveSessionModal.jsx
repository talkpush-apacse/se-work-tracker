import { useState } from 'react';
import Modal from './Modal';
import { ACTIVITY_TYPES, AUTO_TRACK_RATE } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';

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
  const prefilledPoints = Math.round(prefilledHours * AUTO_TRACK_RATE * 100) / 100;

  const [form, setForm] = useState({
    points: String(prefilledPoints),
    hours: String(prefilledHours),
    activityType: '',
    // Pre-fill from task description when timer was started on a specific task
    comment: session.taskDescription || '',
  });
  const [errors, setErrors] = useState({});
  const [showDiscard, setShowDiscard] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.points || isNaN(form.points) || Number(form.points) <= 0)
      e.points = 'Enter a valid positive number';
    if (!form.hours || isNaN(form.hours) || Number(form.hours) < 0)
      e.hours = 'Enter a valid number';
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
        <div className="mb-4 rounded-xl border border-brand-amber/40 bg-brand-amber/10 px-3 py-2.5">
          <p className="text-xs text-brand-amber font-medium">⚠️ The project for this session was deleted. The entry will be saved but will appear as "Unknown" in your history.</p>
        </div>
      )}

      {/* Elapsed time summary */}
      <div className="mb-4 rounded-xl border border-brand-sage/30 bg-brand-sage/10 px-4 py-3">
        <p className="text-xs text-brand-sage font-medium mb-0.5">Session Duration</p>
        <p className="font-mono text-2xl font-bold text-brand-sage tabular-nums">
          {formatHMS(session.elapsedSeconds)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          = {prefilledHours}h / {prefilledPoints} pts · pre-filled below, edit if needed
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Points *</label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 5"
              autoFocus
              {...field('points')}
            />
            {errors.points && <p className="mt-1 text-xs text-destructive">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hours Invested *</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...field('hours')}
            />
            {errors.hours && <p className="mt-1 text-xs text-destructive">{errors.hours}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Activity Type <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            {...field('activityType')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select activity...</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {errors.activityType && <p className="mt-1 text-xs text-destructive">{errors.activityType}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Comment <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            placeholder="What did you accomplish in this session?"
            rows={2}
            {...field('comment')}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowDiscard(true)}
            className="flex-1"
          >
            Discard
          </Button>
          <Button
            type="submit"
            size="sm"
            className="flex-1"
          >
            Save Points
          </Button>
        </div>
      </form>

      {/* Discard confirmation — z-60 to sit above this z-50 modal */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-2">Discard this session?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              The recorded time will be lost and no points will be saved. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDiscard(false)}
              >
                Keep Editing
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onClose}
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
