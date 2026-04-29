/**
 * PomosView — Pomodoro focus-cycle analytics view shown inside the Dashboard's
 * "Pomos" tab. Reads from timeLogs (source === 'pomodoro') only — historic
 * entries with source === null are intentionally excluded.
 *
 * Layout: period filter → stat cards → primary chart → OKR breakdown → session table.
 */
import { useState, useMemo } from 'react';
import { Timer, ChevronLeft, ChevronRight, Clock, Zap, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList,
  ReferenceLine, Tooltip,
} from 'recharts';
import {
  parseISO, format,
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
  eachDayOfInterval, isSameDay, isWithinInterval,
} from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { WORK_TYPE_COLORS } from '../constants';
import { StatCard } from './StatCard';

// Daily Pomo target (cycles/day). 8 cycles × 25 min ≈ 3.3 h of focused work.
// Raise this constant when the target changes — only one place to edit.
const POMO_DAILY_TARGET = 8;

const RANGE_OPTIONS = ['daily', 'weekly', 'monthly'];
const RANGE_LABELS  = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

const TEAL       = WORK_TYPE_COLORS.deep_work.hex; // '#14b8a6' — matches semantic color
const TEAL_TODAY = '#0d9488';                       // slightly darker for the "today" bar
const GRAY_MUTED = '#9ca3af';                       // untagged OKR bars (de-emphasised)

// ── Period helpers ─────────────────────────────────────────────────────────────

