import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, ArrowLeft, Clock, Zap, Calendar, CheckCircle2, PauseCircle, XCircle, Timer, Square, ListPlus, NotebookPen, Pin, PinOff } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AddPointsModal from '../components/AddPointsModal';
import BulkAddProjectsModal from '../components/BulkAddProjectsModal';
import BulkAddPointsModal from '../components/BulkAddPointsModal';
import NewMeetingEntryModal from '../components/NewMeetingEntryModal';
import AddTaskModal from '../components/AddTaskModal';
import { CUSTOMER_COLORS, PROJECT_STATUSES, ACTIVITY_TYPES, ACTIVITY_COLORS, TASK_TYPES, TASK_TYPE_LABELS, TASK_TYPE_COLORS, TASK_STATUS_LABELS, TASK_STATUS_COLORS, TASK_STATUSES, TASK_RECIPIENTS } from '../constants';
import { formatDate, formatDateTime, formatRelative } from '../utils/dateHelpers';

const STATUS_ICONS = {
  'Active': CheckCircle2,
  'On Hold': PauseCircle,
  'Completed': XCircle,
};
const STATUS_COLORS = {
  'Active': 'text-brand-sage',
  'On Hold': 'text-brand-amber',
  'Completed': 'text-muted-foreground',
};

function ProjectForm({ initial = {}, okrs, customers, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    customerId: initial.customerId || '',
    okrId: initial.okrId || '',
    status: initial.status || 'Active',
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.customerId) e.customerId = 'Required';
    if (!form.okrId) e.okrId = 'Required';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({ ...form, name: form.name.trim() });
  };

  const f = (key) => ({ value: form[key], onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })) });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Project Name *</label>
        <input {...f('name')} placeholder="e.g. TaskUs Onboarding Revamp" className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40" />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer *</label>
        <select {...f('customerId')} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40">
          <option value="">Select customer...</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.customerId && <p className="mt-1 text-xs text-destructive">{errors.customerId}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">OKR *</label>
        <select {...f('okrId')} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40">
          <option value="">Select OKR...</option>
          {okrs.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        {errors.okrId && <p className="mt-1 text-xs text-destructive">{errors.okrId}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
        <select {...f('status')} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40">
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-colors">{initial.id ? 'Save Changes' : 'Create Project'}</button>
      </div>
    </form>
  );
}

