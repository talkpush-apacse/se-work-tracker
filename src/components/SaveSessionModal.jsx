import { useState, useMemo } from 'react';
import { Check, Search, X } from 'lucide-react';
import Modal from './Modal';
import WorkTypeSelector from './WorkTypeSelector';
import { ACTIVITY_TYPES, AUTO_TRACK_RATE, WORK_TYPE_LABELS } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { startOfWeek, format } from 'date-fns';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function SaveSessionModal({ session, onClose }) {
  const { addPoint, addTimeLog, customers, okrs } = useAppStore();

  // Compute pre-filled values up-front
  const prefilledHours  = parseFloat((session.elapsedSeconds / 3600).toFixed(2));
  const prefilledPoints = Math.round(prefilledHours * AUTO_TRACK_RATE * 100) / 100;

  const [form, setForm] = useState({
    workType:     session.workType || 'deep_work',
    points:       String(prefilledPoints),
    hours:        String(prefilledHours),
    activityType: '',
    okrId:        session.okrId || '',
    comment:      session.taskDescription || '',
  });

  // Client multi-select state
  const [selectedClientIds, setSelectedClientIds] = useState(() => new Set(session.clientIds || []));
  const [searchQuery, setSearchQuery] = useState('');
  const [errors, setErrors]      = useState({});
  const [showDiscard, setShowDiscard] = useState(false);
  const [showClients, setShowClients] = useState(() => (session.clientIds || []).length > 0);

  // Sort customers: pinned first, then alphabetical
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    }),
    [customers]
  );

  const visibleCustomers = useMemo(
    () => searchQuery.trim()
      ? sortedCustomers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : sortedCustomers,
    [sortedCustomers, searchQuery]
  );

  const selectedCount = selectedClientIds.size;

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

    const hours  = Number(form.hours);
    const points = Number(form.points);
    const okrId  = form.okrId || null;
    const comment = form.comment.trim();
    const clientIds = [...selectedClientIds];

    // Derive weekStart from session startedAt
    const sessionDate = new Date(session.startedAt);
    const weekStart = format(startOfWeek(sessionDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    // 1. Create time_log entry (bandwidth tracking)
    addTimeLog({
      workType: form.workType,
      hours,
      clientIds,
      okrId,
      taskId: session.taskId || null,
      note: comment,
      loggedAt: session.startedAt,
      weekStart,
    });

    // 2. Create points entries (gamification layer — backward compat)
    if (clientIds.length === 0) {
      // No clients tagged — single entry with null customerId
      addPoint({
        customerId: null,
        okrId,
        points,
        hours,
        activityType: form.activityType,
        interactionType: WORK_TYPE_LABELS[form.workType] || '',
        comment,
      });
    } else if (clientIds.length === 1) {
      // Single client — full points
      addPoint({
        customerId: clientIds[0],
        okrId,
        points,
        hours,
        activityType: form.activityType,
        interactionType: WORK_TYPE_LABELS[form.workType] || '',
        comment,
      });
    } else {
      // Multiple clients — split equally
      clientIds.forEach((customerId, i) => {
        const isLast = i === clientIds.length - 1;
        const sharePoints = isLast
          ? Math.round((points - Math.floor(points / clientIds.length * 100) / 100 * (clientIds.length - 1)) * 100) / 100
          : Math.round(points / clientIds.length * 100) / 100;
        const shareHours = isLast
          ? Math.round((hours - Math.floor(hours / clientIds.length * 100) / 100 * (clientIds.length - 1)) * 100) / 100
          : Math.round(hours / clientIds.length * 100) / 100;
        addPoint({
          customerId,
          okrId,
          points: sharePoints,
          hours: shareHours,
          activityType: form.activityType,
          interactionType: WORK_TYPE_LABELS[form.workType] || '',
          comment: `${comment}${clientIds.length > 1 ? ` (split across ${clientIds.length} clients)` : ''}`.trim(),
        });
      });
    }

    onClose();
  };

  const field = (key) => ({
    value:    form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  const toggleClient = (id) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const workTypeLabel = WORK_TYPE_LABELS[form.workType] || form.workType;

  return (
    <Modal title={`Save Session — ${workTypeLabel}`} onClose={() => setShowDiscard(true)} size="md">

      {/* Elapsed time summary */}
      <div className="mb-4 rounded-xl border border-brand-sage/30 bg-brand-sage/10 px-4 py-3">
        <p className="text-xs text-brand-sage font-medium mb-0.5">Session Duration</p>
        <p className="font-mono text-2xl font-bold text-brand-sage tabular-nums">
          {formatHMS(session.elapsedSeconds)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          = {prefilledHours}h / {prefilledPoints.toFixed(1)} pts
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Work Type selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Work Type *</label>
          <WorkTypeSelector
            value={form.workType}
            onChange={(wt) => setForm(p => ({ ...p, workType: wt }))}
            size="sm"
          />
        </div>

        {/* Points & Hours */}
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
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hours *</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...field('hours')}
            />
            {errors.hours && <p className="mt-1 text-xs text-destructive">{errors.hours}</p>}
          </div>
        </div>

        {/* Client tags (optional, collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowClients(p => !p)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{showClients ? '▾' : '▸'}</span>
            Tag Clients {selectedCount > 0 && `(${selectedCount})`}
            <span className="text-muted-foreground/50">(optional)</span>
          </button>

          {showClients && (
            <div className="mt-2">
              {selectedCount > 1 && (
                <p className="text-[10px] text-muted-foreground mb-1.5">
                  Hours will be split equally across all tagged clients in reports.
                </p>
              )}
              {/* Search */}
              {customers.length > 5 && (
                <div className="relative mb-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-secondary/30">
                {visibleCustomers.map(customer => {
                  const isSelected = selectedClientIds.has(customer.id);
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => toggleClient(customer.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-all border-b border-border/30 last:border-b-0 ${
                        isSelected ? 'bg-brand-lavender/10' : 'hover:bg-secondary/80'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? 'bg-brand-lavender border-brand-lavender' : 'border-border'
                      }`}>
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                      <div
                        className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-bold"
                        style={{ backgroundColor: customer.color + '22', color: customer.color }}
                      >
                        {customer.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs text-foreground truncate">{customer.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Phase Type */}
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

        {/* OKR selector */}
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

        {/* Comment */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Note <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            placeholder="What did you accomplish in this session?"
            rows={2}
            {...field('comment')}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-3 sticky bottom-0 bg-background -mx-6 px-6 -mb-5 pb-5 border-t border-border/50">
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
            Save Session
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
