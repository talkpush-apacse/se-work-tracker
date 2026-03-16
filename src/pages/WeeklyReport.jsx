import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Copy, Check, Save, Trash2,
  Loader2, ChevronDown, ChevronUp, Mail, RefreshCw, RotateCcw, AlertTriangle, LogIn,
} from 'lucide-react';
import { format, addWeeks, parseISO } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { getThisWeekRange, filterPointsByRange, isInRange, getWeekRangeForOffset, formatWeekLabel } from '../utils/dateHelpers';
import {
  WEEKLY_REPORT_DEFAULT_PROMPT, WEEKLY_UPDATE_LOG_COLORS, WEEKLY_UPDATE_LOG_LABELS,
  MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, WEEKLY_EMAIL_SUMMARY_PROMPT,
} from '../constants';
import { Button } from '../components/ui/button';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchCalendarEvents, fetchWeeklyEmailsWithBodies } from '../lib/googleApi';
import WeeklyUpdateLog from '../components/WeeklyUpdateLog';

// ─── Module-level constants ──────────────────────────────────────────────────

// Report-worthy types (Neutral excluded from Weekly Report display)
const REPORT_TYPES = ['highlight', 'lowlight', 'learning', 'shoutout', 'annotation', 'next-week-priority'];

// ─── Module-level helpers ─────────────────────────────────────────────────────

