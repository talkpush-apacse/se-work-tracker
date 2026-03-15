/**
 * Pulse — Daily stress check-in and 7-day trend view.
 * Tracks daily stress levels (1–5) with emoji indicators, stressor tags, and notes.
 */
import { useState, useMemo } from 'react';
import { Heart, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAppStore } from '../context/StoreContext';
import { STRESS_LEVELS, STRESSOR_TYPES, STRESSOR_LABELS } from '../constants';
import ConfirmDialog from '../components/ConfirmDialog';

const TODAY = format(new Date(), 'yyyy-MM-dd');

function StressDot({ level, size = 'md' }) {
  const sl = STRESS_LEVELS.find(s => s.level === level);
  if (!sl) return null;
  const sz = size === 'sm' ? 'text-base' : 'text-2xl';
  return <span className={sz}>{sl.emoji}</span>;
}

// ── Inline guide showing all stress levels ────────────────────────────────────
function StressGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Hide guide' : 'What do the levels mean?'}
      </button>
      {open && (
        <div className="mt-2 grid gap-1.5">
          {STRESS_LEVELS.map(sl => (
            <div key={sl.level} className="flex items-start gap-2 text-xs">
              <span className="text-base leading-none mt-px">{sl.emoji}</span>
              <div>
                <span className="font-medium text-foreground">{sl.level} — {sl.label}:</span>{' '}
                <span className="text-muted-foreground">{sl.desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Y-axis tick — shows emoji label instead of a numeral ───────────────
function EmojiYTick({ x, y, payload }) {
  const sl = STRESS_LEVELS.find(s => s.level === payload.value);
  if (!sl) return null;
  return (
    <text x={x - 2} y={y} textAnchor="end" dominantBaseline="middle" fontSize={13}>
      {sl.emoji}
    </text>
  );
}

// ── Custom tooltip for the trend chart ────────────────────────────────────────
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const sl = STRESS_LEVELS.find(s => s.level === d.level);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground">{d.dayLabel}</p>
      <p className="text-muted-foreground mt-0.5">
        {sl?.emoji} {sl?.label} ({d.level}/5)
      </p>
      {d.stressor && <p className="text-muted-foreground mt-0.5">{STRESSOR_LABELS[d.stressor]}</p>}
    </div>
  );
}

export default function Pulse() {
  const { stressLogs, upsertStressLog, deleteStressLog } = useAppStore();
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Form state
  const todayLog = stressLogs.find(l => l.logDate === TODAY);
  const [level, setLevel] = useState(todayLog?.stressLevel || null);
  const [stressor, setStressor] = useState(todayLog?.stressor || '');
  const [note, setNote] = useState(todayLog?.note || '');
  const [saved, setSaved] = useState(false);

  // Sync form if today's log changes externally
  const handleEditExisting = (log) => {
    setEditingId(log.id);
    setLevel(log.stressLevel);
    setStressor(log.stressor || '');
    setNote(log.note || '');
  };

  const handleSave = () => {
    if (!level || !stressor) return;
    const logDate = editingId
      ? stressLogs.find(l => l.id === editingId)?.logDate || TODAY
      : TODAY;
    upsertStressLog(logDate, {
      stressLevel: level,
      stressor,
      note: note.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (editingId) {
      setEditingId(null);
      // Reset form to today
      const tl = stressLogs.find(l => l.logDate === TODAY);
      setLevel(tl?.stressLevel || null);
      setStressor(tl?.stressor || '');
      setNote(tl?.note || '');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    const tl = stressLogs.find(l => l.logDate === TODAY);
    setLevel(tl?.stressLevel || null);
    setStressor(tl?.stressor || '');
    setNote(tl?.note || '');
  };

  // 7-day trend data
  const trendData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const log = stressLogs.find(l => l.logDate === dateStr);
      days.push({
        date: dateStr,
        dayLabel: format(d, 'EEE MMM d'),
        shortLabel: format(d, 'EEE'),
        level: log?.stressLevel || null,
        stressor: log?.stressor || null,
      });
    }
    return days;
  }, [stressLogs]);

  const hasAnyTrend = trendData.some(d => d.level !== null);

  // Average stress this week
  const weekAvg = useMemo(() => {
    const logged = trendData.filter(d => d.level !== null);
    if (!logged.length) return null;
    return (logged.reduce((s, d) => s + d.level, 0) / logged.length).toFixed(1);
  }, [trendData]);

  // All logs sorted newest first (filter out any corrupted entries missing a valid logDate string)
  const sortedLogs = useMemo(
    () => [...stressLogs]
      .filter(l => typeof l.logDate === 'string')
      .sort((a, b) => b.logDate.localeCompare(a.logDate)),
    [stressLogs]
  );

  // Gradient colors based on stress level
  const gradientId = 'stress-gradient';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Heart size={20} className="text-rose-400" /> Pulse
        </h1>
      </div>

      {/* ── Today's Check-in ──────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-foreground mb-3">
          {editingId ? 'Edit Check-in' : todayLog ? 'Update Today\'s Check-in' : 'How are you feeling today?'}
        </h2>

        {/* Emoji selector */}
        <div className="flex gap-2 mb-3">
          {STRESS_LEVELS.map(sl => (
            <button
              key={sl.level}
              onClick={() => setLevel(sl.level)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all ${
                level === sl.level
                  ? 'border-brand-sage-darker bg-brand-sage-lightest ring-1 ring-brand-sage-lighter scale-105'
                  : 'border-border bg-secondary/30 hover:bg-secondary/60'
              }`}
            >
              <span className="text-2xl">{sl.emoji}</span>
              <span className="text-[10px] text-muted-foreground font-medium">{sl.label}</span>
            </button>
          ))}
        </div>

        <StressGuide />

        {/* Stressor dropdown */}
        <div className="mt-4 mb-3">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">What's driving it?</label>
          <select
            value={stressor}
            onChange={e => setStressor(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          >
            <option value="">Select a stressor...</option>
            {STRESSOR_TYPES.map(st => (
              <option key={st} value={st}>{STRESSOR_LABELS[st]}</option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quick note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything you want to remember about today..."
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!level || !stressor}
            className="px-4 py-2 rounded-xl bg-brand-sage-darker hover:bg-brand-sage-darker/80 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-foreground transition-colors"
          >
            {saved ? 'Saved!' : editingId ? 'Update' : todayLog ? 'Update' : 'Save'}
          </button>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── 7-Day Trend Chart ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-foreground leading-tight">7-Day Trend</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Stress level — 1 (calm) to 5 (overwhelmed)</p>
          </div>
          {weekAvg && (
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                {weekAvg}/5 {STRESS_LEVELS.find(s => s.level === Math.round(Number(weekAvg)))?.emoji}
              </p>
              <p className="text-[10px] text-muted-foreground">7-day avg</p>
            </div>
          )}
        </div>
        {!hasAnyTrend ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No check-ins yet this week. Log today's pulse above to start tracking.
          </div>
        ) : trendData.filter(d => d.level !== null).length < 2 ? (
          <div className="flex items-center gap-4 py-5 px-2">
            <span className="text-3xl leading-none">
              {STRESS_LEVELS.find(s => s.level === trendData.find(d => d.level !== null)?.level)?.emoji}
            </span>
            <div>
              <p className="text-sm text-foreground font-medium">
                {trendData.find(d => d.level !== null)?.dayLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Check in for 2+ days to see your trend chart.</p>
            </div>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData.filter(d => d.level !== null)} margin={{ top: 10, right: 10, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={<EmojiYTick />}
                  width={28}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={3} stroke="var(--color-border)" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="level"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={({ cx, cy, payload }) => {
                    const sl = STRESS_LEVELS.find(s => s.level === payload.level);
                    if (!sl) return null;
                    return (
                      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={16}>
                        {sl.emoji}
                      </text>
                    );
                  }}
                  activeDot={{ r: 5, fill: '#f43f5e', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Log Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Check-in Log</h2>
        </div>
        {sortedLogs.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground text-sm">
            No check-ins recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedLogs.map(log => {
              const sl = STRESS_LEVELS.find(s => s.level === log.stressLevel);
              const dateObj = parseISO(log.logDate);
              const isToday = log.logDate === TODAY;
              return (
                <div key={log.id} className="px-5 py-3 flex items-center gap-4 hover:bg-secondary/30 transition-colors">
                  {/* Date */}
                  <div className="w-24 flex-shrink-0">
                    <p className="text-sm font-medium text-foreground">
                      {isToday ? 'Today' : format(dateObj, 'EEE MMM d')}
                    </p>
                    {!isToday && (
                      <p className="text-[10px] text-muted-foreground">{format(dateObj, 'yyyy')}</p>
                    )}
                  </div>

                  {/* Emoji + level */}
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <span className="text-xl">{sl?.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{sl?.label}</p>
                      <p className="text-[10px] text-muted-foreground">{log.stressLevel}/5</p>
                    </div>
                  </div>

                  {/* Stressor badge */}
                  <div className="flex-shrink-0">
                    {log.stressor && (
                      <span className="inline-flex items-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-semibold px-2 py-0.5">
                        {STRESSOR_LABELS[log.stressor] || log.stressor}
                      </span>
                    )}
                  </div>

                  {/* Note */}
                  <p className="flex-1 text-sm text-muted-foreground truncate min-w-0">
                    {log.note || '—'}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEditExisting(log)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(log)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete"
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

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Check-in"
          message={`Delete the check-in for ${format(parseISO(confirmDelete.logDate), 'EEE MMM d, yyyy')}?`}
          danger
          onConfirm={() => { deleteStressLog(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
