/**
 * CalendarEmailImport — collapsible panel for the Weekly Update Log section.
 * Fetches calendar events and emails (starred + sent), provides body-aware
 * AI executive summaries, and lets the user tag/promote items into the Weekly Update Log.
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Calendar, Mail, ChevronDown, ChevronUp, Loader2, AlertCircle,
  Sparkles, Check, X, Download, Pencil, Star,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { fetchCalendarEvents, fetchGmailMessages } from '../lib/googleApi';
import { WEEKLY_UPDATE_LOG_TYPES, WEEKLY_UPDATE_LOG_LABELS, WEEKLY_UPDATE_LOG_COLORS } from '../constants';

// Log types available for tagging (exclude 'neutral' — not useful for promoted items)
const TAG_TYPES = ['highlight', 'lowlight', 'learning', 'annotation', 'next-week-priority', 'skip'];
const TAG_LABELS = {
  highlight:            'Highlight',
  lowlight:             'Lowlight',
  learning:             'Learning',
  annotation:           'Annotation',
  'next-week-priority': 'Priority',
  skip:                 'Skip',
};
const TAG_COLORS = {
  ...WEEKLY_UPDATE_LOG_COLORS,
  skip: '#6b7280',
};

// System prompt for batch AI summaries (uses email body content for executive-quality output)
const SUMMARY_SYSTEM_PROMPT = `You are a concise summariser for a Solutions Engineer's work log. Given a list of calendar events and emails (with body content when available), produce a 1-2 sentence executive-summary-style plain text summary for each item. Focus on: what action was taken, what the outcome or next step is, and why it matters. Be specific and outcome-focused — avoid generic descriptions. Format your response as a JSON array of strings, one summary per input item, in the same order. Return ONLY the JSON array, no other text.`;


export default function CalendarEmailImport({ customers, addWeeklyUpdateLog, aiSettings }) {
  const { googleToken, gmailToken } = useGoogleAuth();

  // Panel open/closed
  const [isOpen, setIsOpen]     = useState(false);

  // Date range — defaults to current week (Sun–Sat)
  const [dateFrom, setDateFrom] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo]     = useState(() => format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));

  // Email source filter: starred, sent, or both (starred shown first)
  const [emailSource, setEmailSource] = useState('both');

  // Fetched data
  const [events, setEvents]     = useState([]);
  const [emails, setEmails]     = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Unified items list (events + emails merged)
  const [items, setItems]       = useState([]);

  // AI summary state
  const [isSummarising, setIsSummarising] = useState(false);
  const [summaryError, setSummaryError]   = useState(null);

  // Per-item state: { [itemId]: { tag, customerId, summary, editing } }
  const [itemState, setItemState] = useState({});

  // Success message
  const [successMsg, setSuccessMsg] = useState('');

  // Customer name lookup for auto-matching
  const customerNames = useMemo(
    () => customers.map(c => ({ id: c.id, name: c.name, nameLower: c.name.toLowerCase() })),
    [customers]
  );

  /** Try to auto-match a customer by looking for their name in text */
  const autoMatchCustomer = useCallback((text) => {
    if (!text) return '';
    const lower = text.toLowerCase();
    const match = customerNames.find(c => lower.includes(c.nameLower));
    return match?.id || '';
  }, [customerNames]);

  /** Fetch calendar events and emails for the selected date range */
  const handleFetch = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    setItems([]);
    setItemState({});
    setSummaryError(null);

    // Use the user-selected date range
    const weekStart = new Date(dateFrom + 'T00:00:00');
    const weekEnd   = new Date(dateTo   + 'T23:59:59');

    const merged = [];

    try {
      // Fetch calendar events if token available
      if (googleToken) {
        try {
          const calEvents = await fetchCalendarEvents(googleToken, weekStart, weekEnd);
          calEvents.forEach(e => {
            const title = e.summary || '(no title)';
            const dt = e.start?.dateTime ? format(parseISO(e.start.dateTime), 'EEE MMM d, h:mm a') : '';
            merged.push({
              id:     `cal-${e.id}`,
              source: 'calendar',
              title,
              datetime: dt,
              rawDate: e.start?.dateTime || '',
              raw: e,
            });
          });
          setEvents(calEvents);
        } catch (err) {
          console.warn('Calendar fetch failed:', err.message);
          // Non-fatal — continue with emails
        }
      }

      // Fetch Gmail emails (starred and/or sent, with body content)
      if (gmailToken) {
        try {
          const emailResults = await fetchGmailMessages(gmailToken, weekStart, weekEnd, emailSource);
          emailResults.forEach(e => {
            merged.push({
              id:       `mail-${e.id}`,
              source:   'email',
              title:    e.subject || '(no subject)',
              datetime: e.date ? e.date : '',
              to:       e.to || '',
              from:     e.from || '',
              body:     e.body || '',
              starred:  e.starred || false,
              raw: e,
            });
          });
          setEmails(emailResults);
        } catch (err) {
          console.warn('Gmail fetch failed:', err.message);
        }
      }

      if (merged.length === 0 && !googleToken && !gmailToken) {
        setFetchError('connect');
      } else if (merged.length === 0) {
        setFetchError(`No events or emails found for ${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}.`);
      }

      setItems(merged);

      // Initialise per-item state with auto-matched customers
      const initial = {};
      merged.forEach(item => {
        const matchText = item.source === 'email' ? `${item.title} ${item.to} ${item.from}` : item.title;
        initial[item.id] = {
          tag:        'highlight',
          customerId: autoMatchCustomer(matchText),
          summary:    '',
          editing:    false,
        };
      });
      setItemState(initial);
      setHasFetched(true);
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch data.');
    } finally {
      setIsFetching(false);
    }
  }, [googleToken, gmailToken, autoMatchCustomer, dateFrom, dateTo, emailSource]);

  /** Batch AI-summarise all items */
  const handleSummarise = useCallback(async () => {
    if (items.length === 0) return;
    setIsSummarising(true);
    setSummaryError(null);

    // Build input list for AI — include email body content for richer summaries
    const inputList = items.map(item => {
      if (item.source === 'calendar') {
        return `[Calendar] ${item.title}${item.datetime ? ` (${item.datetime})` : ''}`;
      }
      // Email — include body snippet for executive-quality summaries
      const parts = [`[Email] Subject: ${item.title}`];
      if (item.to) parts.push(`To: ${item.to}`);
      const bodySnippet = item.body ? item.body.slice(0, 800) : '';
      if (bodySnippet) parts.push(`Body: ${bodySnippet}`);
      return parts.join(' | ');
    });

    const userContent = `Summarise each of these ${inputList.length} work items in 1-2 sentences:\n\n${inputList.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

    try {
      let output = '';
      const provider = aiSettings?.providers?.knowledge || aiSettings?.providers?.weeklyEmail || 'claude';

      if (provider === 'claude') {
        const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set');

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':            'application/json',
            'x-api-key':               apiKey,
            'anthropic-version':       '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model:      aiSettings?.claudeModel || 'claude-sonnet-4-6',
            max_tokens: 2000,
            system:     SUMMARY_SYSTEM_PROMPT,
            messages:   [{ role: 'user', content: userContent }],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `Claude API error ${res.status}`);
        }
        const data = await res.json();
        output = data.content?.[0]?.text || '';
      } else {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not set');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model:       aiSettings?.openaiModel || 'gpt-4o',
            temperature: 0.5,
            messages: [
              { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
              { role: 'user',   content: userContent },
            ],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `OpenAI API error ${res.status}`);
        }
        const data = await res.json();
        output = data.choices?.[0]?.message?.content || '';
      }

      // Parse the JSON array from AI output
      let summaries = [];
      try {
        // Extract JSON array from response (handle markdown code blocks)
        const jsonMatch = output.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          summaries = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback: use raw title as summary if parsing fails
        console.warn('Failed to parse AI summaries, using titles as fallback');
        summaries = items.map(i => i.title);
      }

      // Apply summaries to item state
      setItemState(prev => {
        const next = { ...prev };
        items.forEach((item, i) => {
          if (next[item.id]) {
            next[item.id] = { ...next[item.id], summary: summaries[i] || item.title };
          }
        });
        return next;
      });
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      setIsSummarising(false);
    }
  }, [items, aiSettings]);

  /** Update a single item's state */
  const updateItem = useCallback((id, patch) => {
    setItemState(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }, []);

  /** Add a single item to the Weekly Update Log */
  const handleAddSingle = useCallback((item) => {
    const state = itemState[item.id];
    if (!state || state.tag === 'skip') return;

    const text = (state.summary || item.title).trim();
    if (!text) return;

    addWeeklyUpdateLog({
      type:       state.tag,
      text,
      customerId: state.customerId || undefined,
    });

    // Mark as added
    updateItem(item.id, { added: true });
  }, [itemState, addWeeklyUpdateLog, updateItem]);

  /** Bulk add all non-skipped, non-added items */
  const handleBulkAdd = useCallback(() => {
    let count = 0;
    items.forEach(item => {
      const state = itemState[item.id];
      if (!state || state.tag === 'skip' || state.added) return;

      const text = (state.summary || item.title).trim();
      if (!text) return;

      addWeeklyUpdateLog({
        type:       state.tag,
        text,
        customerId: state.customerId || undefined,
      });

      updateItem(item.id, { added: true });
      count++;
    });

    if (count > 0) {
      setSuccessMsg(`${count} item${count !== 1 ? 's' : ''} added to Weekly Log`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }, [items, itemState, addWeeklyUpdateLog, updateItem]);

  // Count tagged (non-skip, non-added) items
  const taggedCount = useMemo(
    () => items.filter(i => itemState[i.id] && itemState[i.id].tag !== 'skip' && !itemState[i.id]?.added).length,
    [items, itemState]
  );

  // Not connected state
  const isConnected = googleToken || gmailToken;

  return (
    <div className="mb-3">
      {/* Toggle button */}
      <button
        onClick={() => {
          setIsOpen(p => !p);
          // Auto-fetch on first open if connected
          if (!isOpen && isConnected && !hasFetched) {
            setTimeout(handleFetch, 100);
          }
        }}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-brand-lavender/30 transition-all"
      >
        <Download size={13} className="text-brand-lavender" />
        <span>Import from Calendar & Email</span>
        {taggedCount > 0 && (
          <span className="bg-brand-lavender/20 text-brand-lavender text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {taggedCount} tagged
          </span>
        )}
        <span className="ml-auto">
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className="mt-2 bg-card border border-border rounded-2xl overflow-hidden">
          {/* Not connected */}
          {!isConnected && (
            <div className="px-5 py-6 text-center">
              <AlertCircle size={24} className="text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Connect Google Calendar or Gmail in the <strong>Integrations</strong> tab to import events and emails.</p>
            </div>
          )}

          {/* Connected — show controls */}
          {isConnected && (
            <div className="px-4 py-3 space-y-3">
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Date range pickers */}
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-7 bg-secondary border border-border rounded-lg px-1.5 text-[11px] text-foreground focus:outline-none focus:border-ring"
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  To
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-7 bg-secondary border border-border rounded-lg px-1.5 text-[11px] text-foreground focus:outline-none focus:border-ring"
                  />
                </label>

                {/* Email source filter — only shown when Gmail is connected */}
                {gmailToken && (
                  <div className="flex flex-col gap-0.5">
                    <select
                      value={emailSource}
                      onChange={e => setEmailSource(e.target.value)}
                      className="h-7 bg-secondary border border-border rounded-lg px-1.5 text-[11px] text-foreground focus:outline-none focus:border-ring"
                    >
                      <option value="both">★ Starred + Sent</option>
                      <option value="starred">★ Starred Only</option>
                      <option value="sent">Sent Only</option>
                    </select>
                    <span className="text-[9px] text-muted-foreground/60 leading-tight">Tip: Star important received emails in Gmail to import them here</span>
                  </div>
                )}

                <button
                  onClick={handleFetch}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-40 transition-all"
                >
                  {isFetching ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {hasFetched ? 'Refresh' : 'Fetch'}
                </button>

                {items.length > 0 && (
                  <>
                    <button
                      onClick={handleSummarise}
                      disabled={isSummarising}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-lavender/15 text-brand-lavender text-xs font-semibold hover:bg-brand-lavender/25 disabled:opacity-40 transition-all"
                    >
                      {isSummarising ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      AI Summarise All
                    </button>

                    <button
                      onClick={handleBulkAdd}
                      disabled={taggedCount === 0}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-40 transition-all"
                    >
                      <Check size={12} />
                      Add All Tagged ({taggedCount})
                    </button>
                  </>
                )}
              </div>

              {/* Status messages */}
              {fetchError === 'connect' && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>Connect Google Calendar or Gmail in the Integrations tab first.</span>
                </div>
              )}
              {fetchError && fetchError !== 'connect' && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{fetchError}</span>
                </div>
              )}
              {summaryError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>AI summary failed: {summaryError}</span>
                  <button onClick={() => setSummaryError(null)} className="ml-auto text-red-400/60 hover:text-red-400"><X size={11} /></button>
                </div>
              )}
              {successMsg && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                  <Check size={13} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Loading */}
              {isFetching && (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Fetching calendar events and {emailSource === 'starred' ? 'starred' : emailSource === 'sent' ? 'sent' : 'starred & sent'} emails…</span>
                </div>
              )}

              {/* Items list */}
              {!isFetching && items.length > 0 && (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {items.map(item => {
                    const state = itemState[item.id] || { tag: 'highlight', customerId: '', summary: '', editing: false };
                    const isSkipped = state.tag === 'skip';
                    const isAdded = state.added;
                    const tagColor = TAG_COLORS[state.tag] || '#6b7280';

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border px-3 py-2.5 transition-all ${
                          isAdded
                            ? 'border-emerald-500/30 bg-emerald-500/5 opacity-60'
                            : isSkipped
                            ? 'border-border bg-secondary/30 opacity-50'
                            : 'border-border bg-card'
                        }`}
                      >
                        {/* Row 1: source icon + title + datetime */}
                        <div className="flex items-start gap-2 mb-2">
                          {/* Source icon — star indicator for starred emails */}
                          {item.source === 'calendar' ? (
                            <Calendar size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
                              <Mail size={13} className="text-purple-400" />
                              {item.starred && <Star size={11} className="text-amber-400 fill-amber-400" />}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground leading-snug">{item.title}</p>
                            {/* Show From for received emails, To for sent emails */}
                            {item.source === 'email' && item.from && !item.to && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">From: {item.from}</p>
                            )}
                            {item.source === 'email' && item.to && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">To: {item.to}</p>
                            )}
                            {item.datetime && item.source === 'calendar' && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{item.datetime}</p>
                            )}
                            {/* Body snippet preview for emails */}
                            {item.body && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                                {item.body.slice(0, 150)}{item.body.length > 150 ? '…' : ''}
                              </p>
                            )}
                          </div>

                          {/* Added badge */}
                          {isAdded && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 flex-shrink-0">
                              <Check size={11} /> Added
                            </span>
                          )}
                        </div>

                        {/* AI Summary (editable) */}
                        {state.summary && !isAdded && (
                          <div className="mb-2 ml-5">
                            {state.editing ? (
                              <div className="flex gap-1.5">
                                <textarea
                                  rows={2}
                                  value={state.summary}
                                  onChange={e => updateItem(item.id, { summary: e.target.value })}
                                  className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs resize-none text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                                  maxLength={300}
                                />
                                <button
                                  onClick={() => updateItem(item.id, { editing: false })}
                                  className="px-2 py-1 text-[10px] font-medium text-brand-lavender hover:text-brand-lavender/80 transition-colors self-end"
                                >
                                  Done
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5 group">
                                <p className="text-[11px] text-muted-foreground leading-relaxed italic flex-1">{state.summary}</p>
                                <button
                                  onClick={() => updateItem(item.id, { editing: true })}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all p-0.5 flex-shrink-0"
                                  title="Edit summary"
                                >
                                  <Pencil size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Row 2: Tag selector + Customer + Add button */}
                        {!isAdded && (
                          <div className="flex items-center gap-1.5 ml-5 flex-wrap">
                            {/* Tag pills */}
                            {TAG_TYPES.map(tag => {
                              const active = state.tag === tag;
                              const color = TAG_COLORS[tag] || '#6b7280';
                              return (
                                <button
                                  key={tag}
                                  onClick={() => updateItem(item.id, { tag })}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all"
                                  style={active ? {
                                    backgroundColor: color + '25',
                                    color: color,
                                    borderColor: color + '60',
                                  } : {
                                    borderColor: 'var(--border)',
                                    color: 'var(--muted-foreground)',
                                    backgroundColor: 'transparent',
                                  }}
                                >
                                  {TAG_LABELS[tag]}
                                </button>
                              );
                            })}

                            {/* Customer dropdown */}
                            {!isSkipped && (
                              <select
                                value={state.customerId}
                                onChange={e => updateItem(item.id, { customerId: e.target.value })}
                                className="h-6 bg-secondary border border-border rounded-lg px-1.5 text-[10px] text-foreground focus:outline-none focus:border-ring ml-auto max-w-[8rem]"
                              >
                                <option value="">No client</option>
                                {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}

                            {/* Add button */}
                            {!isSkipped && (
                              <button
                                onClick={() => handleAddSingle(item)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/25 transition-all"
                              >
                                <Check size={10} /> Add
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state after fetch */}
              {!isFetching && hasFetched && items.length === 0 && !fetchError && (
                <div className="py-6 text-center">
                  <Calendar size={20} className="text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No events or emails found for {dateFrom && dateTo ? `${format(new Date(dateFrom + 'T00:00:00'), 'MMM d')} – ${format(new Date(dateTo + 'T00:00:00'), 'MMM d')}` : 'the selected dates'}.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
