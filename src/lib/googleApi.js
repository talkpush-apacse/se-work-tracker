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
  if (!res.ok) {
    const err = new Error(res.status === 401
      ? 'Session expired. Please reconnect Google Calendar in Integrations.'
      : `Calendar API ${res.status}`);
    err.status = res.status;
    throw err;
  }
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

/**
 * Fetch received Gmail messages for a date range (subject + sender, metadata only).
 * Used by WeeklyReport to capture client escalations and documentation.
 * @param {string} token - Google OAuth access token
 * @param {Date} start - Range start
 * @param {Date} end - Range end
 * @returns {Promise<Array<{ id: string, subject: string, from: string, date: string }>>}
 */
export async function fetchGmailInbox(token, start, end) {
  const after  = format(start, 'yyyy/MM/dd');
  const before = format(end,   'yyyy/MM/dd');
  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q',          `in:inbox after:${after} before:${before}`);
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
    mUrl.searchParams.set('metadataHeaders', 'Subject,From,Date');
    const mr = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!mr.ok) return null;
    const md = await mr.json();
    const headers = md.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const from    = headers.find(h => h.name === 'From')?.value || '';
    const date    = headers.find(h => h.name === 'Date')?.value || '';
    return { id: m.id, subject, from, date };
  }));

  return details.filter(Boolean);
}

// ─── Gmail Full-Body Helpers (used by CalendarEmailImport) ──────────────────

/** Decode Gmail's URL-safe base64 encoding to UTF-8 text */
function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    // Fallback for non-UTF8 content
    return atob(base64);
  }
}

/** Naive HTML tag stripper for fallback body extraction */
function stripHtmlTags(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recursively extract plain-text body from a Gmail MIME payload.
 * Handles multipart/alternative, multipart/mixed, and single-part messages.
 */
function extractPlainTextBody(payload) {
  // Single-part text/plain
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    // First pass: look for text/plain at this level
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Second pass: recurse into multipart children
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/')) {
        const found = extractPlainTextBody(part);
        if (found) return found;
      }
    }
    // Third pass: fallback to text/html, strip tags
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtmlTags(decodeBase64Url(part.body.data));
      }
    }
  }

  return '';
}

const BODY_TRUNCATE_LENGTH = 1200;

/**
 * Fetch Gmail messages with full body content — supports starred and/or sent.
 * @param {string} token - Gmail OAuth access token
 * @param {Date} start - Range start
 * @param {Date} end - Range end
 * @param {'sent' | 'starred' | 'both'} source - Which emails to fetch
 * @returns {Promise<Array<{ id: string, subject: string, to: string, from: string, date: string, body: string, starred: boolean }>>}
 */
export async function fetchGmailMessages(token, start, end, source = 'both') {
  const after  = format(start, 'yyyy/MM/dd');
  const before = format(end,   'yyyy/MM/dd');

  // Build query based on source
  let query;
  if (source === 'starred') {
    query = `is:starred after:${after} before:${before}`;
  } else if (source === 'sent') {
    query = `in:sent after:${after} before:${before}`;
  } else {
    query = `(in:sent OR is:starred) after:${after} before:${before}`;
  }

  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q',          query);
  url.searchParams.set('maxResults', '30');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  const data = await res.json();
  const msgs = (data.messages || []).slice(0, 20);

  const details = await Promise.all(msgs.map(async (m) => {
    const mUrl = new URL(`https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}`);
    mUrl.searchParams.set('format', 'full');

    const mr = await fetch(mUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mr.ok) return null;
    const md = await mr.json();

    const headers = md.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const to      = headers.find(h => h.name === 'To')?.value || '';
    const from    = headers.find(h => h.name === 'From')?.value || '';
    const date    = headers.find(h => h.name === 'Date')?.value || '';

    // Extract and truncate body
    let body = extractPlainTextBody(md.payload || {});
    if (body.length > BODY_TRUNCATE_LENGTH) {
      body = body.slice(0, BODY_TRUNCATE_LENGTH) + '…';
    }

    // Check if starred via labelIds
    const starred = (md.labelIds || []).includes('STARRED');

    return { id: m.id, subject, to, from, date, body, starred };
  }));

  const results = details.filter(Boolean);

  // Sort: starred emails first, preserve API order within each group
  results.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  });

  return results;
}

// ─── Smart Email Filtering (for Weekly Report) ─────────────────────────────

