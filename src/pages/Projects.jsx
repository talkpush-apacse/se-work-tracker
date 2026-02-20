import { useState } from 'react';
import { Plus, ChevronRight, Pencil, Trash2, ArrowLeft, Clock, Zap, Calendar, CheckCircle2, PauseCircle, XCircle, LayoutGrid, List, Timer, Square, ListPlus } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AddPointsModal from '../components/AddPointsModal';
import BulkAddProjectsModal from '../components/BulkAddProjectsModal';
import BulkAddPointsModal from '../components/BulkAddPointsModal';
import { CUSTOMER_COLORS, PROJECT_STATUSES, ACTIVITY_TYPES, ACTIVITY_COLORS } from '../constants';
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
  const { points, customers, okrs, addPoint, deletePoint, updatePoint, updateProject, deleteProject } = useAppStore();
  const { isRunning, projectId: runningProjectId, startTimer, stopTimer } = useTimerContext();
  const [addModal, setAddModal] = useState(false);
  const [bulkPointsModal, setBulkPointsModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState(null);
  const [editEntryModal, setEditEntryModal] = useState(null);
  const [timerConflict, setTimerConflict] = useState(false);
  const [flashMsg, setFlashMsg] = useState(null);

  const customer = customers.find(c => c.id === project.customerId);
  const okr = okrs.find(o => o.id === project.okrId);
  const entries = points.filter(p => p.projectId === project.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const totalPoints = entries.reduce((s, e) => s + e.points, 0);
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

  const StatusIcon = STATUS_ICONS[project.status] || CheckCircle2;

  const handlePointSuccess = (entry) => {
    setFlashMsg(`+${entry.points} pts!`);
    setTimeout(() => setFlashMsg(null), 1500);
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

        <div className="grid grid-cols-3 gap-3 mt-5">
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
        </div>

        {/* Floating flash */}
        {flashMsg && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-gray-900 text-lg font-black px-6 py-3 rounded-2xl shadow-2xl point-flash">
            {flashMsg}
          </div>
        )}
      </div>

      {/* Action buttons row */}
      <div className="flex gap-3">
        {/* Timer button */}
        {isRunning && runningProjectId === project.id ? (
          <button
            onClick={stopTimer}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold transition-all border border-red-700/40 flex-shrink-0"
          >
            <Square size={14} fill="currentColor" /> Stop Timer
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
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 font-bold transition-all border border-emerald-700/40 flex-shrink-0"
          >
            <Timer size={15} /> Start Timer
          </button>
        )}

        {/* Add points FAB */}
        <button
          onClick={() => setAddModal(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50"
        >
          <Plus size={18} /> Add Points
        </button>

        {/* Bulk add points */}
        <button
          onClick={() => setBulkPointsModal(true)}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white font-medium transition-all flex-shrink-0"
          title="Bulk add point entries"
        >
          <ListPlus size={16} />
        </button>
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

  // Group projects
  const groups = {};
  if (groupBy === 'customer') {
    customers.forEach(c => { groups[c.id] = { label: c.name, color: c.color, items: [] }; });
    groups['_none'] = { label: 'No Customer', color: '#6b7280', items: [] };
    filtered.forEach(p => {
      const key = customers.find(c => c.id === p.customerId) ? p.customerId : '_none';
      if (groups[key]) groups[key].items.push(p);
    });
  } else {
    okrs.forEach(o => { groups[o.id] = { label: o.title, color: '#6366f1', items: [] }; });
    groups['_none'] = { label: 'No OKR', color: '#6b7280', items: [] };
    filtered.forEach(p => {
      const key = okrs.find(o => o.id === p.okrId) ? p.okrId : '_none';
      if (groups[key]) groups[key].items.push(p);
    });
  }

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
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
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
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
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

      {/* Groups */}
      {Object.entries(groups).filter(([, g]) => g.items.length > 0).length === 0 ? (
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
                {group.items.map(project => {
                  const customer = customers.find(c => c.id === project.customerId);
                  const okr = okrs.find(o => o.id === project.okrId);
                  const StatusIcon = STATUS_ICONS[project.status] || CheckCircle2;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className="text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-4 transition-all hover:shadow-lg group"
                      style={{ borderLeftColor: customer?.color || '#6366f1', borderLeftWidth: 3 }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
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
                    </button>
                  );
                })}
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
