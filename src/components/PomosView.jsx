/**
 * PomosView — Pomodoro focus-cycle analytics view shown inside the Dashboard's
 * "Pomos" tab. Prefers timeLogs, but falls back to points-derived pomodoro
 * entries when older sessions are missing from remote timeLogs.
 *
 * Layout: period filter → stat cards → primary chart → OKR breakdown → session table.
 */
import { Fragment, useState, useMemo, useRef, useCallback } from 'react';
import { Timer, ChevronLeft, ChevronRight, Clock, Zap, TrendingUp, Plus, Trash2 } from 'lucide-react';
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
import ManualPomoModal from './ManualPomoModal';
import { Button } from './ui/button';

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

function truncateOkrTitle(title) {
  return title.length > 30 ? title.slice(0, 29) + '…' : title;
}

function normalizePomoNote(note) {
  return String(note || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function roundPomoHours(hours) {
  return Math.round((Number(hours) || 0) * 100) / 100;
}

function buildPomoDedupKey({ workType, pomodoroCycles, hours, okrId, customerId, note }) {
  return [
    workType || '',
    pomodoroCycles ?? 0,
    roundPomoHours(hours),
    okrId || '',
    customerId || '',
    normalizePomoNote(note),
  ].join('|');
}

function getPomoDuplicateWindowMs(hours) {
  const durationMs = roundPomoHours(hours) * 60 * 60 * 1000;
  return Math.max(45 * 60 * 1000, durationMs + (45 * 60 * 1000));
}

function renderNotionTaskLabel(taskName, account) {
  if (!taskName) return null;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-brand-sage">
      {account && (
        <span className="inline-flex shrink-0 rounded-md border border-brand-sage/20 bg-brand-sage/10 px-1.5 py-0.5 font-semibold text-brand-sage">
          {account}
        </span>
      )}
      <span className="truncate">{taskName}</span>
    </div>
  );
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function PomosView() {
  const { timeLogs, points, okrs, customers, deleteTimeLog, deletePoint } = useAppStore();

  const [rangeMode, setRangeMode] = useState('weekly');
  const [anchor, setAnchor]       = useState(new Date());
  const [showAll, setShowAll]     = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [showManualPomo, setShowManualPomo] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const confirmDeleteTimeoutRef = useRef(null);

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

  // ── Data: confirmed Pomo logs first, then points-only fallback sessions ───────
  const allPomoLogs = useMemo(() => {
    const confirmedPomoLogs = timeLogs.filter(
      log => log.source === 'pomodoro' && (log.pomodoroCycles ?? 0) > 0,
    );

    const loggedAtWithTimeLogs = new Set(
      confirmedPomoLogs
        .map(log => log.loggedAt)
        .filter(Boolean),
    );

    const confirmedLogsByDedupKey = confirmedPomoLogs.reduce((map, log) => {
      const loggedAtMs = Date.parse(log.loggedAt || '');
      if (!Number.isFinite(loggedAtMs)) return map;

      const dedupKey = buildPomoDedupKey({
        workType: log.workType,
        pomodoroCycles: log.pomodoroCycles,
        hours: log.hours,
        okrId: log.okrId,
        customerId: log.clientIds?.[0] || null,
        note: log.note,
      });

      const bucket = map.get(dedupKey) || [];
      bucket.push({
        id: log.id,
        loggedAtMs,
        duplicateWindowMs: getPomoDuplicateWindowMs(log.hours),
      });
      map.set(dedupKey, bucket);
      return map;
    }, new Map());

    confirmedLogsByDedupKey.forEach(bucket => {
      bucket.sort((a, b) => a.loggedAtMs - b.loggedAtMs);
    });

    const matchedConfirmedLogIds = new Set();

    const fallbackPointLogs = points
      .filter(point => {
        if (
          point.source !== 'pomodoro'
          || (point.pomodoroCycles ?? 0) <= 0
          || !point.timestamp
        ) {
          return false;
        }

        if (loggedAtWithTimeLogs.has(point.timestamp)) {
          return false;
        }

        const pointTimestampMs = Date.parse(point.timestamp);
        if (!Number.isFinite(pointTimestampMs)) {
          return false;
        }

        const dedupKey = buildPomoDedupKey({
          workType: point.interactionType === 'Meetings' ? 'meetings' : 'deep_work',
          pomodoroCycles: point.pomodoroCycles,
          hours: point.hours,
          okrId: point.okrId,
          customerId: point.customerId || null,
          note: point.comment,
        });

        const candidateLogs = confirmedLogsByDedupKey.get(dedupKey) || [];
        const duplicateLog = candidateLogs.find(candidate =>
          !matchedConfirmedLogIds.has(candidate.id)
          && pointTimestampMs >= candidate.loggedAtMs
          && pointTimestampMs <= (candidate.loggedAtMs + candidate.duplicateWindowMs),
        );

        if (duplicateLog) {
          matchedConfirmedLogIds.add(duplicateLog.id);
          return false;
        }

        return true;
      })
      .map(point => ({
        id: point.id,
        workType: point.interactionType === 'Meetings' ? 'meetings' : 'deep_work',
        hours: point.hours ?? 0,
        clientIds: point.customerId ? [point.customerId] : [],
        okrId: point.okrId || null,
        taskId: null,
        note: point.comment || '',
        loggedAt: point.timestamp,
        source: 'pomodoro',
        pomodoroCycles: point.pomodoroCycles ?? 0,
      }));

    return [...confirmedPomoLogs, ...fallbackPointLogs];
  }, [timeLogs, points]);

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
  const okrTitleById = useMemo(
    () => new Map(okrs.map(okr => [okr.id, okr.title])),
    [okrs],
  );
  const customerNameById = useMemo(
    () => new Map(customers.map(customer => [customer.id, customer.name])),
    [customers],
  );

  const sessionRows = useMemo(() => {
    const rows = [];
    const groupsByLoggedAt = new Map();

    sortedSessions.forEach(log => {
      if (!log.loggedAt) {
        rows.push({ type: 'single', key: log.id, log });
        return;
      }

      const existing = groupsByLoggedAt.get(log.loggedAt);
      if (existing) {
        existing.logs.push(log);
        return;
      }

      const nextGroup = { type: 'group', key: log.loggedAt, loggedAt: log.loggedAt, logs: [log] };
      groupsByLoggedAt.set(log.loggedAt, nextGroup);
      rows.push(nextGroup);
    });

    return rows.map((row) => {
      if (row.type === 'single') return row;

      if (row.logs.length === 1) {
        return {
          type: 'single',
          key: row.logs[0].id,
          log: row.logs[0],
        };
      }

      const { logs } = row;
      const firstLog = logs[0];

      const okrKeys = [...new Set(logs.map(log => log.okrId ?? null))];
      const customerKeys = [...new Set(logs.map(log => log.clientIds?.[0] ?? null))];
      const noteKeys = [...new Set(logs.map(log => log.note?.trim() || ''))];
      const notionKeys = [...new Set(
        logs
          .filter(log => log.notionTaskName)
          .map(log => `${log.notionTaskName}|||${log.notionAccount || ''}`)
      )];

      const sharedOkrTitle = firstLog.okrId ? okrTitleById.get(firstLog.okrId) : null;
      const sharedCustomerName = firstLog.clientIds?.[0]
        ? customerNameById.get(firstLog.clientIds[0]) || '—'
        : '—';
      const sharedNote = firstLog.note?.trim() || '';
      const sharedNotionTaskName = firstLog.notionTaskName?.trim() || '';
      const sharedNotionAccount = firstLog.notionAccount?.trim() || '';

      return {
        type: 'group',
        key: row.key,
        loggedAt: row.loggedAt,
        logs,
        totalHours: logs.reduce((sum, log) => sum + (log.hours ?? 0), 0),
        pomodoroCycles: logs.reduce((sum, log) => sum + (log.pomodoroCycles ?? 0), 0),
        okrLabel: okrKeys.length === 1
          ? (sharedOkrTitle ? truncateOkrTitle(sharedOkrTitle) : '—')
          : `${okrKeys.length} OKRs`,
        customerLabel: customerKeys.length === 1
          ? sharedCustomerName
          : `${customerKeys.length} customers`,
        noteLabel: noteKeys.length === 1
          ? (sharedNote || '—')
          : `${logs.length} tasks`,
        notionTaskLabel: notionKeys.length === 1
          ? sharedNotionTaskName
          : notionKeys.length > 1
            ? `${notionKeys.length} linked tasks`
            : '',
        notionAccountLabel: notionKeys.length === 1 ? sharedNotionAccount : '',
      };
    });
  }, [customerNameById, okrTitleById, sortedSessions]);

  const displayedSessionRows = showAll ? sessionRows : sessionRows.slice(0, 25);

  // Set of ids that live in timeLogs (vs. points-fallback entries)
  const timeLogIdSet = useMemo(() => new Set(timeLogs.map(l => l.id)), [timeLogs]);

  const deleteLog = useCallback((logId) => {
    if (timeLogIdSet.has(logId)) deleteTimeLog(logId);
    else deletePoint(logId);
  }, [timeLogIdSet, deleteTimeLog, deletePoint]);

  const handleDeleteRow = useCallback((e, rowKey, logIds) => {
    e.stopPropagation();
    if (confirmingDeleteId === rowKey) {
      clearTimeout(confirmDeleteTimeoutRef.current);
      logIds.forEach(deleteLog);
      setConfirmingDeleteId(null);
    } else {
      clearTimeout(confirmDeleteTimeoutRef.current);
      setConfirmingDeleteId(rowKey);
      confirmDeleteTimeoutRef.current = setTimeout(() => setConfirmingDeleteId(null), 3000);
    }
  }, [confirmingDeleteId, deleteLog]);

  const toggleGroup = (loggedAt) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(loggedAt)) next.delete(loggedAt);
      else next.add(loggedAt);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Period filter + navigator ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

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

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowManualPomo(true)}
          className="self-start lg:self-auto"
        >
          <Plus size={14} />
          Log Pomo
        </Button>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowManualPomo(true)}
            className="mt-4"
          >
            <Plus size={14} />
            Log Pomo
          </Button>
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
                    {['Date', 'Started', 'Cycles', 'Hours', 'OKR', 'Customer', 'Note', ''].map((h, i) => (
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
                  {displayedSessionRows.map((row, groupIndex) => {
                    if (row.type === 'single') {
                      const log = row.log;
                      const d = parseISO(log.loggedAt);
                      const okrTitle = log.okrId ? okrTitleById.get(log.okrId) : null;
                      const customerId = log.clientIds?.[0];
                      const customerName = customerId
                        ? (customerNameById.get(customerId) || '—')
                        : '—';

                      return (
                        <tr key={log.id} className={`group ${groupIndex % 2 === 1 ? 'bg-secondary/30' : ''}`}>
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
                            {okrTitle ? truncateOkrTitle(okrTitle) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {customerName}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[200px]">
                            <div className="min-w-0">
                              <div className="truncate">{log.note || '—'}</div>
                              {renderNotionTaskLabel(log.notionTaskName, log.notionAccount)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 w-8">
                            <button
                              onClick={(e) => handleDeleteRow(e, log.id, [log.id])}
                              title={confirmingDeleteId === log.id ? 'Click again to confirm' : 'Delete session'}
                              className={`transition-all duration-150 ${
                                confirmingDeleteId === log.id
                                  ? 'opacity-100 text-red-500 scale-110'
                                  : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500'
                              }`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const d = parseISO(row.loggedAt);
                    const isExpanded = expandedGroups.has(row.loggedAt);
                    const parentRowClass = groupIndex % 2 === 1 ? 'bg-secondary/30' : '';

                    return (
                      <Fragment key={row.loggedAt}>
                        <tr
                          className={`group ${parentRowClass} cursor-pointer`}
                          onClick={() => toggleGroup(row.loggedAt)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleGroup(row.loggedAt);
                            }
                          }}
                          tabIndex={0}
                        >
                          <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                size={14}
                                className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <span>{format(d, 'MMM d, EEE')}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                            {format(d, 'h:mm a')}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground tabular-nums">
                            {row.pomodoroCycles}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                            {row.totalHours.toFixed(1)}h
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">
                            {row.okrLabel}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {row.customerLabel}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[200px]">
                            <div className="min-w-0">
                              <div className="truncate">{row.noteLabel}</div>
                              {renderNotionTaskLabel(row.notionTaskLabel, row.notionAccountLabel)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 w-8">
                            <button
                              onClick={(e) => handleDeleteRow(e, row.loggedAt, row.logs.map(l => l.id))}
                              title={confirmingDeleteId === row.loggedAt ? 'Click again to confirm' : `Delete all ${row.logs.length} sessions`}
                              className={`transition-all duration-150 ${
                                confirmingDeleteId === row.loggedAt
                                  ? 'opacity-100 text-red-500 scale-110'
                                  : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500'
                              }`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && row.logs.map((log) => {
                          const okrTitle = log.okrId ? okrTitleById.get(log.okrId) : null;
                          const customerId = log.clientIds?.[0];
                          const customerName = customerId
                            ? (customerNameById.get(customerId) || '—')
                            : '—';

                          return (
                            <tr key={log.id} className="group bg-secondary/15">
                              <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                                <div className="flex items-center gap-2 pl-6">
                                  <span className="w-3" />
                                  <span>{format(d, 'MMM d, EEE')}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                                {format(d, 'h:mm a')}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-muted-foreground tabular-nums">
                                —
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                                {(log.hours ?? 0).toFixed(1)}h
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">
                                {okrTitle ? truncateOkrTitle(okrTitle) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {customerName}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[200px]">
                                <div className="min-w-0">
                                  <div className="truncate">{log.note || '—'}</div>
                                  {renderNotionTaskLabel(log.notionTaskName, log.notionAccount)}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 w-8">
                                <button
                                  onClick={(e) => handleDeleteRow(e, log.id, [log.id])}
                                  title={confirmingDeleteId === log.id ? 'Click again to confirm' : 'Delete session'}
                                  className={`transition-all duration-150 ${
                                    confirmingDeleteId === log.id
                                      ? 'opacity-100 text-red-500 scale-110'
                                      : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500'
                                  }`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sessionRows.length > 25 && (
              <div className="px-5 py-3 border-t border-border">
                <button
                  onClick={() => setShowAll(s => !s)}
                  className="text-xs font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
                >
                  {showAll
                    ? 'Show less'
                    : `Show all ${sessionRows.length} sessions`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {showManualPomo && (
        <ManualPomoModal onClose={() => setShowManualPomo(false)} />
      )}
    </div>
  );
}