/** Sender patterns to exclude from weekly report email activity */
const NOISE_SENDERS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /do-not-reply@/i,
  /notifications?@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /calendar-notification@google\.com/i,
  /calendar-server@google\.com/i,
  /drive-shares-dm-noreply@google\.com/i,
  /drive-shares-noreply@google\.com/i,
  /comments-noreply@docs\.google\.com/i,
  /comments-noreply@google\.com/i,
  /@teams\.microsoft\.com/i,
  /@notifications\.google\.com/i,
  /@docs\.google\.com/i,
];

/** Subject patterns to exclude from weekly report email activity */
const NOISE_SUBJECT_PATTERNS = [
  /^invitation:/i,
  /^accepted:/i,
  /^declined:/i,
  /^tentative:/i,
  /^updated invitation:/i,
  /^canceled event:/i,
  /^cancelled:/i,
  /has shared .* with you/i,
  /^out of office/i,
  /^automatic reply/i,
  /^auto:/i,
  /^auto-reply/i,
  /delivery status notification/i,
  /undeliverable/i,
  /^re:.*out of office/i,
];

/**
 * Returns true if the email should be excluded from weekly report processing.
 */
export function isNoiseEmail(email) {
  const from    = email.from || '';
  const subject = email.subject || '';

  if (NOISE_SENDERS.some(p => p.test(from))) return true;
  if (NOISE_SUBJECT_PATTERNS.some(p => p.test(subject))) return true;

  return false;
}

/**
 * Filter a list of emails, removing automated/system/noise emails.
 * Returns only human-to-human correspondence.
 */
export function filterRelevantEmails(emails) {
  return emails.filter(e => !isNoiseEmail(e));
}

/**
 * Fetch and filter Gmail messages for weekly report consumption.
 * Fetches both sent and inbox, applies noise filtering, returns
 * clean human-to-human correspondence with direction labels.
 */
export async function fetchFilteredWeeklyEmails(token, start, end) {
  const [sent, received] = await Promise.all([
    fetchGmailSent(token, start, end),
    fetchGmailInbox(token, start, end),
  ]);

  const allEmails = [
    ...sent.map(e => ({ ...e, direction: 'sent' })),
    ...received.map(e => ({ ...e, direction: 'received' })),
  ];

  return filterRelevantEmails(allEmails);
}

const WEEKLY_BODY_TRUNCATE = 500;

/**
 * Fetch ALL weekly emails (sent + received) with body content and noise tagging.
 * Returns every email — noise emails are tagged with `isNoise: true` instead of
 * being filtered out, so the UI can show toggleable include/exclude per email.
 *
 * @param {string} token - Gmail OAuth access token
 * @param {Date} start - Range start
 * @param {Date} end - Range end
 * @returns {Promise<Array<{ id, subject, from, to, date, body, direction, isNoise }>>}
 */
export async function fetchWeeklyEmailsWithBodies(token, start, end) {
  const after  = format(start, 'yyyy/MM/dd');
  const before = format(end,   'yyyy/MM/dd');

  // Fetch sent + inbox message IDs in parallel
  const [sentRes, inboxRes] = await Promise.all([
    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`in:sent after:${after} before:${before}`)}&maxResults=30`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : { messages: [] }),
    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`in:inbox after:${after} before:${before}`)}&maxResults=30`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : { messages: [] }),
  ]);

  const sentIds  = (sentRes.messages || []).slice(0, 20).map(m => ({ ...m, _dir: 'sent' }));
  const inboxIds = (inboxRes.messages || []).slice(0, 20).map(m => ({ ...m, _dir: 'received' }));

  // Deduplicate by id (an email can appear in both sent and inbox)
  const seen = new Set();
  const allIds = [];
  for (const item of [...sentIds, ...inboxIds]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      allIds.push(item);
    }
  }

  // Fetch full message details in parallel
  const results = await Promise.all(allIds.map(async ({ id, _dir }) => {
    try {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const md = await res.json();

      const headers = md.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const to      = headers.find(h => h.name === 'To')?.value || '';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value || '';

      let body = extractPlainTextBody(md.payload || {});
      if (body.length > WEEKLY_BODY_TRUNCATE) {
        body = body.slice(0, WEEKLY_BODY_TRUNCATE) + '…';
      }

      const email = { id, subject, from, to, date, body, direction: _dir };
      email.isNoise = isNoiseEmail(email);
      return email;
    } catch {
      return null;
    }
  }));

  return results.filter(Boolean);
}
