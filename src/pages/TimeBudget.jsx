/**
 * TimeBudget — YNAB-style weekly hour budget.
 * Budget 40 hours/week across auto-fetched meetings and manually added tasks.
 * Helps provide realistic timelines for requests from stakeholders.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Clock, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Loader2,
  AlertCircle, Settings, Check, X, CheckSquare, Square, Timer, User,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, differenceInMinutes } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { fetchCalendarEvents } from '../lib/googleApi';

// Default budget hours
const DEFAULT_BUDGET = 40;

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
  };
}

export default function TimeBudget() {
  const { customers, tasks: triageTasks, points, getTimeBudget, upsertTimeBudget } = useAppStore();
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

  // New task form
  const [newTask, setNewTask] = useState({ description: '', hours: 1, customerId: '', taskId: '' });

  // Re-load from store when week changes
  useEffect(() => {
    const budget = getTimeBudget(weekKey);
    setTotalBudgetHours(budget?.totalBudgetHours ?? DEFAULT_BUDGET);
    setMeetings(budget?.meetings ?? []);
    setBudgetTasks(budget?.tasks ?? []);
    setHasFetched(!!budget?.meetings?.length);
  }, [weekKey, getTimeBudget]);

  // Auto-save to store whenever meetings/tasks/budget change
  useEffect(() => {
    upsertTimeBudget(weekKey, {
      totalBudgetHours,
      meetings,
      tasks: budgetTasks,
    });
  }, [weekKey, totalBudgetHours, meetings, budgetTasks, upsertTimeBudget]);

  // Fetch meetings from Google Calendar
  const handleFetchMeetings = useCallback(async () => {
    if (!googleToken) return;
    setIsFetching(true);
    setFetchError(null);
    try {
      const events = await fetchCalendarEvents(googleToken, weekStart, weekEnd);
      const meetingsList = events.map(eventToMeeting);
      // Preserve include/exclude state for events already in the list
      setMeetings(prev => {
        const prevMap = new Map(prev.map(m => [m.calendarEventId, m]));
        return meetingsList.map(m => ({
          ...m,
          included: prevMap.has(m.calendarEventId) ? prevMap.get(m.calendarEventId).included : true,
        }));
      });
      setHasFetched(true);
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

  // Task CRUD
  const addBudgetTask = useCallback(() => {
    if (!newTask.description.trim()) return;
    setBudgetTasks(prev => [...prev, {
      id: crypto.randomUUID(),
      description: newTask.description.trim(),
      hours: newTask.hours,
      customerId: newTask.customerId || undefined,
      taskId: newTask.taskId || undefined,
    }]);
    setNewTask({ description: '', hours: 1, customerId: '', taskId: '' });
  }, [newTask]);

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
    () => Math.round(weeklyLoggedSessions.reduce((sum, s) => sum + (s.hours || 0), 0) * 100) / 100,
    [weeklyLoggedSessions]
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

  // Active triage tasks for linking
  const activeTasks = useMemo(
    () => triageTasks.filter(t => t.status !== 'archived' && t.status !== 'done'),
    [triageTasks]
  );

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
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-snug truncate">{description}</p>
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
                    <span className="text-xs font-semibold text-foreground flex-shrink-0">
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
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar size={14} className="text-blue-400" />
              Meetings
              <span className="text-xs font-normal text-muted-foreground">({meetingHours}h)</span>
            </h2>
            <button
              onClick={handleFetchMeetings}
              disabled={isFetching || !googleToken}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[11px] font-medium text-foreground hover:bg-secondary/80 disabled:opacity-40 transition-all"
            >
              {isFetching ? <Loader2 size={11} className="animate-spin" /> : <Calendar size={11} />}
              {hasFetched ? 'Refresh' : 'Fetch'}
            </button>
          </div>

          <div className="px-4 py-3 space-y-1.5 max-h-[24rem] overflow-y-auto">
            {!googleToken && (
              <div className="flex items-center gap-2 px-3 py-4 text-center">
                <AlertCircle size={14} className="text-muted-foreground/50 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Connect Google Calendar in Integrations to auto-fetch meetings.</p>
              </div>
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
                  <p className="text-[10px] text-muted-foreground">{m.day}{m.startTime ? ` · ${m.startTime}` : ''}</p>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${m.included ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {m.durationHours}h
                </span>
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
            {/* Add task form */}
            <div className="flex gap-1.5 flex-wrap">
              <input
                type="text"
                placeholder="Task description..."
                value={newTask.description}
                onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addBudgetTask(); }}
                className="flex-1 min-w-[10rem] h-8 bg-secondary border border-border rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring"
              />
              <select
                value={newTask.hours}
                onChange={e => setNewTask(prev => ({ ...prev, hours: Number(e.target.value) }))}
                className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring w-20"
              >
                {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8].map(h => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
              <select
                value={newTask.customerId}
                onChange={e => setNewTask(prev => ({ ...prev, customerId: e.target.value }))}
                className="h-8 bg-secondary border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:border-ring max-w-[8rem]"
              >
                <option value="">No client</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-snug">{t.description}</p>
                      {customer && (
                        <p className="text-[10px] text-muted-foreground">{customer.name}</p>
                      )}
                    </div>
                    <select
                      value={t.hours}
                      onChange={e => updateBudgetTaskHours(t.id, Number(e.target.value))}
                      className="h-6 bg-secondary border border-border rounded-lg px-1 text-[11px] text-foreground focus:outline-none focus:border-ring w-16"
                    >
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8].map(h => (
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
    </div>
  );
}
