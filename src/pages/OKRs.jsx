import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Target, ChevronDown, ChevronUp, ListPlus, X, ToggleLeft, Hash, Brain } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import BulkAddOKRsModal from '../components/BulkAddOKRsModal';
import { formatDate } from '../utils/dateHelpers';
import {
  TASK_STATUS_LABELS, TASK_STATUS_COLORS,
} from '../constants';

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
const ALL_QUARTERS = 'all';

function quarterSortValue(quarter) {
  const match = quarter.match(/Q([1-4])\s+(\d{4})/);
  return match ? Number(match[2]) * 10 + Number(match[1]) : Number.NEGATIVE_INFINITY;
}

function sortQuartersDesc(quarters) {
  return [...quarters].sort((a, b) => quarterSortValue(b) - quarterSortValue(a));
}

// ─── KR uid helper ────────────────────────────────────────────────────────────
function krUid() {
  return 'kr-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── KR status ────────────────────────────────────────────────────────────────
// Stays in sync with the `status` field written by the MCP tools (add_key_result,
// update_key_result). Defaulted to 'not_started' for any KR that pre-dates the field.
const KR_STATUSES = [
  { value: 'not_started', label: 'Not started', chip: 'bg-muted text-muted-foreground border-border' },
  { value: 'in_progress', label: 'In progress', chip: 'bg-brand-lavender/15 text-brand-lavender border-indigo-500/30' },
  { value: 'done',        label: 'Done',        chip: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  { value: 'at_risk',     label: 'At risk',     chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
];
const KR_STATUS_MAP = Object.fromEntries(KR_STATUSES.map(s => [s.value, s]));
function krStatusOf(kr) { return KR_STATUS_MAP[kr?.status] ?? KR_STATUSES[0]; }

// ─── OKR Form (create / edit) ─────────────────────────────────────────────────
function OkrForm({ initial = {}, defaultQuarter = CURRENT_QUARTER, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    quarter: initial.quarter || defaultQuarter,
    keyResults: initial.keyResults || [],
    targetPoints: initial.targetPoints ?? null,
  });
  const [errors, setErrors] = useState({});

  const addKr = () => {
    setForm(p => ({
      ...p,
      keyResults: [
        ...p.keyResults,
        {
          id:          krUid(),
          text:        '',
          type:        'boolean',
          value:       null,
          accountName: null,
          status:      'not_started',
          sortOrder:   p.keyResults.length + 1,
        },
      ],
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
      targetPoints: form.targetPoints,
      keyResults: form.keyResults.filter(kr => kr.text.trim()).map(kr => ({
        ...kr,
        text: kr.text.trim(),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quarter + Title */}
      <div className="grid grid-cols-[160px_1fr_120px] gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Quarter</label>
          <select
            value={form.quarter}
            onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {QUARTERS.map(q => (
              <option key={q} value={q}>{q}{q === CURRENT_QUARTER ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">OKR Title *</label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Improve client onboarding speed by 30%"
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
          {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Target Pts</label>
          <input
            type="number"
            min={0}
            value={form.targetPoints ?? ''}
            onChange={e => setForm(p => ({
              ...p,
              targetPoints: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
            }))}
            placeholder="e.g. 50"
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes <span className="text-muted-foreground/70">(optional)</span></label>
        <textarea
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Additional context..."
          rows={2}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
        />
      </div>

      {/* Key Results */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">Key Results</label>
          <button
            type="button"
            onClick={addKr}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
          >
            <Plus size={12} /> Add KR
          </button>
        </div>

        {form.keyResults.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70 italic py-1">No key results yet — click "Add KR" to add one.</p>
        ) : (
          <div className="space-y-2">
            {form.keyResults.map((kr, i) => (
              <div key={kr.id} className="space-y-1.5 border border-border/60 rounded-xl p-2.5 bg-secondary/40">
                <div className="flex items-start gap-2">
                  {/* KR number */}
                  <span className="text-[10px] font-bold text-muted-foreground/70 pt-2.5 w-6 flex-shrink-0">KR{i + 1}</span>

                  {/* KR text */}
                  <input
                    value={kr.text}
                    onChange={e => updateKr(kr.id, { text: e.target.value })}
                    placeholder="Describe this key result..."
                    className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                  />

                  {/* Type toggle: boolean ↔ numeric */}
                  <button
                    type="button"
                    onClick={() => updateKr(kr.id, { type: kr.type === 'boolean' ? 'numeric' : 'boolean', value: null })}
                    title={kr.type === 'boolean' ? 'Switch to 0–100 numeric' : 'Switch to Yes/No'}
                    className={`flex items-center gap-1 px-2 py-2 rounded-xl border text-[10px] font-semibold transition-colors flex-shrink-0 ${
                      kr.type === 'boolean'
                        ? 'bg-secondary border-border text-muted-foreground hover:border-border'
                        : 'bg-brand-lavender/15 border-indigo-500/30 text-brand-lavender'
                    }`}
                  >
                    {kr.type === 'boolean' ? <ToggleLeft size={13} /> : <Hash size={13} />}
                  </button>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeKr(kr.id)}
                    className="p-2 rounded-xl text-muted-foreground/70 hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Account name + status row */}
                <div className="flex items-center gap-2 pl-8">
                  <input
                    value={kr.accountName ?? ''}
                    onChange={e => updateKr(kr.id, { accountName: e.target.value ? e.target.value : null })}
                    placeholder="Account (optional)"
                    className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                  />
                  <select
                    value={kr.status ?? 'not_started'}
                    onChange={e => updateKr(kr.id, { status: e.target.value })}
                    className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                  >
                    {KR_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {form.keyResults.length > 0 && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            <ToggleLeft size={10} className="inline mr-0.5" /> = Yes/No &nbsp;·&nbsp;
            <Hash size={10} className="inline mr-0.5" /> = 0–100 score — click the icon to toggle
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-card-hover text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-colors">{initial.id ? 'Save Changes' : 'Create OKR'}</button>
      </div>
    </form>
  );
}

// ─── KR progress item (on the card) ──────────────────────────────────────────
function KrItem({ kr, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground/70 w-6 flex-shrink-0 font-bold">
        {/* index handled by parent */}
      </span>
      <span className="flex-1 text-xs text-foreground/80 leading-snug">{kr.text}</span>
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
            className="w-12 bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground text-center focus:outline-none focus:border-ring"
          />
          <span className="text-[10px] text-muted-foreground/70">/ 100</span>
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
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${avg >= 100 ? 'bg-emerald-500' : avg >= 50 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
          style={{ width: `${avg}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-semibold text-muted-foreground">{avg}%</span>
    </div>
  );
}

// ─── Points-based progress bar ────────────────────────────────────────────────
function PointsProgress({ totalPoints, targetPoints, onSetTarget, pomoOnly = false }) {
  if (!targetPoints) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onSetTarget(); }}
        className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <Target size={10} /> Set point target to track progress
      </button>
    );
  }

  const pct = Math.min(100, Math.round((totalPoints / targetPoints) * 100));

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pomoOnly ? 'bg-teal-500' : pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-semibold text-muted-foreground">{Number(totalPoints).toFixed(1)}/{Number(targetPoints).toFixed(1)} pts ({pct}%)</span>
    </div>
  );
}

// ─── Main OKRs page ───────────────────────────────────────────────────────────
export default function OKRs() {
  const { okrs, points, tasks, customers, timeLogs, addOkr, updateOkr, deleteOkr } = useAppStore();
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [quarterFilter, setQuarterFilter] = useState(ALL_QUARTERS);
  const [pomoFilter, setPomoFilter]       = useState('all'); // 'all' | 'pomos'

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  // Update a single KR's value in place
  const updateKrValue = (okrId, krId, patch) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;
    updateOkr(okrId, {
      keyResults: (okr.keyResults || []).map(kr => kr.id === krId ? { ...kr, ...patch } : kr),
    });
  };

  // Build a customer lookup map for displaying customer names on tasks
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  // Group OKRs by quarter
  const byQuarter = useMemo(() => okrs.reduce((acc, okr) => {
    const q = okr.quarter || 'No Quarter';
    if (!acc[q]) acc[q] = [];
    acc[q].push(okr);
    return acc;
  }, {}), [okrs]);

  // Sort quarter groups: most recent first
  const sortedQuarters = useMemo(() => sortQuartersDesc(Object.keys(byQuarter)), [byQuarter]);

  const quarterOptions = useMemo(
    () => sortQuartersDesc(Array.from(new Set([...QUARTERS, ...sortedQuarters]))),
    [sortedQuarters],
  );
  const visibleQuarters = quarterFilter === ALL_QUARTERS
    ? sortedQuarters
    : sortedQuarters.filter(quarter => quarter === quarterFilter);
  const visibleOkrCount = visibleQuarters.reduce((sum, quarter) => sum + (byQuarter[quarter]?.length || 0), 0);
  const newOkrQuarter = quarterFilter !== ALL_QUARTERS && quarterFilter !== 'No Quarter'
    ? quarterFilter
    : CURRENT_QUARTER;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-foreground">OKRs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Objectives that guide your work priorities</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-muted border border-border text-sm font-medium text-foreground/80 hover:text-foreground transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> New OKR
          </button>
        </div>
      </div>

      {okrs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <Target size={32} className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No OKRs yet.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-brand-lavender hover:text-brand-lavender/80">Create your first OKR →</button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border rounded-2xl px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quarter Filter</p>
              <p className="text-sm text-foreground mt-0.5">
                {quarterFilter === ALL_QUARTERS
                  ? `${okrs.length} objective${okrs.length !== 1 ? 's' : ''} across ${sortedQuarters.length} quarter${sortedQuarters.length !== 1 ? 's' : ''}`
                  : `${visibleOkrCount} objective${visibleOkrCount !== 1 ? 's' : ''} in ${quarterFilter}`}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {/* Pomos-only toggle */}
              <div className="flex bg-secondary rounded-xl p-0.5 gap-0.5 self-start sm:self-auto">
                {[
                  { id: 'all',   label: 'All sessions' },
                  { id: 'pomos', label: 'Pomos only'   },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPomoFilter(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      pomoFilter === id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={quarterFilter}
                onChange={e => setQuarterFilter(e.target.value)}
                className="h-10 w-full sm:w-auto bg-secondary border border-border rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
              >
                <option value={ALL_QUARTERS}>All quarters</option>
                {quarterOptions.map(quarter => (
                  <option key={quarter} value={quarter}>
                    {quarter}{quarter === CURRENT_QUARTER ? ' (current)' : ''}{byQuarter[quarter] ? ` — ${byQuarter[quarter].length}` : ''}
                  </option>
                ))}
              </select>
              {quarterFilter !== ALL_QUARTERS && (
                <button
                  onClick={() => setQuarterFilter(ALL_QUARTERS)}
                  className="h-10 w-full sm:w-auto px-3 rounded-xl border border-border bg-card hover:bg-card-hover text-xs font-semibold text-foreground transition-colors"
                >
                  Show All
                </button>
              )}
            </div>
          </div>

          {visibleQuarters.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl py-12 text-center">
              <Target size={28} className="text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">No OKRs in {quarterFilter} yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Create one here or switch back to all quarters.</p>
              <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-brand-lavender hover:text-brand-lavender/80">Create OKR for {newOkrQuarter} →</button>
            </div>
          ) : visibleQuarters.map(quarter => (
            <div key={quarter}>
              {/* Quarter header */}
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-foreground">{quarter}</h2>
                {quarter === CURRENT_QUARTER && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-lavender/20 text-brand-lavender border border-indigo-500/20">
                    Current
                  </span>
                )}
                <span className="text-xs text-muted-foreground/70">({byQuarter[quarter].length} objective{byQuarter[quarter].length !== 1 ? 's' : ''})</span>
              </div>

              <div className="space-y-3">
                {byQuarter[quarter].map((okr) => {
                  // Direct lookups — no project indirection
                  const linkedTasks = tasks.filter(t => t.okrId === okr.id);
                  const okrPoints = points.filter(pt => pt.okrId === okr.id);
                  const totalPoints = okrPoints.reduce((s, e) => s + e.points, 0);
                  const totalHours = okrPoints.reduce((s, e) => s + e.hours, 0);
                  // Hours from timeLogs (V3 bandwidth tracking)
                  const timeLogHours = Math.round(timeLogs.filter(l => l.okrId === okr.id).reduce((s, l) => s + (l.hours || 0), 0) * 100) / 100;
                  // Task completion points
                  const taskPts = linkedTasks.reduce((s, t) => s + (t.points || 0), 0);

                  // Pomo-specific metrics (source === 'pomodoro' only)
                  const pomoLogs   = timeLogs.filter(l => l.okrId === okr.id && l.source === 'pomodoro');
                  const pomoCycles = pomoLogs.reduce((s, l) => s + (l.pomodoroCycles || 0), 0);
                  const pomoHours  = Math.round(pomoLogs.reduce((s, l) => s + (l.hours || 0), 0) * 100) / 100;
                  const pomoPoints = points.filter(pt => pt.okrId === okr.id && pt.source === 'pomodoro')
                    .reduce((s, e) => s + e.points, 0);
                  // When pomoFilter === 'pomos', PointsProgress shows only Pomo-sourced points
                  const displayPoints = pomoFilter === 'pomos' ? pomoPoints : totalPoints;

                  const isExpanded = expanded[okr.id];
                  const keyResults = okr.keyResults || [];

                  return (
                    <div key={okr.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-lavender/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Target size={16} className="text-brand-lavender" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground leading-snug">{okr.title}</p>
                            {okr.description && <p className="text-xs text-muted-foreground mt-1">{okr.description}</p>}

                            {/* KR progress bar */}
                            <KrProgress keyResults={keyResults} />

                            {/* Points-based progress bar (switches to Pomo-only when pomoFilter active) */}
                            <PointsProgress
                              totalPoints={displayPoints}
                              targetPoints={okr.targetPoints}
                              onSetTarget={() => setEditTarget(okr)}
                              pomoOnly={pomoFilter === 'pomos'}
                            />

                            {/* Pomo metrics strip — hidden when pomoCycles === 0 */}
                            {pomoCycles > 0 && (
                              <div
                                title="Cycles = completed 25-min Pomodoro intervals. Hours and points reflect only Pomo-tagged sessions, not all work on this OKR."
                                className="flex items-center gap-1.5 mt-1.5 text-[11px] text-teal-700 cursor-default select-none"
                              >
                                <Brain size={11} className="text-teal-600 flex-shrink-0" />
                                <span>{pomoCycles} cycle{pomoCycles !== 1 ? 's' : ''}</span>
                                <span className="text-muted-foreground/40">·</span>
                                <span>{pomoHours}h focus</span>
                                <span className="text-muted-foreground/40">·</span>
                                <span>~{Math.round(pomoPoints * 10) / 10} pts from Pomos</span>
                              </div>
                            )}

                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">{linkedTasks.length} task{linkedTasks.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs font-mono font-semibold text-brand-lavender">{Number(totalPoints).toFixed(1)} pts</span>
                              <span className="text-xs font-mono text-muted-foreground">{totalHours.toFixed(1)}h</span>
                              {timeLogHours > 0 && (
                                <span className="text-xs font-semibold text-teal-700">{timeLogHours}h invested</span>
                              )}
                              {taskPts > 0 && (
                                <span className="text-xs font-semibold text-teal-700">⚡{Number(taskPts).toFixed(1)} task pts</span>
                              )}
                              {keyResults.length > 0 && (
                                <span className="text-xs text-muted-foreground">{keyResults.length} KR{keyResults.length !== 1 ? 's' : ''}</span>
                              )}
                              <span className="text-xs text-muted-foreground/70">Created {formatDate(okr.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => toggle(okr.id)} aria-label={isExpanded ? 'Collapse OKR details' : 'Expand OKR details'} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            <button onClick={() => setEditTarget(okr)} aria-label={`Edit OKR: ${okr.title}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget(okr)} aria-label={`Delete OKR: ${okr.title}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded panel: KRs + linked tasks */}
                      {isExpanded && (
                        <div className="border-t border-border">
                          {/* Key Results */}
                          {keyResults.length > 0 && (
                            <div className="px-5 py-4 space-y-3">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Key Results</p>
                              {keyResults.map((kr, i) => {
                                const krStatus = krStatusOf(kr);
                                return (
                                  <div key={kr.id} className="flex items-start gap-3">
                                    <span className="text-[10px] font-bold text-muted-foreground/70 w-7 flex-shrink-0 pt-0.5">KR{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-foreground/80 leading-snug">{kr.text}</p>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <select
                                          value={kr.status ?? 'not_started'}
                                          onChange={e => updateKrValue(okr.id, kr.id, { status: e.target.value })}
                                          title="Key result status"
                                          className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring/40 ${krStatus.chip}`}
                                        >
                                          {KR_STATUSES.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                          ))}
                                        </select>
                                        {kr.accountName && (
                                          <span className="text-[10px] text-muted-foreground bg-card border border-border/70 rounded-full px-2 py-0.5 truncate max-w-[200px]">
                                            {kr.accountName}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {kr.type === 'boolean' ? (
                                      <input
                                        type="checkbox"
                                        checked={kr.value === true}
                                        onChange={e => updateKrValue(okr.id, kr.id, { value: e.target.checked })}
                                        className="w-4 h-4 mt-0.5 rounded accent-indigo-500 flex-shrink-0 cursor-pointer"
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
                                          className="w-12 bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground text-center focus:outline-none focus:border-ring"
                                        />
                                        <span className="text-[10px] text-muted-foreground/70">/ 100</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Linked tasks */}
                          {linkedTasks.length > 0 && (
                            <div className={`px-5 py-3 space-y-2 ${keyResults.length > 0 ? 'border-t border-border/60' : ''}`}>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Tasks</p>
                              {linkedTasks.map(t => {
                                const cust = customerMap.get(t.customerId);
                                return (
                                  <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                                    <span className="text-foreground/80 truncate flex-1">{t.description}</span>
                                    {cust && (
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                                        style={{
                                          backgroundColor: (cust.color || '#2BAF54') + '22',
                                          color: cust.color || '#2BAF54',
                                          border: `1px solid ${cust.color || '#2BAF54'}40`,
                                        }}
                                      >
                                        {cust.name}
                                      </span>
                                    )}
                                    <span
                                      className="font-medium flex-shrink-0"
                                      style={{ color: TASK_STATUS_COLORS[t.status] || undefined }}
                                    >
                                      {TASK_STATUS_LABELS[t.status] || t.status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {keyResults.length === 0 && linkedTasks.length === 0 && (
                            <div className="px-5 py-5 text-center">
                              <p className="text-xs text-muted-foreground/70 italic mb-3">No key results or linked tasks yet.</p>
                              <button
                                onClick={() => updateOkr(okr.id, {
                                  keyResults: [{ id: krUid(), text: '', type: 'boolean', value: null }],
                                })}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-lavender hover:text-brand-lavender/80 border border-indigo-500/30 hover:border-indigo-500/60 bg-brand-lavender/10 px-3 py-1.5 rounded-lg transition-all"
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
          <OkrForm defaultQuarter={newOkrQuarter} onSubmit={(data) => { addOkr(data); setCreateModal(false); }} onCancel={() => setCreateModal(false)} />
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
          message={`Delete "${deleteTarget.title}"? Tasks linked to this OKR will lose their OKR reference.`}
          onConfirm={() => { deleteOkr(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkModal && <BulkAddOKRsModal initialQuarter={newOkrQuarter} onClose={() => setBulkModal(false)} />}
    </div>
  );
}
