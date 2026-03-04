import { useState } from 'react';
import Modal from './Modal';
import { ACTIVITY_TYPES, TASK_INTERACTION_TYPES, TASK_INTERACTION_TYPE_LABELS } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';

export default function AddPointsModal({ customer, onClose, onSuccess }) {
  const { addPoint, okrs } = useAppStore();
  const [form, setForm] = useState({
    points: '',
    hours: '',
    activityType:    '',
    interactionType: '',
    okrId:           '',
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
      customerId: customer.id,
      okrId: form.okrId || null,
      points: Number(form.points),
      hours: Number(form.hours),
      activityType:    form.activityType,
      interactionType: form.interactionType,
      comment:         form.comment.trim(),
    });
    onSuccess?.(entry);
    onClose();
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <Modal title={`Add Points — ${customer.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Points *</label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 5"
              {...field('points')}
            />
            {errors.points && <p className="mt-1 text-xs text-destructive">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hours Invested *</label>
            <Input
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 1.5"
              {...field('hours')}
            />
            {errors.hours && <p className="mt-1 text-xs text-destructive">{errors.hours}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Phase Type <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            {...field('activityType')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select phase...</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Interaction Type <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            {...field('interactionType')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select type...</option>
            {TASK_INTERACTION_TYPES.map(t => <option key={t} value={t}>{TASK_INTERACTION_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {/* Optional OKR selector */}
        {okrs.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              OKR <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <select
              {...field('okrId')}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">No OKR</option>
              {okrs.map(o => <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Comment <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            placeholder="What did you do? e.g. Helped debug Workday sync issue"
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
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="flex-1"
          >
            Add Points
          </Button>
        </div>
      </form>
    </Modal>
  );
}
