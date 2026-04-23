import { useState, useMemo } from 'react';
import { Timer, Check, Search, X } from 'lucide-react';
import Modal from './Modal';
import WorkTypeSelector from './WorkTypeSelector';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import { Button } from './ui/button';

export default function StartTimerModal({
  onClose,
  preselectedClientIds = [],
  preselectedWorkType = null,
  title = 'Start Timer',
  submitLabel = 'Start Timer',
  helperText = 'Timer runs until you click Stop (max 12 hours). Survives page refresh. You can edit before saving.',
  onStart = null,
}) {
  const { customers, okrs } = useAppStore();
  const { startTimer } = useTimerContext();
  const [workType, setWorkType] = useState(preselectedWorkType || '');
  const [selectedClientIds, setSelectedClientIds] = useState(() => new Set(preselectedClientIds));
  const [okrId, setOkrId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

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

  const toggleClient = (id) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    if (!workType) {
      setError('Select a work type to start');
      return;
    }

    const payload = {
      workType,
      clientIds: [...selectedClientIds],
      okrId: okrId || null,
    };

    if (onStart) {
      onStart(payload);
    } else {
      startTimer(workType, {
        clientIds: payload.clientIds,
        okrId: payload.okrId,
      });
    }

    onClose();
  };

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="space-y-4">
        {/* Work Type — required */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Work Type *</label>
          <WorkTypeSelector
            value={workType}
            onChange={(wt) => { setWorkType(wt); setError(''); }}
          />
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </div>

        {/* Client tags — optional */}
        {customers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Tag Clients <span className="text-muted-foreground/50">(optional)</span>
            </label>
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
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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

        {/* OKR — optional */}
        {okrs.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              OKR <span className="text-muted-foreground/50">(optional)</span>
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

        <div className="rounded-xl bg-secondary/50 border border-border/50 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {helperText}
          </p>
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
            variant="sage"
            size="sm"
            onClick={handleStart}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Timer size={15} />
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
