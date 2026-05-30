import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import WorkTypeSelector from './WorkTypeSelector';
import { AUTO_TRACK_RATE, WORK_TYPE_LABELS } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { startOfWeek, format } from 'date-fns';
import { resolveNotionAccount, saveNotionCustomerMapping } from '../lib/notionCustomerMap';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

let rowIdCounter = 0;
function nextRowId() { return `row-${++rowIdCounter}`; }

export default function SaveSessionModal({ session, onClose }) {
  const { addPoint, addTimeLog, customers, okrs } = useAppStore();

  // Compute pre-filled values up-front
  const prefilledHours  = parseFloat((session.elapsedSeconds / 3600).toFixed(2));
  const prefilledPoints = Math.round(prefilledHours * AUTO_TRACK_RATE * 100) / 100;

  // Shared fields
  const [workType, setWorkType] = useState(session.workType || 'deep_work');
  const [points, setPoints]     = useState(String(prefilledPoints));
  const [hours, setHours]       = useState(String(prefilledHours));

  // Task rows — seeded from mid-session task notes if any, otherwise a blank row.
  // clientId falls back to the Notion Account mapping when no client was tagged at start.
  const [taskRows, setTaskRows] = useState(() => {
    const resolvedNotionCustomerId = resolveNotionAccount(session.notionAccount);
    if (session.pendingTasks && session.pendingTasks.length > 0) {
      return session.pendingTasks.map(t => ({
        id: nextRowId(),
        description: t.description || '',
        clientId: t.clientId || (session.clientIds || [])[0] || '',
        okrId: t.okrId || session.okrId || '',
      }));
    }
    return [{
      id: nextRowId(),
      description: session.taskDescription || '',
      clientId: (session.clientIds || [])[0] || resolvedNotionCustomerId || '',
      okrId: session.okrId || '',
    }];
  });

  const [errors, setErrors]             = useState({});
  const [showDiscard, setShowDiscard]   = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  // OKR nudge — soft prompt when saving a Pomo with no OKR tagged
  const [showOkrNudge, setShowOkrNudge]       = useState(false);
  const [okrNudgeDismissed, setOkrNudgeDismissed] = useState(false);
  const confirmTimerRef = useRef(null);

  // Notion Account mapping — detect once at mount whether this account needs mapping
  const [needsMapping] = useState(() =>
    !!(session.notionAccount && !resolveNotionAccount(session.notionAccount))
  );
  const [mappingCustomerId, setMappingCustomerId] = useState('');
  const [mappingDone, setMappingDone] = useState(false);

  // Sort customers: pinned first, then alphabetical
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    }),
    [customers]
  );

  const rowCount = taskRows.length;

  // Per-row distribution with last-absorbs-remainder
  const distribute = (total) => {
    if (rowCount <= 1) return [total];
    const base = Math.floor(total / rowCount * 100) / 100;
    const remainder = Math.round((total - base * (rowCount - 1)) * 100) / 100;
    return taskRows.map((_, i) => i === rowCount - 1 ? remainder : base);
  };

  const totalHours  = Number(hours) || 0;
  const totalPoints = Number(points) || 0;
  const hoursDist  = distribute(totalHours);
  const pointsDist = distribute(totalPoints);

  const validate = () => {
    const e = {};
    if (!points || isNaN(points) || Number(points) <= 0)
      e.points = 'Enter a valid positive number';
    if (!hours || isNaN(hours) || Number(hours) < 0)
      e.hours = 'Enter a valid number';
    // Check at least one row has a description
    const hasDesc = taskRows.some(r => r.description.trim());
    if (!hasDesc) e.rows = 'At least one task needs a description';
    return e;
  };

  // Save the Notion Account → Customer mapping and pre-fill the first task row.
  const handleSaveMapping = () => {
    if (!mappingCustomerId) return;
    saveNotionCustomerMapping(session.notionAccount, mappingCustomerId);
    // Pre-fill the first task row's clientId if it is still empty
    setTaskRows(prev => prev.map((row, i) =>
      i === 0 && !row.clientId ? { ...row, clientId: mappingCustomerId } : row
    ));
    setMappingDone(true);
  };

  // Extracted save logic — called by handleSubmit and the OKR nudge "Save anyway" path.
  const performSave = () => {
    // Derive weekStart from session startedAt
    const sessionDate = new Date(session.startedAt);
    const weekStart = format(startOfWeek(sessionDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');

    const workTypeLabel = WORK_TYPE_LABELS[workType] || '';

    // Resolve pomo tagging fields from the session payload
    const source = session.mode === 'pomodoro' ? 'pomodoro'
      : session.mode === 'stopwatch' ? 'stopwatch'
      : null;
    const pomodoroCycles = session.mode === 'pomodoro'
      ? (session.pomodoroCompletedCycles ?? null)
      : null;

    // Create one time_log + one point entry per task row
    taskRows.forEach((row, i) => {
      const desc = row.description.trim();
      if (!desc) return; // skip empty rows

      const rowHours  = hoursDist[i];
      const rowPoints = pointsDist[i];
      const clientIds = row.clientId ? [row.clientId] : [];
      const okrId     = row.okrId || null;

      // Time log (bandwidth tracking)
      addTimeLog({
        workType,
        hours: rowHours,
        clientIds,
        okrId,
        taskId: null,
        note: desc,
        loggedAt: session.startedAt,
        weekStart,
        source,
        pomodoroCycles,
        notionTaskId: session.notionTaskId ?? null,
        notionTaskName: session.notionTaskName ?? null,
        notionAccount: session.notionAccount ?? null,
      });

      // Points entry (gamification layer)
      addPoint({
        customerId: row.clientId || null,
        okrId,
        points: rowPoints,
        hours: rowHours,
        activityType: '',
        interactionType: workTypeLabel,
        comment: rowCount > 1
          ? `${desc} (${i + 1}/${rowCount} tasks)`
          : desc,
        source,
        pomodoroCycles,
        timestamp: session.startedAt,
      });
    });

    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // Soft-nudge: if this is a Pomo session and no task row has an OKR,
    // show a one-time prompt. "Save anyway" sets okrNudgeDismissed so the
    // next click (or the nudge's own action) goes straight to performSave.
    const isPomodoro = session.mode === 'pomodoro';
    const hasAnyOkr  = taskRows.some(r => r.okrId);
    if (isPomodoro && !hasAnyOkr && !okrNudgeDismissed) {
      setShowOkrNudge(true);
      return;
    }

    performSave();
  };

  const updateRow = (id, field, value) => {
    setTaskRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setTaskRows(prev => [...prev, { id: nextRowId(), description: '', clientId: '', okrId: '' }]);
  };

  const removeRow = (id) => {
    if (taskRows.length <= 1) return;
    if (confirmingDeleteId === id) {
      // Second click — execute delete
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingDeleteId(null);
      setTaskRows(prev => prev.filter(r => r.id !== id));
    } else {
      // First click — arm confirm state, auto-reset after 3s
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingDeleteId(id);
      confirmTimerRef.current = setTimeout(() => setConfirmingDeleteId(null), 3000);
    }
  };

  const workTypeLabel = WORK_TYPE_LABELS[workType] || workType;

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
            value={workType}
            onChange={setWorkType}
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
              value={points}
              onChange={e => setPoints(e.target.value)}
            />
            {errors.points && <p className="mt-1 text-xs text-destructive">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hours *</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
            {errors.hours && <p className="mt-1 text-xs text-destructive">{errors.hours}</p>}
          </div>
        </div>

        {/* Notion Account mapping prompt — shown once for unmapped accounts */}
        {session.notionAccount && needsMapping && !mappingDone && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              ⚡ New Notion Account detected: &ldquo;{session.notionAccount}&rdquo;
            </p>
            <p className="text-xs text-amber-700">Which Customer is this in your SE Tracker?</p>
            <div className="flex gap-2">
              <select
                value={mappingCustomerId}
                onChange={e => setMappingCustomerId(e.target.value)}
                className="flex-1 h-8 bg-white border border-amber-300 rounded-md px-2 text-xs text-foreground focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
              >
                <option value="">Select customer…</option>
                {sortedCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!mappingCustomerId}
                onClick={handleSaveMapping}
                className="h-8 text-xs px-3 shrink-0"
              >
                Save mapping
              </Button>
            </div>
          </div>
        )}

        {/* Task Rows */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">
              Tasks {rowCount > 1 && <span className="text-muted-foreground/50">({rowCount} — hours split equally)</span>}
            </label>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
            >
              <Plus size={10} /> Add Task
            </button>
          </div>

          {errors.rows && <p className="mb-2 text-xs text-destructive">{errors.rows}</p>}

          <div className="space-y-3">
            {taskRows.map((row, i) => (
              <div key={row.id} className="p-3 rounded-xl border border-border bg-secondary/30 space-y-2">
                {/* Row header with index + distribution + remove */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Task {i + 1}
                    {rowCount > 1 && (
                      <span className="ml-1.5 text-muted-foreground/50 normal-case font-normal">
                        ~{hoursDist[i].toFixed(2)}h · {pointsDist[i].toFixed(1)} pts
                      </span>
                    )}
                  </span>
                  {rowCount > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      title={confirmingDeleteId === row.id ? 'Click again to remove' : 'Remove task'}
                      className={`p-0.5 transition-all duration-150 ${
                        confirmingDeleteId === row.id
                          ? 'text-destructive scale-110'
                          : 'text-muted-foreground hover:text-destructive'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Description */}
                <textarea
                  rows={2}
                  value={row.description}
                  onChange={e => updateRow(row.id, 'description', e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
                />

                {/* Client + OKR row */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={row.clientId}
                    onChange={e => updateRow(row.id, 'clientId', e.target.value)}
                    className="w-full h-8 bg-card border border-border rounded-md px-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                  >
                    <option value="">No client</option>
                    {sortedCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {okrs.length > 0 && (
                    <select
                      value={row.okrId}
                      onChange={e => updateRow(row.id, 'okrId', e.target.value)}
                      className="w-full h-8 bg-card border border-border rounded-md px-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                    >
                      <option value="">No OKR</option>
                      {okrs.map(o => (
                        <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
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
            Save{rowCount > 1 ? ` (${rowCount} tasks)` : ' Session'}
          </Button>
        </div>
      </form>

      {/* OKR nudge — soft prompt for Pomo sessions saved without an OKR tag */}
      {showOkrNudge && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-2">Save Pomo without OKR?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This Pomo isn't tied to an OKR. Tagging it now means it'll count toward your quarterly progress. You can also tag it later by editing the entry.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowOkrNudge(false)}
              >
                Pick an OKR
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setOkrNudgeDismissed(true);
                  setShowOkrNudge(false);
                  performSave();
                }}
              >
                Save anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Discard confirmation — z-60 to sit above this z-50 modal */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
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
