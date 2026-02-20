import { useState } from 'react';
import { Plus, Pencil, Trash2, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../utils/dateHelpers';

function OkrForm({ initial = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({ title: initial.title || '', description: initial.description || '' });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErrors({ title: 'Required' }); return; }
    onSubmit({ title: form.title.trim(), description: form.description.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">OKR Title *</label>
        <input
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="e.g. Improve client onboarding speed by 30%"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        />
        {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Description <span className="text-gray-600">(optional)</span></label>
        <textarea
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Additional context or key results..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">{initial.id ? 'Save Changes' : 'Create OKR'}</button>
      </div>
    </form>
  );
}

export default function OKRs() {
  const { okrs, projects, points, addOkr, updateOkr, deleteOkr } = useAppStore();
  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">OKRs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Objectives that guide your project priorities</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/30"
        >
          <Plus size={16} /> New OKR
        </button>
      </div>

      {okrs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
          <Target size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No OKRs yet.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Create your first OKR →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {okrs.map((okr) => {
            const linkedProjects = projects.filter(p => p.okrId === okr.id);
            const totalPoints = linkedProjects.reduce((s, proj) => {
              return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.points, 0);
            }, 0);
            const totalHours = linkedProjects.reduce((s, proj) => {
              return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.hours, 0);
            }, 0);
            const isExpanded = expanded[okr.id];

            return (
              <div key={okr.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Target size={16} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white leading-snug">{okr.title}</p>
                      {okr.description && <p className="text-xs text-gray-500 mt-1">{okr.description}</p>}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-500">{linkedProjects.length} project{linkedProjects.length !== 1 ? 's' : ''}</span>
                        <span className="text-xs font-semibold text-indigo-400">{totalPoints} pts</span>
                        <span className="text-xs text-gray-500">{totalHours.toFixed(1)}h</span>
                        <span className="text-xs text-gray-600">Created {formatDate(okr.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {linkedProjects.length > 0 && (
                        <button onClick={() => toggle(okr.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      )}
                      <button onClick={() => setEditTarget(okr)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteTarget(okr)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
                {isExpanded && linkedProjects.length > 0 && (
                  <div className="border-t border-gray-800 px-5 py-3 space-y-2">
                    {linkedProjects.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">{p.name}</span>
                        <span className={`font-medium ${p.status === 'Active' ? 'text-emerald-400' : p.status === 'On Hold' ? 'text-amber-400' : 'text-gray-500'}`}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createModal && (
        <Modal title="New OKR" onClose={() => setCreateModal(false)} size="lg">
          <OkrForm onSubmit={(data) => { addOkr(data); setCreateModal(false); }} onCancel={() => setCreateModal(false)} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit OKR" onClose={() => setEditTarget(null)} size="lg">
          <OkrForm initial={editTarget} onSubmit={(data) => { updateOkr(editTarget.id, data); setEditTarget(null); }} onCancel={() => setEditTarget(null)} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete OKR"
          message={`Delete "${deleteTarget.title}"? Projects linked to this OKR will lose their OKR reference.`}
          onConfirm={() => { deleteOkr(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
