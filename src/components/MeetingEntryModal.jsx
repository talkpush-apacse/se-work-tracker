import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import Modal from './Modal';
import { Button } from './ui/button';
import MeetingActionItemRow from './MeetingActionItemRow';
import { generateMeetingSummary } from '../utils/meetingAI';

// Returns today as YYYY-MM-DD in local time
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function uid8() {
  return Math.random().toString(36).slice(2, 10);
}

// ── AI Summary section ─────────────────────────────────────────────────────────
function AISummarySection({ data, onUpdateActionItem, onConvertActionItem, onRegenerate, isGenerating }) {
  const { aiSummary, decisions, openQuestions, actionItems } = data;
  const [expanded, setExpanded] = useState({ decisions: true, questions: true, actions: true });

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-brand-lavender" />
          <span className="text-xs font-semibold text-brand-lavender">AI Summary</span>
          {data.aiGeneratedAt && (
            <span className="text-[10px] text-muted-foreground/60 ml-1">
              {format(new Date(data.aiGeneratedAt), 'MMM d, h:mma')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          {isGenerating
            ? <Loader2 size={11} className="animate-spin" />
            : <RefreshCw size={11} />
          }
          Re-generate
        </button>
      </div>

      {/* Summary paragraph */}
      {aiSummary && (
        <p className="text-xs text-foreground/90 leading-relaxed">{aiSummary}</p>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => toggle('decisions')}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80 mb-1.5"
          >
            <span>✅ Decisions ({decisions.length})</span>
            <ChevronDown size={11} className={`transition-transform ${expanded.decisions ? 'rotate-180' : ''}`} />
          </button>
          {expanded.decisions && (
            <ul className="space-y-1 pl-1">
              {decisions.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                  <span className="flex-shrink-0 mt-0.5 text-emerald-400">•</span>
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Open Questions */}
      {openQuestions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => toggle('questions')}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80 mb-1.5"
          >
            <span>❓ Open Questions ({openQuestions.length})</span>
            <ChevronDown size={11} className={`transition-transform ${expanded.questions ? 'rotate-180' : ''}`} />
          </button>
          {expanded.questions && (
            <ul className="space-y-1 pl-1">
              {openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                  <span className="flex-shrink-0 mt-0.5 text-amber-400">•</span>
                  {q}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => toggle('actions')}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80 mb-1.5"
          >
            <span>📋 Action Items ({actionItems.length})</span>
            <ChevronDown size={11} className={`transition-transform ${expanded.actions ? 'rotate-180' : ''}`} />
          </button>
          {expanded.actions && (
            <div className="space-y-0.5 border-t border-border/30 pt-2">
              {actionItems.map(item => (
                <MeetingActionItemRow
                  key={item.id}
                  item={item}
                  onConvert={onConvertActionItem}
                  onUpdate={onUpdateActionItem}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Skeleton for AI loading ────────────────────────────────────────────────────
function AISkeleton() {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded bg-brand-lavender/30" />
        <div className="h-3 w-20 rounded bg-secondary" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-secondary" />
        <div className="h-3 w-5/6 rounded bg-secondary" />
        <div className="h-3 w-4/6 rounded bg-secondary" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-24 rounded bg-secondary" />
        <div className="h-3 w-full rounded bg-secondary" />
        <div className="h-3 w-3/4 rounded bg-secondary" />
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

/**
 * MeetingEntryModal
 *
 * Props:
 *   entry        — null for new, existing meetingEntry for edit
 *   defaultCustomerId — pre-select this customer when creating
 *   customers    — full customers array
 *   onSave(data) — called with complete meeting entry data
 *   onConvertActionItem(item, customerId) — creates task, returns taskId
 *   onClose()
 */
export default function MeetingEntryModal({
  entry,
  defaultCustomerId,
  customers,
  onSave,
  onConvertActionItem,
  onClose,
}) {
  const isEdit = !!entry;

  const [form, setForm] = useState({
    title:       entry?.title       || '',
    customerId:  entry?.customerId  || defaultCustomerId || '',
    meetingDate: entry?.meetingDate || todayLocalISO(),
    attendees:   entry?.attendees   || '',
    rawNotes:    entry?.rawNotes    || '',
  });

  // AI fields
  const [aiData, setAiData] = useState(
    entry?.aiSummary ? {
      aiSummary:     entry.aiSummary,
      decisions:     entry.decisions      || [],
      openQuestions: entry.openQuestions  || [],
      actionItems:   entry.actionItems    || [],
      aiGeneratedAt: entry.aiGeneratedAt  || null,
      aiProvider:    entry.aiProvider     || null,
    } : null
  );

  const [aiGenerating, setAiGenerating]   = useState(false);
  const [aiError, setAiError]             = useState(null);

  const hasAiSummary = !!aiData?.aiSummary;

  // ── AI generation ──
  const runAI = async () => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const result = await generateMeetingSummary({ ...form, id: entry?.id });
      if (result) {
        // Preserve convertedToTaskId on existing action items when re-generating
        if (aiData?.actionItems?.length) {
          const existing = new Map(aiData.actionItems.map(ai => [ai.text, ai.convertedToTaskId]));
          result.actionItems = result.actionItems.map(ai => ({
            ...ai,
            convertedToTaskId: existing.get(ai.text) || null,
          }));
        }
        setAiData(result);
      } else {
        setAiError('Could not generate summary. Check your API key or try again.');
      }
    } catch (err) {
      setAiError(err.message || 'Could not generate summary. Check your API key or try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Action item update (e.g. convertedToTaskId set) ──
  const handleUpdateActionItem = (itemId, patch) => {
    setAiData(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(ai =>
        ai.id === itemId ? { ...ai, ...patch } : ai
      ),
    }));
  };

  // ── Convert action item to task ──
  const handleConvertActionItem = async (item) => {
    if (!onConvertActionItem) return null;
    return onConvertActionItem(item, form.customerId);
  };

  // ── Save ──
  const handleSave = (e) => {
    e.preventDefault();
    if (!form.rawNotes.trim()) return;

    const saved = {
      ...(entry || {}),
      ...form,
      rawNotes: form.rawNotes.trim(),
      title: form.title.trim() || null,
      attendees: form.attendees.trim() || null,
      ...(aiData ? {
        aiSummary:     aiData.aiSummary,
        decisions:     aiData.decisions,
        openQuestions: aiData.openQuestions,
        actionItems:   aiData.actionItems,
        aiGeneratedAt: aiData.aiGeneratedAt,
        aiProvider:    aiData.aiProvider,
      } : {}),
    };

    onSave(saved);
  };

  const canSummarize = form.rawNotes.trim().length > 0;

  return (
    <Modal
      title={isEdit ? 'Edit Meeting' : 'New Meeting'}
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* ── Header fields ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Title <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Inspiro UAT Review"
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer</label>
            <select
              value={form.customerId}
              onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
              className="w-full h-9 bg-secondary border border-border rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">No customer</option>
              {(customers || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
            <input
              type="date"
              value={form.meetingDate}
              onChange={e => setForm(p => ({ ...p, meetingDate: e.target.value }))}
              className="w-full h-9 bg-secondary border border-border rounded-xl px-3 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Attendees <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <input
              type="text"
              value={form.attendees}
              onChange={e => setForm(p => ({ ...p, attendees: e.target.value }))}
              placeholder="e.g. Jolo, Karen (Inspiro), Ken (Inspiro)"
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>
        </div>

        {/* ── Raw notes ── */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes *</label>
          <textarea
            value={form.rawNotes}
            onChange={e => setForm(p => ({ ...p, rawNotes: e.target.value }))}
            placeholder="Paste or type your raw meeting notes here…"
            rows={7}
            style={{ minHeight: '200px' }}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-y"
          />
        </div>

        {/* ── AI error ── */}
        {aiError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2.5">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-400">{aiError}</p>
          </div>
        )}

        {/* ── AI Summary section ── */}
        <AnimatePresence mode="wait">
          {aiGenerating ? (
            <AISkeleton key="skeleton" />
          ) : hasAiSummary ? (
            <AISummarySection
              key="summary"
              data={aiData}
              onUpdateActionItem={handleUpdateActionItem}
              onConvertActionItem={handleConvertActionItem}
              onRegenerate={runAI}
              isGenerating={aiGenerating}
            />
          ) : null}
        </AnimatePresence>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
          {/* Summarize button — left side */}
          {!hasAiSummary && (
            <Button
              type="button"
              size="sm"
              disabled={!canSummarize || aiGenerating}
              onClick={runAI}
              className="flex items-center gap-1.5"
            >
              {aiGenerating
                ? <Loader2 size={13} className="animate-spin" />
                : <Sparkles size={13} />
              }
              {aiGenerating ? 'Summarizing…' : 'Summarize with AI'}
            </Button>
          )}

          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!form.rawNotes.trim()}>
              {isEdit ? 'Save Changes' : 'Save Entry'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
