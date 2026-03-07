import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Brain, Search, Sparkles, ChevronDown, ChevronUp, X, Loader2, AlertCircle, Clock, Filter } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { formatDistanceToNow, parseISO, isAfter, isBefore, startOfDay, subDays, format } from 'date-fns';
import { WEEKLY_UPDATE_LOG_LABELS, WEEKLY_UPDATE_LOG_COLORS } from '../constants';

// ── Entity type config ──────────────────────────────────────────────────────────
const ENTITY_TYPES = {
  task:       { label: 'Task',       color: '#6b7280' },
  highlight:  { label: 'Highlight',  color: WEEKLY_UPDATE_LOG_COLORS.highlight },
  lowlight:   { label: 'Lowlight',   color: WEEKLY_UPDATE_LOG_COLORS.lowlight },
  learning:   { label: 'Learning',   color: WEEKLY_UPDATE_LOG_COLORS.learning },
  shoutout:   { label: 'Shoutout',   color: WEEKLY_UPDATE_LOG_COLORS.shoutout },
  neutral:    { label: 'Neutral',    color: WEEKLY_UPDATE_LOG_COLORS.neutral },
  'next-week-priority': { label: 'Priority', color: WEEKLY_UPDATE_LOG_COLORS['next-week-priority'] },
  meeting:    { label: 'Meeting',    color: '#8b5cf6' },
  'ai-output': { label: 'AI Output', color: '#6366f1' },
  milestone:  { label: 'Milestone',  color: '#14b8a6' },
};

// Entity types available for the filter multi-select
const FILTERABLE_TYPES = [
  { value: 'task',       label: 'Tasks' },
  { value: 'highlight',  label: 'Highlights' },
  { value: 'lowlight',   label: 'Lowlights' },
  { value: 'learning',   label: 'Learnings' },
  { value: 'shoutout',   label: 'Shoutouts' },
  { value: 'neutral',    label: 'Neutral' },
  { value: 'next-week-priority', label: 'Priorities' },
  { value: 'meeting',    label: 'Meetings' },
  { value: 'ai-output',  label: 'AI Outputs' },
  { value: 'milestone',  label: 'Milestones' },
];

const DATE_PRESETS = [
  { value: '7',   label: 'Last 7 days' },
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

// ── Knowledge search system prompt ──────────────────────────────────────────────
const KNOWLEDGE_SYSTEM_PROMPT = `You are a knowledge retrieval assistant for a Solutions Engineer at Talkpush, a hiring tech SaaS company. The user is searching their personal work history across tasks, weekly highlights/lowlights/learnings, meeting notes, AI outputs, and milestones.

Given the search query and the data below, return the most relevant results ranked by relevance. For each result, include:
- The source type (task, highlight, meeting, etc.)
- The date
- The customer name (if applicable)
- A brief explanation of why it's relevant to the query

If the query asks a factual question (e.g. "When did I last..."), answer it directly first, then list supporting evidence.

Format as a clean numbered list. Plain text only. Be concise and direct.`;

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Build a flat, searchable array of all entities with normalised shape */
function buildSearchIndex(tasks, weeklyUpdateLogs, meetingEntries, aiOutputs, milestones, customerMap) {
  const items = [];

  // Tasks
  (tasks || []).forEach(t => {
    const customer = t.customerId ? customerMap.get(t.customerId) : null;
    items.push({
      id: t.id,
      type: 'task',
      text: t.description || '',
      date: t.createdAt,
      customerId: t.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      meta: { status: t.status, taskType: t.taskType },
    });
  });

  // Weekly update logs
  (weeklyUpdateLogs || []).forEach(l => {
    const customer = l.customerId ? customerMap.get(l.customerId) : null;
    items.push({
      id: l.id,
      type: l.type, // highlight, lowlight, learning, shoutout, neutral, next-week-priority
      text: l.text || '',
      date: l.date ? l.date + 'T00:00:00' : l.createdAt,
      customerId: l.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      meta: {},
    });
  });

  // Meeting entries
  (meetingEntries || []).forEach(m => {
    const customer = m.customerId ? customerMap.get(m.customerId) : null;
    items.push({
      id: m.id,
      type: 'meeting',
      text: m.rawNotes || '',
      date: m.meetingDate || m.createdAt,
      customerId: m.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      meta: { isTriaged: m.isTriaged },
    });
  });

  // AI outputs
  (aiOutputs || []).forEach(o => {
    // Find the parent task's customer
    const parentTask = (tasks || []).find(t => t.id === o.taskId);
    const customer = parentTask?.customerId ? customerMap.get(parentTask.customerId) : null;
    items.push({
      id: o.id,
      type: 'ai-output',
      text: [o.inputText, o.outputText].filter(Boolean).join(' | '),
      date: o.createdAt,
      customerId: parentTask?.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      meta: { outputType: o.outputType },
    });
  });

  // Milestones
  (milestones || []).forEach(m => {
    const customer = m.customerId ? customerMap.get(m.customerId) : null;
    items.push({
      id: m.id,
      type: 'milestone',
      text: m.title || '',
      date: m.targetDate ? m.targetDate + 'T00:00:00' : m.createdAt,
      customerId: m.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      meta: { status: m.status },
    });
  });

  return items;
}

/** Case-insensitive substring match — returns true if all query words are found */
function matchesQuery(text, queryWords) {
  if (!text || queryWords.length === 0) return false;
  const lower = text.toLowerCase();
  return queryWords.every(w => lower.includes(w));
}

/** Highlight matching portions of text */
function highlightText(text, queryWords) {
  if (!text || queryWords.length === 0) return text;
  // Build a regex that matches any of the query words (case-insensitive)
  const escaped = queryWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-amber-400/30 text-foreground rounded px-0.5">{part}</mark>
      : part
  );
}