function getPeriodRange(mode, anchor) {
  if (mode === 'daily')   return { start: startOfDay(anchor),  end: endOfDay(anchor)  };
  if (mode === 'weekly')  return { start: startOfWeek(anchor, { weekStartsOn: 0 }), end: endOfWeek(anchor, { weekStartsOn: 0 }) };
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

function stepAnchor(mode, anchor, dir) {
  const d = dir === 'prev' ? -1 : 1;
  if (mode === 'daily')   return addDays(anchor, d);
  if (mode === 'weekly')  return addWeeks(anchor, d);
  return addMonths(anchor, d);
}

function formatPeriodLabel(mode, start, end) {
  if (mode === 'daily') return format(start, 'MMM d, yyyy');
  if (mode === 'weekly') {
    return start.getMonth() === end.getMonth()
      ? `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
      : `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return format(start, 'MMMM yyyy');
}

function isCurrentPeriod(mode, anchor) {
  const today = new Date();
  if (mode === 'daily')  return isSameDay(anchor, today);
  if (mode === 'weekly') return isSameDay(startOfWeek(anchor, { weekStartsOn: 0 }), startOfWeek(today, { weekStartsOn: 0 }));
  return anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth();
}

function filterByPeriod(logs, start, end) {
  return logs.filter(log => {
    if (!log.loggedAt) return false;
    try { return isWithinInterval(parseISO(log.loggedAt), { start: startOfDay(start), end: endOfDay(end) }); }
    catch { return false; }
  });
}

// ── Custom bar tooltip ─────────────────────────────────────────────────────────

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground">{d.label}</p>
      <p className="text-muted-foreground mt-0.5">{d.cycles} cycle{d.cycles !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PomosView() {
  const { timeLogs, okrs, customers } = useAppStore();

  const [rangeMode, setRangeMode] = useState('weekly');
  const [anchor, setAnchor]       = useState(new Date());
  const [showAll, setShowAll]     = useState(false);

  const handleRangeMode = (mode) => { setRangeMode(mode); setAnchor(new Date()); setShowAll(false); };
  const handleNav       = (dir)  => { setAnchor(a => stepAnchor(rangeMode, a, dir)); setShowAll(false); };
  const handleReset     = ()     => { setAnchor(new Date()); setShowAll(false); };

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getPeriodRange(rangeMode, anchor),
    [rangeMode, anchor],
  );
  const periodLabel = useMemo(
    () => formatPeriodLabel(rangeMode, rangeStart, rangeEnd),
    [rangeMode, rangeStart, rangeEnd],
  );
  const isNow     = useMemo(() => isCurrentPeriod(rangeMode, anchor), [rangeMode, anchor]);
  const rangeWord = rangeMode === 'daily' ? 'day' : rangeMode === 'weekly' ? 'week' : 'month';
  const nowLabel  = rangeMode === 'daily' ? 'Today' : rangeMode === 'weekly' ? 'This Week' : 'This Month';

  // ── Data: confirmed Pomo logs only (source === 'pomodoro' + cycles > 0) ──────
  const allPomoLogs = useMemo(
    () => timeLogs.filter(l => l.source === 'pomodoro' && (l.pomodoroCycles ?? 0) > 0),
    [timeLogs],
  );

  const filteredLogs = useMemo(
    () => filterByPeriod(allPomoLogs, rangeStart, rangeEnd),
    [allPomoLogs, rangeStart, rangeEnd],
  );

  const isEmpty = filteredLogs.length === 0;

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalCycles = useMemo(
    () => filteredLogs.reduce((s, l) => s + (l.pomodoroCycles ?? 0), 0),
    [filteredLogs],
  );

  const totalHours = useMemo(
    () => filteredLogs.reduce((s, l) => s + (l.hours ?? 0), 0),
    [filteredLogs],
  );

  const avgCyclesPerActiveDay = useMemo(() => {
    if (!filteredLogs.length) return 0;
    const activeDays = new Set(filteredLogs.map(l => format(parseISO(l.loggedAt), 'yyyy-MM-dd'))).size;
    return activeDays > 0 ? totalCycles / activeDays : 0;
  }, [filteredLogs, totalCycles]);

  const topOkr = useMemo(() => {
    const counts = {};
    filteredLogs.forEach(l => {
      if (l.okrId) counts[l.okrId] = (counts[l.okrId] || 0) + (l.pomodoroCycles ?? 0);
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) return { title: 'None tagged', cycles: 0 };
    const okr = okrs.find(o => o.id === top[0]);
    return { title: okr?.title || 'Unknown OKR', cycles: top[1] };
  }, [filteredLogs, okrs]);

  // Truncate top OKR title to fit the stat card (font-mono text-2xl)
  const topOkrDisplay = topOkr.title.length > 14
    ? topOkr.title.slice(0, 13) + '…'
    : topOkr.title;

  // ── Dynamic chart title ───────────────────────────────────────────────────────
  const chartTitle = useMemo(() => {
    if (!filteredLogs.length) return 'No Pomos logged yet — tap the timer to start';
    const today = new Date();
    let daysElapsed;
    if (rangeMode === 'daily') {
      daysElapsed = 1;
    } else {
      const effectiveEnd = rangeEnd < today ? rangeEnd : today;
      daysElapsed = effectiveEnd >= rangeStart
        ? eachDayOfInterval({ start: rangeStart, end: effectiveEnd }).length
        : 0;
    }
    const targetSoFar = daysElapsed * POMO_DAILY_TARGET;
    const rangeRef = rangeMode === 'daily' ? 'today' : `this ${rangeWord}`;
    if (totalCycles >= targetSoFar) {
      return `${totalCycles} cycle${totalCycles !== 1 ? 's' : ''} ${rangeRef} — on pace with your ${POMO_DAILY_TARGET}/day target`;
    }
    return `Below pace — ${totalCycles} cycle${totalCycles !== 1 ? 's' : ''} logged ${rangeRef}`;
  }, [filteredLogs, totalCycles, rangeMode, rangeWord, rangeStart, rangeEnd]);

  // ── Weekly / Monthly column chart data ───────────────────────────────────────
  const columnChartData = useMemo(() => {
    if (rangeMode === 'daily') return [];
    const today = new Date();
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const cycles  = filteredLogs
        .filter(l => format(parseISO(l.loggedAt), 'yyyy-MM-dd') === dateStr)
        .reduce((s, l) => s + (l.pomodoroCycles ?? 0), 0);
      return {
        dateStr,
        label:   rangeMode === 'weekly' ? format(day, 'EEE') : format(day, 'd'),
        cycles,
        isToday: isSameDay(day, today),
      };
    });
  }, [filteredLogs, rangeMode, rangeStart, rangeEnd]);

  // ── Daily sessions (for chip strip / hourly chart) ────────────────────────────
  const dailySessions = useMemo(() => {
    if (rangeMode !== 'daily') return [];
    return [...filteredLogs]
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
      .map(l => ({
        id:     l.id,
        label:  format(parseISO(l.loggedAt), 'h:mm a'),
        cycles: l.pomodoroCycles ?? 0,
        hours:  l.hours ?? 0,
      }));
  }, [filteredLogs, rangeMode]);

  // ── OKR breakdown chart data ──────────────────────────────────────────────────
  const okrChartData = useMemo(() => {
    const counts = {};
    filteredLogs.forEach(l => {
      const key = l.okrId || '__untagged__';
      counts[key] = (counts[key] || 0) + (l.pomodoroCycles ?? 0);
    });
    const untagged = counts['__untagged__'] || 0;
    const realItems = Object.entries(counts)
      .filter(([id]) => id !== '__untagged__')
      .map(([id, cycles]) => {
        const title = okrs.find(o => o.id === id)?.title || 'Unknown OKR';
        const label = title.length > 28 ? title.slice(0, 27) + '…' : title;
        return { id, label, cycles, isUntagged: false };
      })
      .sort((a, b) => b.cycles - a.cycles);
    const result = [];
    if (untagged > 0) result.push({ id: '__untagged__', label: 'Untagged', cycles: untagged, isUntagged: true });
    return [...result, ...realItems];
  }, [filteredLogs, okrs]);

  const okrChartHeight = Math.max(100, okrChartData.length * 44);

  // ── Recent sessions table ─────────────────────────────────────────────────────
  const sortedSessions = useMemo(
    () => [...filteredLogs].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [filteredLogs],
  );
  const displayedSessions = showAll ? sortedSessions : sortedSessions.slice(0, 25);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Period filter + navigator ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">

        {/* Segmented control */}
        <div className="flex bg-secondary rounded-xl p-0.5 gap-0.5 self-start">
          {RANGE_OPTIONS.map(mode => (
            <button
              key={mode}
              onClick={() => handleRangeMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                rangeMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {RANGE_LABELS[mode]}
            </button>
          ))}
        </div>

        {/* Prev / label / Next + reset */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleNav('prev')}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[200px] text-center tabular-nums">
            {periodLabel}
          </span>
          <button
            onClick={() => handleNav('next')}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          {!isNow && (
            <button
              onClick={handleReset}
              className="ml-1 text-xs font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
            >
              {nowLabel}
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Timer}
          label="Total cycles"
          value={totalCycles}
          color="emerald"
        />
        <StatCard
          icon={Clock}
          label="Focus hours"
          value={`${totalHours.toFixed(1)}h`}
          color="indigo"
        />
        <StatCard
          icon={Zap}
          label="Avg / active day"
          value={avgCyclesPerActiveDay > 0 ? avgCyclesPerActiveDay.toFixed(1) : '—'}
          sub="per Pomo day"
          color="violet"
        />
        <StatCard
          icon={TrendingUp}
          label="Top OKR"
          value={topOkrDisplay}
          sub={topOkr.cycles > 0 ? `${topOkr.cycles} cycles` : undefined}
          color="amber"
        />
      </div>

      {/* ── Empty state (replaces all three chart / table sections) ──────────── */}
      {isEmpty ? (
        <div className="bg-card border border-border rounded-2xl p-14 flex flex-col items-center text-center">
          <Timer size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">
            No Pomos this {rangeWord} yet.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Start the Pomodoro timer to begin tracking.
          </p>
        </div>
      ) : (
        <>
          {/* ── Primary chart ─────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-foreground leading-snug mb-4">
              {chartTitle}
            </h2>

            {rangeMode === 'daily' ? (
              dailySessions.length < 5 ? (
                /* Chip strip — for sparse daily sessions (fewer than 5) */
                <div className="flex flex-wrap gap-2">
                  {dailySessions.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2"
                    >
                      <span className="text-xs text-teal-700 font-mono font-bold">{s.label}</span>
                      <span className="text-[10px] text-teal-600">
                        {s.cycles} cycle{s.cycles !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Hour-of-day bar chart — for 5+ sessions in one day */
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySessions} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide domain={[0, 'auto']} />
                      <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--color-secondary)' }} />
                      <ReferenceLine y={POMO_DAILY_TARGET} stroke="var(--color-border)" strokeDasharray="4 4" />
                      <Bar dataKey="cycles" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={40}>
                        <LabelList
                          dataKey="cycles"
                          position="top"
                          style={{ fontSize: 11, fill: 'var(--color-foreground)', fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : (
              /* Weekly / Monthly column chart */
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={columnChartData} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--color-secondary)' }} />
                    <ReferenceLine
                      y={POMO_DAILY_TARGET}
                      stroke="var(--color-border)"
                      strokeDasharray="4 4"
                    />
                    <Bar dataKey="cycles" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {columnChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.isToday ? TEAL_TODAY : TEAL}
                          opacity={entry.isToday ? 1 : 0.75}
                        />
                      ))}
                      <LabelList
                        dataKey="cycles"
                        position="top"
                        style={{ fontSize: 11, fill: 'var(--color-foreground)', fontWeight: 600 }}
                        formatter={(v) => (v > 0 ? v : '')}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── OKR breakdown (horizontal bar chart) ─────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Cycles by OKR — {periodLabel}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Untagged Pomos miss out on OKR progress.
            </p>

            {okrChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No data for this period.
              </p>
            ) : (
              <div style={{ height: okrChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={okrChartData}
                    margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={170}
                      tick={{ fontSize: 12, fill: 'var(--color-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--color-secondary)' }} />
                    <Bar dataKey="cycles" radius={[0, 4, 4, 0]} maxBarSize={26}>
                      {okrChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isUntagged ? GRAY_MUTED : TEAL} />
                      ))}
                      <LabelList
                        dataKey="cycles"
                        position="right"
                        style={{ fontSize: 12, fill: 'var(--color-foreground)', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Recent sessions table ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Recent Sessions</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Date', 'Started', 'Cycles', 'Hours', 'OKR', 'Customer', 'Note'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${
                          i <= 1 || i >= 4 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedSessions.map((log, i) => {
                    const d           = parseISO(log.loggedAt);
                    const okr         = log.okrId ? okrs.find(o => o.id === log.okrId) : null;
                    const okrLabel    = okr ? (okr.title.length > 30 ? okr.title.slice(0, 29) + '…' : okr.title) : '—';
                    const customerId  = log.clientIds?.[0];
                    const customerName = customerId
                      ? (customers.find(c => c.id === customerId)?.name || '—')
                      : '—';
                    return (
                      <tr key={log.id} className={i % 2 === 1 ? 'bg-secondary/30' : ''}>
                        <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                          {format(d, 'MMM d, EEE')}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                          {format(d, 'h:mm a')}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground tabular-nums">
                          {log.pomodoroCycles ?? 0}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                          {(log.hours ?? 0).toFixed(1)}h
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">
                          {okrLabel}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {customerName}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                          {log.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sortedSessions.length > 25 && (
              <div className="px-5 py-3 border-t border-border">
                <button
                  onClick={() => setShowAll(s => !s)}
                  className="text-xs font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
                >
                  {showAll
                    ? 'Show less'
                    : `Show all ${sortedSessions.length} sessions`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
