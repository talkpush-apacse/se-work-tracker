import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import {
  ChevronDown, Plus, Mic, MicOff, Copy, Save, Check,
  Loader2, ClipboardList, Sparkles, ChevronRight,
  Calendar, User, Tag, AlertCircle, Archive, ArchiveX, Trash2,
  Settings, RotateCcw, Pencil, GripVertical, ExternalLink, ArrowLeft,
  Timer, Square, Pin, CheckSquare, Paperclip,
  Bookmark, Table2, X,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import ConfirmDialog from '../components/ConfirmDialog';
import FileAttachments from '../components/FileAttachments';
import RichTextEditor from '../components/ui/RichTextEditor';
import {
  TASK_TYPES, TASK_TYPE_LABELS, TASK_TYPE_COLORS,
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  AI_OUTPUT_TYPES, AI_OUTPUT_TYPE_LABELS,
  TASK_RECIPIENTS,
  CUSTOMER_COLORS,
  TASK_TYPE_POINTS,
  AUTO_TRACK_RATE,
  AUTO_TRACK_MIN_SECONDS,
  ANNOTATION_TAGS, ANNOTATION_TAG_LABELS, ANNOTATION_TAG_COLORS,
} from '../constants';
import Modal from '../components/Modal';
import { stripHtml } from '../lib/utils';

// ─── Helper: resolve recipient label from value key ───────────────────────────
function recipientLabel(value) {
  return TASK_RECIPIENTS.find(r => r.value === value)?.label || value || null;
}

// ─── Email nature options (shown as sub-dropdown when output type = message-draft) ─
const EMAIL_NATURES = [
  { value: 'generic-ack',      label: 'Generic Acknowledgment' },
  { value: 'set-expectations', label: 'Set Expectations'       },
  { value: 'share-update',     label: 'Share Update'           },
  { value: 'consult-internal', label: 'Consult Internal Team'  },
  { value: 'consult-client',   label: 'Consult Client'         },
];

// ─── System prompts per output type ───────────────────────────────────────────
// recipient is the human-readable label (e.g. "Client", "Internal — CRM Developers")
const SYSTEM_PROMPTS = {
  'message-draft': (task, client, recipient, emailNature) => {
    const natureInstructions = {
      'generic-ack':
        'Write a professional email acknowledging the client\'s message or request. Confirm you are looking into it. Keep it brief and warm.',
      'set-expectations':
        'Write a professional email setting clear expectations about timelines, next steps, or what the client should expect. Be specific but avoid over-committing.',
      'share-update':
        'Write a professional email sharing a progress update. Summarize what has been done, what is next, and any blockers.',
      'consult-internal':
        'Write a professional internal message asking a colleague for input, help, or review. Be specific about what you need and why.',
      'consult-client':
        'Write a professional email to the client asking for information, feedback, or a decision needed to proceed. Be specific about what you need.',
    };
    return `You are a professional Solutions Engineer at a SaaS company called Talkpush.
Write a clear, concise professional email related to the following task for client "${client}".
${recipient ? `This email is addressed to: ${recipient}.` : ''}
Nature of message: ${natureInstructions[emailNature] || natureInstructions['generic-ack']}
Task context: ${task}
Format: Start with "Subject: ..." on the first line, then a blank line, then the email body.
Keep the tone professional but warm. Be direct and action-oriented. No filler phrases.`;
  },

  'checklist': (task, client) =>
    `You are a Solutions Engineer at Talkpush creating an action checklist for client "${client}".
Task context: ${task}
Write a numbered checklist of clear, specific action items. Each item must start with an action verb.
No introductory paragraphs. No filler. Just the numbered list.`,

  'meeting-summary': (task, client, recipient) =>
    `You are a Solutions Engineer at Talkpush writing a meeting summary for client "${client}".
${recipient ? `Attendees/stakeholders: ${recipient}.` : ''}
Meeting context: ${task}
Write in four sections — Context, Key Decisions, Action Items (with owners if known), and Next Steps.
Be concise and scannable. Bullet points within sections are fine.`,
};

// ─── Inline customer creation form ──────────────────────────────────────────
// Used by both TriageForm and QuickAddTaskForm to allow creating a new customer
// without leaving the current form.
function InlineCustomerCreate({ onCustomerCreated }) {
  const { addCustomer } = useAppStore();
  const [newCustomer, setNewCustomer] = useState({ name: '', color: CUSTOMER_COLORS[0].value });

  const handleCreateCustomer = () => {
    if (!newCustomer.name.trim()) return;
    const created = addCustomer({ name: newCustomer.name.trim(), color: newCustomer.color });
    onCustomerCreated(created);
    setNewCustomer({ name: '', color: CUSTOMER_COLORS[0].value });
  };

  return (
    <div className="mt-2 p-2.5 bg-secondary border border-border rounded-xl space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">New Customer</p>
      <input
        value={newCustomer.name}
        onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
        placeholder="Customer name *"
        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
      />
      <div className="flex flex-wrap gap-1.5">
        {CUSTOMER_COLORS.map(({ name, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setNewCustomer(p => ({ ...p, color: value }))}
            title={name}
            className={`w-5 h-5 rounded-full transition-all ${newCustomer.color === value ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-110' : 'hover:scale-105'}`}
            style={{ backgroundColor: value }}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={!newCustomer.name.trim()}
        onClick={handleCreateCustomer}
        className="w-full py-1.5 rounded-lg bg-brand-lavender hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-foreground transition-colors"
      >
        Create Customer
      </button>
    </div>
  );
}

// ─── Inline triage form (shown below an untriaged entry) ──────────────────────
function TriageForm({ entry, customer, customers, onSubmit, onCancel }) {
  const { okrs } = useAppStore();
  const [form, setForm] = useState({
    customerId:    customer?.id || '',
    description:   entry.rawNotes.split('\n')[0].slice(0, 120), // pre-fill from first line
    taskType:      'comms',
    assigneeOrTeam: '',
    status:        'open',
    okrId:         '',
  });

  // Local list that grows if user creates new entries inline
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [showInlineCreate, setShowInlineCreate] = useState(false);

  const canSubmit = form.customerId && form.description.trim();

  // "Logged on" date from entry.createdAt
  const loggedOn = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="mt-3 border-t border-border/60 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Convert to Task</p>
        {loggedOn && (
          <p className="text-[10px] text-muted-foreground">Logged on {loggedOn}</p>
        )}
      </div>

      {/* Customer selector with inline creation */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">Customer *</label>
          <button
            type="button"
            onClick={() => setShowInlineCreate(v => !v)}
            className="text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
          >
            {showInlineCreate ? '✕ Cancel' : '+ New Customer'}
          </button>
        </div>
        <select
          value={form.customerId}
          onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">— Select customer —</option>
          {localCustomers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {showInlineCreate && (
          <InlineCustomerCreate
            onCustomerCreated={c => {
              setLocalCustomers(prev => [...prev, c]);
              setForm(f => ({ ...f, customerId: c.id }));
              setShowInlineCreate(false);
            }}
          />
        )}
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Task Description *</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Task Type</label>
          <select
            value={form.taskType}
            onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Recipient <span className="text-muted-foreground/70">(optional)</span></label>
        <select
          value={form.assigneeOrTeam}
          onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">— Select recipient —</option>
          {TASK_RECIPIENTS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Optional OKR selector */}
      {okrs.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">OKR <span className="text-muted-foreground/70">(optional)</span></label>
          <select
            value={form.okrId}
            onChange={e => setForm(p => ({ ...p, okrId: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">— No OKR —</option>
            {okrs.map(o => (
              <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl bg-muted hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ ...form, description: form.description.trim() })}
          className="flex-1 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-foreground transition-colors"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

// ─── Triage queue entry card ──────────────────────────────────────────────────
function TriageEntryCard({ entry, customer, onTriaged }) {
  const { addTask, markMeetingEntryTriaged, customers } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (formData) => {
    addTask({
      customerId: formData.customerId,
      okrId: formData.okrId || null,
      meetingEntryId: entry.id,
      description: formData.description,
      taskType: formData.taskType,
      assigneeOrTeam: formData.assigneeOrTeam || null,
      status: formData.status,
    });
    markMeetingEntryTriaged(entry.id);
    onTriaged();
  };

  const previewLines = entry.rawNotes.split('\n').slice(0, 3).join('\n');
  const hasMore = entry.rawNotes.split('\n').length > 3;

  return (
    <div className="bg-secondary/50 border border-border/60 rounded-xl p-3">
      {/* Entry meta */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {customer && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
              >
                {customer.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar size={10} />
            {new Date(entry.meetingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/20 flex-shrink-0">
          Untriaged
        </span>
      </div>

      {/* Notes preview */}
      <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {expanded ? entry.rawNotes : previewLines}
      </p>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-brand-lavender hover:text-brand-lavender/80 mt-1"
        >
          Show more…
        </button>
      )}

      {/* Action row */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-brand-lavender/20 hover:bg-brand-lavender/40 text-brand-lavender text-xs font-semibold border border-indigo-500/20 transition-all"
        >
          <Plus size={12} /> Convert to Task
        </button>
      )}

      {showForm && (
        <TriageForm
          entry={entry}
          customer={customer}
          customers={customers}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ─── Task card (in the board) ─────────────────────────────────────────────────
function TaskCard({ task, customer, isSelected, onSelect, onStatusChange, onArchive }) {
  const { updateTask } = useAppStore();
  const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
  const isArchived = task.status === 'archived';

  // Aging — days since task creation (client-side, no DB needed)
  const ageDays = Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000);
  const ageStyle = ageDays <= 2
    ? 'text-brand-sage bg-brand-sage/10 border-brand-sage/20'
    : ageDays <= 5
      ? 'text-brand-amber bg-amber-500/10 border-amber-500/20'
      : 'text-destructive bg-destructive/10 border-destructive/20';
  const [isEditing, setIsEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(task.description);
  const editRef = useRef(null);

  const commitEdit = () => {
    const trimmed = draftDesc.trim();
    if (trimmed && trimmed !== task.description) {
      updateTask(task.id, { description: trimmed });
    } else {
      setDraftDesc(task.description); // revert if empty or unchanged
    }
    setIsEditing(false);
  };

  return (
    <div
      onClick={() => !isArchived && onSelect(task)}
      className={`p-3 rounded-xl border transition-all ${
        isArchived
          ? 'bg-card/40 border-border/60 opacity-60'
          : isSelected
            ? 'bg-brand-lavender/15 border-indigo-500/40 shadow-lg shadow-indigo-500/10 cursor-pointer'
            : 'bg-secondary/50 border-border/60 hover:border-border cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {customer && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-1 inline-block"
              style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
            >
              {customer.name}
            </span>
          )}
          {isEditing ? (
            <textarea
              ref={editRef}
              value={draftDesc}
              onChange={e => setDraftDesc(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') { setDraftDesc(task.description); setIsEditing(false); }
              }}
              autoFocus
              rows={2}
              onClick={e => e.stopPropagation()}
              className="w-full bg-muted/60 border border-indigo-500/50 rounded-lg px-2 py-1 text-xs text-foreground resize-none focus:outline-none focus:border-indigo-400 leading-snug"
            />
          ) : (
            <div
              className="group/desc flex items-start gap-1"
              onClick={e => { if (!isArchived) { e.stopPropagation(); setIsEditing(true); } }}
            >
              <p className={`flex-1 text-xs font-medium leading-snug line-clamp-2 ${isArchived ? 'text-muted-foreground line-through' : 'text-foreground group-hover/desc:text-indigo-200 cursor-text'}`}>
                {task.description}
              </p>
              {!isArchived && (
                <Pencil size={10} className="flex-shrink-0 mt-0.5 text-muted-foreground/70 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Archive / Unarchive button */}
          <button
            onClick={e => { e.stopPropagation(); onArchive(task); }}
            title={isArchived ? 'Restore task' : 'Archive task'}
            className={`p-1 rounded transition-colors ${
              isArchived
                ? 'text-muted-foreground hover:text-brand-sage'
                : 'text-muted-foreground/70 hover:text-muted-foreground'
            }`}
          >
            {isArchived ? <ArchiveX size={12} /> : <Archive size={12} />}
          </button>
          {!isArchived && (
            <ChevronRight size={13} className={`transition-colors ${isSelected ? 'text-brand-lavender' : 'text-muted-foreground/70'}`} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
          {TASK_TYPE_LABELS[task.taskType]}
        </span>
        {/* Aging chip — hidden for archived tasks */}
        {!isArchived && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${ageStyle}`}
            title={`Created ${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
          >
            {ageDays}d
          </span>
        )}
        {task.assigneeOrTeam && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <User size={9} /> {recipientLabel(task.assigneeOrTeam)}
          </span>
        )}
        {/* Task points badge — shown when task is done */}
        {task.points > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-teal-500/10 text-teal-400 border-teal-500/20"
            title={`${task.points} task point${task.points === 1 ? '' : 's'} earned`}
          >
            ⚡ {task.points}pt{task.points === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Inline status dropdown — only for non-archived tasks */}
      {!isArchived && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <select
            value={task.status}
            onChange={e => onStatusChange(task.id, e.target.value)}
            className={`w-full text-[10px] font-semibold rounded-lg px-2 py-1 border cursor-pointer focus:outline-none ${statusColors.bg} ${statusColors.text} ${statusColors.border} bg-transparent`}
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s} className="bg-secondary text-foreground">
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes preview — read-only plain-text snippet; edit in detail view */}
      {!isArchived && task.notes && (
        <div className="mt-2">
          <p className="text-[10px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
            {stripHtml(task.notes)}
          </p>
        </div>
      )}

      {isArchived && (
        <div>
          {task.notes && (
            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{stripHtml(task.notes)}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground/70 italic">Archived</p>
        </div>
      )}
    </div>
  );
}

// ─── History item (editable previous AI output) ───────────────────────────────
function HistoryItem({ h }) {
  const { updateAiOutput } = useAppStore();
  const [draft,  setDraft]  = useState(h.outputText);
  const [copied, setCopied] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    updateAiOutput(h.id, draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <details className="bg-card border border-border rounded-xl">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {AI_OUTPUT_TYPE_LABELS[h.outputType]}
          </span>
          {h.provider && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
              h.provider === 'claude'
                ? 'bg-amber-500/15 text-brand-amber border-amber-500/20'
                : 'bg-brand-sage/15 text-brand-sage border-brand-sage/20'
            }`}>
              {h.provider === 'claude' ? 'Claude' : 'ChatGPT'}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/70">
            {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' '}
            {new Date(h.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <ChevronDown size={13} className="text-muted-foreground/70 flex-shrink-0" />
      </summary>

      <div className="px-4 pb-4 space-y-2">
        {/* Editable textarea — same UX as current output */}
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.max(5, draft.split('\n').length + 1)}
          className="w-full bg-transparent text-xs text-foreground/80 leading-relaxed resize-none focus:outline-none"
        />

        {/* Edited indicator */}
        {draft !== h.outputText && (
          <p className="text-[10px] text-brand-lavender/60 flex items-center gap-1">
            ✎ Edited — save to persist
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5 border-t border-border pt-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all border border-border"
          >
            {copied
              ? <><Check size={11} className="text-brand-sage" /> Copied!</>
              : <><Copy size={11} /> Copy</>}
          </button>
          <button
            onClick={handleSave}
            disabled={draft === h.outputText}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all border border-border disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved
              ? <><Check size={11} className="text-brand-sage" /> Saved!</>
              : <><Save size={11} /> Save</>}
          </button>
        </div>
      </div>
    </details>
  );
}

// ─── AI Workspace (right panel) ───────────────────────────────────────────────
function AIWorkspace({ task, customer }) {
  const { addAiOutput, getTaskAiOutputs, aiSettings, updateAiSettings } = useAppStore();
  const [outputType, setOutputType] = useState('message-draft');
  const [emailNature, setEmailNature] = useState('generic-ack');
  const [userInput, setUserInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentOutput, setCurrentOutput] = useState(null);
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState(null);
  const [showCustomize, setShowCustomize] = useState(false);
  // Local recipient override — pre-seeded from task, editable per-session without touching the task record
  const [recipientOverride, setRecipientOverride] = useState(task.assigneeOrTeam || '');
  // Editable mirror of the AI output text — user can tweak before copying/saving
  const [editedText, setEditedText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);

  const history = getTaskAiOutputs(task.id);

  // Shorthand for the current output type's settings
  const currentProvider = aiSettings.providers[outputType] || 'openai';
  const customPrompt = aiSettings.prompts[outputType] || '';

  // Reset workspace when task changes
  useEffect(() => {
    setCurrentOutput(null);
    setUserInput('');
    setError(null);
    setEditedText('');
    setRecipientOverride(task.assigneeOrTeam || '');
  }, [task.id]);

  // ── Whisper voice input (MediaRecorder → OpenAI Whisper) ───────────────
  const toggleListening = async () => {
    // ── Stop recording — triggers onstop which sends to Whisper
    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      return;
    }

    // ── Start recording
    setError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied. Allow microphone permission and try again.');
      return;
    }

    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Release browser mic indicator
      stream.getTracks().forEach(t => t.stop());

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      setIsTranscribing(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-1');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` },
          body: formData,
        });

        if (!res.ok) throw new Error(`Whisper error ${res.status}`);
        const data = await res.json();
        setUserInput(prev => prev ? `${prev} ${data.text}` : data.text);
      } catch (err) {
        setError(`Transcription failed: ${err.message}`);
      } finally {
        setIsTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsListening(true);
  };

  // ── Generate — routes to OpenAI or Claude based on per-type provider setting ─
  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setError('Add some context or notes before generating.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentOutput(null);

    const clientName = customer?.name || 'the client';
    const recipient = recipientOverride ? recipientLabel(recipientOverride) : null;

    // Use custom prompt if set; otherwise fall back to built-in default
    const basePrompt = customPrompt.trim()
      ? customPrompt.trim()
      : SYSTEM_PROMPTS[outputType](task.description, clientName, recipient, emailNature);

    // Always produce plain text — no markdown bold, italics, or symbols
    const systemPrompt = `${basePrompt}\n\nIMPORTANT: Write in plain text only. Do not use markdown formatting. Do not use asterisks (*) for bold or emphasis. Do not use underscores for italics. Do not use bullet points with special characters. Use plain sentences and paragraph breaks only.`;

    try {
      if (currentProvider === 'claude') {
        // ── Anthropic Claude ─────────────────────────────────────────────
        const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the dev server.');
        }

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: aiSettings.claudeModel || 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userInput.trim() }],
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Anthropic error ${res.status}`);
        }

        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        setCurrentOutput({ outputType, inputText: userInput.trim(), outputText: text, provider: 'claude' });
        setEditedText(text);
      } else {
        // ── OpenAI GPT-4o ────────────────────────────────────────────────
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('VITE_OPENAI_API_KEY is not set. Add it to your .env file and restart the dev server.');
        }

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: aiSettings.openaiModel || 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userInput.trim() },
            ],
            temperature: 0.7,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `OpenAI error ${res.status}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        setCurrentOutput({ outputType, inputText: userInput.trim(), outputText: text, provider: 'openai' });
        setEditedText(text);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!currentOutput) return;
    navigator.clipboard.writeText(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!currentOutput) return;
    // Save with the edited text (in case user tweaked it before saving)
    addAiOutput({ taskId: task.id, ...currentOutput, outputText: editedText });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
  // Use local override for the resolved label (used both in hint text and passed to AI prompts)
  const recipientText = recipientOverride ? recipientLabel(recipientOverride) : null;

  return (
    <div className="space-y-4">
      {/* Task header */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-start gap-3 flex-wrap mb-2">
          {customer && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
            >
              {customer.name}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border} flex-shrink-0`}>
            {TASK_TYPE_LABELS[task.taskType]}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColors.bg} ${statusColors.text} ${statusColors.border} flex-shrink-0`}>
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug">{task.description}</p>
        {recipientText && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <User size={11} /> {recipientText}
          </p>
        )}
      </div>

      {/* Output type selector */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Output Type</p>
        <div className="flex flex-wrap gap-1.5">
          {AI_OUTPUT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setOutputType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                outputType === type
                  ? 'bg-brand-lavender border-indigo-500 text-foreground'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {AI_OUTPUT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {/* Recipient selector — visible for output types that use it */}
        {['message-draft', 'meeting-summary'].includes(outputType) && (
          <div className="mt-2.5 flex items-center gap-2">
            <User size={11} className="text-muted-foreground flex-shrink-0" />
            <select
              value={recipientOverride}
              onChange={e => setRecipientOverride(e.target.value)}
              className="flex-1 bg-secondary/60 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs text-foreground/80 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">— No recipient —</option>
              {TASK_RECIPIENTS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {recipientText && (
              <span className="text-[10px] text-brand-lavender/70 whitespace-nowrap">
                tailored for <span className="font-semibold">{recipientText}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Email nature sub-selector — only for Message Draft */}
      {outputType === 'message-draft' && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Message Nature</p>
          <select
            value={emailNature}
            onChange={e => setEmailNature(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground/90 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {EMAIL_NATURES.map(n => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Customize Panel ───────────────────────────────────────────────────── */}
      <div className="border border-border/60 rounded-xl overflow-hidden">
        {/* Collapse toggle */}
        <button
          onClick={() => setShowCustomize(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary/50 hover:bg-secondary transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Settings size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Model settings</span>
            {/* Indicators: provider badge + custom prompt dot */}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              currentProvider === 'claude'
                ? 'bg-amber-500/15 text-brand-amber border-amber-500/20'
                : 'bg-brand-sage/15 text-brand-sage border-brand-sage/20'
            }`}>
              {currentProvider === 'claude' ? 'Claude' : 'ChatGPT'}
            </span>
            {customPrompt.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Custom prompt active" />
            )}
          </div>
          <ChevronDown size={16} className={`text-muted-foreground/70 transition-transform ${showCustomize ? 'rotate-180' : ''}`} />
        </button>

        {showCustomize && (
          <div className="p-3 space-y-3 bg-card/40 border-t border-border/60">

            {/* Provider toggle */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AI Provider</p>
              <div className="flex gap-1.5">
                {[
                  { value: 'openai', label: 'OpenAI', desc: 'GPT models' },
                  { value: 'claude', label: 'Claude', desc: 'Anthropic' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateAiSettings({ providers: { [outputType]: opt.value } })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      currentProvider === opt.value
                        ? opt.value === 'claude'
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-brand-sage/20 border-brand-sage/40 text-emerald-300'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground/80 hover:border-border'
                    }`}
                  >
                    {opt.label}
                    <span className="block text-[9px] font-normal opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* OpenAI model selector — only shown when provider is OpenAI */}
            {currentProvider === 'openai' && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">OpenAI Model</p>
                <div className="flex gap-1.5">
                  {[
                    { value: 'gpt-4o', label: 'GPT-4o' },
                    { value: 'gpt-4.1', label: 'GPT-4.1' },
                    { value: 'gpt-4o-mini', label: 'GPT-5 Mini' },
                  ].map(model => (
                    <button
                      key={model.value}
                      onClick={() => updateAiSettings({ openaiModel: model.value })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        (aiSettings.openaiModel || 'gpt-4o') === model.value
                          ? 'bg-brand-sage/20 border-brand-sage/40 text-emerald-300'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground/80 hover:border-border'
                      }`}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Claude model selector — only shown when provider is Claude */}
            {currentProvider === 'claude' && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Claude Model</p>
                <div className="flex gap-1.5">
                  {[
                    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
                    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
                    { value: 'claude-opus-4-6', label: 'Opus 4.6' },
                  ].map(model => (
                    <button
                      key={model.value}
                      onClick={() => updateAiSettings({ claudeModel: model.value })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        (aiSettings.claudeModel || 'claude-sonnet-4-6') === model.value
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground/80 hover:border-border'
                      }`}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom system prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  System Prompt
                </p>
                {customPrompt.trim() && (
                  <button
                    onClick={() => updateAiSettings({ prompts: { [outputType]: '' } })}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground/80 transition-colors"
                    title="Reset to default"
                  >
                    <RotateCcw size={9} /> Reset to default
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                value={customPrompt}
                onChange={e => updateAiSettings({ prompts: { [outputType]: e.target.value } })}
                placeholder={`Leave blank to use the built-in default prompt for "${AI_OUTPUT_TYPE_LABELS[outputType]}".`}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground/90 placeholder-gray-600 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none font-mono leading-relaxed"
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {customPrompt.trim()
                  ? 'Using your custom prompt. Task description and recipient are included automatically by the built-in prompts — in custom prompts you control everything.'
                  : 'Using built-in default. Customize to change tone, format, or add standing instructions.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Voice + text input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">Context / Notes</p>
          <button
            onClick={toggleListening}
            disabled={isTranscribing}
            title={isListening ? 'Stop recording' : 'Record voice input (Whisper)'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isListening
                ? 'bg-destructive/20 border-destructive/40 text-destructive animate-pulse'
                : isTranscribing
                  ? 'bg-secondary border-border text-muted-foreground cursor-not-allowed opacity-60'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {isTranscribing
              ? <><Loader2 size={13} className="animate-spin" /> Transcribing…</>
              : isListening
                ? <><MicOff size={13} /> Stop</>
                : <><Mic size={13} /> Voice</>}
          </button>
        </div>
        <textarea
          rows={5}
          value={userInput}
          onChange={e => setUserInput(e.target.value)}
          placeholder="Describe the situation, add context, or speak using the mic button above…"
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !userInput.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-lavender hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-bold text-sm transition-all shadow-lg shadow-indigo-600/30"
      >
        {isGenerating
          ? <><Loader2 size={16} className="animate-spin" /> Generating…</>
          : <><Sparkles size={16} /> Generate with {currentProvider === 'claude' ? 'Claude' : 'ChatGPT'}</>
        }
      </button>

      {/* Current output */}
      {currentOutput && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {AI_OUTPUT_TYPE_LABELS[currentOutput.outputType]}
              </p>
              {currentOutput.provider && (
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  currentOutput.provider === 'claude'
                    ? 'bg-amber-500/15 text-brand-amber border-amber-500/20'
                    : 'bg-brand-sage/15 text-brand-sage border-brand-sage/20'
                }`}>
                  {currentOutput.provider === 'claude' ? 'Claude' : 'GPT-4o'}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all border border-border"
              >
                {copied ? <><Check size={12} className="text-brand-sage" /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all border border-border"
              >
                {savedMsg ? <><Check size={12} className="text-brand-sage" /> Saved!</> : <><Save size={12} /> Save</>}
              </button>
            </div>
          </div>
          <textarea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            rows={Math.max(6, editedText.split('\n').length + 1)}
            className="w-full bg-transparent text-sm text-foreground/90 leading-relaxed resize-none focus:outline-none placeholder-gray-600"
            placeholder="Output will appear here…"
          />
          {editedText !== currentOutput.outputText && (
            <p className="text-[10px] text-brand-lavender/60 flex items-center gap-1">
              ✎ Edited — copy or save to use your version
            </p>
          )}
        </div>
      )}

      {/* Output history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Previous Outputs ({history.length})</p>
          <div className="space-y-2">
            {history.map(h => (
              <HistoryItem key={h.id} h={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick add task form (no meeting entry, just description + customer link) ───
function QuickAddTaskForm({ customers, onSubmit, onCancel }) {
  const { okrs } = useAppStore();
  const [form, setForm] = useState({
    customerId: '',
    description: '',
    taskType: 'comms',
    assigneeOrTeam: '',
    status: 'open',
    okrId: '',
  });

  // Live list grows when user creates new entries via InlineCustomerCreate
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [showInlineCreate, setShowInlineCreate] = useState(false);

  const canSubmit = form.customerId && form.description.trim();

  return (
    <div className="bg-secondary/60 border border-indigo-500/30 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-brand-lavender/80 uppercase tracking-wide">New Task</p>

      {/* Customer selector */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">Customer *</label>
          <button
            type="button"
            onClick={() => setShowInlineCreate(v => !v)}
            className="text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
          >
            {showInlineCreate ? '✕ Cancel' : '+ New Customer'}
          </button>
        </div>
        <select
          value={form.customerId}
          onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">— Select customer —</option>
          {localCustomers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {showInlineCreate && (
          <InlineCustomerCreate
            onCustomerCreated={c => {
              setLocalCustomers(prev => [...prev, c]);
              setForm(f => ({ ...f, customerId: c.id }));
              setShowInlineCreate(false);
            }}
          />
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Task Description *</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="What needs to be done?"
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Task Type</label>
          <select
            value={form.taskType}
            onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Recipient <span className="text-muted-foreground/70">(optional)</span></label>
        <select
          value={form.assigneeOrTeam}
          onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">— Select recipient —</option>
          {TASK_RECIPIENTS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Optional OKR selector */}
      {okrs.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">OKR <span className="text-muted-foreground/70">(optional)</span></label>
          <select
            value={form.okrId}
            onChange={e => setForm(p => ({ ...p, okrId: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">— No OKR —</option>
            {okrs.map(o => (
              <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl bg-muted hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ ...form, description: form.description.trim() })}
          className="flex-1 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-foreground transition-colors"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

// ─── Sortable task row (compact queue card with drag handle) ──────────────────
const SortableTaskRow = memo(function SortableTaskRow({ task, customer, onOpenDetail, isSelected, onToggleSelect, onStatusChange }) {
  const { updateTask } = useAppStore();
  const { isRunning, taskId: runningTaskId } = useTimerContext();
  const isTimerActive = isRunning && runningTaskId === task.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const typeColors   = TASK_TYPE_COLORS[task.taskType]   || TASK_TYPE_COLORS.comms;
  const statusColors = TASK_STATUS_COLORS[task.status]   || TASK_STATUS_COLORS.open;
  // Only recompute age when the task's creation timestamp changes (not on every parent render)
  const ageDays = useMemo(
    () => Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000),
    [task.createdAt]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all ${
        isSelected
          ? 'bg-brand-lavender/10 border border-indigo-500/40'
          : 'bg-secondary/50 border border-border/60 hover:border-border'
      }`}
    >
      {/* Bulk select checkbox */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={() => onToggleSelect(task.id)}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-border bg-secondary text-indigo-500 focus:ring-ring/40 focus:ring-1 flex-shrink-0 cursor-pointer accent-indigo-500"
        />
      )}

      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-muted-foreground flex-shrink-0 touch-none p-0.5"
        onClick={e => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical size={15} />
      </button>

      {/* Main content (clickable → opens detail) */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpenDetail(task)}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          {/* Pulsing dot when this task's timer is running */}
          {isTimerActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 self-center" title="Timer running" />
          )}
          {customer && (
            <span
              className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
            >
              {customer.name}
            </span>
          )}
          <span className="text-sm text-foreground/90 truncate">{task.description}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
            {TASK_TYPE_LABELS[task.taskType]}
          </span>
          <span
            className="text-[10px] text-muted-foreground"
            title={`Created ${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
          >
            {ageDays}d old
          </span>
          {task.points > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-teal-500/10 text-teal-400 border-teal-500/20">
              ⚡ {task.points}pt{task.points === 1 ? '' : 's'}
            </span>
          )}
          {task.ticketUrl && (
            <span className="text-[10px] text-brand-lavender/70 flex items-center gap-0.5">
              <ExternalLink size={9} /> ticket
            </span>
          )}
        </div>
      </div>

      {/* Quick status select */}
      <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
        <select
          value={task.status}
          onChange={e => {
            updateTask(task.id, { status: e.target.value });
            onStatusChange?.(e.target.value);
          }}
          className={`text-[10px] font-semibold rounded-lg px-2 py-1 border cursor-pointer focus:outline-none ${statusColors.bg} ${statusColors.text} ${statusColors.border} bg-transparent`}
        >
          {TASK_STATUSES.map(s => (
            <option key={s} value={s} className="bg-secondary text-foreground">{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
    </div>
  );
});

// ─── Task detail view (full-width page: metadata + notes + AI Workspace) ───────
// Format seconds → HH:MM:SS
function fmtHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function TaskDetailView({ task, customer, onBack }) {
  const { updateTask, deleteTask, customers, addTask } = useAppStore();
  const { isRunning, customerId: runningCustomerId, taskId: runningTaskId, startTimer, stopTimer } = useTimerContext();
  const elapsedSeconds = useTimerDisplay();

  // Timer computed flags
  const isRunningForThisTask = isRunning && runningTaskId === task.id;
  const isRunningElsewhere   = isRunning && !isRunningForThisTask;

  // Local draft state — all saved on blur or debounced
  const [descDraft,  setDescDraft]  = useState(task.description);
  const [ticketUrl,  setTicketUrl]  = useState(task.ticketUrl  || '');
  const [notesDraft, setNotesDraft] = useState(task.notes      || '');
  const notesTimerRef = useRef(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmArchive, setShowConfirmArchive] = useState(false);
  const [timerConflict, setTimerConflict] = useState(false);

  // Sync draft when task prop changes (e.g. status updated from outside)
  useEffect(() => { setDescDraft(task.description); }, [task.description]);
  useEffect(() => { setTicketUrl(task.ticketUrl || ''); }, [task.ticketUrl]);
  useEffect(() => { setNotesDraft(task.notes || ''); }, [task.notes]);

  const saveDesc = () => {
    const trimmed = descDraft.trim();
    if (trimmed && trimmed !== task.description) updateTask(task.id, { description: trimmed });
    else setDescDraft(task.description);
  };

  const saveTicket = () => {
    if (ticketUrl !== (task.ticketUrl || '')) updateTask(task.id, { ticketUrl });
  };

  const handleNotesChange = (val) => {
    setNotesDraft(val);
    clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => updateTask(task.id, { notes: val }), 500);
  };

  const ageDays = Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000);

  const selectClass = 'w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40';

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Back to Queue
        </button>
        {customer && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
          >
            {customer.name}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">

        {/* ── Left panel (40%) — task metadata + notes ── */}
        <div className="w-2/5 flex-shrink-0 space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0">Task Details</h3>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Task</label>
            <textarea
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              onBlur={saveDesc}
              rows={2}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground/90 resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>

          {/* Status + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select
                value={task.status}
                onChange={e => updateTask(task.id, { status: e.target.value })}
                className={selectClass}
              >
                {TASK_STATUSES.map(s => (
                  <option key={s} value={s} className="bg-secondary">{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select
                value={task.taskType}
                onChange={e => updateTask(task.id, { taskType: e.target.value })}
                className={selectClass}
              >
                {TASK_TYPES.map(t => (
                  <option key={t} value={t} className="bg-secondary">{TASK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee / Recipient */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Recipient / Assignee</label>
            <select
              value={task.assigneeOrTeam || ''}
              onChange={e => updateTask(task.id, { assigneeOrTeam: e.target.value })}
              className={selectClass}
            >
              <option value="" className="bg-secondary">— None —</option>
              {TASK_RECIPIENTS.map(r => (
                <option key={r.value} value={r.value} className="bg-secondary">{r.label}</option>
              ))}
            </select>
          </div>

          {/* Ticket URL */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <ExternalLink size={11} /> Ticket / Link
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={ticketUrl}
                onChange={e => setTicketUrl(e.target.value)}
                onBlur={saveTicket}
                placeholder="https://jira.company.com/ticket/123"
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground/90 placeholder:text-muted-foreground/70 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
              />
              {ticketUrl && (
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 py-2 bg-secondary border border-border rounded-xl text-brand-lavender hover:text-brand-lavender/80 hover:border-border transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          {/* Notes & Artifacts */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes & Artifacts</label>
            <RichTextEditor
              value={notesDraft}
              onChange={handleNotesChange}
              placeholder="Paste links, screenshots, context, artifacts, email threads…"
              minHeight="300px"
            />

            {/* File Attachments */}
            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Paperclip size={11} /> Attachments
              </label>
              <FileAttachments
                attachments={task.attachments || []}
                onUpdate={(att) => updateTask(task.id, { attachments: att })}
              />
            </div>
          </div>

          {/* Footer: meta info + timer + archive */}
          <div className="flex items-center justify-between pt-2 border-t border-border gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <Calendar size={10} />
              <span>
                {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-muted-foreground">{ageDays}d old</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Task timer button */}
              {isRunningForThisTask ? (
                <button
                  onClick={stopTimer}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive/20 hover:bg-destructive/40 text-destructive border border-destructive/50 transition-all animate-pulse font-mono tabular-nums"
                  title="Stop timer"
                >
                  <Square size={12} fill="currentColor" />
                  {fmtHMS(elapsedSeconds)}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isRunningElsewhere) {
                      setTimerConflict(true);
                    } else {
                      startTimer(task.customerId, task.id, task.description);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-sage/20 hover:bg-brand-sage/40 text-brand-sage border border-brand-sage/50 transition-all shadow-sm shadow-emerald-500/10"
                  title="Start timer for this task"
                >
                  <Timer size={14} /> Start Timer
                </button>
              )}

              {/* Archive */}
              <button
                onClick={() => setShowConfirmArchive(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/50 transition-all flex items-center gap-1.5"
              >
                <Archive size={12} /> Archive
              </button>

              {/* Delete */}
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="w-px self-stretch bg-secondary" />

        {/* ── Right panel (60%) — AI Workspace ── */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">AI Assist</h3>
          <AIWorkspace task={task} customer={customer} />
        </div>
      </div>

      {/* Timer conflict dialog */}
      {timerConflict && (
        <ConfirmDialog
          title="Timer Already Running"
          message="A timer is running for another task. Stop it first (you'll be prompted to save that session), then start the timer here."
          danger={false}
          onConfirm={() => { stopTimer(); setTimerConflict(false); }}
          onCancel={() => setTimerConflict(false)}
        />
      )}

      {/* Archive confirmation dialog */}
      {showConfirmArchive && (
        <ConfirmDialog
          title="Archive Task"
          message={`Archive "${task.description}"? You can find it later under the Closed tab.`}
          danger={false}
          onConfirm={() => { updateTask(task.id, { status: 'archived' }); setShowConfirmArchive(false); onBack(); }}
          onCancel={() => setShowConfirmArchive(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {showConfirmDelete && (
        <ConfirmDialog
          title="Delete Task"
          message={`Permanently delete "${task.description}"? This cannot be undone.`}
          danger={true}
          onConfirm={() => { deleteTask(task.id); setShowConfirmDelete(false); onBack(); }}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Annotation row ──────────────────────────────────────────────────────────
function AnnotationRow({ annotation, customer, onEdit, onDelete }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-b-0">
      {/* Tag dot */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: ANNOTATION_TAG_COLORS[annotation.tag] }}
        title={ANNOTATION_TAG_LABELS[annotation.tag]}
      />
      {/* Customer badge + date */}
      <div className="flex-shrink-0 min-w-[110px]">
        {customer && (
          <span
            className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border mb-0.5"
            style={{
              backgroundColor: customer.color + '22',
              color: customer.color,
              borderColor: customer.color + '55',
            }}
          >
            {customer.name}
          </span>
        )}
        <p className="text-[10px] text-muted-foreground">{annotation.date}</p>
      </div>
      {/* Tag badge */}
      <span
        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: ANNOTATION_TAG_COLORS[annotation.tag] + '22',
          color: ANNOTATION_TAG_COLORS[annotation.tag],
        }}
      >
        {ANNOTATION_TAG_LABELS[annotation.tag]}
      </span>
      {/* Text */}
      <p className="flex-1 text-sm text-foreground leading-relaxed min-w-0">{annotation.text}</p>
      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(annotation)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(annotation)}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── VOU Modal (add/edit meeting VOU) ────────────────────────────────────────
function VouModal({ initial = {}, customers, onSubmit, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customerId:  initial.customerId  || '',
    meetingDate: initial.meetingDate || today,
    action:      initial.action      || '',
    who:         initial.who         || '',
    dueDate:     initial.dueDate     || '',
    notes:       initial.notes       || '',
    resolved:    initial.resolved    || false,
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.customerId)  e.customerId  = 'Required';
    if (!form.meetingDate) e.meetingDate = 'Required';
    if (!form.action.trim()) e.action   = 'Required';
    if (!form.who.trim())    e.who      = 'Required';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({
      customerId:  form.customerId,
      meetingDate: form.meetingDate,
      action:      form.action.trim(),
      who:         form.who.trim(),
      dueDate:     form.dueDate || null,
      notes:       form.notes.trim(),
      resolved:    form.resolved,
    });
  };

  const f = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <Modal title={initial.id ? 'Edit VOU' : 'Log Meeting VOU'} onClose={onCancel} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Customer */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer *</label>
          <select
            {...f('customerId')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.customerId && <p className="mt-1 text-xs text-destructive">{errors.customerId}</p>}
        </div>

        {/* Meeting date */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Meeting Date *</label>
          <input
            type="date"
            {...f('meetingDate')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
          {errors.meetingDate && <p className="mt-1 text-xs text-destructive">{errors.meetingDate}</p>}
        </div>

        {/* Action */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Action *</label>
          <input
            placeholder="What was agreed / decided?"
            {...f('action')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
          {errors.action && <p className="mt-1 text-xs text-destructive">{errors.action}</p>}
        </div>

        {/* Who */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Who *</label>
          <input
            placeholder="Person responsible"
            {...f('who')}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          />
          {errors.who && <p className="mt-1 text-xs text-destructive">{errors.who}</p>}
        </div>

        {/* Due date + Notes in grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date <span className="text-muted-foreground/50">(optional)</span></label>
            <input
              type="date"
              {...f('dueDate')}
              className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={form.resolved}
                onChange={e => setForm(p => ({ ...p, resolved: e.target.checked }))}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-xs font-medium text-muted-foreground">Resolved</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes <span className="text-muted-foreground/50">(optional)</span></label>
          <textarea
            placeholder="Additional context…"
            rows={2}
            {...f('notes')}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-colors">
            {initial.id ? 'Save Changes' : 'Log VOU'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Triage page ──────────────────────────────────────────────────────────
export default function Triage() {
  const {
    meetingEntries, tasks, customers, updateTask, addTask, reorderTasks, addPoint, okrs,
    annotations, addAnnotation, updateAnnotation, deleteAnnotation,
    meetingVOUs, addMeetingVOU, updateMeetingVOU, deleteMeetingVOU,
  } = useAppStore();
  const { isRunning, taskId: runningTaskId, startTimer, stopTimer } = useTimerContext();
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [triageRefresh, setTriageRefresh] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterTaskType,   setFilterTaskType]   = useState('');
  const [filterStatus,     setFilterStatus]     = useState('open'); // default to Open on page load
  // 'active' tab: open/in-progress/blocked; 'closed' tab: done + archived
  const [boardTab, setBoardTab] = useState('active');

  // Priority quick-filter toggle
  const [filterPriorityClients, setFilterPriorityClients] = useState(false);

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());

  // Annotation section state
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotationForm, setAnnotationForm] = useState({ customerId: '', date: new Date().toISOString().slice(0, 10), tag: 'good', text: '' });
  const [annotationErrors, setAnnotationErrors] = useState({});
  const [editAnnotation, setEditAnnotation] = useState(null);
  const [deleteAnnotationTarget, setDeleteAnnotationTarget] = useState(null);
  const [filterAnnotationCustomer, setFilterAnnotationCustomer] = useState('');
  const [filterAnnotationTag, setFilterAnnotationTag] = useState('');

  // Meeting VOU section state
  const [showVouModal, setShowVouModal] = useState(false);
  const [vouEditTarget, setVouEditTarget] = useState(null);
  const [vouDeleteTarget, setVouDeleteTarget] = useState(null);
  const [filterVouCustomer, setFilterVouCustomer] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // O(1) lookup map — memoized to avoid recreation every render
  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Derived customer list for filter dropdown (only customers that have tasks)
  const customersWithTasks = useMemo(
    () => customers.filter(c => tasks.some(t => t.customerId === c.id)),
    [customers, tasks]
  );

  // Reset filters when customer filter changes
  const handleCustomerFilter = (val) => {
    setFilterCustomerId(val);
    clearSelection();
  };

  // Untriaged entries, sorted newest meeting date first
  const untriagedEntries = useMemo(
    () => meetingEntries
      .filter(m => !m.isTriaged)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetingEntries]
  );

  // Group untriaged entries by customer
  const untriagedByCustomer = useMemo(
    () => untriagedEntries.reduce((acc, entry) => {
      const customer = customerMap.get(entry.customerId);
      const key = customer?.id || '_none';
      if (!acc[key]) acc[key] = { customer, entries: [] };
      acc[key].entries.push({ entry, customer });
      return acc;
    }, {}),
    [untriagedEntries, customerMap]
  );

  // Filtered annotations (newest first)
  const filteredAnnotations = useMemo(() => {
    return annotations
      .filter(a => (!filterAnnotationCustomer || a.customerId === filterAnnotationCustomer))
      .filter(a => (!filterAnnotationTag || a.tag === filterAnnotationTag))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
  }, [annotations, filterAnnotationCustomer, filterAnnotationTag]);

  // Filtered VOUs — unresolved first, then by meetingDate DESC
  const filteredVOUs = useMemo(() => {
    return meetingVOUs
      .filter(v => (!filterVouCustomer || v.customerId === filterVouCustomer))
      .filter(v => showResolved ? true : !v.resolved)
      .sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return b.meetingDate.localeCompare(a.meetingDate);
      });
  }, [meetingVOUs, filterVouCustomer, showResolved]);

  // Active tasks: open, in-progress, blocked (excludes done and archived)
  const activeTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status === 'done' || t.status === 'archived') return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterTaskType && t.taskType !== filterTaskType) return false;
      if (filterStatus   && t.status   !== filterStatus)   return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      return true;
    }),
    [tasks, customerMap, filterCustomerId, filterTaskType, filterStatus, filterPriorityClients]
  );

  // Closed tasks: done + archived, sorted by closedAt DESC
  const closedTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status !== 'done' && t.status !== 'archived') return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterTaskType && t.taskType !== filterTaskType) return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt)),
    [tasks, customerMap, filterCustomerId, filterTaskType, filterPriorityClients]
  );

  const filtersActive = filterCustomerId || filterTaskType || filterStatus || filterPriorityClients;

  // Bulk action helpers
  const toggleSelect = useCallback((id) => setSelectedTaskIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }), []);
  const selectAll = () => setSelectedTaskIds(new Set(activeTasks.map(t => t.id)));
  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);
  const handleBulkStatus = (status) => {
    selectedTaskIds.forEach(id => updateTask(id, { status }));
    clearSelection();
    if (status === 'done' || status === 'archived') {
      setBoardTab('closed');
      setFilterStatus('');
      setFilterCustomerId('');
      setFilterTaskType('');
      setFilterPriorityClients(false);
    }
  };
  const handleBulkArchive = () => {
    selectedTaskIds.forEach(id => updateTask(id, { status: 'archived' }));
    clearSelection();
    setBoardTab('closed');
    setFilterStatus('');
    setFilterCustomerId('');
    setFilterTaskType('');
    setFilterPriorityClients(false);
  };

  // ── Auto-timer: start on task open, stop + auto-save points on close ───
  const autoSaveSession = (session) => {
    if (!session || session.elapsedSeconds < AUTO_TRACK_MIN_SECONDS) return;
    const hours = session.elapsedSeconds / 3600;
    const pts = Math.round(hours * AUTO_TRACK_RATE * 100) / 100;
    addPoint({
      customerId: session.customerId,
      points: pts,
      hours: Math.round(hours * 100) / 100,
      activityType: 'Task Review',
      comment: `Auto-tracked: ${session.taskDescription || 'Task review'}`,
    });
  };

  const handleOpenDetail = useCallback((task) => {
    // Auto-stop previous timer if running for a different task
    if (isRunning && runningTaskId && runningTaskId !== task.id) {
      autoSaveSession(stopTimer({ silent: true }));
    }
    // Always attempt start — startTimer's internal localStorage guard prevents double-start
    startTimer(task.customerId, task.id, task.description);
    setTaskDetailId(task.id);
  }, [isRunning, runningTaskId, autoSaveSession, stopTimer, startTimer]);

  // Stable handler passed to every SortableTaskRow — useCallback prevents rows from
  // re-rendering just because the parent re-rendered (works in tandem with memo())
  const handleTaskStatusChange = useCallback((newStatus) => {
    if (newStatus === 'done' || newStatus === 'archived') {
      setBoardTab('closed');
      setFilterStatus('');
      setFilterCustomerId('');
      setFilterTaskType('');
      setFilterPriorityClients(false);
      clearSelection();
    }
  }, [clearSelection]);

  const handleCloseDetail = () => {
    // Auto-stop timer if running for the current task
    if (isRunning && runningTaskId === taskDetailId) {
      autoSaveSession(stopTimer({ silent: true }));
    }
    // If the task was marked done/archived while in the detail view, switch to Closed tab
    const closedTask = tasks.find(t => t.id === taskDetailId);
    if (closedTask && (closedTask.status === 'done' || closedTask.status === 'archived')) {
      setBoardTab('closed');
      setFilterStatus('');
      setFilterCustomerId('');
      setFilterTaskType('');
      setFilterPriorityClients(false);
      clearSelection();
    }
    setTaskDetailId(null);
  };

  // Drag-and-drop reorder handler
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeTasks.findIndex(t => t.id === active.id);
    const newIndex  = activeTasks.findIndex(t => t.id === over.id);
    const reordered = arrayMove(activeTasks, oldIndex, newIndex);
    reorderTasks(reordered.map(t => t.id));
  };

  // ─── Annotation handlers ─────────────────────────────────────────────────────
  const handleAnnotationSubmit = () => {
    const errs = {};
    if (!annotationForm.customerId) errs.customerId = 'Required';
    if (!annotationForm.text.trim()) errs.text = 'Required';
    if (Object.keys(errs).length) { setAnnotationErrors(errs); return; }
    if (editAnnotation) {
      updateAnnotation(editAnnotation.id, {
        customerId: annotationForm.customerId,
        date: annotationForm.date,
        tag: annotationForm.tag,
        text: annotationForm.text.trim(),
      });
      setEditAnnotation(null);
    } else {
      addAnnotation({
        customerId: annotationForm.customerId,
        date: annotationForm.date,
        tag: annotationForm.tag,
        text: annotationForm.text.trim(),
      });
    }
    setAnnotationForm({ customerId: '', date: new Date().toISOString().slice(0, 10), tag: 'good', text: '' });
    setAnnotationErrors({});
    setShowAnnotationForm(false);
  };

  const handleEditAnnotation = (a) => {
    setEditAnnotation(a);
    setAnnotationForm({ customerId: a.customerId, date: a.date, tag: a.tag, text: a.text });
    setAnnotationErrors({});
    setShowAnnotationForm(true);
  };

  const handleCancelAnnotation = () => {
    setEditAnnotation(null);
    setAnnotationForm({ customerId: '', date: new Date().toISOString().slice(0, 10), tag: 'good', text: '' });
    setAnnotationErrors({});
    setShowAnnotationForm(false);
  };

  // ─── VOU handlers ────────────────────────────────────────────────────────────
  const handleVouSubmit = (data) => {
    if (vouEditTarget) {
      updateMeetingVOU(vouEditTarget.id, data);
      setVouEditTarget(null);
    } else {
      addMeetingVOU(data);
    }
    setShowVouModal(false);
  };

  const handleEditVou = (v) => {
    setVouEditTarget(v);
    setShowVouModal(true);
  };

  const handleDeleteVou = (v) => {
    setVouDeleteTarget(v);
  };

  // ── Task Detail sub-view ───────────────────────────────────────────────────
  if (taskDetailId) {
    const task = tasks.find(t => t.id === taskDetailId);
    if (!task) { setTaskDetailId(null); return null; }
    const customer = customers.find(c => c.id === task.customerId);
    return <TaskDetailView task={task} customer={customer} onBack={handleCloseDetail} />;
  }

  // ── Queue view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Triage Queue (untriaged meeting entries) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-brand-amber" />
            <h2 className="text-sm font-semibold text-foreground">Triage Queue</h2>
            {untriagedEntries.length > 0 && (
              <span className="bg-amber-500/20 text-brand-amber border border-amber-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {untriagedEntries.length}
              </span>
            )}
          </div>
        </div>

        {untriagedEntries.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
            <ClipboardList size={24} className="text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Queue is clear!</p>
            <p className="text-muted-foreground/70 text-xs mt-1">All meeting entries have been triaged.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.values(untriagedByCustomer).map(({ customer, entries: customerEntries }) => (
              <div key={customer?.id || '_none'}>
                <div className="flex items-center gap-1.5 mb-2">
                  {customer && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: customer.color || '#6366f1' }} />
                  )}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {customer?.name || 'No Customer'}
                  </span>
                  <span className="text-xs text-muted-foreground/70">({customerEntries.length})</span>
                </div>
                <div className="space-y-2">
                  {customerEntries.map(({ entry, customer: c }) => (
                    <TriageEntryCard
                      key={entry.id}
                      entry={entry}
                      customer={c}
                      onTriaged={() => setTriageRefresh(n => n + 1)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Board */}
      <div>
        {/* Board header */}
        <div className="flex items-center gap-2 mb-3">
          <Tag size={15} className="text-brand-lavender" />
          <h2 className="text-sm font-semibold text-foreground">Task Board</h2>
          {boardTab === 'active' && activeTasks.length > 0 && (
            <span className="bg-brand-lavender/20 text-brand-lavender border border-indigo-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {activeTasks.length} active
            </span>
          )}
          {boardTab === 'closed' && closedTasks.length > 0 && (
            <span className="bg-gray-500/20 text-muted-foreground border border-gray-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {closedTasks.length} closed
            </span>
          )}
          {filtersActive && (
            <span className="bg-teal-500/15 text-teal-400 border border-teal-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              filtered
            </span>
          )}
          {/* General Focus Time button — starts timer with no customer */}
          {!isRunning && (
            <button
              onClick={() => startTimer(null, null, null)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all bg-secondary border-border text-muted-foreground hover:text-brand-sage hover:border-emerald-500/40"
              title="Start a General Focus Time timer (not tied to a specific customer)"
            >
              <Timer size={12} />
              Focus Time
            </button>
          )}
          <button
            onClick={() => setShowQuickAdd(v => !v)}
            className={`${isRunning ? 'ml-auto' : ''} flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showQuickAdd
                ? 'bg-brand-lavender/20 border-indigo-500/40 text-brand-lavender/80'
                : 'bg-secondary border-border text-muted-foreground hover:text-brand-lavender/80 hover:border-indigo-500/40'
            }`}
          >
            <Plus size={12} />
            Task
          </button>
        </div>

        {/* Quick add task form */}
        {showQuickAdd && (
          <div className="mb-3">
            <QuickAddTaskForm
              customers={customers}
              onSubmit={(formData) => {
                addTask({
                  customerId: formData.customerId,
                  okrId: formData.okrId || null,
                  description: formData.description,
                  taskType: formData.taskType,
                  assigneeOrTeam: formData.assigneeOrTeam || null,
                  status: formData.status,
                });
                setShowQuickAdd(false);
              }}
              onCancel={() => setShowQuickAdd(false)}
            />
          </div>
        )}

        {/* Filter bar — customer selector */}
        <div className="flex gap-2 mb-2">
          <select
            value={filterCustomerId}
            onChange={e => handleCustomerFilter(e.target.value)}
            className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">All clients</option>
            {customersWithTasks.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Priority quick-filter toggle */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => { setFilterPriorityClients(v => !v); clearSelection(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filterPriorityClients
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-secondary border-border text-muted-foreground hover:text-amber-300 hover:border-amber-500/40'
            }`}
          >
            <Pin size={11} /> Priority Clients
          </button>
        </div>

        {/* Filter bar — row 2: task type + status + clear */}
        <div className="flex gap-2 mb-3">
          <select
            value={filterTaskType}
            onChange={e => { setFilterTaskType(e.target.value); clearSelection(); }}
            className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            <option value="">All types</option>
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {/* Status filter only shown on Active tab; Closed tab always shows done+archived */}
          {boardTab === 'active' && (
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); clearSelection(); }}
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">All statuses</option>
              {TASK_STATUSES.filter(s => !['done', 'archived'].includes(s)).map(s => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              onClick={() => {
                setFilterCustomerId('');
                setFilterTaskType('');
                setFilterStatus('');
                setFilterPriorityClients(false);
                clearSelection();
              }}
              className="px-2.5 py-2 rounded-xl bg-secondary border border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors flex-shrink-0"
              title="Clear all filters"
            >
              ✕
            </button>
          )}
        </div>

        {/* Active / Closed tab switcher */}
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-3 w-fit">
          <button
            onClick={() => { setBoardTab('active'); setFilterStatus('open'); setFilterCustomerId(''); setFilterTaskType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'active' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => { setBoardTab('closed'); setFilterStatus(''); setFilterCustomerId(''); setFilterTaskType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'closed' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Closed
            {closedTasks.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                boardTab === 'closed' ? 'bg-gray-600 text-foreground/80' : 'bg-muted text-muted-foreground'
              }`}>
                {closedTasks.length}
              </span>
            )}
          </button>
        </div>

        {/* Bulk action bar — shown when tasks are selected */}
        {boardTab === 'active' && selectedTaskIds.size > 0 && (
          <div className="flex items-center gap-3 bg-brand-lavender/10 border border-indigo-500/30 rounded-xl px-4 py-2.5 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <CheckSquare size={13} className="text-brand-lavender" />
              <span className="text-xs font-semibold text-brand-lavender/80">{selectedTaskIds.size} selected</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={selectAll}
                className="px-2.5 py-1 rounded-lg bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="px-2.5 py-1 rounded-lg bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                Clear
              </button>
              <select
                onChange={e => { if (e.target.value) handleBulkStatus(e.target.value); e.target.value = ''; }}
                className="bg-secondary border border-border rounded-lg px-2.5 py-1 text-[10px] font-medium text-foreground/80 focus:outline-none focus:border-ring cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Set Status…</option>
                {TASK_STATUSES.map(s => (
                  <option key={s} value={s} className="bg-secondary text-foreground">{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                onClick={handleBulkArchive}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-brand-amber hover:border-amber-500/40 transition-colors"
              >
                <Archive size={11} /> Archive
              </button>
            </div>
          </div>
        )}

        {/* Active tab — draggable task list */}
        {boardTab === 'active' && (
          activeTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
              <Tag size={24} className="text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{filtersActive ? 'No tasks match this filter.' : 'No active tasks.'}</p>
              <p className="text-muted-foreground/70 text-xs mt-1">
                {filtersActive ? 'Try a different filter.' : 'Convert a meeting entry above or add a task to get started.'}
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {activeTasks.map(task => {
                    const customer = customerMap.get(task.customerId);
                    return (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        customer={customer}
                        onOpenDetail={handleOpenDetail}
                        isSelected={selectedTaskIds.has(task.id)}
                        onToggleSelect={toggleSelect}
                        onStatusChange={handleTaskStatusChange}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )
        )}

        {/* Closed tab — done + archived tasks, non-draggable */}
        {boardTab === 'closed' && (
          closedTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
              <Archive size={24} className="text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{filtersActive ? 'No closed tasks match this filter.' : 'No closed tickets yet.'}</p>
              <p className="text-muted-foreground/70 text-xs mt-1">Tasks marked done or archived will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {closedTasks
                .map(task => {
                  const customer = customerMap.get(task.customerId);
                  return (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      customer={customer}
                      onOpenDetail={handleOpenDetail}
                    />
                  );
                })}
            </div>
          )
        )}
      </div>

      {/* ── Annotations Section ──────────────────────────────────────────────── */}
      <div>
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bookmark size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">Annotations</h2>
            {annotations.length > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {annotations.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditAnnotation(null); setAnnotationErrors({}); setShowAnnotationForm(v => !v); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-muted border border-border text-xs font-medium text-foreground/80 hover:text-foreground transition-all"
          >
            {showAnnotationForm ? <X size={13} /> : <Plus size={13} />}
            {showAnnotationForm ? 'Cancel' : 'Add'}
          </button>
        </div>

        {/* Inline add / edit form */}
        {showAnnotationForm && (
          <div className="mb-3 bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Customer */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer *</label>
                <select
                  value={annotationForm.customerId}
                  onChange={e => setAnnotationForm(p => ({ ...p, customerId: e.target.value }))}
                  className="w-full h-10 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                >
                  <option value="">Select customer…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {annotationErrors.customerId && <p className="mt-1 text-xs text-destructive">{annotationErrors.customerId}</p>}
              </div>
              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
                <input
                  type="date"
                  value={annotationForm.date}
                  onChange={e => setAnnotationForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full h-10 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
                />
              </div>
            </div>

            {/* Tag radio */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Tag *</label>
              <div className="flex gap-2">
                {ANNOTATION_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setAnnotationForm(p => ({ ...p, tag }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      annotationForm.tag === tag ? 'border-transparent' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                    style={annotationForm.tag === tag ? {
                      backgroundColor: ANNOTATION_TAG_COLORS[tag] + '25',
                      color: ANNOTATION_TAG_COLORS[tag],
                      borderColor: ANNOTATION_TAG_COLORS[tag] + '60',
                    } : {}}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ANNOTATION_TAG_COLORS[tag] }}
                    />
                    {ANNOTATION_TAG_LABELS[tag]}
                  </button>
                ))}
              </div>
            </div>

            {/* Text */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Note *</label>
              <textarea
                placeholder="What happened? What did you observe?"
                rows={2}
                value={annotationForm.text}
                onChange={e => setAnnotationForm(p => ({ ...p, text: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
              />
              {annotationErrors.text && <p className="mt-1 text-xs text-destructive">{annotationErrors.text}</p>}
            </div>

            <div className="flex gap-3">
              <button onClick={handleCancelAnnotation} className="flex-1 py-2 rounded-xl bg-muted hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleAnnotationSubmit} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white transition-colors">
                {editAnnotation ? 'Save Changes' : 'Add Annotation'}
              </button>
            </div>
          </div>
        )}

        {/* Filter bar */}
        {annotations.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <select
              value={filterAnnotationCustomer}
              onChange={e => setFilterAnnotationCustomer(e.target.value)}
              className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
            >
              <option value="">All Customers</option>
              {customers.filter(c => annotations.some(a => a.customerId === c.id)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filterAnnotationTag}
              onChange={e => setFilterAnnotationTag(e.target.value)}
              className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
            >
              <option value="">All Tags</option>
              {ANNOTATION_TAGS.map(t => <option key={t} value={t}>{ANNOTATION_TAG_LABELS[t]}</option>)}
            </select>
          </div>
        )}

        {/* Annotation list */}
        {annotations.length === 0 && !showAnnotationForm ? (
          <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
            <Bookmark size={24} className="text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No annotations yet.</p>
            <p className="text-muted-foreground/70 text-xs mt-1">Add observations tagged as Good, Bad, or Learnings.</p>
          </div>
        ) : filteredAnnotations.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl px-5 py-6 text-center">
            <p className="text-muted-foreground text-sm">No annotations match this filter.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl px-4 py-1">
            {filteredAnnotations.map(a => (
              <AnnotationRow
                key={a.id}
                annotation={a}
                customer={customerMap.get(a.customerId)}
                onEdit={handleEditAnnotation}
                onDelete={setDeleteAnnotationTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Meeting VOUs Section ──────────────────────────────────────────────── */}
      <div>
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Table2 size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">Meeting VOUs</h2>
            <span className="text-[10px] text-muted-foreground/60">Value of Understanding</span>
            {meetingVOUs.filter(v => !v.resolved).length > 0 && (
              <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {meetingVOUs.filter(v => !v.resolved).length}
              </span>
            )}
          </div>
          <button
            onClick={() => { setVouEditTarget(null); setShowVouModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-muted border border-border text-xs font-medium text-foreground/80 hover:text-foreground transition-all"
          >
            <Plus size={13} /> Log VOU
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            value={filterVouCustomer}
            onChange={e => setFilterVouCustomer(e.target.value)}
            className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
          >
            <option value="">All Customers</option>
            {customers.filter(c => meetingVOUs.some(v => v.customerId === c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={e => setShowResolved(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Show Resolved</span>
          </label>
        </div>

        {/* VOU table or empty state */}
        {meetingVOUs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
            <Table2 size={24} className="text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No VOUs logged yet.</p>
            <p className="text-muted-foreground/70 text-xs mt-1">Log action items and decisions from your meetings.</p>
          </div>
        ) : filteredVOUs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl px-5 py-6 text-center">
            <p className="text-muted-foreground text-sm">No VOUs match this filter.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/40">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground w-[120px]">Customer</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground w-[100px]">Date</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Action</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground w-[100px]">Who</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground w-[90px]">Due</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Notes</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted-foreground w-[40px]">✓</th>
                    <th className="px-3 py-2.5 w-[60px]" />
                  </tr>
                </thead>
                <tbody>
                  {filteredVOUs.map((v, i) => {
                    const customer = customerMap.get(v.customerId);
                    return (
                      <tr
                        key={v.id}
                        className={`border-b border-border/50 last:border-b-0 transition-colors ${
                          v.resolved ? 'opacity-50' : i % 2 === 0 ? '' : 'bg-secondary/20'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          {customer ? (
                            <span
                              className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border truncate max-w-[110px]"
                              style={{ backgroundColor: customer.color + '22', color: customer.color, borderColor: customer.color + '55' }}
                            >
                              {customer.name}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{v.meetingDate}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-sm ${v.resolved ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {v.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-foreground/80 whitespace-nowrap">{v.who}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{v.dueDate || '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{v.notes || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => updateMeetingVOU(v.id, { resolved: !v.resolved })}
                            title={v.resolved ? 'Mark unresolved' : 'Mark resolved'}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-all ${
                              v.resolved
                                ? 'bg-emerald-600 border-emerald-600'
                                : 'border-border hover:border-emerald-500'
                            }`}
                          >
                            {v.resolved && <Check size={11} className="text-white" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleEditVou(v)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDeleteVou(v)} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* VOU Modal */}
      {showVouModal && (
        <VouModal
          initial={vouEditTarget || {}}
          customers={customers}
          onSubmit={handleVouSubmit}
          onCancel={() => { setShowVouModal(false); setVouEditTarget(null); }}
        />
      )}

      {/* Annotation delete confirm */}
      {deleteAnnotationTarget && (
        <ConfirmDialog
          title="Delete Annotation"
          message={`Delete this ${ANNOTATION_TAG_LABELS[deleteAnnotationTarget.tag]} annotation? This cannot be undone.`}
          onConfirm={() => { deleteAnnotation(deleteAnnotationTarget.id); setDeleteAnnotationTarget(null); }}
          onCancel={() => setDeleteAnnotationTarget(null)}
        />
      )}

      {/* VOU delete confirm */}
      {vouDeleteTarget && (
        <ConfirmDialog
          title="Delete VOU"
          message={`Delete the VOU "${vouDeleteTarget.action}"? This cannot be undone.`}
          onConfirm={() => { deleteMeetingVOU(vouDeleteTarget.id); setVouDeleteTarget(null); }}
          onCancel={() => setVouDeleteTarget(null)}
        />
      )}
    </div>
  );
}
