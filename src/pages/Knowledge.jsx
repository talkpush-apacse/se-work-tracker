import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain, Search, Sparkles, X, Loader2, ChevronDown, Plus, AlertCircle, PencilLine, Trash2
} from 'lucide-react';
import {
  format, parseISO, formatDistanceToNow, differenceInDays,
  startOfWeek, startOfMonth, subMonths, startOfYear, isAfter,
} from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { buildMemoryIndex, getEntryColors } from '../utils/memoryIndex';
import { aiMemorySearch } from '../utils/memorySearch';
import { ANNOTATION_TAGS, ANNOTATION_TAG_LABELS } from '../constants';
import MemoryDetailDrawer from '../components/MemoryDetailDrawer';

// ── Type filter options ────────────────────────────────────────────────────────
const TYPE_FILTER_OPTIONS = [
  { value: 'task',        label: 'Task' },
  { value: 'meeting',     label: 'Meeting' },
  { value: 'highlight',   label: 'Highlight',  weeklyLogType: true },
  { value: 'lowlight',    label: 'Lowlight',   weeklyLogType: true },
  { value: 'learning',    label: 'Learning',   weeklyLogType: true },
  { value: 'shoutout',    label: 'Shoutout',   weeklyLogType: true },
  { value: 'aiOutput',    label: 'AI Draft' },
  { value: 'milestone',   label: 'Milestone' },
  { value: 'activityLog', label: 'Activity' },
  { value: 'annotation',  label: 'Note' },
];

