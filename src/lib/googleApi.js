/**
 * Shared Google Calendar & Gmail API fetch helpers.
 * Used by both WeeklyReport.jsx and CalendarEmailImport.jsx.
 */
import { format } from 'date-fns';

/**
 * Fetch calendar events for a date range.
 * @param {string} token - Google OAuth access token
 * @param {Date} start - Range start
 * @param {Date} end - Range end
 * @returns {Promise<Array>} Array of Google Calendar event objects (timed events only)
 */
export async function fetchCalendarEvents(token, start, end) {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin',      start.toISOString());
  url.searchParams.set('timeMax',      end.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy',      'startTime');
  url.searchParams.set('maxResults',   '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data.items || []).filter(e => e.status !== 'cancelled' && e.start?.dateTime);
}

/**
 * Fetch sent Gmail messages for a date range (subject + recipients).
 * @param {string} token - Google OAuth access token
 * @param {Date} start - Range start
 * @param {Date} end - Range end
 * @returns {Promise<Array<{ id: string, subject: string, to: string }>>}
 */
export async function fetchGmailSent(token, start, end) {
  const after  = format(start, 'yyyy/MM/dd');
  const before = format(end,   'yyyy/MM/dd');
  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q',          `in:sent after:${after} before:${before}`);
  url.searchParams.set('maxResults', '30');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  const data = await res.json();
  const msgs = (data.messages || []).slice(0, 15);

  const details = await Promise.all(msgs.map(async (m) => {
    const mUrl = new URL(`https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}`);
    mUrl.searchParams.set('format',          'METADATA');
    mUrl.searchParams.set('metadataHeaders', 'Subject,To,Date');
    const mr = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!mr.ok) return null;
    const md = await mr.json();
    const headers = md.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const to      = headers.find(h => h.name === 'To')?.value || '';
    const date    = headers.find(h => h.name === 'Date')?.value || '';
    return { id: m.id, subject, to, date };
  }));

  return details.filter(Boolean);
}