function EditEntryModal({ entry, onClose }) {
  const { updatePoint } = useAppStore();
  const [form, setForm] = useState({
    points: String(entry.points),
    hours: String(entry.hours),
    activityType: entry.activityType,
    comment: entry.comment || '',
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
    updatePoint(entry.id, {
      points: Number(form.points),
      hours: Number(form.hours),
      activityType: form.activityType,
      comment: form.comment.trim(),
    });
    onClose();
  };

  const f = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <Modal title="Edit Entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Points *</label>
            <input
              type="number" step="0.01" min="0.01" autoFocus
              {...f('points')}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
            {errors.points && <p className="mt-1 text-xs text-destructive">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hours Invested *</label>
            <input
              type="number" step="0.25" min="0"
              {...f('hours')}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
            {errors.hours && <p className="mt-1 text-xs text-destructive">{errors.hours}</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Activity Type <span className="text-muted-foreground/70">(optional)</span></label>
          <select
            {...f('activityType')}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select activity...</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {errors.activityType && <p className="mt-1 text-xs text-destructive">{errors.activityType}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Comment <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <textarea
            rows={2}
            {...f('comment')}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-gray-600 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Inline task edit form (used in Tasks tab) ───────────────────────────────
function TaskEditForm({ task, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    description: task.description || '',
    taskType: task.taskType || 'comms',
    assigneeOrTeam: task.assigneeOrTeam || '',
    status: task.status || 'open',
    ticketUrl: task.ticketUrl || '',
  });

  const handleSave = () => {
    if (!form.description.trim()) return;
    onSave({
      description: form.description.trim(),
      taskType: form.taskType,
      assigneeOrTeam: form.assigneeOrTeam,
      status: form.status,
      ticketUrl: form.ticketUrl.trim(),
    });
  };

  const inputCls = 'w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40';

  return (
    <div className="p-4 space-y-3">
      {/* Description */}
      <textarea
        autoFocus
        rows={2}
        value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        placeholder="Task description..."
        className={`${inputCls} resize-none`}
      />

      {/* Type + Status + Assignee — 3 columns */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Type</label>
          <select
            value={form.taskType}
            onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
            className={inputCls}
          >
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className={inputCls}
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Assignee</label>
          <select
            value={form.assigneeOrTeam}
            onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
            className={inputCls}
          >
            <option value="">— None —</option>
            {TASK_RECIPIENTS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ticket URL */}
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">Ticket URL</label>
        <input
          value={form.ticketUrl}
          onChange={e => setForm(p => ({ ...p, ticketUrl: e.target.value }))}
          placeholder="https://jira.company.com/ticket/123"
          className={inputCls}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onDelete}
          className="px-2.5 py-1.5 rounded-lg text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all flex items-center gap-1.5"
        >
          <Trash2 size={12} /> Delete
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.description.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-lavender hover:bg-brand-lavender/80 text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ project, onBack }) {
  const { points, tasks, customers, okrs, addPoint, deletePoint, updatePoint, updateProject, deleteProject, getProjectMeetingEntries, getProjectTasks, updateTask, deleteTask, getProjectMilestones, addMilestone, updateMilestone, deleteMilestone } = useAppStore();
  const { isRunning, projectId: runningProjectId, startTimer, stopTimer } = useTimerContext();
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'timeline' | 'points' | 'meetings'
  const [addModal, setAddModal] = useState(false);
  const [addTaskModal, setAddTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState(null);
  const [bulkPointsModal, setBulkPointsModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState(null);
  const [editEntryModal, setEditEntryModal] = useState(null);
  const [timerConflict, setTimerConflict] = useState(false);
  const [flashMsg, setFlashMsg] = useState(null);
  const [newMeetingModal, setNewMeetingModal] = useState(false);

  // Milestone & calendar state (for Timeline tab)
  const [calMonth, setCalMonth] = useState(new Date());
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ title: '', targetDate: '', status: 'upcoming' });
  const [milestoneFormErrors, setMilestoneFormErrors] = useState({});
  const [editMilestoneId, setEditMilestoneId] = useState(null);
  const [deleteMilestoneId, setDeleteMilestoneId] = useState(null);

  const customer = customers.find(c => c.id === project.customerId);
  const okr = okrs.find(o => o.id === project.okrId);
  const entries = points.filter(p => p.projectId === project.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const totalPoints = entries.reduce((s, e) => s + e.points, 0);
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  // Task completion points: auto-awarded when tasks are marked done
  const taskPts = tasks.filter(t => t.projectId === project.id).reduce((s, t) => s + (t.points || 0), 0);

  // Meeting entries sorted newest-date-first, then grouped by meetingDate
  const meetingEntries = getProjectMeetingEntries(project.id).sort(
    (a, b) => b.meetingDate.localeCompare(a.meetingDate)
  );
  const meetingsByDate = meetingEntries.reduce((acc, entry) => {
    if (!acc[entry.meetingDate]) acc[entry.meetingDate] = [];
    acc[entry.meetingDate].push(entry);
    return acc;
  }, {});

  // Milestones for this project, sorted by targetDate ascending
  const projectMilestones = getProjectMilestones(project.id).sort(
    (a, b) => a.targetDate.localeCompare(b.targetDate)
  );

  // Tasks for this project, grouped by status
  const projectTasks = getProjectTasks(project.id).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  // Active tasks only (open, in-progress, blocked) — done/archived live in Timeline
  const activeProjectTasks = projectTasks.filter(t => !['done', 'archived'].includes(t.status));
  const doneProjectTasksCount = projectTasks.filter(t => ['done', 'archived'].includes(t.status)).length;
  const tasksByStatus = TASK_STATUSES.filter(s => s !== 'done').reduce((acc, s) => {
    acc[s] = projectTasks.filter(t => t.status === s);
    return acc;
  }, {});

  const StatusIcon = STATUS_ICONS[project.status] || CheckCircle2;

  const handlePointSuccess = (entry) => {
    setFlashMsg(`+${entry.points} pts!`);
    setTimeout(() => setFlashMsg(null), 1500);
  };

  // Milestone helpers
  const openAddMilestoneForm = () => {
    setEditMilestoneId(null);
    setMilestoneForm({ title: '', targetDate: '', status: 'upcoming' });
    setMilestoneFormErrors({});
    setShowMilestoneForm(true);
  };

  const openEditMilestoneForm = (m) => {
    setEditMilestoneId(m.id);
    setMilestoneForm({ title: m.title, targetDate: m.targetDate, status: m.status });
    setMilestoneFormErrors({});
    setShowMilestoneForm(true);
  };

  const handleSaveMilestone = () => {
    const errs = {};
    if (!milestoneForm.title.trim()) errs.title = 'Required';
    if (!milestoneForm.targetDate) errs.targetDate = 'Required';
    if (Object.keys(errs).length) { setMilestoneFormErrors(errs); return; }
    if (editMilestoneId) {
      updateMilestone(editMilestoneId, { ...milestoneForm, title: milestoneForm.title.trim() });
    } else {
      addMilestone({ projectId: project.id, ...milestoneForm, title: milestoneForm.title.trim() });
    }
    setShowMilestoneForm(false);
    setEditMilestoneId(null);
    setMilestoneForm({ title: '', targetDate: '', status: 'upcoming' });
    setMilestoneFormErrors({});
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={15} /> Back to Projects
      </button>

      {/* Project header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {customer && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1', border: `1px solid ${customer.color || '#6366f1'}40` }}
                >
                  {customer.name}
                </span>
              )}
              <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[project.status]}`}>
                <StatusIcon size={12} /> {project.status}
              </span>
            </div>
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
            {okr && <p className="text-xs text-muted-foreground mt-1">OKR: {okr.title}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditModal(true)} className="p-2 rounded-xl bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil size={15} /></button>
            <button onClick={() => setDeleteConfirm(true)} className="p-2 rounded-xl bg-secondary hover:bg-red-900/40 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={15} /></button>
          </div>
        </div>

        <div className={`grid gap-3 mt-5 ${taskPts > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="bg-secondary/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-brand-lavender">{totalPoints}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Points</p>
          </div>
          <div className="bg-secondary/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-violet-400">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Hours</p>
          </div>
          <div className="bg-secondary/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{entries.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Entries</p>
          </div>
          {taskPts > 0 && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-teal-400">⚡{taskPts}</p>
              <p className="text-xs text-teal-500/80 mt-0.5">Task Pts</p>
            </div>
          )}
        </div>

        {/* Floating flash */}
        {flashMsg && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-gray-900 text-lg font-black px-6 py-3 rounded-2xl shadow-2xl point-flash">
            {flashMsg}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-secondary rounded-xl p-1 gap-1 w-fit">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'tasks' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Tasks
          {activeProjectTasks.length > 0 && (
            <span className="ml-0.5 bg-brand-lavender/40 text-brand-lavender/80 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {activeProjectTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'timeline' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Calendar size={12} /> Timeline
          {(projectMilestones.length + doneProjectTasksCount) > 0 && (
            <span className="ml-0.5 bg-brand-lavender/40 text-brand-lavender/80 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {projectMilestones.length + doneProjectTasksCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('points')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'points' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Points Log
        </button>
        <button
          onClick={() => setActiveTab('meetings')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'meetings' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <NotebookPen size={12} /> Meeting Log
          {meetingEntries.length > 0 && (
            <span className="ml-0.5 bg-brand-lavender/40 text-brand-lavender/80 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {meetingEntries.length}
            </span>
          )}
        </button>
      </div>

      {/* Points tab */}
      {activeTab === 'points' && (
        <>
          {/* Action buttons row — consistent position (justify-between) matching Meeting/Tasks tabs */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
            <div className="flex gap-2 flex-shrink-0">
              {isRunning && runningProjectId === project.id ? (
                <button
                  onClick={stopTimer}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/20 hover:bg-destructive/40 text-destructive font-bold transition-all border border-destructive/40"
                >
                  <Square size={13} fill="currentColor" /> Stop Timer
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isRunning) {
                      setTimerConflict(true);
                    } else {
                      startTimer(project.id);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-sage/20 hover:bg-brand-sage/40 text-brand-sage font-bold transition-all border border-brand-sage/40"
                >
                  <Timer size={14} /> Start Timer
                </button>
              )}
              <button
                onClick={() => setAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-foreground text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
              >
                <Plus size={15} /> Add Points
              </button>
              <button
                onClick={() => setBulkPointsModal(true)}
                aria-label="Bulk add points"
                title="Bulk add points"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-muted border border-border text-foreground/80 hover:text-foreground text-xs font-medium transition-all"
              >
                <ListPlus size={15} /> Bulk Add
              </button>
            </div>
          </div>

          {/* Points log */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Points History</h2>
              <span className="text-xs text-muted-foreground">{entries.length} entries</span>
            </div>
            {entries.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-muted-foreground text-sm">No points logged yet.</p>
                <p className="text-muted-foreground/70 text-xs mt-1">Click "Add Points" to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60">
                {entries.map(entry => (
                  <div key={entry.id} className="px-5 py-3.5 flex items-start gap-3 group hover:bg-secondary/30 transition-colors">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: ACTIVITY_COLORS[entry.activityType] || '#6366f1' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{entry.activityType || 'General'}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      {entry.comment && <p className="text-xs text-muted-foreground mt-0.5">{entry.comment}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> {entry.hours}h</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-brand-lavender">+{entry.points}</span>
                      <button
                        onClick={() => setEditEntryModal(entry)}
                        className="p-1 rounded text-muted-foreground/70 hover:text-brand-lavender opacity-0 group-hover:opacity-100 transition-all"
                        title="Edit entry"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteEntryId(entry.id)}
                        className="p-1 rounded text-muted-foreground/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete entry"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Meeting Log tab */}
      {activeTab === 'meetings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{meetingEntries.length} {meetingEntries.length === 1 ? 'entry' : 'entries'}</p>
            <button
              onClick={() => setNewMeetingModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-foreground text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
            >
              <Plus size={15} /> New Meeting Entry
            </button>
          </div>

          {meetingEntries.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-14 text-center">
              <NotebookPen size={28} className="text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No meeting notes yet.</p>
              <p className="text-muted-foreground/70 text-xs mt-1">Click "New Meeting Entry" to log your first meeting.</p>
            </div>
          ) : (
            Object.entries(meetingsByDate).map(([date, dayEntries]) => (
              <div key={date}>
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={13} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-muted-foreground/70">({dayEntries.length})</span>
                </div>

                <div className="space-y-2">
                  {dayEntries.map(entry => (
                    <div key={entry.id} className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="text-[10px] text-muted-foreground">
                          Logged {new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {entry.isTriaged ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-sage/15 text-brand-sage border border-brand-sage/20 flex-shrink-0">
                            <CheckCircle2 size={10} /> Triaged
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/20 flex-shrink-0">
                            Untriaged
                          </span>
                        )}
                      </div>
                      {/* Notes preview — truncated, full HTML visible on expand */}
                      <div
                        className="text-sm text-foreground/80 leading-relaxed line-clamp-3 rich-text-display"
                        dangerouslySetInnerHTML={{ __html: entry.rawNotes }}
                      />
                      {entry.rawNotes.length > 300 && (
                        <details className="mt-1">
                          <summary className="text-xs text-brand-lavender hover:text-brand-lavender/80 cursor-pointer list-none">Show full notes</summary>
                          <div
                            className="mt-2 text-sm text-foreground/80 leading-relaxed rich-text-display"
                            dangerouslySetInnerHTML={{ __html: entry.rawNotes }}
                          />
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">{activeProjectTasks.length} active {activeProjectTasks.length === 1 ? 'task' : 'tasks'}</p>
              {doneProjectTasksCount > 0 && (
                <button onClick={() => setActiveTab('timeline')} className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 transition-colors">
                  {doneProjectTasksCount} done → Timeline
                </button>
              )}
            </div>
            <button
              onClick={() => setAddTaskModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-foreground text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
            >
              <Plus size={15} /> Add Task
            </button>
          </div>

          {activeProjectTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-14 text-center">
              <p className="text-muted-foreground text-sm">No active tasks.</p>
              <p className="text-muted-foreground/70 text-xs mt-1">
                {doneProjectTasksCount > 0
                  ? `${doneProjectTasksCount} completed task${doneProjectTasksCount !== 1 ? 's' : ''} on the Timeline.`
                  : 'Click "Add Task" to create your first task for this project.'}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {TASK_STATUSES.map(status => {
                const group = tasksByStatus[status] || [];
                if (group.length === 0) return null;
                const statusColors = TASK_STATUS_COLORS[status];
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColors.text}`}>
                        {TASK_STATUS_LABELS[status]}
                      </span>
                      <span className="text-xs text-muted-foreground/70">({group.length})</span>
                    </div>
                    <div className="space-y-2">
                      {group.map(task => {
                        const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
                        const isEditing = editingTaskId === task.id;
                        return (
                          <div key={task.id} className={`bg-card border rounded-xl transition-all ${isEditing ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'border-border'}`}>
                            {/* Collapsed view */}
                            {!isEditing ? (
                              <div className="p-3 flex items-start gap-3">
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => setEditingTaskId(task.id)}
                                >
                                  <p className="text-sm text-foreground leading-snug">{task.description}</p>
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
                                      {TASK_TYPE_LABELS[task.taskType]}
                                    </span>
                                    {task.assigneeOrTeam && (
                                      <span className="text-[10px] text-muted-foreground">→ {TASK_RECIPIENTS.find(r => r.value === task.assigneeOrTeam)?.label || task.assigneeOrTeam}</span>
                                    )}
                                    {task.ticketUrl && (
                                      <a href={task.ticketUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-brand-lavender/70 hover:text-brand-lavender/80 transition-colors" onClick={e => e.stopPropagation()}>ticket ↗</a>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <select
                                    value={task.status}
                                    onChange={e => { e.stopPropagation(); updateTask(task.id, { status: e.target.value }); }}
                                    className={`text-[10px] font-semibold rounded-lg px-2 py-1 border cursor-pointer focus:outline-none ${statusColors.bg} ${statusColors.text} ${statusColors.border} bg-transparent`}
                                  >
                                    {TASK_STATUSES.map(s => (
                                      <option key={s} value={s} className="bg-secondary text-foreground">{TASK_STATUS_LABELS[s]}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setEditingTaskId(task.id)}
                                    className="p-1 rounded-lg text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                                    title="Edit task"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Expanded edit form */
                              <TaskEditForm
                                task={task}
                                onSave={(data) => { updateTask(task.id, data); setEditingTaskId(null); }}
                                onCancel={() => setEditingTaskId(null)}
                                onDelete={() => setDeleteTaskTarget(task)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Timeline tab — Calendar layout */}
      {activeTab === 'timeline' && (() => {
        const yr = calMonth.getFullYear();
        const mo = calMonth.getMonth();
        const firstOfMonth = new Date(yr, mo, 1);
        const lastOfMonth = new Date(yr, mo + 1, 0);

        // Build 6-week grid starting from Sunday before the 1st
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(gridStart.getDate() - gridStart.getDay());
        const cells = [];
        const cursor = new Date(gridStart);
        for (let i = 0; i < 42; i++) {
          cells.push(new Date(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
        // Only show 5 rows if the 6th row is entirely next month
        const showSixRows = cells[35].getMonth() === mo;
        const displayCells = showSixRows ? cells : cells.slice(0, 35);

        // Closed (done + archived) tasks for this project
        const closedTasks = projectTasks.filter(t => ['done', 'archived'].includes(t.status));

        // Build events by YYYY-MM-DD key
        const dk = (d) => {
          const dt = d instanceof Date ? d : new Date(d);
          return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        };
        const eventsByDate = {};
        projectMilestones.forEach(m => {
          const key = m.targetDate;
          if (!eventsByDate[key]) eventsByDate[key] = [];
          eventsByDate[key].push({ type: 'milestone', id: m.id, label: m.title, status: m.status, raw: m });
        });
        closedTasks.forEach(t => {
          const d = t.closedAt ? new Date(t.closedAt) : new Date(t.createdAt);
          const key = dk(d);
          if (!eventsByDate[key]) eventsByDate[key] = [];
          eventsByDate[key].push({ type: 'task', id: t.id, label: t.description, status: t.status, raw: t });
        });

        const todayKey = dk(new Date());
        const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header: month nav + add milestone */}
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCalMonth(new Date(yr, mo - 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <h2 className="text-sm font-semibold text-foreground w-40 text-center">{monthLabel}</h2>
                  <button
                    onClick={() => setCalMonth(new Date(yr, mo + 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCalMonth(new Date())}
                    className="ml-1 text-[10px] text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg hover:bg-secondary transition-colors"
                  >
                    Today
                  </button>
                </div>
                <button
                  onClick={openAddMilestoneForm}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-foreground text-xs font-bold transition-all"
                >
                  <Plus size={13} /> Add Milestone
                </button>
              </div>

              {/* Inline milestone add / edit form */}
              {showMilestoneForm && (
                <div className="px-5 py-4 border-b border-border bg-secondary/40 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <input
                        type="text"
                        value={milestoneForm.title}
                        onChange={e => setMilestoneForm(p => ({ ...p, title: e.target.value }))}
                        placeholder="Milestone title *"
                        autoFocus
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                      />
                      {milestoneFormErrors.title && <p className="mt-1 text-[10px] text-destructive">{milestoneFormErrors.title}</p>}
                    </div>
                    <div>
                      <input
                        type="date"
                        value={milestoneForm.targetDate}
                        onChange={e => setMilestoneForm(p => ({ ...p, targetDate: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                      />
                      {milestoneFormErrors.targetDate && <p className="mt-1 text-[10px] text-destructive">{milestoneFormErrors.targetDate}</p>}
                    </div>
                    <div>
                      <select
                        value={milestoneForm.status}
                        onChange={e => setMilestoneForm(p => ({ ...p, status: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="achieved">Achieved</option>
                        <option value="missed">Missed</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveMilestone}
                      className="px-4 py-1.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-foreground text-xs font-bold transition-colors"
                    >
                      {editMilestoneId ? 'Save Changes' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowMilestoneForm(false); setEditMilestoneId(null); setMilestoneFormErrors({}); }}
                      className="px-4 py-1.5 rounded-xl bg-muted hover:bg-gray-600 text-xs text-foreground/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="px-5 py-2 border-b border-border/60 flex items-center gap-5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-400 rotate-45 inline-block" />
                  Milestone
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Done
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                  Archived
                </span>
              </div>

              {/* Day-of-week header */}
              <div className="grid grid-cols-7 border-b border-border/60">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-[10px] text-muted-foreground font-semibold py-2 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className={`grid grid-cols-7`}>
                {displayCells.map((cellDate, i) => {
                  const key = dk(cellDate);
                  const isCurrentMonth = cellDate.getMonth() === mo;
                  const isToday = key === todayKey;
                  const events = eventsByDate[key] || [];
                  const maxShow = 3;
                  const overflow = events.length - maxShow;

                  return (
                    <div
                      key={i}
                      className={`min-h-[85px] border-b border-r border-border/30 p-1.5 transition-colors ${
                        isCurrentMonth ? 'bg-card' : 'bg-background/50'
                      } ${isToday ? 'ring-1 ring-inset ring-indigo-500/50' : ''}`}
                    >
                      {/* Day number */}
                      <div className={`text-[11px] font-medium mb-1 ${
                        isToday ? 'text-brand-lavender font-bold' : isCurrentMonth ? 'text-muted-foreground' : 'text-muted-foreground/60'
                      }`}>
                        {cellDate.getDate()}
                      </div>

                      {/* Events */}
                      {events.slice(0, maxShow).map(ev => (
                        <div
                          key={`${ev.type}-${ev.id}`}
                          className={`flex items-center gap-1 mb-0.5 rounded px-1 py-0.5 cursor-default group/ev ${
                            ev.type === 'milestone' ? 'hover:bg-secondary/60' : 'hover:bg-secondary/40'
                          }`}
                          title={ev.type === 'milestone'
                            ? `${ev.label} (${ev.status})`
                            : `${ev.label} — ${ev.status === 'done' ? 'Done' : 'Archived'}`
                          }
                        >
                          {ev.type === 'milestone' ? (
                            <span className={`w-1.5 h-1.5 rotate-45 flex-shrink-0 ${
                              ev.status === 'achieved' ? 'bg-emerald-400' : ev.status === 'missed' ? 'bg-red-400' : 'bg-amber-400'
                            }`} />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              ev.status === 'done' ? 'bg-emerald-400' : 'bg-gray-500'
                            }`} />
                          )}
                          <span className={`text-[10px] truncate leading-tight ${
                            !isCurrentMonth ? 'text-muted-foreground/70' : ev.type === 'milestone' ? 'text-foreground font-medium' : 'text-muted-foreground'
                          }`}>
                            {ev.label.length > 18 ? ev.label.slice(0, 16) + '…' : ev.label}
                          </span>
                          {/* Milestone edit/delete on hover */}
                          {ev.type === 'milestone' && (
                            <div className="hidden group-hover/ev:flex items-center gap-0.5 flex-shrink-0 ml-auto">
                              <button onClick={() => openEditMilestoneForm(ev.raw)} className="text-muted-foreground/70 hover:text-brand-lavender" title="Edit">
                                <Pencil size={9} />
                              </button>
                              <button onClick={() => setDeleteMilestoneId(ev.id)} className="text-muted-foreground/70 hover:text-destructive" title="Delete">
                                <Trash2 size={9} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[9px] text-muted-foreground/70 pl-1">+{overflow} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestone delete confirmation */}
            {deleteMilestoneId && (
              <ConfirmDialog
                title="Delete Milestone"
                message="Remove this milestone? This cannot be undone."
                onConfirm={() => { deleteMilestone(deleteMilestoneId); setDeleteMilestoneId(null); }}
                onCancel={() => setDeleteMilestoneId(null)}
              />
            )}
          </div>
        );
      })()}

      {addTaskModal && (
        <AddTaskModal
          project={project}
          onClose={() => setAddTaskModal(false)}
        />
      )}

      {newMeetingModal && (
        <NewMeetingEntryModal
          project={project}
          onClose={() => setNewMeetingModal(false)}
        />
      )}

      {addModal && (
        <AddPointsModal
          project={project}
          onClose={() => setAddModal(false)}
          onSuccess={handlePointSuccess}
        />
      )}

      {bulkPointsModal && (
        <BulkAddPointsModal
          project={project}
          onClose={() => setBulkPointsModal(false)}
        />
      )}

      {editModal && (
        <Modal title="Edit Project" onClose={() => setEditModal(false)}>
          <ProjectForm
            initial={project}
            okrs={okrs}
            customers={customers}
            onSubmit={(data) => { updateProject(project.id, data); setEditModal(false); }}
            onCancel={() => setEditModal(false)}
          />
        </Modal>
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Project"
          message={`Delete "${project.name}" and all its point entries? This cannot be undone.`}
          onConfirm={() => { deleteProject(project.id); onBack(); }}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}

      {deleteTaskTarget && (
        <ConfirmDialog
          title="Delete Task"
          message={`Permanently delete "${deleteTaskTarget.description}"? This cannot be undone.`}
          danger={true}
          onConfirm={() => { deleteTask(deleteTaskTarget.id); setDeleteTaskTarget(null); setEditingTaskId(null); }}
          onCancel={() => setDeleteTaskTarget(null)}
        />
      )}

      {deleteEntryId && (
        <ConfirmDialog
          title="Delete Entry"
          message="Remove this point entry?"
          onConfirm={() => { deletePoint(deleteEntryId); setDeleteEntryId(null); }}
          onCancel={() => setDeleteEntryId(null)}
        />
      )}

      {editEntryModal && (
        <EditEntryModal
          entry={editEntryModal}
          onClose={() => setEditEntryModal(null)}
        />
      )}

      {timerConflict && (
        <ConfirmDialog
          title="Timer Already Running"
          message="A timer is already running for another project. Stop it first (you'll be prompted to save that session), then you can start a timer here."
          danger={false}
          onConfirm={() => { stopTimer(); setTimerConflict(false); }}
          onCancel={() => setTimerConflict(false)}
        />
      )}
    </div>
  );
}

// ─── Project card (used in both Priority section and group sections) ──────────
function ProjectCard({ project, customers, okrs, onSelect, onPin }) {
  const customer = customers.find(c => c.id === project.customerId);
  const okr = okrs.find(o => o.id === project.okrId);
  const StatusIcon = STATUS_ICONS[project.status] || CheckCircle2;
  const isPinned = !!project.pinned;

  return (
    <div
      onClick={() => onSelect(project.id)}
      className={`relative text-left rounded-2xl p-4 transition-all hover:shadow-lg cursor-pointer group ${
        isPinned
          ? 'bg-amber-950/20 border border-amber-700/40 hover:border-amber-600/60'
          : 'bg-card border border-border hover:border-border'
      }`}
      style={{ borderLeftColor: customer?.color || '#6366f1', borderLeftWidth: 3 }}
    >
      {/* Pin button — always visible, top-right */}
      <button
        onClick={e => { e.stopPropagation(); onPin(project.id, !isPinned); }}
        title={isPinned ? 'Unpin project' : 'Pin to top'}
        className={`absolute top-3 right-3 p-1 rounded-lg transition-colors z-10 ${
          isPinned
            ? 'text-brand-amber hover:text-amber-300 hover:bg-amber-900/40'
            : 'text-muted-foreground/70 hover:text-brand-amber hover:bg-secondary'
        }`}
      >
        {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>

      <div className="flex items-start justify-between gap-2 mb-3 pr-6">
        <p className="font-semibold text-foreground text-sm leading-tight">{project.name}</p>
        <ChevronRight size={15} className="text-muted-foreground/70 group-hover:text-muted-foreground flex-shrink-0 mt-0.5 transition-colors" />
      </div>
      {okr && <p className="text-[11px] text-muted-foreground mb-3 line-clamp-1">{okr.title}</p>}
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 text-[11px] font-medium ${STATUS_COLORS[project.status]}`}>
          <StatusIcon size={11} /> {project.status}
        </span>
        <span className="text-xs text-muted-foreground">Created {formatDate(project.createdAt)}</span>
      </div>
    </div>
  );
}

export default function Projects({ initialProjectId, onProjectSelect }) {
  const { projects, customers, okrs, addProject, updateProject, deleteProject } = useAppStore();
  const [selectedId, setSelectedId] = useState(initialProjectId || null);
  const [createModal, setCreateModal] = useState(false);
  const [bulkProjectsModal, setBulkProjectsModal] = useState(false);
  const [viewTab, setViewTab] = useState('priority'); // 'priority' | 'non-priority'

  const selectedProject = projects.find(p => p.id === selectedId);

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} onBack={() => setSelectedId(null)} />;
  }

  const pinnedProjects = projects.filter(p => !!p.pinned);
  const unpinnedProjects = projects.filter(p => !p.pinned);
  const displayedProjects = viewTab === 'priority' ? pinnedProjects : unpinnedProjects;

  const handlePin = (id, value) => updateProject(id, { pinned: value });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkProjectsModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-muted border border-border text-sm font-medium text-foreground/80 hover:text-foreground transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {/* Priority / Non-Priority tab switcher */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setViewTab('priority')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            viewTab === 'priority' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Pin size={11} className={viewTab === 'priority' ? 'text-brand-amber' : ''} />
          Priority
          {pinnedProjects.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              viewTab === 'priority' ? 'bg-amber-500/20 text-brand-amber' : 'bg-muted text-muted-foreground'
            }`}>
              {pinnedProjects.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewTab('non-priority')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            viewTab === 'non-priority' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Non Priority
          {unpinnedProjects.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              viewTab === 'non-priority' ? 'bg-gray-600 text-foreground/80' : 'bg-muted text-muted-foreground'
            }`}>
              {unpinnedProjects.length}
            </span>
          )}
        </button>
      </div>

      {/* Project grid */}
      {displayedProjects.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <p className="text-muted-foreground text-sm">
            {viewTab === 'priority' ? 'No priority projects.' : 'No non-priority projects.'}
          </p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            {viewTab === 'priority'
              ? 'Pin a project to make it priority.'
              : 'All projects are pinned as priority.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              customers={customers}
              okrs={okrs}
              onSelect={setSelectedId}
              onPin={handlePin}
            />
          ))}
        </div>
      )}

      {createModal && (
        <Modal title="New Project" onClose={() => setCreateModal(false)}>
          <ProjectForm
            okrs={okrs}
            customers={customers}
            onSubmit={(data) => { addProject(data); setCreateModal(false); }}
            onCancel={() => setCreateModal(false)}
          />
        </Modal>
      )}
      {bulkProjectsModal && <BulkAddProjectsModal onClose={() => setBulkProjectsModal(false)} />}
    </div>
  );
}