const DATE_RANGE_OPTIONS = [
  { value: 'all',      label: 'All time' },
  { value: 'week',     label: 'This week' },
  { value: 'month',    label: 'This month' },
  { value: '3months',  label: 'Last 3 months' },
  { value: '6months',  label: 'Last 6 months' },
  { value: 'year',     label: 'This year' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEntryDate(dateStr) {
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    const diff = differenceInDays(now, d);
    if (diff < 7) return formatDistanceToNow(d, { addSuffix: true });
    if (d.getFullYear() !== now.getFullYear()) return format(d, 'MMM d, yyyy');
    return format(d, 'MMM d');
  } catch {
    return '';
  }
}

function getDateCutoff(rangeValue) {
  const now = new Date();
  switch (rangeValue) {
    case 'week':    return startOfWeek(now, { weekStartsOn: 0 });
    case 'month':   return startOfMonth(now);
    case '3months': return subMonths(now, 3);
    case '6months': return subMonths(now, 6);
    case 'year':    return startOfYear(now);
    default:        return null;
  }
}

function matchesTypeFilter(entry, selectedTypes) {
  if (selectedTypes.size === 0) return true;
  for (const type of selectedTypes) {
    const opt = TYPE_FILTER_OPTIONS.find(o => o.value === type);
    if (opt?.weeklyLogType) {
      if (entry.entityType === 'weeklyLog' && entry.sourceRef?.type === type) return true;
    } else {
      if (entry.entityType === type) return true;
    }
  }
  return false;
}

function matchesKeyword(entry, words) {
  if (words.length === 0) return true;
  const haystack = [entry.text, entry.subtext, entry.label, entry.customerName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every(w => haystack.includes(w));
}

// Accepts a pre-compiled RegExp (memoized by the parent) instead of rebuilding
// on every card render. Caller resets lastIndex before passing the regex in.
function highlightText(text, regex) {
  if (!text || !regex) return text;
  regex.lastIndex = 0;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    regex.lastIndex = 0;
    return regex.test(part)
      ? <mark key={i} className="bg-amber-400/30 text-foreground rounded px-0.5">{part}</mark>
      : part;
  });
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-5 w-16 bg-secondary rounded-lg flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-3 w-16 bg-secondary rounded" />
            <div className="h-3 w-12 bg-secondary rounded" />
          </div>
          <div className="h-3 w-full bg-secondary rounded" />
          <div className="h-3 w-3/4 bg-secondary rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Type multi-select dropdown ────────────────────────────────────────────────
function TypeDropdown({ selectedTypes, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = selectedTypes.size === 0
    ? 'Type'
    : selectedTypes.size === 1
      ? TYPE_FILTER_OPTIONS.find(o => selectedTypes.has(o.value))?.label || 'Type'
      : `${selectedTypes.size} types`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
          selectedTypes.size > 0
            ? 'bg-brand-lavender/15 text-brand-lavender border-brand-lavender/30'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        {selectedTypes.size > 0 && (
          <span
            className="ml-0.5 p-0.5 rounded-full hover:bg-brand-lavender/20"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <X size={10} />
          </span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-card border border-border rounded-2xl shadow-lg py-1.5 min-w-[160px]">
          {TYPE_FILTER_OPTIONS.map(opt => {
            const active = selectedTypes.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                  active ? 'text-brand-lavender font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                  active ? 'bg-brand-lavender border-brand-lavender' : 'border-border'
                }`}>
                  {active && <span className="text-white text-[8px] leading-none">✓</span>}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Customer dropdown ─────────────────────────────────────────────────────────
function CustomerDropdown({ customers, value, onChange }) {
  const selected = customers.find(c => c.id === value);
  const label = selected ? selected.name : 'Customer';

  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 rounded-xl border text-xs font-medium transition-all focus:outline-none cursor-pointer ${
          value
            ? 'bg-brand-lavender/15 text-brand-lavender border-brand-lavender/30'
            : 'bg-secondary border-border text-muted-foreground'
        }`}
        style={{ backgroundImage: 'none' }}
      >
        <option value="">Customer</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  );
}

// ── Date range dropdown ───────────────────────────────────────────────────────
function DateRangeDropdown({ value, onChange }) {
  const selected = DATE_RANGE_OPTIONS.find(o => o.value === value);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 rounded-xl border text-xs font-medium transition-all focus:outline-none cursor-pointer ${
          value !== 'all'
            ? 'bg-brand-lavender/15 text-brand-lavender border-brand-lavender/30'
            : 'bg-secondary border-border text-muted-foreground'
        }`}
        style={{ backgroundImage: 'none' }}
      >
        {DATE_RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  );
}

// ── Add Note modal ────────────────────────────────────────────────────────────
function AddNoteModal({ customers, initialData, onSave, onClose }) {
  const [text, setText] = useState(initialData?.text || '');
  const [customerId, setCustomerId] = useState(initialData?.customerId || '');
  const [tag, setTag] = useState(initialData?.tag || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ text: text.trim(), customerId: customerId || null, tag: tag || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {initialData ? 'Edit Note' : 'Add Note'}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write your note…"
            rows={4}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 pr-8 py-2 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
              >
                <option value="">No client</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
            </div>

            <div className="relative">
              <select
                value={tag}
                onChange={e => setTag(e.target.value)}
                className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 pr-8 py-2 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
              >
                <option value="">No tag</option>
                {ANNOTATION_TAGS.map(t => (
                  <option key={t} value={t}>{ANNOTATION_TAG_LABELS[t]}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-4 py-2 rounded-xl bg-brand-lavender text-white text-xs font-semibold hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {initialData ? 'Save changes' : 'Add note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Memory card ───────────────────────────────────────────────────────────────
function MemoryCard({ entry, highlightRegex, aiActive, aiReason, onClick }) {
  const colors = getEntryColors(entry);
  const dateStr = formatEntryDate(entry.date);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      onClick={() => onClick(entry)}
      className="bg-card border border-border rounded-2xl px-4 py-3 hover:bg-accent/30 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        {/* Icon + type badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
          <span className="text-base leading-none">{entry.icon}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border} whitespace-nowrap`}>
            {entry.label}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Meta: customer + date */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {entry.customerName && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.customerColor || '#6366f1' }}
                />
                {entry.customerName}
              </span>
            )}
            {dateStr && (
              <span className="text-[10px] text-muted-foreground">
                {dateStr}
              </span>
            )}
            {entry.subtext && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                {entry.subtext}
              </span>
            )}
          </div>

          {/* Text — 2-line clamp */}
          <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">
            {highlightRegex ? highlightText(entry.text, highlightRegex) : entry.text}
          </p>

          {/* AI reason */}
          {aiActive && aiReason && (
            <p className="text-[10px] text-muted-foreground/70 mt-1 italic line-clamp-1">
              {aiReason}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Simple window virtualizer ─────────────────────────────────────────────────
const ITEM_HEIGHT = 92;
const BUFFER_COUNT = 20;

function useWindowVirtualizer(totalItems, enabled) {
  const containerRef = useRef(null);
  const [slice, setSlice] = useState({ start: 0, end: Math.min(totalItems, 60) });

  useEffect(() => {
    if (!enabled) {
      setSlice({ start: 0, end: totalItems });
      return;
    }

    const update = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerTop = rect.top + window.scrollY;
      const scrollY = window.scrollY;
      const viewH = window.innerHeight;

      const relScroll = Math.max(0, scrollY - containerTop);
      const start = Math.max(0, Math.floor(relScroll / ITEM_HEIGHT) - BUFFER_COUNT);
      const end = Math.min(totalItems, Math.ceil((relScroll + viewH) / ITEM_HEIGHT) + BUFFER_COUNT);
      setSlice({ start, end });
    };

    // Give DOM time to settle on first render
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [totalItems, enabled]);

  return { containerRef, slice };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Knowledge({ onNavigate }) {
  const store = useAppStore();
  const { customers, annotations, addAnnotation, updateAnnotation, deleteAnnotation, aiSettings } = store;

  // ── State ──
  const [query, setQuery]                 = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [dateRange, setDateRange]         = useState('all');

  // AI search
  const [aiActive, setAiActive]         = useState(false);
  const [aiSearching, setAiSearching]   = useState(false);
  const [aiError, setAiError]           = useState(null);
  const [aiReasons, setAiReasons]       = useState({});
  const [aiRankedEntries, setAiRankedEntries] = useState(null);

  // UI
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showAddNote, setShowAddNote]     = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState(null);

  const debounceRef = useRef(null);
  const searchRef   = useRef(null);

  // ── Debounce query (200ms) ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Reset AI results when query or filters change
  useEffect(() => {
    if (aiActive) {
      setAiActive(false);
      setAiRankedEntries(null);
      setAiReasons({});
      setAiError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedTypes, selectedCustomer, dateRange]);

  // ── Build memory index ──
  const memoryIndex = useMemo(() => buildMemoryIndex(store), [
    store.tasks, store.weeklyUpdateLogs, store.meetingEntries,
    store.aiOutputs, store.milestones, store.points,
    store.annotations, store.customers,
  ]);

  // ── Apply filters (keyword + type + customer + date) ──
  const filteredEntries = useMemo(() => {
    const words = debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cutoff = getDateCutoff(dateRange);

    return memoryIndex.filter(entry => {
      if (!matchesTypeFilter(entry, selectedTypes)) return false;
      if (selectedCustomer && entry.customerId !== selectedCustomer) return false;
      if (cutoff && !isAfter(parseISO(entry.date), cutoff)) return false;
      if (!matchesKeyword(entry, words)) return false;
      return true;
    });
  }, [memoryIndex, debouncedQuery, selectedTypes, selectedCustomer, dateRange]);

  // ── Display entries: AI-ranked or keyword-filtered ──
  const displayEntries = aiActive && aiRankedEntries
    ? aiRankedEntries.filter(e => filteredEntries.some(f => f.id === e.id))
    : filteredEntries;

  // Memoize to a stable array reference — prevents every MemoryCard from getting
  // a new prop reference on unrelated re-renders (e.g. selectedEntry changes)
  const queryWords = useMemo(
    () => debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [debouncedQuery]
  );

  // Compile the highlight regex once per query instead of once per card render
  const highlightRegex = useMemo(() => {
    if (!queryWords.length) return null;
    const escaped = queryWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(${escaped.join('|')})`, 'gi');
  }, [queryWords]);

  // ── Virtualization ──
  const shouldVirtualize = displayEntries.length > 200;
  const { containerRef, slice } = useWindowVirtualizer(displayEntries.length, shouldVirtualize);
  const visibleEntries = shouldVirtualize ? displayEntries.slice(slice.start, slice.end) : displayEntries;
  const paddingTop = shouldVirtualize ? slice.start * ITEM_HEIGHT : 0;
  const paddingBottom = shouldVirtualize ? Math.max(0, (displayEntries.length - slice.end) * ITEM_HEIGHT) : 0;

  // ── AI search ──
  const handleAiSearch = useCallback(async () => {
    if (!query.trim()) return;
    if (aiActive) {
      // Toggle off
      setAiActive(false);
      setAiRankedEntries(null);
      setAiReasons({});
      return;
    }

    setAiSearching(true);
    setAiError(null);

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      const { rankedEntries, reasons } = await aiMemorySearch(
        query,
        filteredEntries,
        apiKey
      );
      setAiRankedEntries(rankedEntries);
      setAiReasons(reasons);
      setAiActive(true);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSearching(false);
    }
  }, [query, aiActive, filteredEntries]);

  // ── Filter helpers ──
  const toggleType = (type) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const hasActiveFilters = selectedTypes.size > 0 || selectedCustomer || dateRange !== 'all';

  const clearFilters = () => {
    setSelectedTypes(new Set());
    setSelectedCustomer('');
    setDateRange('all');
  };

  // ── Annotation CRUD ──
  const handleSaveNote = ({ text, customerId, tag }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (editingAnnotation) {
      updateAnnotation(editingAnnotation.id, { text, customerId, tag, date: editingAnnotation.date || today });
      setEditingAnnotation(null);
    } else {
      addAnnotation({ text, customerId, tag, date: today });
    }
    setShowAddNote(false);
  };

  const handleEditAnnotation = (entry) => {
    setSelectedEntry(null);
    setEditingAnnotation(entry.sourceRef);
    setShowAddNote(true);
  };

  const handleDeleteAnnotation = (entry) => {
    deleteAnnotation(entry.sourceRef.id);
    setSelectedEntry(null);
  };

  // ── Navigation helper ──
  const handleNavigateToTriage = () => {
    onNavigate?.('triage');
  };

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-brand-lavender" />
            <h1 className="text-2xl font-bold text-foreground">Memory</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-7">Everything you've logged, searchable.</p>
        </div>
        <button
          onClick={() => { setEditingAnnotation(null); setShowAddNote(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-lavender/15 text-brand-lavender text-xs font-semibold hover:bg-brand-lavender/25 transition-all border border-brand-lavender/20"
        >
          <Plus size={13} />
          Add Note
        </button>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tasks, meetings, learnings, decisions…"
          className="w-full h-12 bg-card border border-border rounded-2xl pl-11 pr-28 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 transition-all"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => { setQuery(''); setDebouncedQuery(''); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleAiSearch}
            disabled={!query.trim() || aiSearching}
            title={aiActive ? 'Reset AI results' : 'AI semantic search'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              aiActive
                ? 'bg-brand-lavender text-white hover:bg-brand-lavender/80'
                : 'bg-brand-lavender/15 text-brand-lavender hover:bg-brand-lavender/25'
            }`}
          >
            {aiSearching
              ? <Loader2 size={13} className="animate-spin" />
              : <Sparkles size={13} />
            }
            {aiActive ? 'AI on' : 'AI'}
          </button>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <TypeDropdown
          selectedTypes={selectedTypes}
          onToggle={toggleType}
          onClear={() => setSelectedTypes(new Set())}
        />
        <CustomerDropdown
          customers={customers}
          value={selectedCustomer}
          onChange={setSelectedCustomer}
        />
        <DateRangeDropdown value={dateRange} onChange={setDateRange} />
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={11} /> Clear filters
          </button>
        )}
      </div>

      {/* ── AI error ── */}
      {aiError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-400">AI search failed</p>
            <p className="text-[11px] text-red-400/70 mt-0.5">{aiError}</p>
          </div>
          <button onClick={() => setAiError(null)} className="text-red-400/60 hover:text-red-400">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{displayEntries.length}</span> of{' '}
          <span className="font-medium text-foreground">{memoryIndex.length}</span> entries
        </span>
        {aiActive && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-lavender/15 text-brand-lavender text-[10px] font-semibold border border-brand-lavender/20">
            <Sparkles size={9} />
            AI ranked
          </span>
        )}
      </div>

      {/* ── Results list ── */}
      {aiSearching ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : displayEntries.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-6 py-12 text-center">
          <Search size={28} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">No entries match your search.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try different keywords or adjust your filters.</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-brand-lavender hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div ref={containerRef}>
          {/* Top spacer for virtualization */}
          {paddingTop > 0 && <div style={{ height: paddingTop }} />}

          {/*
            AnimatePresence is only used when NOT virtualizing. When virtualizing,
            items leaving visibleEntries (due to scroll) would each trigger an exit
            animation, creating invisible animated elements at the viewport edge.
          */}
          {shouldVirtualize ? (
            <div className="space-y-2">
              {visibleEntries.map(entry => (
                <MemoryCard
                  key={`${entry.entityType}-${entry.id}`}
                  entry={entry}
                  highlightRegex={highlightRegex}
                  aiActive={aiActive}
                  aiReason={aiReasons[entry.id]}
                  onClick={setSelectedEntry}
                />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <div className="space-y-2">
                {visibleEntries.map(entry => (
                  <MemoryCard
                    key={`${entry.entityType}-${entry.id}`}
                    entry={entry}
                    highlightRegex={highlightRegex}
                    aiActive={aiActive}
                    aiReason={aiReasons[entry.id]}
                    onClick={setSelectedEntry}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}

          {/* Bottom spacer for virtualization */}
          {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
        </div>
      )}

      {/* ── Memory detail drawer ── */}
      {selectedEntry && (
        <MemoryDetailDrawer
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onNavigateToTriage={handleNavigateToTriage}
          extraActions={selectedEntry.entityType === 'annotation' ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleEditAnnotation(selectedEntry)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
              >
                <PencilLine size={12} /> Edit
              </button>
              <button
                onClick={() => handleDeleteAnnotation(selectedEntry)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-all"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          ) : null}
        />
      )}

      {/* ── Add / Edit Note modal ── */}
      {showAddNote && (
        <AddNoteModal
          customers={customers}
          initialData={editingAnnotation}
          onSave={handleSaveNote}
          onClose={() => { setShowAddNote(false); setEditingAnnotation(null); }}
        />
      )}
    </div>
  );
}