/** Truncate text to ~maxLen chars, breaking at word boundary */
function truncateText(text, maxLen = 200) {
  if (!text || text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/** Build context string for AI from search results */
function buildAIContext(query, results, maxItems = 50) {
  const items = results.slice(0, maxItems);
  const lines = [`Search query: "${query}"`, '', `Found ${items.length} matching items:`, ''];

  items.forEach((item, i) => {
    const dateStr = item.date ? format(parseISO(item.date), 'MMM d, yyyy') : 'unknown date';
    const typeLabel = ENTITY_TYPES[item.type]?.label || item.type;
    const customer = item.customerName || 'No client';
    const textPreview = truncateText(item.text, 300);
    lines.push(`${i + 1}. [${typeLabel}] ${dateStr} — ${customer}`);
    lines.push(`   ${textPreview}`);
    lines.push('');
  });

  return lines.join('\n');
}


// ─── Component ──────────────────────────────────────────────────────────────────

export default function Knowledge() {
  const {
    tasks, weeklyUpdateLogs, meetingEntries, aiOutputs, milestones,
    customers, aiSettings, updateAiSettings,
  } = useAppStore();

  // ── State ──
  const [query, setQuery]               = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDatePreset, setFilterDatePreset] = useState('all');
  const [filterTypes, setFilterTypes]       = useState(new Set());
  const [filtersOpen, setFiltersOpen]       = useState(false);
  const [expandedCards, setExpandedCards]   = useState(new Set());
  const [provider, setProvider]             = useState(aiSettings.providers?.knowledge || 'claude');

  // AI search state
  const [aiResult, setAiResult]       = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiError, setAiError]         = useState(null);

  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the query (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // O(1) customer lookup
  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Build search index — memoised to avoid rebuilding on every keystroke
  const searchIndex = useMemo(
    () => buildSearchIndex(tasks, weeklyUpdateLogs, meetingEntries, aiOutputs, milestones, customerMap),
    [tasks, weeklyUpdateLogs, meetingEntries, aiOutputs, milestones, customerMap]
  );

  // ── Tier 1: Local keyword search (instant) ──
  const keywordResults = useMemo(() => {
    const queryWords = debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

    let items = searchIndex;

    // Apply customer filter
    if (filterCustomer) {
      items = items.filter(i => i.customerId === filterCustomer);
    }

    // Apply date filter
    if (filterDatePreset !== 'all') {
      const days = parseInt(filterDatePreset, 10);
      const cutoff = startOfDay(subDays(new Date(), days));
      items = items.filter(i => {
        try { return isAfter(parseISO(i.date), cutoff); }
        catch { return true; }
      });
    }

    // Apply entity type filter
    if (filterTypes.size > 0) {
      items = items.filter(i => filterTypes.has(i.type));
    }

    // If no query, show everything (filtered) sorted by date desc
    if (queryWords.length === 0) {
      return [...items].sort((a, b) => {
        try { return parseISO(b.date) - parseISO(a.date); }
        catch { return 0; }
      });
    }

    // Match and score — simple substring matching with all query words
    // Also match against customerName for queries like "TaskUs"
    const matched = items.filter(i =>
      matchesQuery(i.text, queryWords) || matchesQuery(i.customerName, queryWords)
    );

    // Sort: prioritise customer name matches, then by date desc
    return matched.sort((a, b) => {
      const aCustomerMatch = matchesQuery(a.customerName, queryWords) ? 1 : 0;
      const bCustomerMatch = matchesQuery(b.customerName, queryWords) ? 1 : 0;
      if (bCustomerMatch !== aCustomerMatch) return bCustomerMatch - aCustomerMatch;
      try { return parseISO(b.date) - parseISO(a.date); }
      catch { return 0; }
    });
  }, [searchIndex, debouncedQuery, filterCustomer, filterDatePreset, filterTypes]);

  // Recent activity (last 7 days) — shown when no search query
  const recentActivity = useMemo(() => {
    const cutoff = startOfDay(subDays(new Date(), 7));
    return searchIndex
      .filter(i => { try { return isAfter(parseISO(i.date), cutoff); } catch { return false; } })
      .sort((a, b) => { try { return parseISO(b.date) - parseISO(a.date); } catch { return 0; } })
      .slice(0, 30);
  }, [searchIndex]);

  // ── Tier 2: AI-powered semantic search ──
  const handleAiSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsAiSearching(true);
    setAiError(null);
    setAiResult('');

    const context = buildAIContext(query, keywordResults);

    try {
      let output = '';

      if (provider === 'claude') {
        const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env.local file.');

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
            system:     KNOWLEDGE_SYSTEM_PROMPT,
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
        if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not set. Add it to your .env.local file.');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model:       aiSettings.openaiModel || 'gpt-4o',
            temperature: 0.5,
            messages: [
              { role: 'system', content: KNOWLEDGE_SYSTEM_PROMPT },
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

      setAiResult(output);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setIsAiSearching(false);
    }
  }, [query, keywordResults, provider, aiSettings]);

  // Handle Enter key to trigger AI search
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      handleAiSearch();
    }
  }, [query, handleAiSearch]);

  // Toggle a type in the filter set
  const toggleTypeFilter = (type) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Toggle card expansion
  const toggleCardExpand = (id) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear all filters and query
  const clearAll = () => {
    setQuery('');
    setDebouncedQuery('');
    setFilterCustomer('');
    setFilterDatePreset('all');
    setFilterTypes(new Set());
    setAiResult('');
    setAiError(null);
  };

  // Persist provider to AI settings when changed
  useEffect(() => {
    if (provider !== aiSettings.providers?.knowledge) {
      updateAiSettings({ providers: { knowledge: provider } });
    }
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasFilters = filterCustomer || filterDatePreset !== 'all' || filterTypes.size > 0;
  const displayResults = hasQuery || hasFilters ? keywordResults : recentActivity;
  const queryWords = debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-1">
        <Brain size={20} className="text-brand-lavender" />
        <h1 className="text-xl font-semibold text-foreground">Knowledge Hub</h1>
        <span className="text-xs text-muted-foreground ml-1">Search across all your work history</span>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search your client knowledge... (press Enter for AI search)"
          className="w-full h-12 bg-card border border-border rounded-2xl pl-11 pr-32 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              onClick={() => { setQuery(''); setDebouncedQuery(''); setAiResult(''); setAiError(null); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleAiSearch}
            disabled={!query.trim() || isAiSearching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-lavender/20 text-brand-lavender text-xs font-semibold hover:bg-brand-lavender/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="AI-powered smart search"
          >
            {isAiSearching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Smart Search
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Filter toggle + active count */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFiltersOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
          >
            <Filter size={12} />
            Filters
            {hasFilters && (
              <span className="bg-brand-lavender/20 text-brand-lavender text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5">
                {(filterCustomer ? 1 : 0) + (filterDatePreset !== 'all' ? 1 : 0) + (filterTypes.size > 0 ? 1 : 0)}
              </span>
            )}
            {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {/* Date presets — always visible */}
          <div className="flex gap-1 flex-wrap">
            {DATE_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setFilterDatePreset(p.value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                  filterDatePreset === p.value
                    ? 'bg-brand-lavender/20 text-brand-lavender border-brand-lavender/30'
                    : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Provider selector */}
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="ml-auto h-7 bg-secondary border border-border rounded-lg px-2 text-[11px] text-muted-foreground focus:outline-none focus:border-ring"
            title="AI provider for smart search"
          >
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X size={11} /> Clear all
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            {/* Customer filter */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Client</label>
              <select
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                className="w-full h-9 bg-secondary border border-border rounded-lg px-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
              >
                <option value="">All clients</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Entity type multi-select (pill toggles) */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1.5">Entity Types</label>
              <div className="flex gap-1.5 flex-wrap">
                {FILTERABLE_TYPES.map(ft => {
                  const active = filterTypes.has(ft.value);
                  const cfg = ENTITY_TYPES[ft.value];
                  return (
                    <button
                      key={ft.value}
                      onClick={() => toggleTypeFilter(ft.value)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                      style={active ? {
                        backgroundColor: cfg.color + '25',
                        color: cfg.color,
                        borderColor: cfg.color + '60',
                      } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)', backgroundColor: 'transparent' }}
                    >
                      {ft.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI Smart Results ── */}
      {aiResult && (
        <div className="rounded-2xl border border-brand-lavender/30 bg-brand-lavender/5 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-brand-lavender" />
            <h3 className="text-sm font-semibold text-foreground">Smart Results</h3>
            <button
              onClick={() => setAiResult('')}
              className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={13} />
            </button>
          </div>
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiResult}</div>
        </div>
      )}

      {aiError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">AI search failed</p>
            <p className="text-xs text-red-400/70 mt-0.5">{aiError}</p>
          </div>
          <button
            onClick={() => setAiError(null)}
            className="ml-auto p-1 text-red-400/60 hover:text-red-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {isAiSearching && (
        <div className="rounded-2xl border border-brand-lavender/20 bg-card px-5 py-4 flex items-center gap-3">
          <Loader2 size={16} className="text-brand-lavender animate-spin" />
          <span className="text-sm text-muted-foreground">Searching with AI…</span>
        </div>
      )}

      {/* ── Section label ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasQuery || hasFilters ? (
            <>
              <Search size={13} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}
                {hasQuery && <> for &ldquo;{debouncedQuery}&rdquo;</>}
              </span>
            </>
          ) : (
            <>
              <Clock size={13} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Recent Activity
                <span className="ml-1 text-muted-foreground/60">— last 7 days</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Results list ── */}
      {displayResults.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-6 py-10 text-center">
          <Search size={28} className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {hasQuery ? 'No results match your search.' : 'No recent activity in the last 7 days.'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {hasQuery ? 'Try different keywords or broaden your filters.' : 'Start logging tasks and highlights to build your knowledge base.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayResults.slice(0, 100).map(item => {
            const cfg = ENTITY_TYPES[item.type] || ENTITY_TYPES.task;
            const isExpanded = expandedCards.has(item.id);
            const needsTruncation = item.text.length > 200;
            const displayText = isExpanded ? item.text : truncateText(item.text, 200);

            // Relative time
            let relativeDate = '';
            let absoluteDate = '';
            try {
              const d = parseISO(item.date);
              relativeDate = formatDistanceToNow(d, { addSuffix: true });
              absoluteDate = format(d, 'MMM d, yyyy');
            } catch {
              relativeDate = '';
              absoluteDate = '';
            }

            return (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-card border border-border rounded-2xl px-4 py-3 hover:border-border/80 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Type badge */}
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5 whitespace-nowrap"
                    style={{ backgroundColor: cfg.color + '20', color: cfg.color }}
                  >
                    {cfg.label}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Meta line: customer + date */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {item.customerName && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.customerColor || '#6366f1' }}
                          />
                          {item.customerName}
                        </span>
                      )}
                      {relativeDate && (
                        <span
                          className="text-[10px] text-muted-foreground"
                          title={absoluteDate}
                        >
                          {relativeDate}
                        </span>
                      )}
                      {/* Extra meta badges */}
                      {item.meta?.status && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                          {item.meta.status}
                        </span>
                      )}
                    </div>

                    {/* Text content */}
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {hasQuery ? highlightText(displayText, queryWords) : displayText}
                    </p>

                    {/* Show more / less toggle */}
                    {needsTruncation && (
                      <button
                        onClick={() => toggleCardExpand(item.id)}
                        className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 font-medium mt-1 transition-colors"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination hint */}
          {displayResults.length > 100 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              Showing first 100 of {displayResults.length} results. Refine your search to narrow down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
