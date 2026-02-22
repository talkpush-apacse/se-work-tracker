import { useState } from 'react';
import { Plus, Pencil, Trash2, Target, ChevronDown, ChevronUp, ListPlus, X, ToggleLeft, Hash } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import BulkAddOKRsModal from '../components/BulkAddOKRsModal';
import { formatDate } from '../utils/dateHelpers';

// ─── Quarter options ──────────────────────────────────────────────────────────
function generateQuarters() {
  const quarters = [];
  const now = new Date();
  const startYear = now.getFullYear();
  const startQ = Math.ceil((now.getMonth() + 1) / 3);
  // Generate current Q + 3 future + 3 past quarters
  for (let offset = -3; offset <= 4; offset++) {
    let q = startQ + offset;
    let y = startYear;
    while (q < 1) { q += 4; y--; }
    while (q > 4) { q -= 4; y++; }
    quarters.push(`Q${q} ${y}`);
  }
  return quarters;
}
const QUARTERS = generateQuarters();
const CURRENT_QUARTER = QUARTERS[3]; // index 3 = "current" (offset 0)

// ─── KR uid helper ────────────────────────────────────────────────────────────
function krUid() {
  return 'kr-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── OKR Form (create / edit) ─────────────────────────────────────────────────
function OkrForm({ initial = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    quarter: initial.quarter || CURRENT_QUARTER,
    keyResults: initial.keyResults || [],
  });
  const [errors, setErrors] = useState({});

  const addKr = () => {
    setForm(p => ({
      ...p,
      keyResults: [...p.keyResults, { id: krUid(), text: '', type: 'boolean', value: null }],
    }));
  };

  const removeKr = (id) => {
    setForm(p => ({ ...p, keyResults: p.keyResults.filter(kr => kr.id !== id) }));
  };

  const updateKr = (id, patch) => {
    setForm(p => ({
      ...p,
      keyResults: p.keyResults.map(kr => kr.id === id ? { ...kr, ...patch } : kr),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErrors({ title: 'Required' }); return; }
    onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      quarter: form.quarter,
      keyResults: form.keyResults.filter(kr => kr.text.trim()).map(kr => ({
        ...kr,
        text: kr.text.trim(),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quarter + Title */}
      <div className="grid grid-cols-[160px_1fr] gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Quarter</label>
          <select
            value={form.quarter}
            onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {QUARTERS.map(q => (
              <option key={q} value={q}>{q}{q === CURRENT_QUARTER ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>
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
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Notes <span className="text-gray-600">(optional)</span></label>
        <textarea
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Additional context..."
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
        />
      </div>

      {/* Key Results */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-400">Key Results</label>
          <button
            type="button"
            onClick={addKr}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Plus size={12} /> Add KR
          </button>
        </div>

        {form.keyResults.length === 0 ? (
          <p className="text-[11px] text-gray-600 italic py-1">No key results yet — click "Add KR" to add one.</p>
        ) : (
          <div className="space-y-2">
            {form.keyResults.map((kr, i) => (
              <div key={kr.id} className="flex items-start gap-2">
                {/* KR number */}
                <span className="text-[10px] font-bold text-gray-600 pt-2.5 w-6 flex-shrink-0">KR{i + 1}</span>

                {/* KR text */}
                <input
                  value={kr.text}
                  onChange={e => updateKr(kr.id, { text: e.target.value })}
                  placeholder="Describe this key result..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
                />

                {/* Type toggle: boolean ↔ numeric */}
                <button
                  type="button"
                  onClick={() => updateKr(kr.id, { type: kr.type === 'boolean' ? 'numeric' : 'boolean', value: null })}
                  title={kr.type === 'boolean' ? 'Switch to 0–100 numeric' : 'Switch to Yes/No'}
                  className={`flex items-center gap-1 px-2 py-2 rounded-xl border text-[10px] font-semibold transition-colors flex-shrink-0 ${
                    kr.type === 'boolean'
                      ? 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      : 'bg-indigo-600/15 border-indigo-500/30 text-indigo-400'
                  }`}
                >
                  {kr.type === 'boolean' ? <ToggleLeft size={13} /> : <Hash size={13} />}
                </button>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeKr(kr.id)}
                  className="p-2 rounded-xl text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {form.keyResults.length > 0 && (
          <p className="mt-1.5 text-[10px] text-gray-600">
            <ToggleLeft size={10} className="inline mr-0.5" /> = Yes/No &nbsp;·&nbsp;
            <Hash size={10} className="inline mr-0.5" /> = 0–100 score — click the icon to toggle
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">{initial.id ? 'Save Changes' : 'Create OKR'}</button>
      </div>
    </form>
  );
}

// ─── KR progress item (on the card) ──────────────────────────────────────────
function KrItem({ kr, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-gray-600 w-6 flex-shrink-0 font-bold">
        {/* index handled by parent */}
      </span>
      <span className="flex-1 text-xs text-gray-300 leading-snug">{kr.text}</span>
      {kr.type === 'boolean' ? (
        <input
          type="checkbox"
          checked={kr.value === true}
          onChange={e => onChange({ value: e.target.checked })}
          className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0 cursor-pointer"
        />
      ) : (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            value={kr.value ?? ''}
            onChange={e => {
              const n = e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value)));
              onChange({ value: n });
            }}
            placeholder="—"
            className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-indigo-500"
          />
          <span className="text-[10px] text-gray-600">/ 100</span>
        </div>
      )}
    </div>
  );
}

// ─── OKR completion summary ───────────────────────────────────────────────────
function KrProgress({ keyResults }) {
  if (!keyResults || keyResults.length === 0) return null;

  // Compute overall progress (average across KRs)
  const scores = keyResults.map(kr => {
    if (kr.type === 'boolean') return kr.value === true ? 100 : 0;
    return typeof kr.value === 'number' ? kr.value : 0;
  });
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${avg >= 100 ? 'bg-emerald-500' : avg >= 50 ? 'bg-indigo-500' : 'bg-gray-600'}`}
          style={{ width: `${avg}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-gray-500">{avg}%</span>
    </div>
  );
}

// ─── Main OKRs page ───────────────────────────────────────────────────────────
export default function OKRs() {
  const { okrs, projects, points, tasks, addOkr, updateOkr, deleteOkr } = useAppStore();
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  // Update a single KR's value in place
  const updateKrValue = (okrId, krId, patch) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;
    updateOkr(okrId, {
      keyResults: (okr.keyResults || []).map(kr => kr.id === krId ? { ...kr, ...patch } : kr),
    });
  };

  // Group OKRs by quarter
  const byQuarter = okrs.reduce((acc, okr) => {
    const q = okr.quarter || 'No Quarter';
    if (!acc[q]) acc[q] = [];
    acc[q].push(okr);
    return acc;
  }, {});

  // Sort quarter groups: most recent first
  const sortedQuarters = Object.keys(byQuarter).sort((a, b) => {
    // Parse "Q1 2026" → sortable number
    const parse = (s) => {
      const m = s.match(/Q(\d)\s+(\d+)/);
      return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
    };
    return parse(b) - parse(a);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">OKRs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Objectives that guide your project priorities</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium text-gray-300 hover:text-white transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> New OKR
          </button>
        </div>
      </div>

      {okrs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
          <Target size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No OKRs yet.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Create your first OKR →</button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedQuarters.map(quarter => (
            <div key={quarter}>
              {/* Quarter header */}
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-white">{quarter}</h2>
                {quarter === CURRENT_QUARTER && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                    Current
                  </span>
                )}
                <span className="text-xs text-gray-600">({byQuarter[quarter].length} objective{byQuarter[quarter].length !== 1 ? 's' : ''})</span>
              </div>

              <div className="space-y-3">
                {byQuarter[quarter].map((okr) => {
                  const linkedProjects = projects.filter(p => p.okrId === okr.id);
                  const totalPoints = linkedProjects.reduce((s, proj) => {
                    return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.points, 0);
                  }, 0);
                  const totalHours = linkedProjects.reduce((s, proj) => {
                    return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.hours, 0);
                  }, 0);
                  // Task completion points rolled up from all linked projects
                  const taskPts = linkedProjects.reduce((s, proj) =>
                    s + tasks.filter(t => t.projectId === proj.id).reduce((ss, t) => ss + (t.points || 0), 0), 0);
                  const isExpanded = expanded[okr.id];
                  const keyResults = okr.keyResults || [];

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

                            {/* KR progress bar */}
                            <KrProgress keyResults={keyResults} />

                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <span className="text-xs text-gray-500">{linkedProjects.length} project{linkedProjects.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs font-semibold text-indigo-400">{totalPoints} pts</span>
                              <span className="text-xs text-gray-500">{totalHours.toFixed(1)}h</span>
                              {taskPts > 0 && (
                                <span className="text-xs font-semibold text-teal-400">⚡{taskPts} task pts</span>
                              )}
                              {keyResults.length > 0 && (
                                <span className="text-xs text-gray-500">{keyResults.length} KR{keyResults.length !== 1 ? 's' : ''}</span>
                              )}
                              <span className="text-xs text-gray-600">Created {formatDate(okr.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => toggle(okr.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            <button onClick={() => setEditTarget(okr)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget(okr)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded panel: KRs + linked projects */}
                      {isExpanded && (
                        <div className="border-t border-gray-800">
                          {/* Key Results */}
                          {keyResults.length > 0 && (
                            <div className="px-5 py-4 space-y-3">
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Key Results</p>
                              {keyResults.map((kr, i) => (
                                <div key={kr.id} className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-gray-600 w-7 flex-shrink-0">KR{i + 1}</span>
                                  <span className="flex-1 text-xs text-gray-300 leading-snug">{kr.text}</span>
                                  {kr.type === 'boolean' ? (
                                    <input
                                      type="checkbox"
                                      checked={kr.value === true}
                                      onChange={e => updateKrValue(okr.id, kr.id, { value: e.target.checked })}
                                      className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0 cursor-pointer"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={kr.value ?? ''}
                                        onChange={e => {
                                          const n = e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value)));
                                          updateKrValue(okr.id, kr.id, { value: n });
                                        }}
                                        placeholder="—"
                                        className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-indigo-500"
                                      />
                                      <span className="text-[10px] text-gray-600">/ 100</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Linked projects */}
                          {linkedProjects.length > 0 && (
                            <div className={`px-5 py-3 space-y-2 ${keyResults.length > 0 ? 'border-t border-gray-800/60' : ''}`}>
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Linked Projects</p>
                              {linkedProjects.map(p => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-300">{p.name}</span>
                                  <span className={`font-medium ${p.status === 'Active' ? 'text-emerald-400' : p.status === 'On Hold' ? 'text-amber-400' : 'text-gray-500'}`}>{p.status}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {keyResults.length === 0 && linkedProjects.length === 0 && (
                            <div className="px-5 py-5 text-center">
                              <p className="text-xs text-gray-600 italic mb-3">No key results or linked projects yet.</p>
                              <button
                                onClick={() => updateOkr(okr.id, {
                                  keyResults: [{ id: krUid(), text: '', type: 'boolean', value: null }],
                                })}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-all"
                              >
                                <Plus size={12} /> Add Key Result
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
      {bulkModal && <BulkAddOKRsModal onClose={() => setBulkModal(false)} />}
    </div>
  );
}
