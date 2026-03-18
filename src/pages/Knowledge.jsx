import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain, Search, Sparkles, StickyNote, X, Loader2, ChevronDown, Plus, AlertCircle, PencilLine, Trash2,
  CheckSquare, Square, CheckCheck, Database,
} from 'lucide-react';
import {
  format, parseISO, formatDistanceToNow, differenceInDays,
  startOfWeek, startOfMonth, subMonths, startOfYear, isAfter,
} from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { buildMemoryIndex, getEntryColors } from '../utils/memoryIndex';
import { chunkMemoryEntries } from '../utils/chunker';
import { ragSearch } from '../utils/ragSearch';
import { ANNOTATION_TAGS, ANNOTATION_TAG_LABELS } from '../constants';
import MemoryDetailDrawer from '../components/MemoryDetailDrawer';

// ── Source badge config for auto-indexed annotations ──────────────────────────
const SOURCE_BADGE_CONFIG = {
  'ai-output':     { label: 'AI Draft',      cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  'meeting':       { label: 'Meeting',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  'task':          { label: 'Task',           cls: 'bg-green-50 text-green-700 border-green-200' },
  'weekly-update': { label: 'Update',         cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'weekly-report': { label: 'Weekly Report',  cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

// ── Type filter options ────────────────────────────────────────────────────────
const TYPE_FILTER_OPTIONS = [
  { value: 'task',        label: 'Task' },
  { value: 'meeting',     label: 'Meeting' },
  { value: 'highlight',   label: 'Highlight',  weeklyLogType: true },
  { value: 'lowlight',    label: 'Lowlight',   weeklyLogType: true },
  { value: 'learning',    label: 'Learning',   weeklyLogType: true },
  { value: 'shoutout',    label: 'Shoutout',   weeklyLogType: true },
  { value: 'artifact',    label: 'Artifact' },
  { value: 'task-note',   label: 'Task Note' },
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
      ? <mark key={i} className="bg-amber-100 text-foreground rounded px-0.5">{part}</mark>
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

// ── RAG Answer card skeleton ──────────────────────────────────────────────────
function AnswerSkeleton() {
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-4 animate-pulse space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={14} className="text-accent-foreground/40" />
        <div className="h-3 w-20 bg-accent/30 rounded" />
      </div>
      <div className="h-3 w-full bg-accent/20 rounded" />
      <div className="h-3 w-5/6 bg-accent/20 rounded" />
      <div className="h-3 w-4/6 bg-accent/20 rounded" />
      <p className="text-[11px] text-muted-foreground/50 pt-1">Searching memory…</p>
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
                  {active && <span className="text-foreground text-[8px] leading-none">✓</span>}
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
        {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  );
}

// ── Date range dropdown ───────────────────────────────────────────────────────
function DateRangeDropdown({ value, onChange }) {
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
                {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              className="px-4 py-2 rounded-xl bg-brand-lavender text-foreground text-xs font-semibold hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
function MemoryCard({ entry, highlightRegex, similarityPct, onClick, isSelected, isSelectMode, onSelect, entryIndex }) {
  const colors = getEntryColors(entry);
  const dateStr = formatEntryDate(entry.date);

  const handleCardClick = (e) => {
    if (isSelectMode) {
      onSelect(entry, entryIndex, e.shiftKey);
    } else {
      onClick(entry);
    }
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(entry, entryIndex, e.shiftKey);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      onClick={handleCardClick}
      className={`relative border rounded-2xl px-4 py-3 hover:shadow-sm transition-all cursor-pointer group ${
        isSelected
          ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-200'
          : 'bg-card border-border hover:bg-accent/30'
      }`}
    >
      {/* Checkbox — visible on hover or when in select mode */}
      <div
        className={`absolute top-3 right-3 transition-opacity ${isSelectMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={handleCheckboxClick}
      >
        {isSelected
          ? <CheckSquare size={16} className="text-teal-500" />
          : <Square size={16} className="text-muted-foreground/50" />
        }
      </div>

      <div className="flex items-start gap-3">
        {/* Icon + type badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
          {entry.entityType === 'artifact'
            ? <Sparkles size={16} className="text-primary" />
            : entry.entityType === 'task-note'
              ? <StickyNote size={16} className="text-amber-700" />
              : <span className="text-base leading-none">{entry.icon}</span>
          }
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border} whitespace-nowrap`}>
            {entry.label}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Meta: customer + date + similarity */}
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
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                entry.entityType === 'meeting'
                  ? 'font-bold bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}>
                {entry.subtext}
              </span>
            )}
            {/* Source badge — only on auto-generated annotations */}
            {entry.entityType === 'annotation' && entry.sourceRef?.autoGenerated && SOURCE_BADGE_CONFIG[entry.sourceRef.source] && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${SOURCE_BADGE_CONFIG[entry.sourceRef.source].cls}`}>
                {SOURCE_BADGE_CONFIG[entry.sourceRef.source].label}
              </span>
            )}
            {/* Similarity badge for RAG source results */}
            {similarityPct != null && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-lavender/15 text-brand-lavender border border-brand-lavender/20">
                {similarityPct}% match
              </span>
            )}
          </div>

          {/* Meeting-specific: show summary + badges instead of raw text */}
          {entry.entityType === 'meeting' && entry.sourceRef?.aiSummary ? (
            <>
              <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">
                {highlightRegex ? highlightText(entry.sourceRef.aiSummary, highlightRegex) : entry.sourceRef.aiSummary}
              </p>
              {/* Meeting pill badges */}
              <div className="flex items-center gap-1.5 mt-1">
                {(entry.sourceRef.actionItems || []).filter(a => typeof a === 'object' ? !a.triaged : true).length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {(entry.sourceRef.actionItems || []).filter(a => typeof a === 'object' ? !a.triaged : true).length} pending actions
                  </span>
                )}
                {(entry.sourceRef.decisions || []).length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {(entry.sourceRef.decisions || []).length} decision{(entry.sourceRef.decisions || []).length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </>
          ) : (
            /* Text — 2-line clamp */
            <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">
              {highlightRegex ? highlightText(entry.text, highlightRegex) : entry.text}
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

const DELETABLE_TYPES = new Set(['annotation', 'task', 'meeting', 'milestone', 'activityLog', 'weeklyLog']);

function getEntryKey(entry) {
  return `${entry.entityType}-${entry.id}`;
}

// Build a lookup map from entity id → MemoryEntry for RAG chunk → entry resolution
function buildIdMap(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.id, e);
  return map;
}

export default function Knowledge({ onNavigate }) {
  const store = useAppStore();
  const {
    customers, annotations, addAnnotation, updateAnnotation, deleteAnnotation,
    deleteTask, deleteMeetingEntry, deleteMilestone, deletePoint, deleteWeeklyUpdateLog,
    aiSettings,
  } = store;

  // ── State ──
  const [query, setQuery]                   = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTypes, setSelectedTypes]   = useState(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [dateRange, setDateRange]           = useState('all');

  // RAG search
  const [ragMode, setRagMode]               = useState(false); // true when RAG results are shown
  const [ragSearching, setRagSearching]     = useState(false);
  const [ragAnswer, setRagAnswer]           = useState(null);
  const [ragChunks, setRagChunks]           = useState([]);   // raw chunks from API
  const [ragError, setRagError]             = useState(null);

  // Rebuild memory index (backfill)
  const [rebuilding, setRebuilding]         = useState(false);
  const [rebuildStatus, setRebuildStatus]   = useState(null); // null | 'done' | 'error'

  // UI
  const [selectedEntry, setSelectedEntry]   = useState(null);
  const [showAddNote, setShowAddNote]       = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState(null);

  // Bulk select
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const lastSelectedIndexRef                = useRef(null);

  const debounceRef = useRef(null);
  const searchRef   = useRef(null);

  // ── Debounce query (200ms) ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Reset RAG results when query or filters change
  useEffect(() => {
    if (ragMode) {
      setRagMode(false);
      setRagAnswer(null);
      setRagChunks([]);
      setRagError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedTypes, selectedCustomer, dateRange]);

  // ── Build memory index ──
  const memoryIndex = useMemo(() => buildMemoryIndex(store), [
    store.tasks, store.weeklyUpdateLogs, store.meetingEntries,
    store.aiOutputs, store.milestones, store.points,
    store.annotations, store.customers,
  ]);

  const entryById = useMemo(() => buildIdMap(memoryIndex), [memoryIndex]);

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

  // ── Resolve RAG chunks → MemoryEntry objects for display ──
  // Chunks from the vector store reference entity_id, which maps to MemoryEntry.id
  const ragSourceEntries = useMemo(() => {
    if (!ragChunks.length) return [];
    const seen = new Set();
    return ragChunks
      .map(chunk => {
        const entry = entryById.get(chunk.entity_id);
        if (!entry || seen.has(entry.id)) return null;
        seen.add(entry.id);
        return { entry, similarity: chunk.similarity };
      })
      .filter(Boolean);
  }, [ragChunks, entryById]);

  // ── Display entries: RAG sources or keyword-filtered ──
  const displayEntries = ragMode ? ragSourceEntries.map(s => s.entry) : filteredEntries;

  const queryWords = useMemo(
    () => debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [debouncedQuery]
  );

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

  // ── RAG search ──
  const handleRagSearch = useCallback(async () => {
    if (!query.trim()) return;

    if (ragMode) {
      // Toggle off — back to browse
      setRagMode(false);
      setRagAnswer(null);
      setRagChunks([]);
      setRagError(null);
      return;
    }

    setRagSearching(true);
    setRagError(null);

    const apiSecret = import.meta.env.VITE_API_SECRET;

    // Build filters from current UI selections
    const filters = {};
    if (selectedCustomer) filters.customer_id = selectedCustomer;
    if (selectedTypes.size > 0) {
      // Map weeklyLog sub-types back to 'weeklyLog' entity type for the backend filter
      const entityTypes = [...selectedTypes].map(t => {
        const opt = TYPE_FILTER_OPTIONS.find(o => o.value === t);
        return opt?.weeklyLogType ? 'weeklyLog' : t;
      });
      filters.entity_types = [...new Set(entityTypes)];
    }

    // Pass the user's preferred Claude model — synthesis now happens server-side
    const result = await ragSearch(query, filters, apiSecret, aiSettings?.claudeModel);

    setRagSearching(false);

    if (result.error) {
      setRagError(result.error);
      return;
    }

    setRagAnswer(result.answer);
    setRagChunks(result.chunks);
    setRagMode(true);
  }, [query, ragMode, selectedCustomer, selectedTypes]);

  // ── Rebuild Memory Index (backfill) ──
  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    setRebuildStatus(null);
    try {
      const entries = buildMemoryIndex(store);
      const chunks = chunkMemoryEntries(entries);
      const res = await fetch('/api/embeddings?op=upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_API_SECRET}`,
        },
        body: JSON.stringify({ chunks }),
      });
      if (!res.ok) throw new Error('Upsert failed');
      setRebuildStatus(`done:${chunks.length}`);
    } catch {
      setRebuildStatus('error');
    } finally {
      setRebuilding(false);
    }
  }, [store]);

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

  const clearRag = () => {
    setRagMode(false);
    setRagAnswer(null);
    setRagChunks([]);
    setRagError(null);
  };

  // ── Bulk select ──
  const isSelectMode = selectedIds.size > 0;

  const handleSelectEntry = useCallback((entry, index, shiftKey) => {
    if (!DELETABLE_TYPES.has(entry.entityType)) return;
    const key = getEntryKey(entry);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndexRef.current !== null) {
        const from = Math.min(lastSelectedIndexRef.current, index);
        const to = Math.max(lastSelectedIndexRef.current, index);
        displayEntries.slice(from, to + 1)
          .filter(e => DELETABLE_TYPES.has(e.entityType))
          .forEach(e => next.add(getEntryKey(e)));
      } else {
        next.has(key) ? next.delete(key) : next.add(key);
        lastSelectedIndexRef.current = index;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayEntries]);

  const handleSelectAll = () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    } else {
      const all = new Set(
        displayEntries.filter(e => DELETABLE_TYPES.has(e.entityType)).map(getEntryKey)
      );
      setSelectedIds(all);
    }
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(key => {
      const [entityType, ...idParts] = key.split('-');
      const id = idParts.join('-');
      switch (entityType) {
        case 'annotation':  deleteAnnotation(id); break;
        case 'task':        deleteTask(id); break;
        case 'meeting':     deleteMeetingEntry(id); break;
        case 'milestone':   deleteMilestone(id); break;
        case 'activityLog': deletePoint(id); break;
        case 'weeklyLog':   deleteWeeklyUpdateLog(id); break;
        default: break;
      }
    });
    setSelectedIds(new Set());
    setShowBulkConfirm(false);
    lastSelectedIndexRef.current = null;
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

  const handleNavigateToTriage = () => {
    onNavigate?.('triage');
  };

  // Resolve rebuild status label
  const rebuildLabel = (() => {
    if (rebuilding) return null; // handled by button state
    if (!rebuildStatus) return null;
    if (rebuildStatus === 'error') return 'Index failed';
    const n = rebuildStatus.replace('done:', '');
    return `Done — ${n} chunks indexed`;
  })();

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-brand-lavender" />
            <h1 className="text-2xl font-bold text-foreground">Memory</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-7">Everything you've logged, searchable.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Rebuild Memory Index button */}
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              title="Re-embed all entries into the vector store"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/80 text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-secondary transition-all border border-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebuilding
                ? <Loader2 size={12} className="animate-spin" />
                : <Database size={12} />
              }
              {rebuilding
                ? `Indexing ${chunkMemoryEntries(buildMemoryIndex(store)).length} entries…`
                : 'Rebuild Index'
              }
            </button>
            {rebuildLabel && (
              <span className={`text-[10px] ${rebuildStatus === 'error' ? 'text-red-700' : 'text-muted-foreground'}`}>
                {rebuildLabel}
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditingAnnotation(null); setShowAddNote(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-lavender/15 text-brand-lavender text-xs font-semibold hover:bg-brand-lavender/25 transition-all border border-brand-lavender/20"
          >
            <Plus size={13} />
            Add Note
          </button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && query.trim()) handleRagSearch(); }}
          placeholder="Search tasks, meetings, learnings, decisions…"
          className="w-full h-12 bg-input-bg border border-border rounded-xl pl-11 pr-28 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 transition-all"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => { setQuery(''); setDebouncedQuery(''); clearRag(); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleRagSearch}
            disabled={!query.trim() || ragSearching}
            title={ragMode ? 'Clear AI results' : 'AI semantic search (RAG)'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              ragMode
                ? 'bg-brand-lavender text-foreground hover:bg-brand-lavender/80'
                : 'bg-brand-lavender/15 text-brand-lavender hover:bg-brand-lavender/25'
            }`}
          >
            {ragSearching
              ? <Loader2 size={13} className="animate-spin" />
              : <Sparkles size={13} />
            }
            {ragMode ? 'AI on' : 'AI'}
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
        {/* Notes & Artifacts quick-toggle chip */}
        {(() => {
          const bothActive = selectedTypes.has('artifact') && selectedTypes.has('task-note');
          return (
            <button
              onClick={() => setSelectedTypes(prev => {
                const next = new Set(prev);
                if (bothActive) { next.delete('artifact'); next.delete('task-note'); }
                else { next.add('artifact'); next.add('task-note'); }
                return next;
              })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                bothActive
                  ? 'bg-brand-lavender/15 text-brand-lavender border-brand-lavender/30'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <StickyNote size={11} />
              Notes & Artifacts
            </button>
          );
        })()}
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

      {/* ── RAG error ── */}
      {ragError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-700">AI search failed</p>
            <p className="text-[11px] text-red-700/70 mt-0.5">{ragError}</p>
          </div>
          <button onClick={() => setRagError(null)} className="text-red-700/60 hover:text-red-700">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── RAG answer card (searching skeleton or result) ── */}
      {ragSearching && <AnswerSkeleton />}

      {ragMode && ragAnswer && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Brain size={14} className="text-brand-lavender" />
              <span className="text-xs font-semibold text-foreground">AI Answer</span>
            </div>
            <button
              onClick={clearRag}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear <X size={11} />
            </button>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
            {ragAnswer}
          </p>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {ragMode ? (
            <span>
              Sources: <span className="font-medium text-foreground">{ragSourceEntries.length}</span> entries
            </span>
          ) : (
            <span>
              Showing <span className="font-medium text-foreground">{displayEntries.length}</span> of{' '}
              <span className="font-medium text-foreground">{memoryIndex.length}</span> entries
            </span>
          )}
          {ragMode && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-lavender/15 text-brand-lavender text-[10px] font-semibold border border-brand-lavender/20">
              <Sparkles size={9} />
              RAG
            </span>
          )}
        </div>
        {/* Select All toggle */}
        {displayEntries.length > 0 && (
          <button
            onClick={handleSelectAll}
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
              selectedIds.size > 0
                ? 'text-teal-600 hover:text-teal-700'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCheck size={13} />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </button>
        )}
      </div>

      {/* ── RAG sources label ── */}
      {ragMode && ragSourceEntries.length > 0 && (
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Sources ({ragSourceEntries.length})
        </p>
      )}

      {/* ── Results list ── */}
      {ragSearching ? null : displayEntries.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-6 py-12 text-center">
          <Search size={28} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            {ragMode ? 'No matching sources found.' : 'No entries match your search.'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {ragMode ? 'Try a different question or clear filters.' : 'Try different keywords or adjust your filters.'}
          </p>
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
          {paddingTop > 0 && <div style={{ height: paddingTop }} />}

          {shouldVirtualize ? (
            <div className="space-y-2">
              {visibleEntries.map((entry, i) => {
                const absoluteIndex = slice.start + i;
                const simPct = ragMode
                  ? ragSourceEntries.find(s => s.entry.id === entry.id)?.similarity
                  : null;
                return (
                  <MemoryCard
                    key={`${entry.entityType}-${entry.id}`}
                    entry={entry}
                    highlightRegex={highlightRegex}
                    similarityPct={simPct != null ? Math.round(simPct * 100) : null}
                    onClick={setSelectedEntry}
                    isSelected={selectedIds.has(getEntryKey(entry))}
                    isSelectMode={isSelectMode}
                    onSelect={handleSelectEntry}
                    entryIndex={absoluteIndex}
                  />
                );
              })}
            </div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <div className="space-y-2">
                {visibleEntries.map((entry, i) => {
                  const simPct = ragMode
                    ? ragSourceEntries.find(s => s.entry.id === entry.id)?.similarity
                    : null;
                  return (
                    <MemoryCard
                      key={`${entry.entityType}-${entry.id}`}
                      entry={entry}
                      highlightRegex={highlightRegex}
                      similarityPct={simPct != null ? Math.round(simPct * 100) : null}
                      onClick={setSelectedEntry}
                      isSelected={selectedIds.has(getEntryKey(entry))}
                      isSelectMode={isSelectMode}
                      onSelect={handleSelectEntry}
                      entryIndex={i}
                    />
                  );
                })}
              </div>
            </AnimatePresence>
          )}

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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-700 hover:bg-red-50 transition-all"
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

      {/* ── Bulk actions toolbar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-card border border-border shadow-xl"
          >
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={() => { setSelectedIds(new Set()); lastSelectedIndexRef.current = null; }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Deselect all
            </button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-all border border-red-200"
            >
              <Trash2 size={12} />
              Delete {selectedIds.size}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk delete confirmation dialog ── */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This will permanently delete {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} from your memory. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 rounded-xl bg-red-500 text-foreground text-xs font-semibold hover:bg-red-600 transition-all"
              >
                Delete {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
