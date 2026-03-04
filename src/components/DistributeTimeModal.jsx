import { useState, useMemo } from 'react';
import { Users, Check, Search, X } from 'lucide-react';
import Modal from './Modal';
import { ACTIVITY_TYPES, AUTO_TRACK_RATE } from '../constants';
import { useAppStore } from '../context/StoreContext';
import { Button } from './ui/button';

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// Always distribute equally across all selected customers.
// The last customer absorbs any floating-point remainder so total always = 100.
function equalSplit(ids) {
  if (ids.size === 0) return {};
  const arr   = [...ids];
  const share = parseFloat((100 / arr.length).toFixed(2));
  const result = {};
  let assigned = 0;
  arr.forEach((id, i) => {
    if (i === arr.length - 1) {
      result[id] = parseFloat((100 - assigned).toFixed(2));
    } else {
      result[id] = share;
      assigned   = parseFloat((assigned + share).toFixed(2));
    }
  });
  return result;
}

export default function DistributeTimeModal({ session, onClose, initialCustomerId }) {
  const { addPoint, customers, okrs } = useAppStore();

  const totalHours  = parseFloat((session.elapsedSeconds / 3600).toFixed(2));
  const totalPoints = Math.round(totalHours * AUTO_TRACK_RATE * 100) / 100;

  // If initialCustomerId is provided (switching from a task session to distribute mode),
  // pre-select that customer so the user just adds more and adjusts percentages.
  const [selectedIds, setSelectedIds] = useState(() => {
    if (initialCustomerId) return new Set([initialCustomerId]);
    return new Set();
  });
  const [percentages, setPercentages] = useState(() => {   // { [customerId]: number | '' }
    if (initialCustomerId) return equalSplit(new Set([initialCustomerId]));
    return {};
  });
  const [activityType, setActivityType] = useState('');
  const [okrId,        setOkrId]        = useState('');
  const [comment,      setComment]      = useState(session.taskDescription || '');
  const [showDiscard,  setShowDiscard]  = useState(false);
  const [error,        setError]        = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');

  // Sort customers: pinned first, then alphabetical
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    }),
    [customers]
  );

  // Filter by search query
  const visibleCustomers = useMemo(
    () => searchQuery.trim()
      ? sortedCustomers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : sortedCustomers,
    [sortedCustomers, searchQuery]
  );

  // Selected customers in sorted order (for percentage rows + preview)
  const selectedCustomers = useMemo(
    () => sortedCustomers.filter(c => selectedIds.has(c.id)),
    [sortedCustomers, selectedIds]
  );

  const selectedCount = selectedIds.size;

  // Running total of all percentages
  const totalPct = useMemo(
    () => [...selectedIds].reduce((s, id) => s + (parseFloat(percentages[id]) || 0), 0),
    [selectedIds, percentages]
  );

  // Per-customer pts/hrs based on their assigned percentage
  const customerPts = (id) =>
    Math.round(totalPoints * ((parseFloat(percentages[id]) || 0) / 100) * 100) / 100;
  const customerHrs = (id) =>
    Math.round(totalHours  * ((parseFloat(percentages[id]) || 0) / 100) * 100) / 100;

  const isValid = Math.abs(totalPct - 100) <= 0.5;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleCustomer = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      setPercentages(equalSplit(next));
      return next;
    });
    setError('');
  };

  const selectAll = () => {
    const next = new Set(customers.map(c => c.id));
    setSelectedIds(next);
    setPercentages(equalSplit(next));
    setError('');
  };

  const clearAll = () => {
    setSelectedIds(new Set());
    setPercentages({});
  };

  const handlePctChange = (id, rawValue) => {
    const clamped = rawValue === ''
      ? ''
      : Math.min(100, Math.max(0, parseFloat(rawValue) || 0));
    setPercentages(prev => ({ ...prev, [id]: clamped }));
    setError('');
  };

  const handleSubmit = () => {
    if (selectedCount === 0) {
      setError('Select at least one customer to distribute time to');
      return;
    }
    if (!isValid) {
      setError(`Percentages must add up to 100% — currently ${totalPct.toFixed(2)}%`);
      return;
    }

    selectedIds.forEach(customerId => {
      const pct        = parseFloat(percentages[customerId]) || 0;
      const custPoints = Math.round(totalPoints * (pct / 100) * 100) / 100;
      const custHours  = Math.round(totalHours  * (pct / 100) * 100) / 100;
      const splitLabel = `General Focus Time — ${pct.toFixed(1)}% of session (${selectedCount} customer${selectedCount > 1 ? 's' : ''} total)`;
      addPoint({
        customerId,
        okrId: okrId || null,
        points: custPoints,
        hours:  custHours,
        activityType,
        comment: comment.trim()
          ? `${comment.trim()} (${splitLabel})`
          : splitLabel,
      });
    });

    onClose();
  };

  return (
    <Modal title="Distribute Focus Time" onClose={() => setShowDiscard(true)} size="lg">

      {/* Session summary */}
      <div className="mb-4 rounded-xl border border-brand-lavender/30 bg-brand-lavender/10 px-4 py-3">
        <p className="text-xs text-brand-lavender font-medium mb-0.5">
          {initialCustomerId ? 'Task Focus Session — Distribute Across Customers' : 'General Focus Time Session'}
        </p>
        <p className="font-mono text-2xl font-bold text-brand-lavender tabular-nums">
          {formatHMS(session.elapsedSeconds)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          = {totalHours}h / {totalPoints} pts — assign a % to each selected customer below
        </p>
      </div>

      {/* Customer selection */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">
            Select Customers *
          </label>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 font-semibold transition-colors"
            >
              Select All
            </button>
            {selectedCount > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] text-muted-foreground hover:text-foreground font-semibold transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="rounded-xl border border-border bg-secondary/50 px-4 py-6 text-center">
            <Users size={20} className="text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No customers. Create one first.</p>
          </div>
        ) : (
          <>
            {/* Search input */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-secondary/30">
              {visibleCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No customers match &ldquo;{searchQuery}&rdquo;
                </p>
              ) : visibleCustomers.map(customer => {
                const isSelected = selectedIds.has(customer.id);
                return (
                  <button
                    key={customer.id}
                    onClick={() => toggleCustomer(customer.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all border-b border-border/50 last:border-b-0 ${
                      isSelected
                        ? 'bg-brand-lavender/10'
                        : 'hover:bg-secondary/80'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? 'bg-brand-lavender border-brand-lavender'
                        : 'border-border hover:border-muted-foreground'
                    }`}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>

                    {/* Customer avatar */}
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: customer.color + '22', color: customer.color }}
                    >
                      {customer.name.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Name + pinned badge */}
                    <span className="text-sm text-foreground font-medium truncate flex-1">
                      {customer.name}
                    </span>
                    {customer.pinned && (
                      <span className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                        Priority
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>

      {/* ── Percentage split ── */}
      {selectedCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">Percentage Split *</label>
            <span className={`text-xs font-semibold tabular-nums ${
              isValid ? 'text-brand-sage' : 'text-destructive'
            }`}>
              {totalPct.toFixed(2)}% / 100%
            </span>
          </div>
          <div className="space-y-1.5">
            {selectedCustomers.map(customer => (
              <div
                key={customer.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
              >
                {/* Avatar */}
                <div
                  className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: customer.color + '22', color: customer.color }}
                >
                  {customer.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Name */}
                <span className="text-sm text-foreground font-medium truncate flex-1">
                  {customer.name}
                </span>

                {/* Live pts/hrs preview */}
                <span className="text-[10px] text-muted-foreground flex-shrink-0 hidden sm:inline tabular-nums">
                  {customerPts(customer.id)} pts · {customerHrs(customer.id)}h
                </span>

                {/* Percentage input */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={percentages[customer.id] ?? ''}
                    onChange={e => handlePctChange(customer.id, e.target.value)}
                    className="w-16 text-right bg-card border border-border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Distribution preview ── */}
      {selectedCount > 0 && (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${
          isValid
            ? 'border-brand-sage/30 bg-brand-sage/10'
            : 'border-destructive/30 bg-destructive/5'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-medium ${isValid ? 'text-brand-sage' : 'text-destructive'}`}>
              Distribution Preview
            </p>
            <span className={`text-xs font-semibold ${isValid ? 'text-brand-sage' : 'text-destructive'}`}>
              {isValid
                ? 'Ready to distribute'
                : `${totalPct.toFixed(2)}% — must equal 100%`}
            </span>
          </div>
          <div className="space-y-1">
            {selectedCustomers.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground/70 truncate flex-1 mr-2">{c.name}</span>
                <span className="tabular-nums text-muted-foreground flex-shrink-0">
                  {customerPts(c.id)} pts · {customerHrs(c.id)}h
                  <span className="ml-1.5 text-muted-foreground/60">
                    ({(parseFloat(percentages[c.id]) || 0).toFixed(1)}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/30">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular-nums font-semibold text-foreground">
              {totalPoints} pts · {totalHours}h
            </span>
          </div>
        </div>
      )}

      {/* Activity type */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Activity Type <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <select
          value={activityType}
          onChange={e => setActivityType(e.target.value)}
          className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">Select activity...</option>
          {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Optional OKR selector */}
      {okrs.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            OKR <span className="text-muted-foreground/50">(optional — applies to all)</span>
          </label>
          <select
            value={okrId}
            onChange={e => setOkrId(e.target.value)}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">No OKR</option>
            {okrs.map(o => <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>)}
          </select>
        </div>
      )}

      {/* Comment */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Comment <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <textarea
          placeholder="What did you accomplish in this session?"
          rows={2}
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
        />
      </div>

      {/* Buttons */}
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
          size="sm"
          onClick={handleSubmit}
          disabled={customers.length === 0}
          className="flex-1"
        >
          Distribute & Save
        </Button>
      </div>

      {/* Discard confirmation */}
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
