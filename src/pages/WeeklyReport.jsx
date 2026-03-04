import { useState, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Copy, Check, Save, Trash2,
  Loader2, ChevronDown, ChevronUp, Mail, RefreshCw, RotateCcw,
} from 'lucide-react';
import { format, addWeeks, parseISO } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { getThisWeekRange, filterPointsByRange, isInRange } from '../utils/dateHelpers';
import { WEEKLY_REPORT_DEFAULT_PROMPT, WEEKLY_UPDATE_LOG_COLORS, WEEKLY_UPDATE_LOG_LABELS } from '../constants';
import { Button } from '../components/ui/button';
import ConfirmDialog from '../components/ConfirmDialog';

// ─── Module-level helpers ─────────────────────────────────────────────────────

function getWeekRangeForOffset(offset) {
  const base = getThisWeekRange();
  return {
    weekStart: addWeeks(base.start, offset),
    weekEnd:   addWeeks(base.end,   offset),
  };
}

function formatWeekLabel(weekStart, weekEnd) {
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  if (sameMonth) {
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'd, yyyy')}`;
  }
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
}

function buildWeekContext({ weekStart, weekEnd, points, tasks, customers, okrs, annotations, weeklyUpdateLogs, calendarEvents, gmailEmails }) {
  const weekLabel = formatWeekLabel(weekStart, weekEnd);
  const lines = [];

  lines.push(`## Weekly Work Summary: ${weekLabel}`);
  lines.push('');

  // ── Overview ──
  const weekPoints = filterPointsByRange(points, weekStart, weekEnd);
  const totalPts = weekPoints.reduce((s, p) => s + (p.points || 0), 0);
  const totalHrs = Math.round(weekPoints.reduce((s, p) => s + (p.hours || 0), 0) * 100) / 100;
  const activeCustomerIds = [...new Set(weekPoints.map(p => p.customerId).filter(Boolean))];
  const weekTasks = tasks.filter(t => {
    if (!t.closedAt) return false;
    return isInRange(t.closedAt, weekStart, weekEnd);
  });

  lines.push('### Overview');
  lines.push(`- Total points logged: ${totalPts}`);
  lines.push(`- Total hours: ${totalHrs}h`);
  lines.push(`- Active customers: ${activeCustomerIds.length}`);
  lines.push(`- Tasks completed: ${weekTasks.filter(t => t.status === 'done').length}`);
  lines.push('');

  // ── Customer breakdown ──
  if (activeCustomerIds.length > 0) {
    lines.push('### Customer Breakdown');
    const customerMap = new Map(customers.map(c => [c.id, c]));

    activeCustomerIds.forEach(cid => {
      const customer = customerMap.get(cid);
      if (!customer) return;
      const cPoints = weekPoints.filter(p => p.customerId === cid);
      const cPts = cPoints.reduce((s, p) => s + (p.points || 0), 0);
      const cHrs = Math.round(cPoints.reduce((s, p) => s + (p.hours || 0), 0) * 100) / 100;
      lines.push(`\n**${customer.name}** — ${cPts} pts / ${cHrs}h`);
      cPoints.forEach(p => {
        if (p.comment) lines.push(`  - ${p.comment}${p.activityType ? ` [${p.activityType}]` : ''}`);
      });
    });
    lines.push('');
  }

  // ── Tasks this week ──
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  if (weekTasks.length > 0 || inProgressTasks.length > 0 || blockedTasks.length > 0) {
    lines.push('### Tasks This Week');
    if (weekTasks.filter(t => t.status === 'done').length > 0) {
      lines.push('**Completed:**');
      weekTasks.filter(t => t.status === 'done').forEach(t => {
        const cName = customerMap.get(t.customerId)?.name || 'General';
        lines.push(`  - [${cName}] ${t.description}`);
      });
    }
    if (inProgressTasks.length > 0) {
      lines.push('**In Progress:**');
      inProgressTasks.slice(0, 10).forEach(t => {
        const cName = customerMap.get(t.customerId)?.name || 'General';
        lines.push(`  - [${cName}] ${t.description}`);
      });
    }
    if (blockedTasks.length > 0) {
      lines.push('**Blocked:**');
      blockedTasks.forEach(t => {
        const cName = customerMap.get(t.customerId)?.name || 'General';
        lines.push(`  - [${cName}] ${t.description}`);
      });
    }
    lines.push('');
  }

  // ── OKR progress ──
  const weekTaskOkrIds = new Set(weekTasks.map(t => t.okrId).filter(Boolean));
  const relevantOkrs = okrs.filter(o => weekTaskOkrIds.has(o.id));
  if (relevantOkrs.length > 0) {
    lines.push('### OKR Progress');
    relevantOkrs.forEach(o => {
      lines.push(`  - ${o.title}${o.quarter ? ` [${o.quarter}]` : ''}`);
    });
    lines.push('');
  }

  // ── Wins & learnings ──
  const weekAnnotations = annotations.filter(a => {
    try {
      return isInRange(parseISO(a.date + 'T00:00:00'), weekStart, weekEnd);
    } catch { return false; }
  });
  if (weekAnnotations.length > 0) {
    lines.push('### Wins & Learnings');
    weekAnnotations.forEach(a => {
      const prefix = a.tag === 'good' ? '✓' : a.tag === 'bad' ? '✗' : '→';
      const cName = customerMap.get(a.customerId)?.name;
      lines.push(`  - ${prefix}${cName ? ` [${cName}]` : ''} ${a.text}`);
    });
    lines.push('');
  }

  // ── Weekly Highlights & Lowlights ──
  const weekLogs = (weeklyUpdateLogs || []).filter(l => {
    try { return isInRange(parseISO(l.date + 'T00:00:00'), weekStart, weekEnd); }
    catch { return false; }
  });
  if (weekLogs.length > 0) {
    const highlights = weekLogs.filter(l => l.type === 'highlight');
    const lowlights  = weekLogs.filter(l => l.type === 'lowlight');
    lines.push('### Weekly Highlights & Lowlights');
    if (highlights.length > 0) {
      lines.push('**Highlights:**');
      highlights.forEach(l => {
        const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
        lines.push(`  - ${l.text}${cName ? ` [${cName}]` : ''}`);
      });
    }
    if (lowlights.length > 0) {
      lines.push('**Lowlights / Challenges:**');
      lowlights.forEach(l => {
        const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
        lines.push(`  - ${l.text}${cName ? ` [${cName}]` : ''}`);
      });
    }
    lines.push('');
  }

  // ── Calendar meetings ──
  if (calendarEvents && calendarEvents.length > 0) {
    lines.push('### Calendar Meetings');
    calendarEvents.forEach(e => {
      const start = e.start?.dateTime ? format(parseISO(e.start.dateTime), 'EEE MMM d, h:mm a') : '';
      lines.push(`  - ${e.summary || '(no title)'}${start ? ` — ${start}` : ''}`);
    });
    lines.push('');
  }

  // ── Emails sent ──
  if (gmailEmails && gmailEmails.length > 0) {
    lines.push('### Emails Sent This Week');
    gmailEmails.forEach(e => {
      lines.push(`  - ${e.subject || '(no subject)'}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

async function fetchCalendarEvents(googleToken, weekStart, weekEnd) {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin',      weekStart.toISOString());
  url.searchParams.set('timeMax',      weekEnd.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy',      'startTime');
  url.searchParams.set('maxResults',   '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data.items || []).filter(e => e.status !== 'cancelled' && e.start?.dateTime);
}

async function fetchGmailSent(gmailToken, weekStart, weekEnd) {
  const after  = format(weekStart, 'yyyy/MM/dd');
  const before = format(weekEnd,   'yyyy/MM/dd');
  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q',          `in:sent after:${after} before:${before}`);
  url.searchParams.set('maxResults', '30');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${gmailToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  const data = await res.json();
  const msgs = (data.messages || []).slice(0, 10);

  const details = await Promise.all(msgs.map(async (m) => {
    const mUrl = new URL(`https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}`);
    mUrl.searchParams.set('format',          'METADATA');
    mUrl.searchParams.set('metadataHeaders', 'Subject');
    const mr = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${gmailToken}` } });
    if (!mr.ok) return null;
    const md = await mr.json();
    const subjectHeader = (md.payload?.headers || []).find(h => h.name === 'Subject');
    return { subject: subjectHeader?.value || '(no subject)' };
  }));

  return details.filter(Boolean);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyReport({ onNavigate }) {
  const {
    points, tasks, customers, okrs, annotations, weeklyUpdateLogs,
    weeklyReports, addWeeklyReport, deleteWeeklyReport,
    aiSettings, updateAiSettings,
  } = useAppStore();
  const { googleToken, gmailToken } = useGoogleAuth();

  const [weekOffset, setWeekOffset]   = useState(0);
  const [provider,   setProvider]     = useState(aiSettings.providers?.weeklyEmail || 'claude');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError]       = useState(null);
  const [emailText, setEmailText]     = useState('');
  const [copied, setCopied]           = useState(false);
  const [promptOpen, setPromptOpen]   = useState(false);
  const [localPrompt, setLocalPrompt] = useState('');
  const [promptSaved, setPromptSaved] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { weekStart, weekEnd } = useMemo(() => getWeekRangeForOffset(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => formatWeekLabel(weekStart, weekEnd), [weekStart, weekEnd]);
  const offsetLabel = weekOffset === 0 ? 'Current week' : weekOffset === -1 ? 'Last week' : `${Math.abs(weekOffset)} weeks ago`;

  // Stats for the selected week
  const weekPoints = useMemo(() => filterPointsByRange(points, weekStart, weekEnd), [points, weekStart, weekEnd]);
  const totalPts   = useMemo(() => weekPoints.reduce((s, p) => s + (p.points || 0), 0), [weekPoints]);
  const totalHrs   = useMemo(() => Math.round(weekPoints.reduce((s, p) => s + (p.hours || 0), 0) * 100) / 100, [weekPoints]);
  const activeCustomers = useMemo(() => new Set(weekPoints.map(p => p.customerId).filter(Boolean)).size, [weekPoints]);
  const doneTasks = useMemo(
    () => tasks.filter(t => t.status === 'done' && t.closedAt && isInRange(t.closedAt, weekStart, weekEnd)).length,
    [tasks, weekStart, weekEnd]
  );

  // Weekly update logs for the selected week
  const weekLogs = useMemo(
    () => (weeklyUpdateLogs || []).filter(l => {
      try { return isInRange(parseISO(l.date + 'T00:00:00'), weekStart, weekEnd); }
      catch { return false; }
    }),
    [weeklyUpdateLogs, weekStart, weekEnd]
  );

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGenError(null);

    let calendarEvents = null;
    let gmailEmails    = null;

    if (googleToken) {
      try { calendarEvents = await fetchCalendarEvents(googleToken, weekStart, weekEnd); }
      catch (e) { console.warn('[WeeklyReport] Calendar fetch failed:', e.message); }
    }

    if (gmailToken) {
      try { gmailEmails = await fetchGmailSent(gmailToken, weekStart, weekEnd); }
      catch (e) { console.warn('[WeeklyReport] Gmail fetch failed:', e.message); }
    }

    const context = buildWeekContext({
      weekStart, weekEnd, points, tasks, customers, okrs,
      annotations, weeklyUpdateLogs, calendarEvents, gmailEmails,
    });

    const systemPrompt = localPrompt.trim() || aiSettings.prompts?.weeklyEmail?.trim() || WEEKLY_REPORT_DEFAULT_PROMPT;

    try {
      let output = '';

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
            model:      aiSettings.claudeModel || 'claude-sonnet-4-6',
            max_tokens: 1500,
            system:     systemPrompt,
            messages:   [{ role: 'user', content: context }],
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
            model:       aiSettings.openaiModel || 'gpt-4o',
            temperature: 0.7,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: context },
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

      setEmailText(output);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setIsGenerating(false);
    }
  }, [provider, weekStart, weekEnd, points, tasks, customers, okrs, annotations, weeklyUpdateLogs, googleToken, gmailToken, localPrompt, aiSettings]);

  const handleSave = useCallback(() => {
    const model = provider === 'claude'
      ? (aiSettings.claudeModel || 'claude-sonnet-4-6')
      : (aiSettings.openaiModel || 'gpt-4o');
    addWeeklyReport({
      weekStart:  weekStart.toISOString(),
      weekEnd:    weekEnd.toISOString(),
      emailText,
      provider,
      model,
      promptUsed: localPrompt.trim() || aiSettings.prompts?.weeklyEmail?.trim() || WEEKLY_REPORT_DEFAULT_PROMPT,
    });
  }, [emailText, weekStart, weekEnd, provider, localPrompt, aiSettings, addWeeklyReport]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(emailText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [emailText]);

  const handleSavePrompt = useCallback(() => {
    updateAiSettings({ prompts: { weeklyEmail: localPrompt.trim() } });
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
  }, [localPrompt, updateAiSettings]);

  const handleResetPrompt = useCallback(() => {
    setLocalPrompt('');
    updateAiSettings({ prompts: { weeklyEmail: '' } });
  }, [updateAiSettings]);

  const handlePromptPanelToggle = useCallback(() => {
    if (!promptOpen) {
      // Populate from saved setting when opening
      setLocalPrompt(aiSettings.prompts?.weeklyEmail || '');
    }
    setPromptOpen(p => !p);
  }, [promptOpen, aiSettings]);

  // History — last 8 reports, newest first
  const sortedHistory = useMemo(
    () => [...weeklyReports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8),
    [weeklyReports]
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Weekly Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Summarize your week and generate a professional status email.
        </p>
      </div>

      {/* ── A: Week Picker ── */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-4">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Previous week"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center flex-1">
          <p className="text-sm font-semibold text-foreground">{weekLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{offsetLabel}</p>
        </div>

        <button
          onClick={() => setWeekOffset(o => o + 1)}
          disabled={weekOffset >= 0}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── B: Stats chips ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Points"    value={Number(totalPts).toFixed(1)} />
        <StatChip label="Hours"     value={`${totalHrs}h`} />
        <StatChip label="Customers" value={activeCustomers} />
        <StatChip label="Tasks Done" value={doneTasks} />
      </div>

      {/* Integration status chips */}
      <div className="flex flex-wrap gap-2">
        <IntegrationChip
          label="Google Calendar"
          connected={!!googleToken}
          onConnect={() => onNavigate('integrations')}
        />
        <IntegrationChip
          label="Gmail"
          connected={!!gmailToken}
          onConnect={() => onNavigate('integrations')}
        />
      </div>

      {/* ── B2: Weekly Highlights & Lowlights ── */}
      {weekLogs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Highlights &amp; Lowlights this week
            <span className="ml-2 text-xs font-normal text-muted-foreground">{weekLogs.length} logged</span>
          </h3>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {weekLogs.map(log => {
              const customer = log.customerId ? customers.find(c => c.id === log.customerId) : null;
              return (
                <div key={log.id} className="flex items-start gap-2">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: WEEKLY_UPDATE_LOG_COLORS[log.type] + '20',
                      color: WEEKLY_UPDATE_LOG_COLORS[log.type],
                    }}
                  >
                    {WEEKLY_UPDATE_LOG_LABELS[log.type]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-relaxed">{log.text}</p>
                    {customer && <p className="text-[10px] text-muted-foreground">{customer.name}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── C: Generate ── */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">AI Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div className="flex-1 flex items-end">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              {isGenerating
                ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                : <><Mail size={14} /> Generate Weekly Email</>
              }
            </Button>
          </div>
        </div>

        {genError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">{genError}</p>
        )}
      </div>

      {/* ── D: Output ── */}
      {emailText && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Generated Email</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check size={13} className="text-brand-sage" /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <Button size="sm" variant="secondary" onClick={handleSave} className="flex items-center gap-1.5">
                <Save size={13} />
                Save Report
              </Button>
            </div>
          </div>

          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            rows={16}
            className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-mono text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-y"
          />
          <p className="text-xs text-muted-foreground">You can edit the email above before saving or copying.</p>
        </div>
      )}

      {/* ── E: Prompt Settings ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          onClick={handlePromptPanelToggle}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">Prompt Settings</span>
          {promptOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {promptOpen && (
          <div className="px-5 pb-5 space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Customize the system prompt used to generate the email. Leave blank to use the built-in default.
            </p>
            <textarea
              value={localPrompt}
              onChange={e => setLocalPrompt(e.target.value)}
              rows={10}
              placeholder={WEEKLY_REPORT_DEFAULT_PROMPT}
              className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-y"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSavePrompt} className="flex items-center gap-1.5">
                {promptSaved ? <Check size={13} /> : <Save size={13} />}
                {promptSaved ? 'Saved!' : 'Save Prompt'}
              </Button>
              <button
                onClick={handleResetPrompt}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw size={13} />
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── F: History ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">
            Saved Reports {weeklyReports.length > 0 && <span className="text-muted-foreground font-normal">({weeklyReports.length})</span>}
          </span>
          {historyOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {historyOpen && (
          <div className="border-t border-border">
            {sortedHistory.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No saved reports yet. Generate and save your first weekly email above.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedHistory.map(r => {
                  const rStart = parseISO(r.weekStart);
                  const rEnd   = parseISO(r.weekEnd);
                  const label  = formatWeekLabel(rStart, rEnd);
                  const savedAt = format(parseISO(r.createdAt), 'MMM d, h:mm a');
                  const preview = (r.emailText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                  return (
                    <div key={r.id} className="px-5 py-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            Saved {savedAt} · {r.provider} · {r.model}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEmailText(r.emailText)}
                            className="text-xs text-brand-lavender hover:text-brand-lavender/80 transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => setDeleteTarget(r.id)}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {preview && (
                        <p className="text-xs text-muted-foreground/70 line-clamp-2">{preview}…</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Report"
          message="Are you sure you want to delete this saved report? This cannot be undone."
          onConfirm={() => { deleteWeeklyReport(deleteTarget); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function IntegrationChip({ label, connected, onConnect }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-brand-sage/10 text-brand-sage border border-brand-sage/20">
      <Check size={11} />
      {label} connected
    </span>
  ) : (
    <button
      onClick={onConnect}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground border border-border hover:text-foreground transition-colors"
    >
      {label} — connect in Integrations
    </button>
  );
}
