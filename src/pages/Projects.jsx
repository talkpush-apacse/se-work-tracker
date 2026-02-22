import { useState } from 'react';
import { Plus, ChevronRight, Pencil, Trash2, ArrowLeft, Clock, Zap, Calendar, CheckCircle2, PauseCircle, XCircle, LayoutGrid, List, Timer, Square, ListPlus, NotebookPen, Pin, PinOff, Flag, GitCommitHorizontal } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AddPointsModal from '../components/AddPointsModal';
import BulkAddProjectsModal from '../components/BulkAddProjectsModal';
import BulkAddPointsModal from '../components/BulkAddPointsModal';
import NewMeetingEntryModal from '../components/NewMeetingEntryModal';
import AddTaskModal from '../components/AddTaskModal';
import { CUSTOMER_COLORS, PROJECT_STATUSES, ACTIVITY_TYPES, ACTIVITY_COLORS, TASK_TYPE_LABELS, TASK_TYPE_COLORS, TASK_STATUS_LABELS, TASK_STATUS_COLORS, TASK_STATUSES, TASK_RECIPIENTS } from '../constants';
import { formatDate, formatDateTime, formatRelative } from '../utils/dateHelpers';

const STATUS_ICONS = {
  'Active': CheckCircle2,
  'On Hold': PauseCircle,
  'Completed': XCircle,
};
const STATUS_COLORS = {
  'Active': 'text-emerald-400',
  'On Hold': 'text-amber-400',
  'Completed': 'text-gray-500',
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
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Project Name *</label>
        <input {...f('name')} placeholder="e.g. TaskUs Onboarding Revamp" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40" />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer *</label>
        <select {...f('customerId')} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40">
          <option value="">Select customer...</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.customerId && <p className="mt-1 text-xs text-red-400">{errors.customerId}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">OKR *</label>
        <select {...f('okrId')} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40">
          <option value="">Select OKR...</option>
          {okrs.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        {errors.okrId && <p className="mt-1 text-xs text-red-400">{errors.okrId}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
        <select {...f('status')} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40">
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">{initial.id ? 'Save Changes' : 'Create Project'}</button>
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
    if (!form.activityType) e.activityType = 'Select an activity type';
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
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Points *</label>
            <input
              type="number" step="1" min="1" autoFocus
              {...f('points')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.points && <p className="mt-1 text-xs text-red-400">{errors.points}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Hours Invested *</label>
            <input
              type="number" step="0.25" min="0"
              {...f('hours')}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            />
            {errors.hours && <p className="mt-1 text-xs text-red-400">{errors.hours}</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Activity Type *</label>
          <select
            {...f('activityType')}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            <option value="">Select activity...</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {errors.activityType && <p className="mt-1 text-xs text-red-400">{errors.activityType}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Comment <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            rows={2}
            {...f('comment')}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectDetail({ project, onBack }) {
  const { points, tasks, customers, okrs, addPoint, deletePoint, updatePoint, updateProject, deleteProject, getProjectMeetingEntries, getProjectTasks, updateTask, getProjectMilestones, addMilestone, updateMilestone, deleteMilestone } = useAppStore();
  const { isRunning, projectId: runningProjectId, startTimer, stopTimer } = useTimerContext();
  const [activeTab, setActiveTab] = useState('points'); // 'points' | 'meetings' | 'tasks' | 'timeline'
  const [addModal, setAddModal] = useState(false);
  const [addTaskModal, setAddTaskModal] = useState(false);
  const [bulkPointsModal, setBulkPointsModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState(null);
  const [editEntryModal, setEditEntryModal] = useState(null);
  const [timerConflict, setTimerConflict] = useState(false);
  const [flashMsg, setFlashMsg] = useState(null);
  const [newMeetingModal, setNewMeetingModal] = useState(false);

  // Milestone state (for Timeline tab)
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
  const tasksByStatus = TASK_STATUSES.reduce((acc, s) => {
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
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={15} /> Back to Projects
      </button>

      {/* Project header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
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
            <h1 className="text-xl font-bold text-white">{project.name}</h1>
            {okr && <p className="text-xs text-gray-500 mt-1">OKR: {okr.title}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditModal(true)} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"><Pencil size={15} /></button>
            <button onClick={() => setDeleteConfirm(true)} className="p-2 rounded-xl bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
          </div>
        </div>

        <div className={`grid gap-3 mt-5 ${taskPts > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-indigo-400">{totalPoints}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Points</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-violet-400">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Hours</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-white">{entries.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Entries</p>
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
      <div className="flex bg-gray-800 rounded-xl p-1 gap-1 w-fit">
        <button
          onClick={() => setActiveTab('points')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'points' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Points Log
        </button>
        <button
          onClick={() => setActiveTab('meetings')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'meetings' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <NotebookPen size={12} /> Meeting Log
          {meetingEntries.length > 0 && (
            <span className="ml-0.5 bg-indigo-600/40 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {meetingEntries.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'tasks' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Tasks
          {projectTasks.length > 0 && (
            <span className="ml-0.5 bg-indigo-600/40 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {projectTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'timeline' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Flag size={12} /> Timeline
          {projectMilestones.length > 0 && (
            <span className="ml-0.5 bg-indigo-600/40 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              {projectMilestones.length}
            </span>
          )}
        </button>
      </div>

      {/* Points tab */}
      {activeTab === 'points' && (
        <>
          {/* Action buttons row — consistent position (justify-between) matching Meeting/Tasks tabs */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
            <div className="flex gap-2 flex-shrink-0">
              {isRunning && runningProjectId === project.id ? (
                <button
                  onClick={stopTimer}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold transition-all border border-red-700/40"
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
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 font-bold transition-all border border-emerald-700/40"
                >
                  <Timer size={14} /> Start Timer
                </button>
              )}
              <button
                onClick={() => setAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
              >
                <Plus size={15} /> Add Points
              </button>
              <button
                onClick={() => setBulkPointsModal(true)}
                aria-label="Bulk add points"
                title="Bulk add points"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-all"
              >
                <ListPlus size={15} /> Bulk Add
              </button>
            </div>
          </div>

          {/* Points log */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">Points History</h2>
              <span className="text-xs text-gray-500">{entries.length} entries</span>
            </div>
            {entries.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-gray-500 text-sm">No points logged yet.</p>
                <p className="text-gray-600 text-xs mt-1">Click "Add Points" to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60">
                {entries.map(entry => (
                  <div key={entry.id} className="px-5 py-3.5 flex items-start gap-3 group hover:bg-gray-800/30 transition-colors">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: ACTIVITY_COLORS[entry.activityType] || '#6366f1' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-white">{entry.activityType}</span>
                        <span className="text-[10px] text-gray-500">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      {entry.comment && <p className="text-xs text-gray-400 mt-0.5">{entry.comment}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {entry.hours}h</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-indigo-400">+{entry.points}</span>
                      <button
                        onClick={() => setEditEntryModal(entry)}
                        className="p-1 rounded text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Edit entry"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteEntryId(entry.id)}
                        className="p-1 rounded text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
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
            <p className="text-xs text-gray-500">{meetingEntries.length} {meetingEntries.length === 1 ? 'entry' : 'entries'}</p>
            <button
              onClick={() => setNewMeetingModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
            >
              <Plus size={15} /> New Meeting Entry
            </button>
          </div>

          {meetingEntries.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-14 text-center">
              <NotebookPen size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No meeting notes yet.</p>
              <p className="text-gray-600 text-xs mt-1">Click "New Meeting Entry" to log your first meeting.</p>
            </div>
          ) : (
            Object.entries(meetingsByDate).map(([date, dayEntries]) => (
              <div key={date}>
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={13} className="text-gray-500" />
                  <span className="text-xs font-semibold text-gray-400">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-gray-600">({dayEntries.length})</span>
                </div>

                <div className="space-y-2">
                  {dayEntries.map(entry => (
                    <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="text-[10px] text-gray-500">
                          Logged {new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {entry.isTriaged ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                            <CheckCircle2 size={10} /> Triaged
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 flex-shrink-0">
                            Untriaged
                          </span>
                        )}
                      </div>
                      {/* Notes preview — truncated at 3 lines, full text visible on expand */}
                      <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-3 leading-relaxed">
                        {entry.rawNotes}
                      </p>
                      {entry.rawNotes.split('\n').length > 3 && (
                        <details className="mt-1">
                          <summary className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer list-none">Show full notes</summary>
                          <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{entry.rawNotes}</p>
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
            <p className="text-xs text-gray-500">{projectTasks.length} {projectTasks.length === 1 ? 'task' : 'tasks'}</p>
            <button
              onClick={() => setAddTaskModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-600/30"
            >
              <Plus size={15} /> Add Task
            </button>
          </div>

          {projectTasks.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-14 text-center">
              <p className="text-gray-500 text-sm">No tasks yet.</p>
              <p className="text-gray-600 text-xs mt-1">Click "Add Task" to create your first task for this project.</p>
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
                      <span className="text-xs text-gray-600">({group.length})</span>
                    </div>
                    <div className="space-y-2">
                      {group.map(task => {
                        const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
                        return (
                          <div key={task.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white leading-snug">{task.description}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
                                    {TASK_TYPE_LABELS[task.taskType]}
                                  </span>
                                  {task.assigneeOrTeam && (
                                    <span className="text-[10px] text-gray-500">→ {TASK_RECIPIENTS.find(r => r.value === task.assigneeOrTeam)?.label || task.assigneeOrTeam}</span>
                                  )}
                                </div>
                              </div>
                              {/* Inline status dropdown */}
                              <select
                                value={task.status}
                                onChange={e => updateTask(task.id, { status: e.target.value })}
                                className={`text-[10px] font-semibold rounded-lg px-2 py-1 border cursor-pointer focus:outline-none flex-shrink-0 ${statusColors.bg} ${statusColors.text} ${statusColors.border} bg-transparent`}
                              >
                                {TASK_STATUSES.map(s => (
                                  <option key={s} value={s} className="bg-gray-800 text-white">
                                    {TASK_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
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

      {/* Timeline tab */}
      {activeTab === 'timeline' && (() => {
        const MILESTONE_STATUS_STYLES = {
          upcoming: { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20', dot: 'bg-amber-400', label: 'Upcoming' },
          achieved: { badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400', label: 'Achieved' },
          missed:   { badge: 'bg-red-500/15 text-red-400 border-red-500/20',         dot: 'bg-red-400',     label: 'Missed'   },
        };
        return (
          <div className="space-y-5">

            {/* ── Milestones ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flag size={14} className="text-indigo-400" />
                  <h2 className="text-sm font-semibold text-white">Milestones</h2>
                  {projectMilestones.length > 0 && (
                    <span className="text-xs text-gray-500">({projectMilestones.length})</span>
                  )}
                </div>
                <button
                  onClick={openAddMilestoneForm}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
                >
                  <Plus size={13} /> Add Milestone
                </button>
              </div>

              {/* Inline add / edit form */}
              {showMilestoneForm && (
                <div className="px-5 py-4 border-b border-gray-800 bg-gray-800/40 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <input
                        type="text"
                        value={milestoneForm.title}
                        onChange={e => setMilestoneForm(p => ({ ...p, title: e.target.value }))}
                        placeholder="Milestone title *"
                        autoFocus
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
                      />
                      {milestoneFormErrors.title && <p className="mt-1 text-[10px] text-red-400">{milestoneFormErrors.title}</p>}
                    </div>
                    <div>
                      <input
                        type="date"
                        value={milestoneForm.targetDate}
                        onChange={e => setMilestoneForm(p => ({ ...p, targetDate: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
                      />
                      {milestoneFormErrors.targetDate && <p className="mt-1 text-[10px] text-red-400">{milestoneFormErrors.targetDate}</p>}
                    </div>
                    <div>
                      <select
                        value={milestoneForm.status}
                        onChange={e => setMilestoneForm(p => ({ ...p, status: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
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
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                    >
                      {editMilestoneId ? 'Save Changes' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowMilestoneForm(false); setEditMilestoneId(null); setMilestoneFormErrors({}); }}
                      className="px-4 py-1.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Milestone list */}
              {projectMilestones.length === 0 && !showMilestoneForm ? (
                <div className="px-5 py-10 text-center">
                  <Flag size={24} className="text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No milestones yet.</p>
                  <p className="text-gray-600 text-xs mt-1">Add one to track key dates for this project.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {projectMilestones.map(m => {
                    const style = MILESTONE_STATUS_STYLES[m.status] || MILESTONE_STATUS_STYLES.upcoming;
                    const formattedDate = m.targetDate
                      ? new Date(m.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—';
                    return (
                      <div key={m.id} className="px-5 py-3.5 flex items-center gap-4 group hover:bg-gray-800/30 transition-colors">
                        {/* Status dot */}
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        {/* Title + date */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium leading-snug">{m.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Calendar size={10} /> {formattedDate}
                          </p>
                        </div>
                        {/* Status badge */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${style.badge}`}>
                          {style.label}
                        </span>
                        {/* Actions — visible on hover */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => openEditMilestoneForm(m)}
                            className="p-1 rounded text-gray-600 hover:text-indigo-400 transition-colors"
                            title="Edit milestone"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteMilestoneId(m.id)}
                            className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors"
                            title="Delete milestone"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Task Log ── */}
            {(() => {
              // Dot colors per task status (TASK_STATUS_COLORS has no .dot property)
              const TASK_DOT = {
                'open':        'bg-gray-500',
                'in-progress': 'bg-indigo-400',
                'done':        'bg-emerald-400',
                'blocked':     'bg-red-400',
                'archived':    'bg-gray-600',
              };
              return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitCommitHorizontal size={14} className="text-gray-400" />
                  <h2 className="text-sm font-semibold text-white">Task Log</h2>
                </div>
                <span className="text-xs text-gray-500">{projectTasks.length} {projectTasks.length === 1 ? 'task' : 'tasks'}</span>
              </div>
              {projectTasks.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <GitCommitHorizontal size={24} className="text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No tasks logged yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {projectTasks.map(task => {
                    const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
                    const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
                    return (
                      <div key={task.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-800/30 transition-colors">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TASK_DOT[task.status] || 'bg-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-snug">{task.description}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
                              {TASK_TYPE_LABELS[task.taskType]}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                              {TASK_STATUS_LABELS[task.status]}
                            </span>
                            <span className="text-[10px] text-gray-600">{formatDate(task.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
              );
            })()}

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
          : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
      }`}
      style={{ borderLeftColor: customer?.color || '#6366f1', borderLeftWidth: 3 }}
    >
      {/* Pin button — always visible, top-right */}
      <button
        onClick={e => { e.stopPropagation(); onPin(project.id, !isPinned); }}
        title={isPinned ? 'Unpin project' : 'Pin to top'}
        className={`absolute top-3 right-3 p-1 rounded-lg transition-colors z-10 ${
          isPinned
            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/40'
            : 'text-gray-600 hover:text-amber-400 hover:bg-gray-800'
        }`}
      >
        {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>

      <div className="flex items-start justify-between gap-2 mb-3 pr-6">
        <p className="font-semibold text-white text-sm leading-tight">{project.name}</p>
        <ChevronRight size={15} className="text-gray-600 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" />
      </div>
      {okr && <p className="text-[11px] text-gray-500 mb-3 line-clamp-1">{okr.title}</p>}
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 text-[11px] font-medium ${STATUS_COLORS[project.status]}`}>
          <StatusIcon size={11} /> {project.status}
        </span>
        <span className="text-xs text-gray-500">Created {formatDate(project.createdAt)}</span>
      </div>
    </div>
  );
}

export default function Projects({ initialProjectId, onProjectSelect }) {
  const { projects, customers, okrs, addProject, updateProject, deleteProject } = useAppStore();
  const [selectedId, setSelectedId] = useState(initialProjectId || null);
  const [createModal, setCreateModal] = useState(false);
  const [bulkProjectsModal, setBulkProjectsModal] = useState(false);
  const [groupBy, setGroupBy] = useState('customer'); // 'customer' | 'okr'
  const [statusFilter, setStatusFilter] = useState('All');

  const selectedProject = projects.find(p => p.id === selectedId);

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} onBack={() => setSelectedId(null)} />;
  }

  const filtered = statusFilter === 'All' ? projects : projects.filter(p => p.status === statusFilter);

  // Pinned projects — shown in the Priority section above all groups
  const pinnedProjects = filtered.filter(p => !!p.pinned);
  // Unpinned only go into the group sections
  const unpinned = filtered.filter(p => !p.pinned);

  // Group projects (unpinned only — pinned ones live in the Priority section)
  const groups = {};
  if (groupBy === 'customer') {
    customers.forEach(c => { groups[c.id] = { label: c.name, color: c.color, items: [] }; });
    groups['_none'] = { label: 'No Customer', color: '#6b7280', items: [] };
    unpinned.forEach(p => {
      const key = customers.find(c => c.id === p.customerId) ? p.customerId : '_none';
      if (groups[key]) groups[key].items.push(p);
    });
  } else {
    okrs.forEach(o => { groups[o.id] = { label: o.title, color: '#6366f1', items: [] }; });
    groups['_none'] = { label: 'No OKR', color: '#6b7280', items: [] };
    unpinned.forEach(p => {
      const key = okrs.find(o => o.id === p.okrId) ? p.okrId : '_none';
      if (groups[key]) groups[key].items.push(p);
    });
  }

  const handlePin = (id, value) => updateProject(id, { pinned: value });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkProjectsModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium text-gray-300 hover:text-white transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div aria-label="Group by" className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {['customer', 'okr'].map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${groupBy === g ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              By {g === 'okr' ? 'OKR' : 'Customer'}
            </button>
          ))}
        </div>
        {/* Divider between filter groups */}
        <div className="w-px h-6 bg-gray-700 flex-shrink-0" />
        <div aria-label="Filter by status" className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {['All', ...PROJECT_STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Priority Projects — pinned items float above all groups */}
      {pinnedProjects.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Pin size={13} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Priority</span>
            <span className="text-xs text-gray-600">({pinnedProjects.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedProjects.map(project => (
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
        </div>
      )}

      {/* Groups */}
      {Object.entries(groups).filter(([, g]) => g.items.length > 0).length === 0 && pinnedProjects.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
          <p className="text-gray-500 text-sm">No projects found.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Create your first project →</button>
        </div>
      ) : (
        Object.entries(groups)
          .filter(([, g]) => g.items.length > 0)
          .map(([key, group]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="text-sm font-semibold text-gray-300 truncate max-w-xs">{group.label}</span>
                <span className="text-xs text-gray-600">({group.items.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.items.map(project => (
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
            </div>
          ))
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
