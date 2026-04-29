import { useState, useMemo } from 'react';
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Pencil, Trash2, Flag, CheckCircle2, Circle, Ban,
  ClipboardList, Calendar, Check, Clock, MessageSquare, Sparkles, Loader2,
} from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import {
  WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_COLORS,
  TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_STATUS_ENTRIES,
  MILESTONE_STATUSES, MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS,
  ANNOTATION_TAGS, ANNOTATION_TAG_LABELS, ANNOTATION_TAG_COLORS,
  ACTIVITY_TYPES, AUTO_TRACK_RATE,
} from '../constants';
import { formatDate } from '../utils/dateHelpers';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import MeetingEntryModal from './MeetingEntryModal';
import { generateMeetingSummary } from '../utils/meetingAI';
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
  if (status === 'completed')   return <CheckCircle2 size={size} className="text-status-success" />;
  if (status === 'cancelled')   return <Ban          size={size} className="text-muted-foreground"    />;
  if (status === 'in-progress') return <Circle       size={size} className="text-indigo-700"  />;
  return                               <Circle       size={size} className="text-amber-700"   />; // pending
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
          className="[color-scheme:light]"
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
function TasksTab({ tasks, addTask, customerId, okrs }) {
  const [subTab, setSubTab] = useState('active');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({
    description: '', workType: 'deep_work', status: 'open', okrId: '',
  });

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

  const handleAddTask = (e) => {
    e.preventDefault();
    if (!taskForm.description.trim() || !addTask) return;
    addTask({
      customerId,
      description:    taskForm.description.trim(),
      workType:       taskForm.workType,
      status:         taskForm.status,
      okrId:          taskForm.okrId || undefined,
    });
    setTaskForm({ description: '', workType: 'deep_work', status: 'open', okrId: '' });
    setShowAddForm(false);
  };

  return (
    <div>
      {/* Add Task button / inline form */}
      <div className="mb-4">
        {!showAddForm ? (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5">
            <Plus size={13} /> Add Task
          </Button>
        ) : (
          <form onSubmit={handleAddTask} className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
            <textarea
              rows={2}
              value={taskForm.description}
              onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Task description *"
              className="w-full rounded-lg border border-border bg-input-bg px-2.5 py-1.5 text-xs resize-none text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
              autoFocus
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={taskForm.workType}
                onChange={e => setTaskForm(p => ({ ...p, workType: e.target.value }))}
                className="rounded-lg border border-border bg-input-bg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
              >
                {WORK_TYPES.map(wt => (
                  <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
                ))}
              </select>
              <select
                value={taskForm.status}
                onChange={e => setTaskForm(p => ({ ...p, status: e.target.value }))}
                className="rounded-lg border border-border bg-input-bg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
              >
                {TASK_STATUS_ENTRIES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <select
              value={taskForm.okrId}
              onChange={e => setTaskForm(p => ({ ...p, okrId: e.target.value }))}
              className="w-full rounded-lg border border-border bg-input-bg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
            >
              <option value="">No OKR linked</option>
              {(okrs || []).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!taskForm.description.trim()}>
                Add Task
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setTaskForm({ description: '', workType: 'deep_work', status: 'open', okrId: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

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
            const typeColor   = WORK_TYPE_COLORS[task.workType]  || {};
            const statusColor = TASK_STATUS_COLORS[task.status]  || {};
            const isExpanded  = expandedTaskId === task.id;
            const linkedOkr   = task.okrId ? (okrs || []).find(o => o.id === task.okrId) : null;
            return (
              <div
                key={task.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Main row */}
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Work type badge */}
                  <span className={`flex-shrink-0 mt-0.5 border rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${typeColor.bg || 'bg-muted'} ${typeColor.text || 'text-muted-foreground'} ${typeColor.border || 'border-border'}`}>
                    {WORK_TYPE_LABELS[task.workType] || task.workType || 'Comms'}
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
                  <span className={`flex-shrink-0 border rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${statusColor.bg || 'bg-muted'} ${statusColor.text || 'text-muted-foreground'} ${statusColor.border || 'border-border'}`}>
                    {TASK_STATUS_LABELS[task.status] || task.status}
                  </span>

                  {/* Points */}
                  {task.points > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold text-brand-lavender whitespace-nowrap">
                      {task.points} pt
                    </span>
                  )}

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    className="flex-shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
                    title={isExpanded ? 'Collapse' : 'Show details'}
                  >
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Expandable detail panel */}
                {isExpanded && (
                  <div className="border-t border-border/50 bg-secondary/20 px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
                    {linkedOkr && (
                      <p><span className="font-medium text-foreground/70">OKR:</span> {linkedOkr.quarter} — {linkedOkr.title}</p>
                    )}
                    <p><span className="font-medium text-foreground/70">Added:</span> {formatDate(task.createdAt)}</p>
                    {task.closedAt && (
                      <p><span className="font-medium text-foreground/70">Closed:</span> {formatDate(task.closedAt)}</p>
                    )}
                  </div>
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

function TimelineTab({ tasks, milestones, annotations, customer, onAdd, onEdit, onDelete, onEditAnnotation, onDeleteAnnotation }) {
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

  // Build a map: YYYY-MM-DD → { milestones: [], tasks: [], annotations: [] }
  const eventsByDate = useMemo(() => {
    const map = {};
    milestones.forEach(m => {
      if (!m.targetDate) return;
      const key = m.targetDate.slice(0, 10);
      if (!map[key]) map[key] = { milestones: [], tasks: [], annotations: [] };
      map[key].milestones.push(m);
    });
    closedTasks.forEach(t => {
      const key = toLocalDateStr(t.closedAt || t.createdAt);
      if (!key) return;
      if (!map[key]) map[key] = { milestones: [], tasks: [], annotations: [] };
      map[key].tasks.push(t);
    });
    annotations.forEach(a => {
      const key = a.date; // already YYYY-MM-DD
      if (!map[key]) map[key] = { milestones: [], tasks: [], annotations: [] };
      map[key].annotations.push(a);
    });
    return map;
  }, [milestones, closedTasks, annotations]);

  // Build calendar cells for the current month.
  // Memoized on [year, month, eventsByDate] — the Date math + Array.from only
  // re-runs when the month navigates or the underlying event data changes.
  const todayStr = todayLocalStr();
  const { cells } = useMemo(() => {
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const totalCells     = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

    return {
      cells: Array.from({ length: totalCells }, (_, i) => {
        const dayNum = i - firstDayOfWeek + 1;
        if (dayNum < 1 || dayNum > daysInMonth) return null;
        const mm      = String(month + 1).padStart(2, '0');
        const dd      = String(dayNum).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        return { dayNum, dateStr, events: eventsByDate[dateStr] || { milestones: [], tasks: [], annotations: [] } };
      }),
    };
  }, [year, month, eventsByDate]);

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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-amber/20 hover:bg-brand-amber/30 text-brand-amber border border-amber-200 text-xs font-semibold transition-all"
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
                      const colors  = WORK_TYPE_COLORS[t.workType] || {};
                      return (
                        <span
                          key={`t-${t.id}-${idx}`}
                          className={`truncate text-[9px] font-medium px-1 py-0.5 rounded leading-tight ${colors.bg || 'bg-muted'} ${colors.text || 'text-muted-foreground'}`}
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

                {/* Annotation dots — separate row, not counted toward chip limit */}
                {events.annotations.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap mt-auto pt-0.5 px-0.5">
                    {events.annotations.slice(0, 5).map(a => (
                      <div
                        key={a.id}
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ANNOTATION_TAG_COLORS[a.tag] }}
                        title={`${ANNOTATION_TAG_LABELS[a.tag]}: ${a.text}`}
                      />
                    ))}
                    {events.annotations.length > 5 && (
                      <span className="text-[8px] text-muted-foreground/50 leading-tight">+{events.annotations.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-amber-100 border border-amber-200" />
            <span className="text-[10px] text-muted-foreground">Milestone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-teal-500/15" />
            <span className="text-[10px] text-muted-foreground">Closed Task</span>
          </div>
          {/* Annotation dot legend */}
          {ANNOTATION_TAGS.map(tag => (
            <div key={tag} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ANNOTATION_TAG_COLORS[tag] }} />
              <span className="text-[10px] text-muted-foreground">{ANNOTATION_TAG_LABELS[tag]}</span>
            </div>
          ))}
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

      {/* ── Annotations list ── */}
      {annotations.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Annotations ({annotations.length})
          </h3>
          <div className="bg-card border border-border rounded-2xl px-4 py-1">
            {[...annotations]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-b-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: ANNOTATION_TAG_COLORS[a.tag] }}
                  />
                  <span
                    className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: ANNOTATION_TAG_COLORS[a.tag] + '22',
                      color: ANNOTATION_TAG_COLORS[a.tag],
                    }}
                  >
                    {ANNOTATION_TAG_LABELS[a.tag]}
                  </span>
                  <p className="flex-1 text-sm text-foreground leading-relaxed min-w-0">{a.text}</p>
                  <p className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">{a.date}</p>
                  <div className="flex gap-1 flex-shrink-0">
                    {onEditAnnotation && (
                      <button
                        onClick={() => onEditAnnotation(a)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {onDeleteAnnotation && (
                      <button
                        onClick={() => onDeleteAnnotation(a)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

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

// ── Meetings tab ──────────────────────────────────────────────────────────────
function MeetingsTab({ meetings, customers, customer, onSave, onDelete, onConvertActionItem }) {
  const [showModal, setShowModal]       = useState(false);
  const [editEntry, setEditEntry]       = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [summarizingId, setSummarizingId] = useState(null);

  const sorted = useMemo(
    () => [...meetings].sort((a, b) => {
      const da = a.meetingDate || a.createdAt || '';
      const db = b.meetingDate || b.createdAt || '';
      return db.localeCompare(da);
    }),
    [meetings]
  );

  const handleInlineSummarize = async (meeting) => {
    setSummarizingId(meeting.id);
    try {
      const result = await generateMeetingSummary(meeting);
      if (result) onSave({ ...meeting, ...result });
    } catch { /* ignore */ }
    finally { setSummarizingId(null); }
  };

  return (
    <div>
      {/* Add Meeting button */}
      <div className="mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setEditEntry(null); setShowModal(true); }}
          className="flex items-center gap-1.5"
        >
          <Plus size={13} /> Add Meeting
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl border-dashed">
          <MessageSquare size={24} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">No meetings logged yet.</p>
          <button
            onClick={() => { setEditEntry(null); setShowModal(true); }}
            className="text-xs text-brand-lavender hover:text-brand-lavender/80 font-semibold transition-colors"
          >
            Log your first meeting →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(m => {
            const isExpanded  = expandedId === m.id;
            const hasAI       = !!m.aiSummary;
            const summarizing = summarizingId === m.id;
            const canExpand   = hasAI || !!m.attendees;

            return (
              <div key={m.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Main row */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <MessageSquare size={14} className="text-blue-700 flex-shrink-0 mt-0.5" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {m.title || 'Meeting'}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(m.meetingDate || m.createdAt)}
                      </span>
                    </div>

                    {hasAI ? (
                      <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{m.aiSummary}</p>
                    ) : (
                      m.rawNotes && (
                        <p className="text-xs text-muted-foreground/70 line-clamp-2">{m.rawNotes}</p>
                      )
                    )}

                    {/* AI chips */}
                    {hasAI && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.decisions?.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✅ {m.decisions.length} decision{m.decisions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {m.openQuestions?.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            ❓ {m.openQuestions.length} question{m.openQuestions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {m.actionItems?.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            📋 {m.actionItems.length} action item{m.actionItems.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!hasAI && !summarizing && (
                      <button
                        onClick={() => handleInlineSummarize(m)}
                        disabled={!m.rawNotes?.trim()}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-brand-lavender/20 text-brand-lavender hover:bg-brand-lavender/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Summarize with AI"
                      >
                        <Sparkles size={10} /> Summarize
                      </button>
                    )}
                    {summarizing && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground px-2">
                        <Loader2 size={10} className="animate-spin" /> Summarizing…
                      </span>
                    )}
                    <button
                      onClick={() => { setEditEntry(m); setShowModal(true); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Edit meeting"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                      title="Delete meeting"
                    >
                      <Trash2 size={12} />
                    </button>
                    {canExpand && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border/50 bg-secondary/20 px-4 py-3 space-y-3 text-xs text-muted-foreground">
                    {m.attendees && (
                      <p><span className="font-medium text-foreground/70">Attendees:</span> {m.attendees}</p>
                    )}
                    {m.decisions?.length > 0 && (
                      <div>
                        <p className="font-semibold text-foreground/70 mb-1">✅ Decisions</p>
                        <ul className="space-y-1 pl-1">
                          {m.decisions.map((d, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-foreground/80">
                              <span className="text-status-success flex-shrink-0">•</span>{d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.openQuestions?.length > 0 && (
                      <div>
                        <p className="font-semibold text-foreground/70 mb-1">❓ Open Questions</p>
                        <ul className="space-y-1 pl-1">
                          {m.openQuestions.map((q, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-foreground/80">
                              <span className="text-amber-700 flex-shrink-0">•</span>{q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.actionItems?.length > 0 && (
                      <div>
                        <p className="font-semibold text-foreground/70 mb-1">📋 Action Items</p>
                        <ul className="space-y-1 pl-1">
                          {m.actionItems.map(item => (
                            <li key={item.id} className="flex items-start gap-2 text-foreground/80">
                              <span className={`flex-shrink-0 ${item.convertedToTaskId ? 'text-emerald-700' : 'text-muted-foreground/60'}`}>
                                {item.convertedToTaskId ? '✓' : '•'}
                              </span>
                              <span className="flex-1 min-w-0">{item.text}</span>
                              {item.owner && <span className="text-muted-foreground/50 flex-shrink-0">{item.owner}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.rawNotes && (
                      <div>
                        <p className="font-semibold text-foreground/70 mb-1">📝 Raw Notes</p>
                        <p className="text-foreground/70 leading-relaxed whitespace-pre-wrap">{m.rawNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Meeting modal */}
      {showModal && (
        <MeetingEntryModal
          entry={editEntry}
          defaultCustomerId={customer.id}
          customers={customers}
          onSave={(data) => { onSave(data); setShowModal(false); setEditEntry(null); }}
          onConvertActionItem={onConvertActionItem}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Meeting"
          message={`Delete this meeting entry? This cannot be undone.`}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── LogHoursModal ─────────────────────────────────────────────────────────────
function LogHoursModal({ okrs, onSubmit, onCancel }) {
  const [hours,           setHours]           = useState('');
  const [activityType,    setActivityType]    = useState('');
  const [okrId,           setOkrId]           = useState('');
  const [comment, setComment]           = useState('');
  const [error, setError]               = useState('');

  const previewPoints = hours && !isNaN(hours) && Number(hours) > 0
    ? Math.round(Number(hours) * AUTO_TRACK_RATE * 100) / 100
    : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hours || isNaN(hours) || Number(hours) <= 0) {
      setError('Enter a valid number of hours.');
      return;
    }
    onSubmit({
      points:          previewPoints,
      hours:           Math.round(Number(hours) * 100) / 100,
      activityType:    activityType || '',
      okrId:           okrId || null,
      comment:         comment.trim(),
    });
  };

  return (
    <Modal title="Log Hours" onClose={onCancel} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Hours input + auto-calculated points preview */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Hours Invested *
            </label>
            <Input
              type="number"
              step="0.25"
              min="0.25"
              placeholder="e.g. 1.5"
              value={hours}
              onChange={e => { setHours(e.target.value); setError(''); }}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Points (auto)
            </label>
            <div className="h-10 flex items-center px-3 rounded-md border border-dashed border-border bg-secondary/40 text-sm font-semibold text-brand-lavender tabular-nums">
              {previewPoints != null ? `${Number(previewPoints).toFixed(1)} pts` : '—'}
            </div>
          </div>
        </div>

        {/* Phase Type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Phase Type <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            value={activityType}
            onChange={e => setActivityType(e.target.value)}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select phase…</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* OKR — only shown when OKRs exist */}
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

        {/* Comment */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Comment <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Helped debug Workday sync issue"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" size="sm" className="flex-1" disabled={!previewPoints}>
            Log Hours
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main CustomerDetailView ───────────────────────────────────────────────────
export default function CustomerDetailView({ customer, onBack }) {
  const {
    tasks, milestones, points, meetingEntries, customers, addPoint, addTask, okrs,
    addMilestone, updateMilestone, deleteMilestone,
    addMeetingEntry, updateMeetingEntry, deleteMeetingEntry,
    annotations, updateAnnotation, deleteAnnotation,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState('tasks');

  // Log Hours modal state
  const [showLogHoursModal, setShowLogHoursModal] = useState(false);

  // Annotation edit/delete from timeline
  const [annotationDeleteTarget, setAnnotationDeleteTarget] = useState(null);

  // Filter data for this customer
  const customerTasks = useMemo(
    () => tasks.filter(t => t.customerId === customer.id),
    [tasks, customer.id]
  );
  const customerMilestones = useMemo(
    () => milestones.filter(m => m.customerId === customer.id),
    [milestones, customer.id]
  );
  const customerAnnotations = useMemo(
    () => annotations.filter(a => a.customerId === customer.id),
    [annotations, customer.id]
  );
  const customerMeetings = useMemo(
    () => meetingEntries.filter(m => m.customerId === customer.id),
    [meetingEntries, customer.id]
  );
  // Quick stats
  const totalPoints = useMemo(
    () => points.filter(p => p.customerId === customer.id).reduce((s, p) => s + p.points, 0),
    [points, customer.id]
  );
  const totalHours = useMemo(
    () => points.filter(p => p.customerId === customer.id).reduce((s, p) => s + (p.hours || 0), 0),
    [points, customer.id]
  );
  const openTasks   = customerTasks.filter(t => !['done', 'archived'].includes(t.status)).length;
  const closedTasks = customerTasks.filter(t =>  ['done', 'archived'].includes(t.status)).length;

  const handleLogHours = (data) => {
    addPoint({ customerId: customer.id, ...data, source: 'manual', pomodoroCycles: null });
    setShowLogHoursModal(false);
  };

  const handleMeetingSave = (data) => {
    if (data.id) {
      updateMeetingEntry(data.id, data);
    } else {
      addMeetingEntry({ ...data, customerId: customer.id });
    }
  };

  const handleConvertActionItem = (item, customerId) => {
    const task = addTask({
      customerId: customerId || customer.id,
      description: item.text,
      workType: 'deep_work',
      status: 'open',
    });
    return task?.id || null;
  };

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
                <span className="text-lg font-bold text-foreground">{totalHours.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground ml-1">hrs logged</span>
              </div>
              <div className="relative group/pts">
                <span className="text-lg font-bold text-foreground">{Number(totalPoints).toFixed(1)}</span>
                <span className="text-xs text-muted-foreground ml-1">pts earned</span>
                <span className="ml-1 text-[10px] text-muted-foreground/50 cursor-help select-none">(?)</span>
                {/* Tooltip */}
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/pts:block z-20 w-56 bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-xl pointer-events-none">
                  ~{AUTO_TRACK_RATE.toFixed(1)} pts per hour logged<br />
                  <span className="text-muted-foreground/60">(2,150 pts ÷ 160 hrs/month target)</span>
                </div>
              </div>
              <div>
                <span className="text-lg font-bold text-brand-amber">{customerMilestones.length}</span>
                <span className="text-xs text-muted-foreground ml-1">milestones</span>
              </div>
            </div>
          </div>

          {/* Log Hours CTA — primary */}
          <Button
            size="sm"
            onClick={() => setShowLogHoursModal(true)}
            className="flex-shrink-0 self-end"
          >
            <Clock size={13} className="mr-1.5" />
            Log Hours
          </Button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'tasks',    label: 'Task Log',  icon: ClipboardList },
          { id: 'meetings', label: 'Meetings',  icon: MessageSquare },
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
        <TasksTab
          tasks={customerTasks}
          addTask={addTask}
          customerId={customer.id}
          okrs={okrs}
        />
      )}

      {activeTab === 'meetings' && (
        <MeetingsTab
          meetings={customerMeetings}
          customers={customers}
          customer={customer}
          onSave={handleMeetingSave}
          onDelete={(id) => deleteMeetingEntry(id)}
          onConvertActionItem={handleConvertActionItem}
        />
      )}

      {activeTab === 'timeline' && (
        <TimelineTab
          tasks={customerTasks}
          milestones={customerMilestones}
          annotations={customerAnnotations}
          customer={customer}
          onAdd={(data) => addMilestone({ ...data, customerId: customer.id })}
          onEdit={(id, data) => updateMilestone(id, data)}
          onDelete={(id) => deleteMilestone(id)}
          onEditAnnotation={(a) => updateAnnotation(a.id, a)}
          onDeleteAnnotation={(a) => setAnnotationDeleteTarget(a)}
        />
      )}

      {/* Log Hours modal */}
      {showLogHoursModal && (
        <LogHoursModal
          okrs={okrs}
          onSubmit={handleLogHours}
          onCancel={() => setShowLogHoursModal(false)}
        />
      )}

      {/* Annotation delete confirm */}
      {annotationDeleteTarget && (
        <ConfirmDialog
          title="Delete Annotation"
          message={`Delete this ${ANNOTATION_TAG_LABELS[annotationDeleteTarget.tag]} annotation? This cannot be undone.`}
          onConfirm={() => { deleteAnnotation(annotationDeleteTarget.id); setAnnotationDeleteTarget(null); }}
          onCancel={() => setAnnotationDeleteTarget(null)}
        />
      )}
    </div>
  );
}
