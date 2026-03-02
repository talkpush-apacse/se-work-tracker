import { useState, useMemo } from 'react';
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight,
  Pencil, Trash2, Flag, CheckCircle2, Circle, Ban,
  ClipboardList, Calendar,
} from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import {
  TASK_TYPE_LABELS, TASK_TYPE_COLORS,
  TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  MILESTONE_STATUSES, MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS,
} from '../constants';
import { formatDate } from '../utils/dateHelpers';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

// ── Date helper: ISO timestamp/string → local YYYY-MM-DD string ──────────────
function toLocalDateStr(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayLocalStr() {
  return toLocalDateStr(new Date());
}

// ── Milestone status icon ─────────────────────────────────────────────────────
function MilestoneStatusIcon({ status, size = 13 }) {
  if (status === 'completed')   return <CheckCircle2 size={size} className="text-emerald-400" />;
  if (status === 'cancelled')   return <Ban          size={size} className="text-gray-500"    />;
  if (status === 'in-progress') return <Circle       size={size} className="text-indigo-400"  />;
  return                               <Circle       size={size} className="text-amber-400"   />; // pending
}

// ── Milestone form ────────────────────────────────────────────────────────────
function MilestoneForm({ initial = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title:      initial.title      || '',
    targetDate: initial.targetDate || '',
    status:     initial.status     || 'pending',
  });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    onSubmit({
      title:      form.title.trim(),
      targetDate: form.targetDate || null,
      status:     form.status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title *</label>
        <Input
          autoFocus
          value={form.title}
          onChange={e => { setForm(p => ({ ...p, title: e.target.value })); setError(''); }}
          placeholder="e.g. Go-live, QBR, Integration complete"
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Target Date <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <Input
          type="date"
          value={form.targetDate}
          onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))}
          className="[color-scheme:dark]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
        <select
          value={form.status}
          onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
          className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          {MILESTONE_STATUSES.map(s => (
            <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" size="sm" className="flex-1">
          {initial.id ? 'Save Changes' : 'Add Milestone'}
        </Button>
      </div>
    </form>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────
function TasksTab({ tasks }) {
  const [subTab, setSubTab] = useState('active');

  const activeTasks = useMemo(
    () => [...tasks]
      .filter(t => !['done', 'archived'].includes(t.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tasks]
  );

  const closedTasks = useMemo(
    () => [...tasks]
      .filter(t => ['done', 'archived'].includes(t.status))
      .sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt)),
    [tasks]
  );

  const display = subTab === 'active' ? activeTasks : closedTasks;

  return (
    <div>
      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-4 w-fit">
        <button
          onClick={() => setSubTab('active')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'active'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active ({activeTasks.length})
        </button>
        <button
          onClick={() => setSubTab('closed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'closed'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Closed ({closedTasks.length})
        </button>
      </div>

      {display.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <ClipboardList size={24} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No {subTab === 'active' ? 'active' : 'closed'} tasks for this customer.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map(task => {
            const typeColor  = TASK_TYPE_COLORS[task.taskType]   || {};
            const statusColor = TASK_STATUS_COLORS[task.status]  || {};
            return (
              <div
                key={task.id}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-3"
              >
                {/* Task type badge */}
                <span className={`flex-shrink-0 mt-0.5 border rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${typeColor.bg || 'bg-gray-500/15'} ${typeColor.text || 'text-gray-400'} ${typeColor.border || 'border-gray-500/20'}`}>
                  {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                </span>

                {/* Description + date */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{task.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {subTab === 'closed'
                      ? `Closed ${formatDate(task.closedAt || task.createdAt)}`
                      : `Added ${formatDate(task.createdAt)}`
                    }
                  </p>
                </div>

                {/* Status badge */}
                <span className={`flex-shrink-0 border rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${statusColor.bg || 'bg-gray-500/15'} ${statusColor.text || 'text-gray-400'} ${statusColor.border || 'border-gray-500/20'}`}>
                  {TASK_STATUS_LABELS[task.status] || task.status}
                </span>

                {/* Points */}
                {task.points > 0 && (
                  <span className="flex-shrink-0 text-xs font-bold text-brand-lavender whitespace-nowrap">
                    {task.points} pt
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Timeline / Calendar tab ───────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function TimelineTab({ tasks, milestones, customer, onAdd, onEdit, onDelete }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  // Add milestone modal state
  const [showAdd,    setShowAdd]    = useState(false);
  const [prefillDate, setPrefillDate] = useState('');

  // Edit / delete state
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  // Closed tasks (have a definitive end date)
  const closedTasks = useMemo(
    () => tasks.filter(t => t.status === 'done' || t.status === 'archived'),
    [tasks]
  );

  // Build a map: YYYY-MM-DD → { milestones: [], tasks: [] }
  const eventsByDate = useMemo(() => {
    const map = {};
    milestones.forEach(m => {
      if (!m.targetDate) return;
      const key = m.targetDate.slice(0, 10);
      if (!map[key]) map[key] = { milestones: [], tasks: [] };
      map[key].milestones.push(m);
    });
    closedTasks.forEach(t => {
      const key = toLocalDateStr(t.closedAt || t.createdAt);
      if (!key) return;
      if (!map[key]) map[key] = { milestones: [], tasks: [] };
      map[key].tasks.push(t);
    });
    return map;
  }, [milestones, closedTasks]);

  // Build calendar cells for the current month
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();       // 0=Sun
  const totalCells     = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
  const todayStr       = todayLocalStr();

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - firstDayOfWeek + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const mm      = String(month + 1).padStart(2, '0');
    const dd      = String(dayNum).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    return { dayNum, dateStr, events: eventsByDate[dateStr] || { milestones: [], tasks: [] } };
  });

  // Click on a calendar day → open add modal with that date pre-filled
  const handleDayClick = (dateStr) => {
    setPrefillDate(dateStr);
    setShowAdd(true);
  };

  const handleAddOpen = () => {
    setPrefillDate('');
    setShowAdd(true);
  };

  // Milestone list sorted by targetDate (nulls last)
  const sortedMilestones = useMemo(
    () => [...milestones].sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    }),
    [milestones]
  );

  return (
    <div className="space-y-6">
      {/* ── Calendar ── */}
      <div>
        {/* Month header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <span className="text-sm font-bold text-foreground">
                {MONTH_NAMES[month]} {year}
              </span>
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            onClick={handleAddOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-amber/20 hover:bg-brand-amber/30 text-brand-amber border border-amber-500/30 text-xs font-semibold transition-all"
          >
            <Flag size={12} />
            Add Milestone
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/50 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} className="h-24 rounded-lg bg-secondary/10 border border-border/30" />;
            }
            const { dayNum, dateStr, events } = cell;
            const isToday    = dateStr === todayStr;
            const isPast     = dateStr < todayStr;
            const allEvents  = [
              ...events.milestones.map(m => ({ kind: 'milestone', data: m })),
              ...events.tasks.map(t =>      ({ kind: 'task',      data: t })),
            ];
            const visibleEvts = allEvents.slice(0, 3);
            const overflow    = allEvents.length - visibleEvts.length;

            return (
              <div
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                className={`h-24 rounded-lg p-1 flex flex-col cursor-pointer group transition-colors ${
                  isToday
                    ? 'bg-brand-lavender/15 border-2 border-brand-lavender/50'
                    : 'bg-card border border-border hover:border-brand-lavender/30 hover:bg-brand-lavender/5'
                }`}
              >
                {/* Day number */}
                <div className="flex justify-end mb-0.5">
                  <span className={`text-[11px] font-bold leading-tight w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                    isToday
                      ? 'bg-brand-lavender text-white'
                      : isPast
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground group-hover:text-foreground'
                  }`}>
                    {dayNum}
                  </span>
                </div>

                {/* Events */}
                <div className="flex flex-col gap-0.5 flex-1 overflow-hidden min-h-0">
                  {visibleEvts.map((ev, idx) => {
                    if (ev.kind === 'milestone') {
                      const m     = ev.data;
                      const color = MILESTONE_STATUS_COLORS[m.status] || '#f59e0b';
                      return (
                        <button
                          key={`m-${m.id}-${idx}`}
                          onClick={e => { e.stopPropagation(); setEditTarget(m); }}
                          className="truncate text-left text-[9px] font-semibold px-1 py-0.5 rounded leading-tight w-full"
                          style={{ backgroundColor: color + '25', color, border: `1px solid ${color}35` }}
                          title={m.title}
                        >
                          🏁 {m.title}
                        </button>
                      );
                    } else {
                      const t       = ev.data;
                      const colors  = TASK_TYPE_COLORS[t.taskType] || {};
                      return (
                        <span
                          key={`t-${t.id}-${idx}`}
                          className={`truncate text-[9px] font-medium px-1 py-0.5 rounded leading-tight ${colors.bg || 'bg-gray-500/15'} ${colors.text || 'text-gray-400'}`}
                          title={t.description}
                        >
                          ✓ {t.description}
                        </span>
                      );
                    }
                  })}
                  {overflow > 0 && (
                    <span className="text-[9px] text-muted-foreground/50 px-1 leading-tight">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-amber-400/25 border border-amber-500/40" />
            <span className="text-[10px] text-muted-foreground">Milestone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-teal-500/15" />
            <span className="text-[10px] text-muted-foreground">Closed Task</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-brand-lavender/15 border-2 border-brand-lavender/50 flex items-center justify-center">
              <span className="text-[7px] text-brand-lavender font-bold">T</span>
            </span>
            <span className="text-[10px] text-muted-foreground">Today</span>
          </div>
          <p className="text-[10px] text-muted-foreground/50 ml-auto italic">Click any day to add a milestone</p>
        </div>
      </div>

      {/* ── Milestones list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            All Milestones ({milestones.length})
          </h3>
          {milestones.length > 0 && (
            <button
              onClick={handleAddOpen}
              className="flex items-center gap-1 text-[11px] text-brand-amber hover:text-amber-300 font-semibold transition-colors"
            >
              <Plus size={11} /> Add
            </button>
          )}
        </div>

        {milestones.length === 0 ? (
          <div className="text-center py-10 bg-card border border-border rounded-2xl border-dashed">
            <Flag size={22} className="text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-1">No milestones yet.</p>
            <button
              onClick={handleAddOpen}
              className="text-xs text-brand-amber hover:text-amber-300 font-semibold transition-colors"
            >
              Add your first milestone →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedMilestones.map(m => {
              const color    = MILESTONE_STATUS_COLORS[m.status] || '#f59e0b';
              const isOverdue = m.targetDate && m.targetDate < todayStr && m.status === 'pending';
              return (
                <div
                  key={m.id}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <MilestoneStatusIcon status={m.status} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${
                      m.status === 'cancelled'
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground'
                    }`}>
                      {m.title}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      {isOverdue ? '⚠ Overdue · ' : ''}
                      {m.targetDate ? formatDate(m.targetDate) : 'No date set'}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: color + '20',
                      color,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    {MILESTONE_STATUS_LABELS[m.status] || m.status}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditTarget(m)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Edit milestone"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                      title="Delete milestone"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Milestone Modal ── */}
      {showAdd && (
        <Modal title="Add Milestone" onClose={() => setShowAdd(false)} size="sm">
          <MilestoneForm
            initial={{ targetDate: prefillDate }}
            onSubmit={(data) => {
              onAdd(data);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </Modal>
      )}

      {/* ── Edit Milestone Modal ── */}
      {editTarget && (
        <Modal title="Edit Milestone" onClose={() => setEditTarget(null)} size="sm">
          <MilestoneForm
            initial={editTarget}
            onSubmit={(data) => {
              onEdit(editTarget.id, data);
              setEditTarget(null);
            }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Milestone"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Main CustomerDetailView ───────────────────────────────────────────────────
export default function CustomerDetailView({ customer, onBack }) {
  const { tasks, milestones, points, addMilestone, updateMilestone, deleteMilestone } = useAppStore();
  const [activeTab, setActiveTab] = useState('tasks');

  // Filter data for this customer
  const customerTasks = useMemo(
    () => tasks.filter(t => t.customerId === customer.id),
    [tasks, customer.id]
  );
  const customerMilestones = useMemo(
    () => milestones.filter(m => m.customerId === customer.id),
    [milestones, customer.id]
  );

  // Quick stats
  const totalPoints = useMemo(
    () => points.filter(p => p.customerId === customer.id).reduce((s, p) => s + p.points, 0),
    [points, customer.id]
  );
  const openTasks   = customerTasks.filter(t => !['done', 'archived'].includes(t.status)).length;
  const closedTasks = customerTasks.filter(t =>  ['done', 'archived'].includes(t.status)).length;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to Customers
        </button>

        <div className="flex items-start gap-4">
          {/* Customer avatar */}
          <div
            className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-foreground font-bold text-base"
            style={{ backgroundColor: customer.color + '22', color: customer.color }}
          >
            {customer.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground leading-tight">{customer.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Added {formatDate(customer.createdAt)}</p>

            {/* Quick stats row */}
            <div className="flex flex-wrap items-center gap-4 mt-3">
              <div>
                <span className="text-lg font-bold" style={{ color: customer.color }}>{openTasks}</span>
                <span className="text-xs text-muted-foreground ml-1">open tasks</span>
              </div>
              <div>
                <span className="text-lg font-bold text-muted-foreground">{closedTasks}</span>
                <span className="text-xs text-muted-foreground ml-1">closed</span>
              </div>
              <div>
                <span className="text-lg font-bold text-foreground">{totalPoints}</span>
                <span className="text-xs text-muted-foreground ml-1">pts earned</span>
              </div>
              <div>
                <span className="text-lg font-bold text-brand-amber">{customerMilestones.length}</span>
                <span className="text-xs text-muted-foreground ml-1">milestones</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'tasks',    label: 'Task Log',  icon: ClipboardList },
          { id: 'timeline', label: 'Timeline',  icon: Calendar      },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
              activeTab === id
                ? 'border-brand-lavender text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'tasks' && (
        <TasksTab tasks={customerTasks} />
      )}

      {activeTab === 'timeline' && (
        <TimelineTab
          tasks={customerTasks}
          milestones={customerMilestones}
          customer={customer}
          onAdd={(data) => addMilestone({ ...data, customerId: customer.id })}
          onEdit={(id, data) => updateMilestone(id, data)}
          onDelete={(id) => deleteMilestone(id)}
        />
      )}
    </div>
  );
}