function buildWeekContext({ weekStart, weekEnd, points, tasks, customers, okrs, weeklyUpdateLogs, milestones, calendarEvents, gmailEmails, emailSummary, timeLogs, stressLogs }) {
  const weekLabel = formatWeekLabel(weekStart, weekEnd);
  const lines = [];
  const customerMap = new Map(customers.map(c => [c.id, c]));

  lines.push(`## Weekly Work Summary: ${weekLabel}`);
  lines.push('');

  // ── Overview ──
  const weekPoints = filterPointsByRange(points, weekStart, weekEnd);
  const totalPts = weekPoints.reduce((s, p) => s + (p.points || 0), 0);
  const totalHrs = Math.round(weekPoints.reduce((s, p) => s + (p.hours || 0), 0) * 100) / 100;
  const activeCustomerIds = [...new Set(weekPoints.map(p => p.customerId).filter(Boolean))];
  const weekTasks = tasks.filter(t => {
    if (!['done', 'archived'].includes(t.status)) return false;
    const ts = t.closedAt || t.createdAt;
    if (!ts) return false;
    return isInRange(ts, weekStart, weekEnd);
  });

  lines.push('### Overview');
  lines.push(`- Total points logged: ${totalPts}`);
  lines.push(`- Total hours: ${totalHrs}h`);
  lines.push(`- Active customers: ${activeCustomerIds.length}`);
  lines.push(`- Tasks completed: ${weekTasks.length}`);
  lines.push('');

  // ── Bandwidth Breakdown (from timeLogs) ──
  if (timeLogs && timeLogs.length > 0) {
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    const weekTimeLogs = timeLogs.filter(l => l.weekStart === weekKey);
    if (weekTimeLogs.length > 0) {
      const byType = { deep_work: 0, meetings: 0, comms: 0, admin: 0 };
      weekTimeLogs.forEach(l => {
        if (byType[l.workType] !== undefined) byType[l.workType] += l.hours || 0;
      });
      const totalByType = Object.values(byType).reduce((s, v) => s + v, 0);
      if (totalByType > 0) {
        lines.push('### How I Spent My Time');
        lines.push(`- Total hours logged: ${Math.round(totalByType * 10) / 10}h`);
        Object.entries(byType).forEach(([wt, hrs]) => {
          if (hrs > 0) {
            const label = { deep_work: 'Deep Work', meetings: 'Meetings', comms: 'Comms', admin: 'Admin' }[wt] || wt;
            const pct = Math.round((hrs / totalByType) * 100);
            lines.push(`- ${label}: ${Math.round(hrs * 10) / 10}h (${pct}%)`);
          }
        });
        // Flags
        if (byType.meetings / totalByType > 0.5) {
          lines.push('- FLAG: Meeting load was unusually high (>50% of time)');
        }
        lines.push('');

        // Hours by OKR
        const okrHours = {};
        weekTimeLogs.filter(l => l.okrId).forEach(l => {
          okrHours[l.okrId] = (okrHours[l.okrId] || 0) + (l.hours || 0);
        });
        const okrEntries = Object.entries(okrHours).filter(([, h]) => h > 0);
        if (okrEntries.length > 0) {
          lines.push('### Time Invested by OKR');
          okrEntries.forEach(([okrId, hrs]) => {
            const okr = okrs.find(o => o.id === okrId);
            if (okr) lines.push(`- ${okr.title}: ${Math.round(hrs * 10) / 10}h this week`);
          });
          lines.push('');
        }
      }
    }
  }

  // ── Weekly Pulse (stress) ──
  if (stressLogs && stressLogs.length > 0) {
    const weekStressLogs = stressLogs.filter(l => {
      try { return isInRange(parseISO(l.logDate + 'T12:00:00'), weekStart, weekEnd); }
      catch { return false; }
    });
    if (weekStressLogs.length > 0) {
      const avgStress = Math.round(weekStressLogs.reduce((s, l) => s + l.stressLevel, 0) / weekStressLogs.length * 10) / 10;
      const stressorCounts = {};
      weekStressLogs.forEach(l => {
        if (l.stressor) stressorCounts[l.stressor] = (stressorCounts[l.stressor] || 0) + 1;
      });
      const topStressor = Object.entries(stressorCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      lines.push('### Weekly Pulse');
      lines.push(`- Average stress: ${avgStress} / 5`);
      if (topStressor) {
        const stressorLabel = { workload: 'Workload', client_issue: 'Client Issue', unclear_priorities: 'Unclear Priorities', meetings: 'Meetings', personal: 'Personal', other: 'Other' }[topStressor] || topStressor;
        lines.push(`- Top stressor: ${stressorLabel}`);
      }
      weekStressLogs.forEach(l => {
        if (l.note) lines.push(`- ${l.logDate}: ${l.note}`);
      });
      lines.push('');
    }
  }

  // ── Customer breakdown ──
  if (activeCustomerIds.length > 0) {
    lines.push('### Customer Breakdown');
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
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  if (weekTasks.length > 0 || inProgressTasks.length > 0 || blockedTasks.length > 0) {
    lines.push('### Tasks This Week');
    if (weekTasks.length > 0) {
      lines.push('**Completed:**');
      weekTasks.forEach(t => {
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

  // ── Milestones ──
  const weekMilestonesCtx = (milestones || []).filter(m => {
    if (!m.targetDate) return false;
    try { return isInRange(parseISO(m.targetDate + 'T00:00:00'), weekStart, weekEnd); }
    catch { return false; }
  });
  if (weekMilestonesCtx.length > 0) {
    lines.push('### Milestones');
    weekMilestonesCtx.forEach(m => {
      const cName = customerMap.get(m.customerId)?.name;
      lines.push(`  - [${m.status}]${cName ? ` [${cName}]` : ''} ${m.title} (target: ${m.targetDate})`);
    });
    lines.push('');
  }

  // ── Weekly Highlights, Learnings & Shoutouts ──
  const weekLogs = (weeklyUpdateLogs || []).filter(l => {
    try { return isInRange(parseISO(l.date + 'T00:00:00'), weekStart, weekEnd); }
    catch { return false; }
  });
  const reportLogs = weekLogs.filter(l => ['highlight', 'lowlight', 'learning', 'shoutout', 'annotation'].includes(l.type));
  if (reportLogs.length > 0) {
    const highlights = reportLogs.filter(l => l.type === 'highlight');
    const lowlights  = reportLogs.filter(l => l.type === 'lowlight');
    const learnings  = reportLogs.filter(l => l.type === 'learning');
    const shoutouts  = reportLogs.filter(l => l.type === 'shoutout');
    lines.push('### Weekly Highlights & Notes');
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
    if (learnings.length > 0) {
      lines.push('**Learnings:**');
      learnings.forEach(l => {
        const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
        lines.push(`  - ${l.text}${cName ? ` [${cName}]` : ''}`);
      });
    }
    if (shoutouts.length > 0) {
      lines.push('**Shoutouts:**');
      shoutouts.forEach(l => {
        const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
        lines.push(`  - ${l.text}${cName ? ` [${cName}]` : ''}`);
      });
    }
    const annotations = reportLogs.filter(l => l.type === 'annotation');
    if (annotations.length > 0) {
      lines.push('**Config Annotations:**');
      annotations.forEach(l => {
        const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
        lines.push(`  - ${l.text}${cName ? ` [${cName}]` : ''}`);
      });
    }
    lines.push('');
  }

  // ── Next Week Priorities ──
  const nextWeekPriorities = weekLogs.filter(l => l.type === 'next-week-priority');
  if (nextWeekPriorities.length > 0) {
    lines.push('### NEXT WEEK PRIORITIES');
    nextWeekPriorities.forEach(l => {
      const cName = l.customerId ? customerMap.get(l.customerId)?.name : null;
      lines.push(`  - ${cName ? `[${cName}] ` : ''}${l.text}`);
    });
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

  // ── Email activity (only included emails) ──
  const includedEmails = (gmailEmails || []).filter(e => !e._excluded);
  if (includedEmails.length > 0) {
    lines.push('### Email Activity This Week');
    const sentEmails     = includedEmails.filter(e => e.direction === 'sent');
    const receivedEmails = includedEmails.filter(e => e.direction === 'received');
    if (sentEmails.length > 0) {
      lines.push('**Sent:**');
      sentEmails.forEach(e => {
        lines.push(`  - ${e.subject || '(no subject)'}${e.body ? ` — ${e.body.slice(0, 120)}` : ''}`);
      });
    }
    if (receivedEmails.length > 0) {
      lines.push('**Received:**');
      receivedEmails.forEach(e => {
        lines.push(`  - ${e.subject || '(no subject)'}${e.body ? ` — ${e.body.slice(0, 120)}` : ''}`);
      });
    }
    lines.push('');
  }

  // ── AI Email Summary (pre-generated) ──
  if (emailSummary) {
    lines.push('### Email Activity Summary (AI-Generated)');
    lines.push(emailSummary);
    lines.push('');
  }

  return lines.join('\n');
}

// fetchCalendarEvents and fetchGmailSent imported from ../lib/googleApi

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyReport({ onNavigate }) {
  const {
    points, tasks, customers, okrs, weeklyUpdateLogs, milestones,
    weeklyReports, addWeeklyReport, deleteWeeklyReport,
    aiSettings, updateAiSettings,
    timeLogs, stressLogs,
  } = useAppStore();
  const { googleToken, gmailToken } = useGoogleAuth();

  // ── Existing state ──
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [provider,      setProvider]      = useState(aiSettings.providers?.weeklyEmail || 'claude');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [genError,      setGenError]      = useState(null);
  const [emailText,     setEmailText]     = useState('');
  const [copied,        setCopied]        = useState(false);
  const [promptOpen,    setPromptOpen]    = useState(false);
  const [localPrompt,   setLocalPrompt]   = useState('');
  const [promptSaved,   setPromptSaved]   = useState(false);
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);

  // ── New state ──
  const [expandedTile,   setExpandedTile]   = useState(null);          // 'tasks' | 'customers' | null
  const [calendarEvents, setCalendarEvents] = useState(null);          // null = not yet fetched
  const [gmailEmails,    setGmailEmails]    = useState(null);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [reviewOpen,     setReviewOpen]     = useState(true);          // "Week in Review" expanded by default
  const [genSuccess,     setGenSuccess]     = useState(false);
  const [genSummary,     setGenSummary]     = useState(null);          // { tasks, emails, meetings }
  const [navError,       setNavError]       = useState(null);          // integration button error
  const [emailSummary,       setEmailSummary]       = useState('');
  const [isEmailSummarizing, setIsEmailSummarizing] = useState(false);
  const [emailSummaryError,  setEmailSummaryError]  = useState(null);
  const [emailSelections,    setEmailSelections]    = useState({});  // { emailId: boolean } — true = included
  const [expandedEmailId,    setExpandedEmailId]    = useState(null);
  const [reportTypeFilter,   setReportTypeFilter]   = useState('all'); // 'all' | one of REPORT_TYPES

  const emailOutputRef = useRef(null);

  // ── Derived values ──
  const { weekStart, weekEnd } = useMemo(() => getWeekRangeForOffset(weekOffset), [weekOffset]);
  const weekLabel   = useMemo(() => formatWeekLabel(weekStart, weekEnd), [weekStart, weekEnd]);
  const offsetLabel = weekOffset === 0 ? 'Current week' : weekOffset === -1 ? 'Last week' : `${Math.abs(weekOffset)} weeks ago`;

  // Stats for the selected week
  const weekPoints = useMemo(() => filterPointsByRange(points, weekStart, weekEnd), [points, weekStart, weekEnd]);
  const totalPts   = useMemo(() => weekPoints.reduce((s, p) => s + (p.points || 0), 0), [weekPoints]);
  const totalHrs   = useMemo(() => Math.round(weekPoints.reduce((s, p) => s + (p.hours || 0), 0) * 100) / 100, [weekPoints]);
  const activeCustomers = useMemo(() => new Set(weekPoints.map(p => p.customerId).filter(Boolean)).size, [weekPoints]);

  // Full list of tasks closed this week (replaces doneTasks count)
  const weekTasksList = useMemo(
    () => tasks.filter(t => {
      if (!['done', 'archived'].includes(t.status)) return false;
      const ts = t.closedAt || t.createdAt;
      return ts && isInRange(ts, weekStart, weekEnd);
    }),
    [tasks, weekStart, weekEnd]
  );

  // Per-customer pts/hrs breakdown for the Customers expanded tile
  const customerBreakdown = useMemo(() => {
    const map = {};
    weekPoints.forEach(p => {
      if (!p.customerId) return;
      if (!map[p.customerId]) map[p.customerId] = { pts: 0, hrs: 0 };
      map[p.customerId].pts += (p.points || 0);
      map[p.customerId].hrs += (p.hours || 0);
    });
    return Object.entries(map)
      .map(([id, data]) => ({
        id,
        name: customers.find(c => c.id === id)?.name || 'Unknown',
        pts:  data.pts,
        hrs:  Math.round(data.hrs * 100) / 100,
      }))
      .sort((a, b) => b.pts - a.pts);
  }, [weekPoints, customers]);

  // Weekly update logs for the selected week
  const weekLogs = useMemo(
    () => (weeklyUpdateLogs || []).filter(l => {
      try { return isInRange(parseISO(l.date + 'T00:00:00'), weekStart, weekEnd); }
      catch { return false; }
    }),
    [weeklyUpdateLogs, weekStart, weekEnd]
  );

  const reportLogs = useMemo(
    () => weekLogs.filter(l => REPORT_TYPES.includes(l.type)),
    [weekLogs]
  );
  const logsByType = useMemo(() => {
    const groups = {};
    REPORT_TYPES.forEach(t => { groups[t] = weekLogs.filter(l => l.type === t); });
    return groups;
  }, [weekLogs]);

  // Milestones whose targetDate falls in the selected week
  const weekMilestones = useMemo(
    () => (milestones || []).filter(m => {
      if (!m.targetDate) return false;
      try { return isInRange(parseISO(m.targetDate + 'T00:00:00'), weekStart, weekEnd); }
      catch { return false; }
    }),
    [milestones, weekStart, weekEnd]
  );

  // ── Prefetch calendar + Gmail whenever week or tokens change ──
  useEffect(() => {
    setCalendarEvents(null);
    setGmailEmails(null);
    setEmailSummary('');
    setEmailSummaryError(null);
    setExpandedEmailId(null);

    const fetches = [];

    if (googleToken) {
      fetches.push(
        fetchCalendarEvents(googleToken, weekStart, weekEnd)
          .then(setCalendarEvents)
          .catch(() => setCalendarEvents([]))
      );
    }
    if (gmailToken) {
      fetches.push(
        fetchWeeklyEmailsWithBodies(gmailToken, weekStart, weekEnd)
          .then(emails => {
            setGmailEmails(emails);
            // Apply saved selections from localStorage, or default: noise = excluded
            const weekKey = format(weekStart, 'yyyy-MM-dd');
            const saved = (() => {
              try { return JSON.parse(localStorage.getItem(`gpt-email-selections-${weekKey}`) || '{}'); }
              catch { return {}; }
            })();
            const selections = {};
            emails.forEach(e => {
              if (saved[e.id] !== undefined) {
                selections[e.id] = saved[e.id];
              } else {
                selections[e.id] = !e.isNoise; // noise emails excluded by default
              }
            });
            setEmailSelections(selections);
          })
          .catch(() => setGmailEmails([]))
      );
    }

    if (fetches.length > 0) {
      setIsFetchingData(true);
      Promise.all(fetches).finally(() => setIsFetchingData(false));
    }
  }, [weekStart, weekEnd, googleToken, gmailToken]);

  // Persist email selections to localStorage when they change
  useEffect(() => {
    if (!gmailEmails || gmailEmails.length === 0) return;
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    localStorage.setItem(`gpt-email-selections-${weekKey}`, JSON.stringify(emailSelections));
  }, [emailSelections, weekStart, gmailEmails]);

  // Compute included email count
  const includedEmailCount = useMemo(
    () => gmailEmails ? gmailEmails.filter(e => emailSelections[e.id]).length : 0,
    [gmailEmails, emailSelections]
  );

  // Annotate emails with _excluded for buildWeekContext
  const annotatedEmails = useMemo(
    () => gmailEmails ? gmailEmails.map(e => ({ ...e, _excluded: !emailSelections[e.id] })) : null,
    [gmailEmails, emailSelections]
  );

  // "Summarize Selected" handler — manual trigger, not auto
  const handleSummarizeEmails = useCallback(async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey || !gmailEmails) return;

    const included = gmailEmails.filter(e => emailSelections[e.id]);
    if (included.length === 0) return;

    setIsEmailSummarizing(true);
    setEmailSummaryError(null);

    const emailData = included.map(e => {
      const dir = e.direction === 'sent' ? 'SENT' : 'RECEIVED';
      const person = e.direction === 'sent' ? (e.to || '') : (e.from || '');
      const bodySnippet = e.body ? `\n  Body: ${e.body.slice(0, 300)}` : '';
      return `[${dir}] ${e.subject || '(no subject)'} — ${person}${bodySnippet}`;
    }).join('\n\n');

    try {
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
          max_tokens: 800,
          system:     WEEKLY_EMAIL_SUMMARY_PROMPT,
          messages:   [{ role: 'user', content: `Here are ${included.length} emails from this week:\n\n${emailData}` }],
        }),
      });
      if (!res.ok) throw new Error(`Claude API ${res.status}`);
      const data = await res.json();
      setEmailSummary(data.content?.[0]?.text || '');
    } catch (err) {
      setEmailSummaryError(err.message);
    } finally {
      setIsEmailSummarizing(false);
    }
  }, [gmailEmails, emailSelections, aiSettings.claudeModel]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGenError(null);

    // calendarEvents / annotatedEmails now come from prefetched state
    const context = buildWeekContext({
      weekStart, weekEnd, points, tasks, customers, okrs,
      weeklyUpdateLogs, milestones, calendarEvents, gmailEmails: annotatedEmails, emailSummary,
      timeLogs, stressLogs,
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
      setGenSummary({
        tasks:    weekTasksList.length,
        emails:   gmailEmails?.length || 0,
        meetings: calendarEvents?.length || 0,
      });
      setGenSuccess(true);
      setTimeout(() => setGenSuccess(false), 4000);
      // Scroll to output after state updates settle
      setTimeout(() => emailOutputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setIsGenerating(false);
    }
  }, [provider, weekStart, weekEnd, points, tasks, customers, okrs, weeklyUpdateLogs, milestones, calendarEvents, gmailEmails, emailSummary, localPrompt, aiSettings, weekTasksList]);

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
        <h1 className="text-2xl font-bold text-foreground">Weekly Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Summarize your week and generate a professional status email.
        </p>
      </div>

      {/* ── Integration onboarding banner — only when any integration is missing ── */}
      {(!googleToken || !gmailToken) && (
        <div className="flex flex-wrap items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5">
          <span className="text-xs text-muted-foreground">Connect integrations to unlock calendar and email insights:</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <IntegrationButton
              label="Google Calendar"
              connected={!!googleToken}
              onNavigate={onNavigate}
              onError={msg => { setNavError(msg); setTimeout(() => setNavError(null), 3000); }}
            />
            <IntegrationButton
              label="Gmail"
              connected={!!gmailToken}
              onNavigate={onNavigate}
              onError={msg => { setNavError(msg); setTimeout(() => setNavError(null), 3000); }}
            />
          </div>
        </div>
      )}

      {/* ── Success banner ── */}
      {genSuccess && (
        <div className="flex items-center gap-2 text-sm text-brand-sage bg-brand-sage/10 border border-brand-sage/20 rounded-xl px-4 py-2.5">
          <Check size={14} /> Email generated from your week data
        </div>
      )}

      {/* ── A: Week Picker ── */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-4">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-foreground bg-secondary/40 hover:bg-secondary transition-colors"
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
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-foreground bg-secondary/40 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── B: Stats chips — Tasks Done & Customers are expandable ── */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip label="Points"    value={Number(totalPts).toFixed(1)} valueColor="text-brand-amber" />
          <StatChip label="Hours"     value={`${totalHrs}h`} valueColor="text-brand-lavender" />
          <ExpandableTile
            label="Tasks Done"
            value={weekTasksList.length}
            isExpanded={expandedTile === 'tasks'}
            onToggle={() => setExpandedTile(expandedTile === 'tasks' ? null : 'tasks')}
            valueColor="text-brand-sage"
          />
          <ExpandableTile
            label="Customers"
            value={activeCustomers}
            isExpanded={expandedTile === 'customers'}
            onToggle={() => setExpandedTile(expandedTile === 'customers' ? null : 'customers')}
            valueColor="text-brand-pink"
          />
        </div>

        {/* Tasks expanded panel — full width below grid */}
        {expandedTile === 'tasks' && (
          <div className="mt-3 rounded-xl border border-brand-lavender/40 bg-card px-4 py-3 text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {weekTasksList.length === 0 ? (
              <p className="text-muted-foreground">No tasks closed this week</p>
            ) : (
              weekTasksList.map(t => {
                const cName = customers.find(c => c.id === t.customerId)?.name;
                return (
                  <div key={t.id} className="flex items-start gap-2">
                    {cName && (
                      <span className="text-muted-foreground flex-shrink-0 font-medium">[{cName}]</span>
                    )}
                    <span className="text-foreground flex-1 min-w-0">{t.description}</span>
                    {t.points != null && (
                      <span className="text-muted-foreground flex-shrink-0 ml-auto">{t.points}pts</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Customers expanded panel — full width below grid */}
        {expandedTile === 'customers' && (
          <div className="mt-3 rounded-xl border border-brand-lavender/40 bg-card px-4 py-3 text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {customerBreakdown.length === 0 ? (
              <p className="text-muted-foreground">No activity this week</p>
            ) : (
              customerBreakdown.map(c => (
                <div key={c.id} className="flex items-center justify-between">
                  <span className="text-foreground font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.pts} pts · {c.hrs}h</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Navigation error banner ── */}
      {navError && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-2.5">
          <AlertTriangle size={14} /> {navError}
        </div>
      )}


      {/* ── Week in Review ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setReviewOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">Week in Review</span>
          {reviewOpen
            ? <ChevronUp size={16} className="text-muted-foreground" />
            : <ChevronDown size={16} className="text-muted-foreground" />
          }
        </button>

        {reviewOpen && (
          <div className="border-t border-border px-5 pb-5 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

              {/* Card A — Tasks Done */}
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: weekTasksList.length > 0 ? '#4ade80' : '#6b7280' }}
                  />
                  <p className="text-xs font-semibold text-foreground">Tasks Done</p>
                  <span className="text-xs text-muted-foreground ml-auto">{weekTasksList.length}</span>
                </div>
                {weekTasksList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks closed this week</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {weekTasksList.map(t => {
                      const cName = customers.find(c => c.id === t.customerId)?.name;
                      return (
                        <div key={t.id} className="text-xs text-foreground/80 leading-relaxed">
                          {cName && (
                            <span className="text-muted-foreground">[{cName}] </span>
                          )}
                          {t.description}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Card B — Emails Sent */}
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{
                      backgroundColor: !gmailToken
                        ? '#6b7280'
                        : (isFetchingData || gmailEmails === null)
                          ? '#6b7280'
                          : gmailEmails.length > 0
                            ? '#4ade80'
                            : '#f59e0b',
                    }}
                  />
                  <p className="text-xs font-semibold text-foreground">Emails Sent</p>
                  {gmailToken && gmailEmails !== null && (
                    <span className="text-xs text-muted-foreground ml-auto">{gmailEmails.length}</span>
                  )}
                </div>
                {!gmailToken ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gmail not connected</p>
                    <button
                      onClick={() => onNavigate('integrations')}
                      className="text-xs text-brand-lavender hover:underline"
                    >
                      Connect →
                    </button>
                  </div>
                ) : (isFetchingData || gmailEmails === null) ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : gmailEmails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No emails sent this week</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {gmailEmails.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-foreground/80 truncate">{e.subject}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Card C — Meetings */}
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{
                      backgroundColor: !googleToken
                        ? '#6b7280'
                        : (isFetchingData || calendarEvents === null)
                          ? '#6b7280'
                          : calendarEvents.length > 0
                            ? '#4ade80'
                            : '#f59e0b',
                    }}
                  />
                  <p className="text-xs font-semibold text-foreground">Meetings</p>
                  {googleToken && calendarEvents !== null && (
                    <span className="text-xs text-muted-foreground ml-auto">{calendarEvents.length}</span>
                  )}
                </div>
                {!googleToken ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Google Calendar not connected</p>
                    <button
                      onClick={() => onNavigate('integrations')}
                      className="text-xs text-brand-lavender hover:underline"
                    >
                      Connect →
                    </button>
                  </div>
                ) : (isFetchingData || calendarEvents === null) ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : calendarEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No meetings this week</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {calendarEvents.slice(0, 5).map((e, i) => {
                      const startTime = e.start?.dateTime
                        ? format(parseISO(e.start.dateTime), 'EEE h:mm a')
                        : '';
                      return (
                        <div key={i} className="text-xs text-foreground/80 leading-relaxed">
                          {startTime && (
                            <span className="text-muted-foreground">{startTime} — </span>
                          )}
                          {e.summary || '(no title)'}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Email Activity — Interactive Viewer with Include/Exclude ── */}
      {gmailToken && gmailEmails !== null && gmailEmails.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-brand-lavender" />
            <h3 className="text-sm font-semibold text-foreground">Email Activity This Week</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {includedEmailCount}/{gmailEmails.length} included
            </span>
          </div>

          {/* AI summary result (shown when available) */}
          {emailSummary && (
            <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line bg-secondary/30 rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
              {emailSummary}
            </div>
          )}
          {emailSummaryError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              Could not summarize: {emailSummaryError}
            </p>
          )}

          {/* Select All / Deselect All + Summarize button */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const next = {};
                gmailEmails.forEach(e => { next[e.id] = true; });
                setEmailSelections(next);
              }}
              className="text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
            >
              Select All
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button
              type="button"
              onClick={() => {
                const next = {};
                gmailEmails.forEach(e => { next[e.id] = false; });
                setEmailSelections(next);
              }}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={handleSummarizeEmails}
              disabled={isEmailSummarizing || includedEmailCount === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-lavender/20 text-brand-lavender border border-indigo-500/20 hover:bg-brand-lavender/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isEmailSummarizing ? (
                <><Loader2 size={11} className="animate-spin" /> Summarizing…</>
              ) : (
                <>Summarize Selected ({includedEmailCount})</>
              )}
            </button>
          </div>

          {/* Email list */}
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {gmailEmails.map(e => {
              const isIncluded = emailSelections[e.id] ?? !e.isNoise;
              const isExpanded = expandedEmailId === e.id;
              // Parse date for display
              const dateStr = (() => {
                try {
                  const d = new Date(e.date);
                  return isNaN(d.getTime()) ? '' : format(d, 'MMM d');
                } catch { return ''; }
              })();
              const person = e.direction === 'sent' ? (e.to || '').split('<')[0].trim() : (e.from || '').split('<')[0].trim();

              return (
                <div key={e.id} className={`rounded-lg border transition-all ${isIncluded ? 'border-border bg-secondary/20' : 'border-border/40 bg-secondary/5 opacity-60'}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* Include/Exclude checkbox */}
                    <button
                      type="button"
                      onClick={() => setEmailSelections(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isIncluded ? 'bg-brand-lavender border-brand-lavender' : 'border-border'
                      }`}
                      title={isIncluded ? 'Click to exclude' : 'Click to include'}
                    >
                      {isIncluded && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </button>

                    {/* Direction badge */}
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      e.direction === 'sent'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                      {e.direction === 'sent' ? 'Sent' : 'Recv'}
                    </span>

                    {/* Noise badge */}
                    {e.isNoise && (
                      <span className="flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">
                        Auto
                      </span>
                    )}

                    {/* Subject + person */}
                    <button
                      type="button"
                      onClick={() => setExpandedEmailId(isExpanded ? null : e.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs text-foreground truncate">{e.subject || '(no subject)'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {person}{dateStr ? ` · ${dateStr}` : ''}
                      </p>
                    </button>

                    {/* Expand toggle */}
                    {e.body && (
                      <button
                        type="button"
                        onClick={() => setExpandedEmailId(isExpanded ? null : e.id)}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded body preview */}
                  {isExpanded && e.body && (
                    <div className="px-3 pb-2.5 pt-0">
                      <div className="text-[11px] text-foreground/70 leading-relaxed whitespace-pre-wrap bg-card/50 rounded-lg px-3 py-2 max-h-40 overflow-y-auto border border-border/30">
                        {e.body}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── B2: Highlights, Learnings & Shoutouts ── */}
      {reportLogs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Weekly Log Entries
              <span className="ml-2 text-xs font-normal text-muted-foreground">{reportLogs.length} logged</span>
            </h3>
            <div className="flex flex-wrap gap-1 ml-auto">
              <button
                onClick={() => setReportTypeFilter('all')}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  reportTypeFilter === 'all'
                    ? 'bg-secondary border-border text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              {REPORT_TYPES.filter(t => logsByType[t]?.length > 0).map(t => (
                <button
                  key={t}
                  onClick={() => setReportTypeFilter(prev => prev === t ? 'all' : t)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    reportTypeFilter === t
                      ? 'border-transparent font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  style={reportTypeFilter === t ? {
                    backgroundColor: WEEKLY_UPDATE_LOG_COLORS[t] + '20',
                    color: WEEKLY_UPDATE_LOG_COLORS[t],
                  } : {}}
                >
                  {WEEKLY_UPDATE_LOG_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {REPORT_TYPES.filter(t => (reportTypeFilter === 'all' ? logsByType[t]?.length > 0 : reportTypeFilter === t && logsByType[t]?.length > 0)).map(t => (
            <div key={t} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                  style={{ backgroundColor: WEEKLY_UPDATE_LOG_COLORS[t] + '20', color: WEEKLY_UPDATE_LOG_COLORS[t] }}
                >
                  {WEEKLY_UPDATE_LOG_LABELS[t]}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {logsByType[t].map(log => {
                const customer = log.customerId ? customers.find(c => c.id === log.customerId) : null;
                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                      style={{
                        backgroundColor: WEEKLY_UPDATE_LOG_COLORS[t] + '20',
                        color: WEEKLY_UPDATE_LOG_COLORS[t],
                      }}
                    >
                      {WEEKLY_UPDATE_LOG_LABELS[t]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground leading-relaxed">{log.text}</p>
                      {customer && <p className="text-[10px] text-muted-foreground">{customer.name}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── B3: Milestones this week ── */}
      {weekMilestones.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Milestones this week
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {weekMilestones.length} milestone{weekMilestones.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {weekMilestones.map(m => {
              const customer = m.customerId ? customers.find(c => c.id === m.customerId) : null;
              return (
                <div key={m.id} className="flex items-start gap-2">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: (MILESTONE_STATUS_COLORS[m.status] || '#6b7280') + '20',
                      color: MILESTONE_STATUS_COLORS[m.status] || '#6b7280',
                    }}
                  >
                    {MILESTONE_STATUS_LABELS[m.status] || m.status}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-relaxed">{m.title}</p>
                    {customer && <p className="text-[10px] text-muted-foreground">{customer.name}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Read / Write separator ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Add Log Entries</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* ── B4: Weekly Update Log (add entries before generating) ── */}
      <WeeklyUpdateLog weekStart={weekStart} weekEnd={weekEnd} />

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
        <div ref={emailOutputRef} className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Generated Email</p>
              {genSummary && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generated from: {genSummary.tasks} task{genSummary.tasks !== 1 ? 's' : ''},
                  {' '}{genSummary.emails} email{genSummary.emails !== 1 ? 's' : ''},
                  {' '}{genSummary.meetings} meeting{genSummary.meetings !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
            className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-sans text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-y"
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
                  const rStart  = parseISO(r.weekStart);
                  const rEnd    = parseISO(r.weekEnd);
                  const label   = formatWeekLabel(rStart, rEnd);
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

function StatChip({ label, value, valueColor = 'text-foreground' }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

/** Stat tile with a chevron indicator — expanded content is rendered separately below the grid */
function ExpandableTile({ label, value, isExpanded, onToggle, valueColor = 'text-foreground' }) {
  return (
    <div
      className={`rounded-xl border bg-card transition-colors cursor-pointer ${
        isExpanded ? 'border-brand-lavender/40' : 'border-border'
      }`}
    >
      <button onClick={onToggle} className="w-full px-4 py-3 text-center hover:bg-secondary/30 transition-colors rounded-xl">
        <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
          {label}
          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </p>
      </button>
    </div>
  );
}

/** Integration pill button — connected (green) or unconnected (amber warning). Navigates to Integrations tab. */
function IntegrationButton({ label, connected, onNavigate: navigate, onError }) {
  function handleClick() {
    try {
      navigate('integrations');
    } catch (e) {
      onError?.(`Could not navigate to Integrations: ${e.message}`);
    }
  }

  return connected ? (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-brand-sage/10 text-brand-sage-darker border border-brand-sage/20 hover:bg-brand-sage/20 transition-colors"
    >
      <Check size={11} /> {label} connected
    </button>
  ) : (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-brand-lavender/40 text-brand-lavender hover:bg-brand-lavender/10 transition-colors"
    >
      <LogIn size={11} /> Connect {label}
    </button>
  );
}
