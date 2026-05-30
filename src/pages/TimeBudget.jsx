/**
 * TimeBudget — YNAB-style weekly hour budget.
 * Budget 40 hours/week across auto-fetched meetings and manually added tasks.
 * Helps provide realistic timelines for requests from stakeholders.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Clock, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Loader2,
  AlertCircle, Settings, X, CheckSquare, Square, Copy,
  Brain, Users, RotateCcw,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, differenceInMinutes, isThursday, isFriday, isSaturday, isSunday } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { fetchCalendarEvents } from '../lib/googleApi';
import { formatRelative } from '../utils/dateHelpers';
import {
  WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_COLORS, DEFAULT_WORK_TYPE_TARGETS,
} from '../constants';

const WORK_TYPE_ICONS = {
  deep_work: Brain,
  meetings:  Users,
};

// Default budget hours
const DEFAULT_BUDGET = 40;
// Duration options for meeting and task hour selectors
const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
// Stable empty array to prevent infinite re-render when budget has no excludedPointIds
const EMPTY_EXCLUDED = [];
/** Compute the week-start date string (YYYY-MM-DD) for a given date */
function getWeekStartKey(date) {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

/** Convert calendar event to a meeting entry with computed duration */
function eventToMeeting(event) {
  const start = event.start?.dateTime ? parseISO(event.start.dateTime) : null;
  const end = event.end?.dateTime ? parseISO(event.end.dateTime) : null;
  const durationMins = start && end ? differenceInMinutes(end, start) : 60;
  const durationHours = Math.round(durationMins / 30) * 0.5; // Round to nearest 0.5h
  return {
    calendarEventId: event.id,
    summary: event.summary || '(no title)',
    day: start ? format(start, 'EEE MMM d') : '',
    startTime: start ? format(start, 'h:mm a') : '',
    durationHours: Math.max(0.5, durationHours), // minimum 0.5h
    included: true,
    source: 'calendar',
  };
}

export default function TimeBudget() {
  const { timeLogs, getTimeBudget, upsertTimeBudget, getWorkTypeTargets, upsertWorkTypeTargets } = useAppStore();
  const { googleToken, logout } = useGoogleAuth();

  // Week navigation — default to current week
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);
  const weekKey = getWeekStartKey(currentDate);

  // Load persisted budget for this week (or create fresh)
  const savedBudget = getTimeBudget(weekKey);
  const [totalBudgetHours, setTotalBudgetHours] = useState(savedBudget?.totalBudgetHours ?? DEFAULT_BUDGET);
  const [meetings, setMeetings] = useState(savedBudget?.meetings ?? []);
  const [budgetTasks, setBudgetTasks] = useState(savedBudget?.tasks ?? []);
  const [showSettings, setShowSettings] = useState(false);

  // Calendar fetch state
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(savedBudget?.lastFetchedAt ?? null);

  // Focus time exclusions — track which point IDs are excluded from budget
  const [excludedPointIds, setExcludedPointIds] = useState(savedBudget?.excludedPointIds ?? EMPTY_EXCLUDED);

  // Manual meeting form
  const [showManualMeeting, setShowManualMeeting] = useState(false);
  const [newManualMeeting, setNewManualMeeting] = useState({ summary: '', durationHours: 1 });


  // Re-load from store when week changes
  useEffect(() => {
    const budget = getTimeBudget(weekKey);
    const targets = getWorkTypeTargets(weekKey);
    // Prefer budget's saved value, fall back to sum of work type targets, then default
    const targetSum = targets?.targets
      ? Object.values(targets.targets).reduce((s, v) => s + v, 0)
      : null;
    setTotalBudgetHours(budget?.totalBudgetHours ?? targetSum ?? DEFAULT_BUDGET);
    setMeetings(budget?.meetings ?? []);
    setBudgetTasks(budget?.tasks ?? []);
    setHasFetched(!!budget?.meetings?.length);
    setLastFetchedAt(budget?.lastFetchedAt ?? null);
    setExcludedPointIds(budget?.excludedPointIds ?? EMPTY_EXCLUDED);
    setFetchError(null);
    setShowManualMeeting(false);
    // Only re-run when navigating to a different week, not on target changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  // Auto-save to store whenever meetings/tasks/budget change
  useEffect(() => {
    upsertTimeBudget(weekKey, {
      totalBudgetHours,
      meetings,
      tasks: budgetTasks,
      lastFetchedAt,
      excludedPointIds,
    });
  }, [weekKey, totalBudgetHours, meetings, budgetTasks, lastFetchedAt, excludedPointIds, upsertTimeBudget]);

  // Fetch meetings from Google Calendar (preserves manual + copied entries)
  const handleFetchMeetings = useCallback(async () => {
    if (!googleToken) return;
    setIsFetching(true);
    setFetchError(null);
    try {
      const events = await fetchCalendarEvents(googleToken, weekStart, weekEnd, { meetingsOnly: true });
      const meetingsList = events.map(eventToMeeting);
      // Preserve include/exclude state for calendar events already in the list, keep manual + copied entries
      setMeetings(prev => {
        const manualAndCopied = prev.filter(m => m.source === 'manual' || m.source === 'copied');
        const prevCalendarMap = new Map(prev.filter(m => !m.source || m.source === 'calendar').map(m => [m.calendarEventId, m]));
        const calendarEntries = meetingsList.map(m => ({
          ...m,
          included: prevCalendarMap.has(m.calendarEventId) ? prevCalendarMap.get(m.calendarEventId).included : true,
        }));
        return [...calendarEntries, ...manualAndCopied];
      });
      setHasFetched(true);
      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      // Auto-clear stale token on 401 so the UI shows the "connect" prompt
      if (err.status === 401) {
        logout();
      }
      setFetchError(err.message || 'Failed to fetch calendar events');
    } finally {
      setIsFetching(false);
    }
  }, [googleToken, weekStart, weekEnd]);

  // Auto-fetch on mount if connected and no meetings loaded
  useEffect(() => {
    if (googleToken && !hasFetched && meetings.length === 0) {
      handleFetchMeetings();
    }
  }, [googleToken, weekKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle meeting include/exclude
  const toggleMeeting = useCallback((calendarEventId) => {
    setMeetings(prev => prev.map(m =>
      m.calendarEventId === calendarEventId ? { ...m, included: !m.included } : m
    ));
  }, []);


  // Add a manual meeting entry
  const addManualMeeting = useCallback(() => {
    if (!newManualMeeting.summary.trim()) return;
    setMeetings(prev => [...prev, {
      calendarEventId: `manual-${crypto.randomUUID()}`,
      summary: newManualMeeting.summary.trim(),
      day: '',
      startTime: '',
      durationHours: newManualMeeting.durationHours,
      included: true,
      source: 'manual',
    }]);
    setNewManualMeeting({ summary: '', durationHours: 1 });
    setShowManualMeeting(false);
  }, [newManualMeeting]);

  // Delete a manual/copied meeting
  const deleteManualMeeting = useCallback((calendarEventId) => {
    setMeetings(prev => prev.filter(m => m.calendarEventId !== calendarEventId));
  }, []);

  // Copy meetings from last week
  const lastWeekKey = getWeekStartKey(subWeeks(currentDate, 1));
  const lastWeekBudget = getTimeBudget(lastWeekKey);
  const canCopyFromLastWeek = !googleToken && meetings.length === 0 && lastWeekBudget?.meetings?.length > 0;

  const handleCopyFromLastWeek = useCallback(() => {
    if (!lastWeekBudget?.meetings?.length) return;
    const copiedMeetings = lastWeekBudget.meetings.map(m => ({
      ...m,
      calendarEventId: `copied-${crypto.randomUUID()}`,
      source: 'copied',
      included: true,
    }));
    setMeetings(copiedMeetings);
    setHasFetched(true);
  }, [lastWeekBudget]);

  // Calculations
  const meetingHours = useMemo(
    () => meetings.filter(m => m.included).reduce((sum, m) => sum + m.durationHours, 0),
    [meetings]
  );
  // Week navigation
  const goToPrevWeek = () => setCurrentDate(d => subWeeks(d, 1));
  const goToNextWeek = () => setCurrentDate(d => addWeeks(d, 1));
  const goToThisWeek = () => setCurrentDate(new Date());

  // ── Bandwidth: Work Type breakdown from timeLogs ──────────────────────────
  const [showTargetsEditor, setShowTargetsEditor] = useState(false);

  // Get targets for this week (or defaults)
  const currentTargets = useMemo(() => {
    const saved = getWorkTypeTargets(weekKey);
    return saved?.targets || { ...DEFAULT_WORK_TYPE_TARGETS };
  }, [weekKey, getWorkTypeTargets]);

  const [editTargets, setEditTargets] = useState(currentTargets);
  useEffect(() => { setEditTargets(currentTargets); }, [currentTargets]);

  // Time logs for current week, grouped by work type (includes checked meeting hours)
  const workTypeHours = useMemo(() => {
    const hours = { deep_work: 0, meetings: 0 };
    timeLogs.forEach(log => {
      if (!log.weekStart || log.weekStart !== weekKey) return;
      if (hours[log.workType] !== undefined) {
        hours[log.workType] += log.hours || 0;
      }
    });
    // Add included meeting hours to the meetings bucket
    const inclMeetingHours = meetings.filter(m => m.included).reduce((sum, m) => sum + m.durationHours, 0);
    hours.meetings += inclMeetingHours;
    // Round
    Object.keys(hours).forEach(k => { hours[k] = Math.round(hours[k] * 100) / 100; });
    return hours;
  }, [timeLogs, weekKey, meetings]);

  const totalLoggedByType = useMemo(
    () => WORK_TYPES.reduce((s, wt) => s + workTypeHours[wt], 0),
    [workTypeHours]
  );

  const totalTargetHours = useMemo(
    () => Object.values(currentTargets).reduce((s, v) => s + v, 0),
    [currentTargets]
  );

  // Health indicators
  const healthAlerts = useMemo(() => {
    const alerts = [];
    const totalLogged = totalLoggedByType;
    if (totalLogged > 0) {
      const meetingPct = workTypeHours.meetings / totalLogged;
      if (meetingPct > 0.5) {
        alerts.push({ type: 'warning', text: 'Meeting-heavy week — meetings are over 50% of your logged time.' });
      }
      if (workTypeHours.deep_work < currentTargets.deep_work * 0.5 && totalLogged > 10) {
        alerts.push({ type: 'warning', text: 'Below deep work target — consider protecting focus blocks.' });
      }
    }
    const now = new Date();
    const isLateWeek = isThursday(now) || isFriday(now) || isSaturday(now) || isSunday(now);
    const isCurrentWeek = weekKey === getWeekStartKey(new Date());
    if (isLateWeek && isCurrentWeek && totalLogged < 30 && totalLogged > 0) {
      alerts.push({ type: 'info', text: 'Underlogged — are sessions being tracked? You have less than 30h logged late in the week.' });
    }
    return alerts;
  }, [totalLoggedByType, workTypeHours, currentTargets, weekKey]);

  const handleSaveTargets = () => {
    upsertWorkTypeTargets(weekKey, editTargets);
    setShowTargetsEditor(false);
  };

  const handleResetTargets = () => {
    setEditTargets({ ...DEFAULT_WORK_TYPE_TARGETS });
  };

  // When weekly budget changes, proportionally scale work type targets to match
  const handleBudgetChange = useCallback((newBudget) => {
    const clamped = Math.max(1, Math.min(168, newBudget));
    setTotalBudgetHours(clamped);
    const oldTotal = Object.values(currentTargets).reduce((s, v) => s + v, 0);
    if (oldTotal > 0) {
      const ratio = clamped / oldTotal;
      const scaled = {};
      WORK_TYPES.forEach(wt => {
        scaled[wt] = Math.round(currentTargets[wt] * ratio * 2) / 2; // round to nearest 0.5
      });
      // Adjust rounding drift on the largest category
      const scaledTotal = Object.values(scaled).reduce((s, v) => s + v, 0);
      const diff = clamped - scaledTotal;
      if (diff !== 0) {
        const largest = WORK_TYPES.reduce((a, b) => scaled[a] >= scaled[b] ? a : b);
        scaled[largest] = Math.max(0, scaled[largest] + diff);
      }
      upsertWorkTypeTargets(weekKey, scaled);
      setEditTargets(scaled);
    }
  }, [currentTargets, weekKey, upsertWorkTypeTargets]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-foreground flex items-center gap-2">
            <Clock size={20} className="text-brand-lavender" />
            Time Budget
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan your week like a budget — every hour has a job.</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          title="Budget settings"
          aria-label="Budget settings"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <label className="flex items-center gap-3 text-sm text-foreground">
            <span className="text-muted-foreground font-medium">Weekly budget:</span>
            <input
              type="number"
              min={1}
              max={168}
              step={1}
              value={totalBudgetHours}
              onChange={e => handleBudgetChange(Number(e.target.value))}
              className="w-20 h-8 bg-secondary border border-border rounded-lg px-2 text-sm text-foreground text-center focus:outline-none focus:border-ring"
            />
            <span className="text-muted-foreground">hours</span>
          </label>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3">
        <button onClick={goToPrevWeek} className="p-1.5 rounded-lg bg-secondary/40 hover:bg-secondary text-foreground transition-all">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </p>
          {weekKey !== getWeekStartKey(new Date()) ? (
            <button
              onClick={goToThisWeek}
              className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 font-medium transition-colors mt-0.5"
            >
              Go to this week
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground mt-0.5">Current week</span>
          )}
        </div>
        <button onClick={goToNextWeek} className="p-1.5 rounded-lg bg-secondary/40 hover:bg-secondary text-foreground transition-all">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Weekly Bandwidth Overview ──────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Weekly Bandwidth</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{totalLoggedByType.toFixed(1)}h</span>
            <span className="mx-1">/</span>
            <span>{totalTargetHours}h target</span>
            <span className="ml-1.5 text-xs">({totalTargetHours > 0 ? Math.round((totalLoggedByType / totalTargetHours) * 100) : 0}%)</span>
          </p>
        </div>

        {/* Stacked progress bar */}
        <div className="w-full h-4 rounded-full bg-muted overflow-hidden flex">
          {WORK_TYPES.map(wt => {
            const pct = totalTargetHours > 0 ? (workTypeHours[wt] / totalTargetHours) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={wt}
                className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: WORK_TYPE_COLORS[wt].hex }}
                title={`${WORK_TYPE_LABELS[wt]}: ${workTypeHours[wt]}h`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {WORK_TYPES.map(wt => (
            <div key={wt} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: WORK_TYPE_COLORS[wt].hex }} />
              {WORK_TYPE_LABELS[wt]}
            </div>
          ))}
        </div>
      </div>

      {/* ── Work Type Breakdown ──────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">By Work Type</h2>
          <button
            onClick={() => setShowTargetsEditor(v => !v)}
            className="text-xs text-brand-lavender hover:text-brand-lavender/80 font-medium transition-colors"
          >
            {showTargetsEditor ? 'Close' : 'Edit targets'}
          </button>
        </div>

        {/* 4 horizontal bars */}
        <div className="space-y-3">
          {WORK_TYPES.map(wt => {
            const Icon = WORK_TYPE_ICONS[wt];
            const target = currentTargets[wt] || 0;
            const logged = workTypeHours[wt];
            const pct = target > 0 ? Math.min((logged / target) * 100, 100) : 0;
            const over = logged > target;
            return (
              <div key={wt}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon size={13} className={WORK_TYPE_COLORS[wt].text} />
                    <span className="text-xs font-medium text-foreground">{WORK_TYPE_LABELS[wt]}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <span className={`font-mono font-semibold ${over ? 'text-amber-700' : 'text-foreground'}`}>{logged}h</span>
                    {' / '}{target}h
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: WORK_TYPE_COLORS[wt].hex }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Targets editor */}
        {showTargetsEditor && (
          <div className="border-t border-border pt-3 mt-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Weekly hour targets</p>
            <div className="grid grid-cols-2 gap-2">
              {WORK_TYPES.map(wt => (
                <label key={wt} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-20">{WORK_TYPE_LABELS[wt]}</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={editTargets[wt]}
                    onChange={e => setEditTargets(prev => ({ ...prev, [wt]: Math.max(0, Number(e.target.value)) }))}
                    className="w-16 h-7 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground text-center focus:outline-none focus:border-ring"
                  />
                  <span className="text-muted-foreground">hrs</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <p className="text-[10px] text-muted-foreground flex-1">
                Total: {Object.values(editTargets).reduce((s, v) => s + v, 0)}h
              </p>
              <button
                onClick={handleResetTargets}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={10} /> Reset
              </button>
              <button
                onClick={handleSaveTargets}
                className="px-3 py-1 rounded-lg bg-brand-lavender text-foreground text-xs font-semibold hover:bg-brand-lavender/80 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Health Indicators ─────────────────────────────────────────────────── */}
      {healthAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">Week Health</p>
          {healthAlerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 px-4 py-2.5 rounded-xl border text-xs ${
                alert.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}
            >
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{alert.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Meetings ────────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar size={14} className="text-blue-700" />
                Meetings
                <span className="text-xs font-normal text-muted-foreground">({meetingHours}h)</span>
              </h2>
              {lastFetchedAt && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Fetched {formatRelative(lastFetchedAt)}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowManualMeeting(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[11px] font-medium text-foreground hover:bg-secondary/80 transition-all"
              >
                <Plus size={11} />
                Manual
              </button>
              <button
                onClick={handleFetchMeetings}
                disabled={isFetching || !googleToken}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[11px] font-medium text-foreground hover:bg-secondary/80 disabled:opacity-40 transition-all"
              >
                {isFetching ? <Loader2 size={11} className="animate-spin" /> : <Calendar size={11} />}
                {hasFetched ? 'Refresh' : 'Fetch'}
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-1.5 max-h-[24rem] overflow-y-auto">
            {/* Manual meeting form */}
            {showManualMeeting && (
              <div className="flex gap-1.5 flex-wrap p-2.5 bg-secondary/50 border border-border rounded-xl mb-1.5">
                <input
                  type="text"
                  placeholder="Meeting name..."
                  value={newManualMeeting.summary}
                  onChange={e => setNewManualMeeting(prev => ({ ...prev, summary: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') addManualMeeting(); }}
                  className="flex-1 min-w-[8rem] h-8 bg-card border border-border rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring"
                  autoFocus
                />
                <select
                  value={newManualMeeting.durationHours}
                  onChange={e => setNewManualMeeting(prev => ({ ...prev, durationHours: Number(e.target.value) }))}
                  className="h-8 bg-card border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring w-20"
                >
                  {HOUR_OPTIONS.map(h => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
                <button
                  onClick={addManualMeeting}
                  disabled={!newManualMeeting.summary.trim()}
                  className="flex items-center gap-1 px-3 h-8 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-40 transition-all"
                >
                  <Plus size={12} /> Add
                </button>
                <button
                  onClick={() => { setShowManualMeeting(false); setNewManualMeeting({ summary: '', durationHours: 1 }); }}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {!googleToken && meetings.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
                <AlertCircle size={14} className="text-muted-foreground/50 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Re-connect Google Calendar in Integrations, or add meetings manually above.
                </p>
              </div>
            )}

            {/* Copy from last week button */}
            {canCopyFromLastWeek && (
              <button
                onClick={handleCopyFromLastWeek}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-all"
              >
                <Copy size={12} />
                Copy from last week ({lastWeekBudget.meetings.length} meetings)
              </button>
            )}

            {fetchError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{fetchError}</span>
              </div>
            )}

            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
                <Loader2 size={14} className="animate-spin" />
                <span>Fetching meetings...</span>
              </div>
            )}

            {!isFetching && meetings.length === 0 && hasFetched && (
              <p className="text-xs text-muted-foreground text-center py-4">No meetings found for this week.</p>
            )}

            {meetings.map(m => (
              <div
                key={m.calendarEventId}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                  m.included
                    ? 'border-border bg-card'
                    : 'border-border/50 bg-secondary/30 opacity-50'
                }`}
              >
                <button
                  onClick={() => toggleMeeting(m.calendarEventId)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title={m.included ? 'Exclude from budget' : 'Include in budget'}
                >
                  {m.included
                    ? <CheckSquare size={14} className="text-blue-700" />
                    : <Square size={14} />
                  }
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium leading-snug ${m.included ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                    {m.summary}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {m.day && <p className="text-[10px] text-muted-foreground">{m.day}{m.startTime ? ` · ${m.startTime}` : ''}</p>}
                    {m.source === 'manual' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">Manual</span>
                    )}
                    {m.source === 'copied' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">Copied</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${m.included ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {m.durationHours}h
                </span>
                {(m.source === 'manual' || m.source === 'copied') && (
                  <button
                    onClick={() => deleteManualMeeting(m.calendarEventId)}
                    className="p-1 text-muted-foreground hover:text-red-700 transition-colors flex-shrink-0"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

    </div>
  );
}
