import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Timer, Check, Search, X, RotateCw } from 'lucide-react';
import Modal from './Modal';
import WorkTypeSelector from './WorkTypeSelector';
import { useAppStore } from '../context/StoreContext';
import { Button } from './ui/button';
import { fetchNotionTasks } from '../lib/api';

export default function StartTimerModal({
  onClose,
  preselectedClientIds = [],
  preselectedWorkType = null,
  title = 'Start Pomodoro',
  submitLabel = 'Start Pomodoro',
  helperText = 'Pomodoro uses the 25 / 5 / 15 cadence, auto-advances between intervals, and only work time is saved.',
  onStart,
}) {
  const { customers, okrs } = useAppStore();
  const [workType, setWorkType] = useState(preselectedWorkType || '');
  const [selectedClientIds, setSelectedClientIds] = useState(() => new Set(preselectedClientIds));
  const [okrId, setOkrId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notionSearchQuery, setNotionSearchQuery] = useState('');
  const [notionTasks, setNotionTasks] = useState([]);
  const [selectedNotionTask, setSelectedNotionTask] = useState(null);
  const [isLoadingNotionTasks, setIsLoadingNotionTasks] = useState(false);
  const [notionTasksError, setNotionTasksError] = useState('');
  const [error, setError] = useState('');
  const hasFetchedNotionTasksRef = useRef(false);
  const isMountedRef = useRef(true);

  const loadNotionTasks = useCallback(async (force = false) => {
    if (!force && hasFetchedNotionTasksRef.current) return;
    hasFetchedNotionTasksRef.current = true;
    setIsLoadingNotionTasks(true);
    setNotionTasksError('');

    try {
      const tasks = await fetchNotionTasks({ force });
      if (!isMountedRef.current) return;
      setNotionTasks(tasks);
    } catch (err) {
      if (!isMountedRef.current) return;
      setNotionTasksError(err.message || 'Failed to load Notion tasks');
    } finally {
      if (isMountedRef.current) {
        setIsLoadingNotionTasks(false);
      }
    }
  }, []);

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

  const filteredNotionTasks = useMemo(() => {
    const query = notionSearchQuery.trim().toLowerCase();
    if (!query) return notionTasks;

    return notionTasks.filter((task) => {
      const taskName = task.task_name?.toLowerCase() || '';
      const account = task.account?.toLowerCase() || '';
      return taskName.includes(query) || account.includes(query);
    });
  }, [notionSearchQuery, notionTasks]);

  useEffect(() => {
    isMountedRef.current = true;
    loadNotionTasks().catch(() => {});
    return () => {
      isMountedRef.current = false;
    };
  }, [loadNotionTasks]);

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
      notionTask: selectedNotionTask
        ? {
            id: selectedNotionTask.id,
            task_name: selectedNotionTask.task_name,
            account: selectedNotionTask.account,
            okr: selectedNotionTask.okr ?? null,
            okrPageId: selectedNotionTask.okrPageId ?? null,
          }
        : null,
    };

    onStart(payload);
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

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Notion Task <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => loadNotionTasks(true)}
              disabled={isLoadingNotionTasks}
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
            >
              <RotateCw className={`h-3 w-3 ${isLoadingNotionTasks ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-secondary/30">
            <div className="relative border-b border-border/50">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search by task or account..."
                value={notionSearchQuery}
                onChange={e => setNotionSearchQuery(e.target.value)}
                className="w-full rounded-t-lg bg-transparent pl-8 pr-7 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {notionSearchQuery && (
                <button
                  type="button"
                  onClick={() => setNotionSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedNotionTask(null)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-xs border-b border-border/30 transition-all ${
                  !selectedNotionTask ? 'bg-brand-lavender/10 text-foreground' : 'text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                <span>No task</span>
                {!selectedNotionTask && <Check className="w-3.5 h-3.5 text-brand-lavender" />}
              </button>

              {isLoadingNotionTasks && (
                <div className="px-2.5 py-3 text-xs text-muted-foreground">
                  Loading Notion tasks...
                </div>
              )}

              {!isLoadingNotionTasks && notionTasksError && (
                <div className="px-2.5 py-3 text-xs text-destructive">
                  {notionTasksError}
                </div>
              )}

              {!isLoadingNotionTasks && !notionTasksError && filteredNotionTasks.length === 0 && (
                <div className="px-2.5 py-3 text-xs text-muted-foreground">
                  No matching Notion tasks.
                </div>
              )}

              {!isLoadingNotionTasks && !notionTasksError && filteredNotionTasks.map((task) => {
                const isSelected = selectedNotionTask?.id === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedNotionTask({ id: task.id, task_name: task.task_name, account: task.account || null, okr: task.okr || null, okrPageId: task.okrPageId || null })}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 text-left border-b border-border/30 last:border-b-0 transition-all ${
                      isSelected ? 'bg-brand-lavender/10' : 'hover:bg-secondary/80'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="inline-flex shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {task.account || 'No account'}
                      </span>
                      <span className="truncate text-xs text-foreground">{task.task_name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-brand-lavender" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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
