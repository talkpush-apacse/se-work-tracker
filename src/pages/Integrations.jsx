import { useState, useMemo, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { useAppStore } from '../context/StoreContext';
import { AUTO_TRACK_RATE } from '../constants';
import { Calendar, LogIn, LogOut, RefreshCw, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format, subDays, parseISO } from 'date-fns';

function toDateInput(d) {
  return format(d, 'yyyy-MM-dd');
}

function calcDurationHours(event) {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const ms = new Date(event.end.dateTime) - new Date(event.start.dateTime);
  return Math.round((ms / 3600000) * 100) / 100;
}

const HAS_CLIENT_ID = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Integrations() {
  const { googleToken, setGoogleToken, logout } = useGoogleAuth();
  const { customers, addPoint } = useAppStore();

  const [dateFrom, setDateFrom] = useState(toDateInput(subDays(new Date(), 7)));
  const [dateTo, setDateTo]     = useState(toDateInput(new Date()));
  const [events, setEvents]     = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [assignments, setAssignments] = useState({}); // eventId → customerId
  const [checked, setChecked]         = useState({}); // eventId → bool
  const [logged, setLogged]           = useState(new Set());
  const [successMsg, setSuccessMsg]   = useState('');

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  );

  const login = useGoogleLogin({
    onSuccess: (res) => setGoogleToken(res.access_token),
    onError:   ()    => setFetchError('Google login failed. Please try again.'),
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
  });

  const fetchEvents = useCallback(async () => {
    if (!googleToken) return;
    setFetching(true);
    setFetchError('');
    setEvents([]);
    try {
      const timeMin = new Date(dateFrom + 'T00:00:00').toISOString();
      const timeMax = new Date(dateTo   + 'T23:59:59').toISOString();
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('timeMin',       timeMin);
      url.searchParams.set('timeMax',       timeMax);
      url.searchParams.set('singleEvents',  'true');
      url.searchParams.set('orderBy',       'startTime');
      url.searchParams.set('maxResults',    '250');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${googleToken}` },
      });

      if (res.status === 401) {
        logout();
        setFetchError('Session expired. Please reconnect Google Calendar.');
        return;
      }
      if (!res.ok) throw new Error(`Google API error ${res.status}`);

      const data  = await res.json();
      // Only keep timed events (skip all-day events which have no dateTime)
      const items = (data.items || []).filter(
        e => e.status !== 'cancelled' && e.start?.dateTime
      );
      setEvents(items);

      // Default all to checked, no customer assigned yet
      const initChecked = {};
      items.forEach(e => { initChecked[e.id] = true; });
      setChecked(initChecked);
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch calendar events.');
    } finally {
      setFetching(false);
    }
  }, [googleToken, dateFrom, dateTo, logout]);

  // Hide events already logged this session
  const visibleEvents = useMemo(
    () => events.filter(e => !logged.has(e.id)),
    [events, logged]
  );

  // Count events that are checked AND have a customer assigned
  const readyToLog = useMemo(
    () => visibleEvents.filter(e => checked[e.id] && assignments[e.id]),
    [visibleEvents, checked, assignments]
  );

  const handleLog = () => {
    if (!readyToLog.length) return;

    readyToLog.forEach(event => {
      const hours = calcDurationHours(event);
      if (!hours) return;
      const points = Math.round(hours * AUTO_TRACK_RATE * 100) / 100;
      addPoint({
        customerId:   assignments[event.id],
        points,
        hours,
        activityType: 'Joining Meeting',
        comment:      `${event.summary || 'Calendar event'} (from Google Calendar)`,
      });
    });

    setLogged(prev => {
      const next = new Set(prev);
      readyToLog.forEach(e => next.add(e.id));
      return next;
    });

    const n = readyToLog.length;
    setSuccessMsg(`${n} event${n !== 1 ? 's' : ''} logged successfully.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const allChecked = visibleEvents.length > 0 && visibleEvents.every(e => checked[e.id]);

  const toggleAll = (val) => {
    const next = {};
    visibleEvents.forEach(e => { next[e.id] = val; });
    setChecked(prev => ({ ...prev, ...next }));
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Connect external services to auto-log activity.</p>
      </div>

      {/* Google Calendar card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Calendar size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Google Calendar</p>
              <p className="text-xs text-muted-foreground">
                {googleToken ? 'Connected — fetch events to log time' : 'Not connected'}
              </p>
            </div>
          </div>
          {googleToken ? (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={13} />
              Disconnect
            </button>
          ) : (
            <Button size="sm" onClick={() => login()} disabled={!HAS_CLIENT_ID}>
              <LogIn size={14} className="mr-1.5" />
              Connect
            </Button>
          )}
        </div>

        {/* Setup warning — shown when no client ID is configured */}
        {!HAS_CLIENT_ID && (
          <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <strong>Setup required:</strong> Add{' '}
              <code className="bg-amber-500/10 px-1 rounded font-mono">VITE_GOOGLE_CLIENT_ID</code>{' '}
              to your Vercel environment variables, then redeploy.
            </p>
          </div>
        )}

        {/* Not connected CTA (only when client ID exists) */}
        {!googleToken && HAS_CLIENT_ID && (
          <div className="px-5 py-10 text-center">
            <Calendar size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Connect your Google Calendar to review recent meetings and auto-log them as customer activity.
            </p>
            <Button onClick={() => login()} size="sm">
              <LogIn size={14} className="mr-1.5" />
              Connect Google Calendar
            </Button>
          </div>
        )}

        {/* Connected state — date picker + events table */}
        {googleToken && (
          <div className="p-5 space-y-4">

            {/* Date range + fetch button */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={fetchEvents}
                disabled={fetching}
                className="flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
                {fetching ? 'Fetching…' : 'Fetch Events'}
              </Button>
            </div>

            {/* Error */}
            {fetchError && (
              <p className="text-sm text-destructive">{fetchError}</p>
            )}

            {/* Success toast */}
            {successMsg && (
              <div className="flex items-center gap-2 text-sm text-brand-sage bg-brand-sage/10 border border-brand-sage/20 rounded-xl px-4 py-2.5">
                <Check size={14} />
                {successMsg}
              </div>
            )}

            {/* Empty hint before first fetch */}
            {!fetching && events.length === 0 && !fetchError && (
              <p className="text-sm text-muted-foreground">
                Select a date range and click <strong>Fetch Events</strong> to see your Google Calendar events.
              </p>
            )}

            {/* All logged */}
            {!fetching && events.length > 0 && visibleEvents.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                All fetched events have been logged.
              </div>
            )}

            {/* Events table */}
            {visibleEvents.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40">
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={e => toggleAll(e.target.checked)}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Event</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Duration</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Points</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[160px]">Customer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents.map((event, idx) => {
                        const hours = calcDurationHours(event);
                        const pts   = hours ? Math.round(hours * AUTO_TRACK_RATE * 100) / 100 : 0;
                        const date  = event.start.dateTime
                          ? format(parseISO(event.start.dateTime), 'MMM d, EEE')
                          : event.start.date;
                        const isChecked = checked[event.id] ?? true;
                        return (
                          <tr
                            key={event.id}
                            className={`border-b border-border/50 last:border-b-0 transition-opacity ${
                              idx % 2 !== 0 ? 'bg-secondary/20' : ''
                            } ${!isChecked ? 'opacity-40' : ''}`}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => setChecked(prev => ({ ...prev, [event.id]: e.target.checked }))}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-2.5 font-medium text-foreground max-w-[200px] truncate">
                              {event.summary || '(no title)'}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{date}</td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                              {hours ? `${hours}h` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-brand-lavender font-semibold whitespace-nowrap">
                              {pts ? `${pts} pt` : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={assignments[event.id] || ''}
                                onChange={e => setAssignments(prev => ({ ...prev, [event.id]: e.target.value }))}
                                className="w-full h-8 bg-card border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                              >
                                <option value="">— Skip —</option>
                                {sortedCustomers.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer: count + log button */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {readyToLog.length > 0
                      ? `${readyToLog.length} event${readyToLog.length !== 1 ? 's' : ''} ready to log`
                      : 'Assign a customer to log events'}
                    {visibleEvents.length - readyToLog.length > 0 && readyToLog.length > 0
                      ? ` · ${visibleEvents.length - readyToLog.length} unassigned/skipped`
                      : ''}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleLog}
                    disabled={readyToLog.length === 0}
                  >
                    <Check size={13} className="mr-1.5" />
                    Log {readyToLog.length > 0 ? readyToLog.length : ''} Event{readyToLog.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
