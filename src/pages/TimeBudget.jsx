/**
 * TimeBudget — YNAB-style weekly hour budget.
 * Budget 40 hours/week across auto-fetched meetings and manually added tasks.
 * Helps provide realistic timelines for requests from stakeholders.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Clock, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Loader2,
  AlertCircle, Settings, Check, X, CheckSquare, Square, Timer, User, Copy,
  Brain, Users, MessageSquare, ClipboardList, RotateCcw, ChevronDown, ChevronUp,
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
  comms:     MessageSquare,
  admin:     ClipboardList,
};

// Default budget hours
const DEFAULT_BUDGET = 40;
// Duration options for meeting and task hour selectors
const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
// Stable empty array to prevent infinite re-render when budget has no excludedPointIds
const EMPTY_EXCLUDED = [];

/** Compute the Monday date string (YYYY-MM-DD) for a given date */
function getMonday(date) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
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
  const { customers, addTask, okrs, points, timeLogs, getTimeBudget, upsertTimeBudget, getWorkTypeTargets, upsertWorkTypeTargets } = useAppStore();
  const { googleToken, logout } = useGoogleAuth();

  // Week navigation — default to current week
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekKey = getMonday(currentDate);

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

  // New task form — aligned with Triage QuickAddTaskForm fields
  const [newTask, setNewTask] = useState({
    description: '', hours: 1, customerId: '',
    workType: 'comms', okrId: '', isEvergreen: false,
  });

  // Re-load from store when week changes
  useEffect(() => {
    const budget = getTimeBudget(weekKey);
    setTotalBudgetHours(budget?.totalBudgetHours ?? DEFAULT_BUDGET);
    setMeetings(budget?.meetings ?? []);
    setBudgetTasks(budget?.tasks ?? []);
    setHasFetched(!!budget?.meetings?.length);
    setLastFetchedAt(budget?.lastFetchedAt ?? null);
    setExcludedPointIds(budget?.excludedPointIds ?? EMPTY_EXCLUDED);
    setFetchError(null);
    setShowManualMeeting(false);
  }, [weekKey, getTimeBudget]);

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
      const events = await fetchCalendarEvents(googleToken, weekStart, weekEnd);
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

  // Toggle focus time session inclusion in budget
  const togglePointInclusion = useCallback((pointId) => {
    setExcludedPointIds(prev =>
      prev.includes(pointId) ? prev.filter(id => id !== pointId) : [...prev, pointId]
    );
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
  const lastWeekKey = getMonday(subWeeks(currentDate, 1));
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

  // Task CRUD — auto-creates a linked Triage task on add
  const addBudgetTask = useCallback(() => {
    if (!newTask.description.trim()) return;

    // Auto-create linked Triage task
    const triageTask = addTask({
      description: newTask.description.trim(),
      customerId: newTask.customerId || undefined,
      workType: newTask.workType,
      isEvergreen: newTask.isEvergreen || undefined,
      okrId: newTask.okrId || undefined,
      status: 'open',
    });

    // Add budget task linked to the Triage task
    setBudgetTasks(prev => [...prev, {
      id: crypto.randomUUID(),
      description: newTask.description.trim(),
      hours: newTask.hours,
      customerId: newTask.customerId || undefined,
      workType: newTask.workType,
      okrId: newTask.okrId || undefined,
      taskId: triageTask.id,
    }]);

    setNewTask({
      description: '', hours: 1, customerId: '',
      workType: 'comms', okrId: '', isEvergreen: false,
    });
  }, [newTask, addTask]);

  const removeBudgetTask = useCallback((id) => {
    setBudgetTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateBudgetTaskHours = useCallback((id, hours) => {
    setBudgetTasks(prev => prev.map(t => t.id === id ? { ...t, hours } : t));
  }, []);

  // Focus time logged — read from points for the current week
  const weeklyLoggedSessions = useMemo(() => {
    return points
      .filter(p => p.hours > 0 && p.timestamp)
      .filter(p => {
        const t = new Date(p.timestamp);
        return t >= weekStart && t <= weekEnd;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [points, weekStart, weekEnd]);

  const loggedHours = useMemo(
    () => Math.round(
      weeklyLoggedSessions
        .filter(s => !excludedPointIds.includes(s.id))
        .reduce((sum, s) => sum + (s.hours || 0), 0) * 100
    ) / 100,
    [weeklyLoggedSessions, excludedPointIds]
  );

  // Calculations
  const meetingHours = useMemo(
    () => meetings.filter(m => m.included).reduce((sum, m) => sum + m.durationHours, 0),
    [meetings]
  );
  const taskHours = useMemo(
    () => budgetTasks.reduce((sum, t) => sum + t.hours, 0),
    [budgetTasks]
  );
  const budgeted = meetingHours + taskHours + loggedHours;
  const remaining = totalBudgetHours - budgeted;
  const budgetPercent = totalBudgetHours > 0 ? Math.min((budgeted / totalBudgetHours) * 100, 100) : 0;
  const isOverBudget = remaining < 0;
  const isNearBudget = budgetPercent >= 80 && !isOverBudget;

  // Budget bar color
  const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-emerald-500';
  const barBg = isOverBudget ? 'bg-red-500/10' : isNearBudget ? 'bg-amber-500/10' : 'bg-emerald-500/10';

  // Week navigation
  const goToPrevWeek = () => setCurrentDate(d => subWeeks(d, 1));
  const goToNextWeek = () => setCurrentDate(d => addWeeks(d, 1));
  const goToThisWeek = () => setCurrentDate(new Date());

  // ── Bandwidth: Work Type breakdown from timeLogs ──────────────────────────
  const [showTargetsEditor, setShowTargetsEditor] = useState(false);
  const [showDetailSections, setShowDetailSections] = useState(false);

  // Get targets for this week (or defaults)
  const currentTargets = useMemo(() => {
    const saved = getWorkTypeTargets(weekKey);
    return saved?.targets || { ...DEFAULT_WORK_TYPE_TARGETS };
  }, [weekKey, getWorkTypeTargets]);

  const [editTargets, setEditTargets] = useState(currentTargets);
  useEffect(() => { setEditTargets(currentTargets); }, [currentTargets]);

  // Time logs for current week, grouped by work type
  const workTypeHours = useMemo(() => {
    const hours = { deep_work: 0, meetings: 0, comms: 0, admin: 0 };
    timeLogs.forEach(log => {
      if (!log.weekStart || log.weekStart !== weekKey) return;
      if (hours[log.workType] !== undefined) {
        hours[log.workType] += log.hours || 0;
      }
    });
    // Round
    Object.keys(hours).forEach(k => { hours[k] = Math.round(hours[k] * 100) / 100; });
    return hours;
  }, [timeLogs, weekKey]);

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
    const isCurrentWeek = weekKey === getMonday(new Date());
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Clock size={20} className="text-brand-lavender" />
            Time Budget
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan your week like a budget — every hour has a job.</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          title="Budget settings"
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
              onChange={e => setTotalBudgetHours(Math.max(1, Number(e.target.value)))}
              className="w-20 h-8 bg-secondary border border-border rounded-lg px-2 text-sm text-foreground text-center focus:outline-none focus:border-ring"
            />
            <span className="text-muted-foreground">hours</span>
          </label>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3">
        <button onClick={goToPrevWeek} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </p>
          <button
            onClick={goToThisWeek}
            className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 font-medium transition-colors mt-0.5"
          >
            Go to this week
          </button>
        </div>
        <button onClick={goToNextWeek} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
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
        <div className="w-full h-4 rounded-full bg-secondary overflow-hidden flex">
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
                    <span className={`font-semibold ${over ? 'text-amber-400' : 'text-foreground'}`}>{logged}h</span>
                    {' / '}{target}h
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
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
          {healthAlerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 px-4 py-2.5 rounded-xl border text-xs ${
                alert.type === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}
            >
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{alert.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Original Budget Summary (collapsible) ─────────────────────────── */}
      <div>
        <button
          onClick={() => setShowDetailSections(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          {showDetailSections ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Budget Planning Details
          <span className="text-[10px] font-normal">(meetings, tasks, focus time)</span>
        </button>
      </div>

      {showDetailSections && (<>
      {/* Summary card */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
        {/* Budget bar */}
        <div className={`w-full h-3 rounded-full ${barBg} overflow-hidden`}>
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${Math.min(budgetPercent, 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Meetings</p>
            <p className="text-lg font-bold text-foreground">{meetingHours}h</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tasks</p>
            <p className="text-lg font-bold text-foreground">{taskHours}h</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Logged</p>
            <p className="text-lg font-bold text-purple-400">{loggedHours}h</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Budgeted</p>
            <p className="text-lg font-bold text-foreground">{budgeted}h <span className="text-xs font-normal text-muted-foreground">/ {totalBudgetHours}h</span></p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Available</p>
            <p className={`text-lg font-bold ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
              {isOverBudget ? `${Math.abs(remaining)}h over` : `${remaining}h`}
            </p>
          </div>
        </div>
      </div>

      {/* Focus Time Logged section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Timer size={14} className="text-purple-400" />
            Focus Time Logged
            <span className="text-xs font-normal text-muted-foreground">({loggedHours}h)</span>
          </h2>
        </div>

        <div className="px-4 py-3">
          {weeklyLoggedSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No focus time logged this week yet. Complete timer sessions in Triage to track actual hours.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[20rem] overflow-y-auto">
              {weeklyLoggedSessions.map(s => {
                const customer = s.customerId ? customers.find(c => c.id === s.customerId) : null;
                // Use comment as description, fall back to activity type
                const description = s.comment || s.activityType || 'Focus session';
                const sessionDate = s.timestamp ? format(parseISO(s.timestamp), 'EEE MMM d · h:mm a') : '';
                const isIncluded = !excludedPointIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                      isIncluded
                        ? 'border-border bg-card'
                        : 'border-border/50 bg-secondary/30 opacity-50'
                    }`}
                  >
                    {/* Toggle inclusion in budget — matches meeting checkbox pattern */}
                    <button
                      onClick={() => togglePointInclusion(s.id)}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title={isIncluded ? 'Exclude from budget' : 'Include in budget'}
                    >
                      {isIncluded
                        ? <CheckSquare size={14} className="text-purple-400" />
                        : <Square size={14} />
                      }
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium leading-snug truncate ${
                        isIncluded ? 'text-foreground' : 'text-muted-foreground line-through'
                      }`}>{description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {customer && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                            <User size={8} />
                            {customer.name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{sessionDate}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${
                      isIncluded ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {Math.round(s.hours * 100) / 100}h
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Meetings section */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar size={14} className="text-blue-400" />
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
                  className="flex items-center gap-1 px-3 h-8 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 disabled:opacity-40 transition-all"
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
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 text-blue-400 text-xs font-medium hover:bg-blue-500/10 transition-all"
              >
                <Copy size={12} />
                Copy from last week ({lastWeekBudget.meetings.length} meetings)
              </button>
            )}

            {fetchError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
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
                    ? <CheckSquare size={14} className="text-blue-400" />
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold">Manual</span>
                    )}
                    {m.source === 'copied' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">Copied</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${m.included ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {m.durationHours}h
                </span>
                {(m.source === 'manual' || m.source === 'copied') && (
                  <button
                    onClick={() => deleteManualMeeting(m.calendarEventId)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tasks section */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock size={14} className="text-teal-400" />
              Tasks & Focus Time
              <span className="text-xs font-normal text-muted-foreground">({taskHours}h)</span>
            </h2>
          </div>

          <div className="px-4 py-3 space-y-2">
            {/* Add task form — Row 1: Description */}
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Task description..."
                value={newTask.description}
                onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addBudgetTask(); }}
                className="flex-1 min-w-[10rem] h-8 bg-secondary border border-border rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring"
              />
            </div>

            {/* Row 2: Work Type · Customer · Hours · OKR · Add */}
            <div className="flex gap-1.5 flex-wrap">
              {/* Work Type */}
              <select
                value={newTask.workType}
                onChange={e => setNewTask(prev => ({ ...prev, workType: e.target.value }))}
                className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring w-28"
              >
                {WORK_TYPES.map(wt => (
                  <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
                ))}
              </select>

              {/* Customer */}
              <select
                value={newTask.customerId}
                onChange={e => setNewTask(prev => ({ ...prev, customerId: e.target.value }))}
                className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring max-w-[8rem]"
              >
                <option value="">No client</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Hours */}
              <select
                value={newTask.hours}
                onChange={e => setNewTask(prev => ({ ...prev, hours: Number(e.target.value) }))}
                className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring w-20"
              >
                {HOUR_OPTIONS.map(h => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>

              {/* OKR (only if OKRs exist) */}
              {okrs.length > 0 && (
                <select
                  value={newTask.okrId}
                  onChange={e => setNewTask(prev => ({ ...prev, okrId: e.target.value }))}
                  className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring max-w-[8rem]"
                >
                  <option value="">OKR...</option>
                  {okrs.map(o => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              )}

              {/* Add button */}
              <button
                onClick={addBudgetTask}
                disabled={!newTask.description.trim()}
                className="flex items-center gap-1 px-3 h-8 rounded-lg bg-brand-lavender/15 text-brand-lavender text-xs font-semibold hover:bg-brand-lavender/25 disabled:opacity-40 transition-all"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {/* Task list */}
            <div className="space-y-1.5 max-h-[20rem] overflow-y-auto">
              {budgetTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No tasks added yet. Add time blocks for focus work, client tasks, or admin.
                </p>
              )}

              {budgetTasks.map(t => {
                const customer = t.customerId ? customers.find(c => c.id === t.customerId) : null;
                const typeColor = t.workType ? WORK_TYPE_COLORS[t.workType] : null;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Work type badge */}
                        {t.workType && typeColor && (
                          <span className={`inline-flex items-center rounded-full text-[9px] font-semibold px-1.5 py-0.5 border ${typeColor.bg} ${typeColor.text} ${typeColor.border}`}>
                            {WORK_TYPE_LABELS[t.workType] || t.workType}
                          </span>
                        )}
                        <p className="text-xs font-medium text-foreground leading-snug">{t.description}</p>
                      </div>
                      {/* Sub-line: customer */}
                      {customer && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{customer.name}</span>
                        </div>
                      )}
                    </div>
                    <select
                      value={t.hours}
                      onChange={e => updateBudgetTaskHours(t.id, Number(e.target.value))}
                      className="h-6 bg-secondary border border-border rounded-lg px-1 text-[11px] text-foreground focus:outline-none focus:border-ring w-16"
                    >
                      {HOUR_OPTIONS.map(h => (
                        <option key={h} value={h}>{h}h</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeBudgetTask(t.id)}
                      className="p-1 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}
