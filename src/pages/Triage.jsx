import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Plus, Mic, MicOff, Copy, Save, Check,
  Loader2, Sparkles, ChevronLeft, ChevronRight,
  Calendar, User, Tag, AlertCircle, Archive, ArchiveX, Trash2,
  Settings, RotateCcw, Pencil, GripVertical, ExternalLink, Link2, ArrowLeft,
  Timer, Square, Pin, CheckSquare, Paperclip, Clock,
  Table2, X, RefreshCw, Video,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseISO } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext, useTimerDisplay } from '../context/TimerContext';
import { callClaude } from '../lib/api';
import { getWeekRangeForOffset, formatWeekLabel, isInRange } from '../utils/dateHelpers';
import ConfirmDialog from '../components/ConfirmDialog';
import FileAttachments from '../components/FileAttachments';
import RichTextEditor from '../components/ui/RichTextEditor';
import {
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  AI_OUTPUT_TYPES, AI_OUTPUT_TYPE_LABELS,
  TASK_RECIPIENTS,
  CUSTOMER_COLORS,
  AUTO_TRACK_RATE,
  AUTO_TRACK_MIN_SECONDS,
  WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_COLORS,
} from '../constants';
import Modal from '../components/Modal';
import AIAssistModal from '../components/AIAssistModal';
import VoiceCommsModal from '../components/VoiceCommsModal';
import QuickLogMeetingModal from '../components/QuickLogMeetingModal';
import MeetingReviewPanel from '../components/MeetingReviewPanel';
import { stripHtml, htmlToPlainText } from '../lib/utils';

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

// ─── Custom checkbox — avoids native browser rendering inconsistency on dark theme ──
// Hidden native input (accessible, keyboard-operable) + custom-styled visual span.
function CustomCheckbox({ checked, onChange, ariaLabel }) {
  return (
    <label className="relative flex-shrink-0 cursor-pointer block w-4 h-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className="sr-only peer"
      />
      <span className={`flex w-4 h-4 rounded border-2 transition-all items-center justify-center
        peer-focus-visible:ring-2 peer-focus-visible:ring-green-400/60
        ${checked
          ? 'bg-green-500 border-green-500'
          : 'bg-secondary border-border hover:border-green-400/50'
        }`}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}

// ─── Inline customer creation form ──────────────────────────────────────────
// Used by QuickAddTaskForm to allow creating a new customer without leaving
// the current form.
const InlineCustomerCreate = memo(function InlineCustomerCreate({ onCustomerCreated }) {
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
});


// ─── Jira URL parser ──────────────────────────────────────────────────────────
/** Strips Atlassian ticket URLs from text and returns the clean text + ticket array. */
function extractJiraLinks(text = '') {
  const regex = /https?:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/browse\/([A-Z]+-\d+)/g;
  const tickets = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    tickets.push({ id: match[1], url: match[0] });
  }
  const cleanText = text.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
  return { cleanText, tickets };
}

// ─── Task card (in the board) ─────────────────────────────────────────────────
const TaskCard = memo(function TaskCard({ task, customer, isSelected, onSelect, onStatusChange, onArchive }) {
  const { updateTask } = useAppStore();
  const typeColors = WORK_TYPE_COLORS[task.workType] || WORK_TYPE_COLORS.comms;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
  const isArchived = task.status === 'archived';

  // Aging — days since task creation (client-side, no DB needed)
  const ageDays = Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000);
  // 0–7d: muted gray  |  8–13d: amber warning  |  14+d: red urgent
  const ageStyle = ageDays < 8
    ? 'text-muted-foreground bg-secondary border-border'
    : ageDays < 14
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-red-400 bg-red-500/10 border-red-500/20';
  const [isEditing, setIsEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(task.description);
  const editRef = useRef(null);
  // Pre-parse Jira URLs once per description change — avoids regex exec on every keystroke/render
  const { cleanText: descCleanText, tickets: descTickets } = useMemo(
    () => extractJiraLinks(task.description),
    [task.description]
  );

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
                  {descCleanText}
                  {descTickets.map(t => (
                    <a
                      key={t.id}
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-block ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-brand-lavender/30 bg-brand-lavender/10 text-brand-lavender hover:bg-brand-lavender/20 transition-colors"
                    >
                      {t.id}
                    </a>
                  ))}
                </p>
                {!isArchived && (
                  <Pencil size={10} className="flex-shrink-0 mt-0.5 text-muted-foreground/70 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                )}
              </div>
          )
          }
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
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
          {task.isEvergreen && <RefreshCw size={9} />}
          {WORK_TYPE_LABELS[task.workType] || 'Comms'}
        </span>
        {/* Aging chip — hidden for archived tasks */}
        {!isArchived && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${ageStyle}`}
            title={`Created ${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
          >
            {ageDays}d
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
});

// ─── History item (editable previous AI output) ───────────────────────────────
const HistoryItem = memo(function HistoryItem({ h }) {
  const { updateAiOutput } = useAppStore();
  const [draft,  setDraft]  = useState(h.outputText);
  const [copied, setCopied] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(htmlToPlainText(draft));
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
});

// ─── AI Workspace (right panel) ───────────────────────────────────────────────
const AIWorkspace = memo(function AIWorkspace({ task, customer }) {
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

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_API_SECRET}` },
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Transcription failed (${res.status})`);
        }
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
        // ── Anthropic Claude (via server-side proxy) ──────────────────────
        const text = await callClaude({
          model:      aiSettings.claudeModel,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userInput.trim() }],
          max_tokens: 1024,
        });
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
    navigator.clipboard.writeText(htmlToPlainText(editedText));
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

  const typeColors = WORK_TYPE_COLORS[task.workType] || WORK_TYPE_COLORS.comms;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
  // Use local override for the resolved label (used both in hint text and passed to AI prompts)
  const recipientText = recipientOverride ? recipientLabel(recipientOverride) : null;

  return (
    <div className="space-y-4">
      {/* Task context — compact chip row (description visible in left panel) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {customer && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
          >
            {customer.name}
          </span>
        )}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${typeColors.bg} ${typeColors.text} ${typeColors.border} flex-shrink-0`}>
          {task.isEvergreen && <RefreshCw size={9} />}
          {WORK_TYPE_LABELS[task.workType] || 'Comms'}
        </span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColors.bg} ${statusColors.text} ${statusColors.border} flex-shrink-0`}>
          {TASK_STATUS_LABELS[task.status]}
        </span>
        {recipientText && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
            <User size={9} /> {recipientText}
          </span>
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
                  ? 'bg-brand-lavender border-brand-lavender text-white font-semibold shadow-sm'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {AI_OUTPUT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {/* Recipient selector — visible for output types that use it */}
        {['message-draft', 'meeting-summary'].includes(outputType) && (
          <div className="mt-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recipient</p>
            <div className="flex items-center gap-2">
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

      {/* Inline hint when context field is empty */}
      {!userInput.trim() && !isGenerating && (
        <p className="text-[11px] text-muted-foreground/60 text-center -mt-1">
          Add context notes above to enable generation
        </p>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !userInput.trim()}
        title={!userInput.trim() && !isGenerating ? 'Add context notes to generate' : undefined}
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
});

// ─── Timer quick task form — minimal form to create a task and start the timer ───
function TimerQuickTaskForm({ customers, onSubmit, onStartWithoutTask, onCancel }) {
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId]   = useState('');
  const canSubmit = description.trim().length > 0;

  return (
    <div className="mb-3 bg-secondary/60 border border-emerald-500/30 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wide">Focus Task</p>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">What are you working on? *</label>
        <input
          type="text"
          autoFocus
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canSubmit && onSubmit(description.trim(), customerId)}
          placeholder="e.g. Review onboarding deck for Accenture"
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Customer <span className="opacity-60">(optional)</span>
        </label>
        <select
          value={customerId}
          onChange={e => setCustomerId(e.target.value)}
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        >
          <option value="">— No specific client —</option>
          {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="py-2 px-3 rounded-xl bg-muted hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onStartWithoutTask}
          className="flex-1 py-2 rounded-xl bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Start without task
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(description.trim(), customerId)}
          className="flex-1 py-2 rounded-xl bg-emerald-700/40 hover:bg-emerald-700/60 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-emerald-300 border border-emerald-700/40 transition-colors"
        >
          Create &amp; Start Timer
        </button>
      </div>
    </div>
  );
}

// ─── Quick add task form (no meeting entry, just description + customer link) ───
function QuickAddTaskForm({ customers, onSubmit, onCancel }) {
  const { okrs } = useAppStore();
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [form, setForm] = useState({
    customerId:      '',
    description:     '',
    workType:        'comms',
    status:          'open',
    okrId:           '',
    isEvergreen:     false,
  });
  const [bulkRows, setBulkRows] = useState([
    { id: crypto.randomUUID(), description: '', customerId: '', okrId: '' }
  ]);

  // Live list grows when user creates new entries via InlineCustomerCreate
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [showInlineCreate, setShowInlineCreate] = useState(false);

  const addBulkRow = useCallback(() => {
    setBulkRows(prev => [...prev, { id: crypto.randomUUID(), description: '', customerId: '', okrId: '' }]);
  }, []);

  const deleteBulkRow = useCallback((id) => {
    setBulkRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }, []);

  const updateBulkRow = useCallback((id, field, value) => {
    setBulkRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  // When pasting multi-line text into a row, split into multiple rows
  const handleRowPaste = useCallback((e, rowId) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    setBulkRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      const newRows = lines.map((desc, i) => ({
        id: i === 0 ? rowId : crypto.randomUUID(),
        description: desc,
        customerId: prev[idx].customerId,
        okrId: prev[idx].okrId,
      }));
      return [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)];
    });
  }, []);

  const filledBulkRows = bulkRows.filter(r => r.description.trim().length > 0);

  const canSubmit = mode === 'single'
    ? form.description.trim().length > 0
    : filledBulkRows.length > 0;

  const handleSubmit = () => {
    if (mode === 'single') {
      onSubmit([{ ...form, description: form.description.trim() }]);
    } else {
      onSubmit(filledBulkRows.map(row => ({
        customerId:  row.customerId || null,
        okrId:       row.okrId     || null,
        description: row.description.trim(),
        workType:    form.workType,
        status:      form.status,
        isEvergreen: form.isEvergreen,
      })));
    }
  };

  return (
    <div className="bg-secondary/60 border border-indigo-500/30 rounded-xl p-3 space-y-3">
      {/* Header + mode toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-brand-lavender/80 uppercase tracking-wide">New Task</p>
        <div className="flex items-center gap-0.5 bg-secondary border border-border rounded-lg p-0.5">
          {['single', 'bulk'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                mode === m
                  ? 'bg-brand-lavender text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'single' ? 'Single' : 'Bulk'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer selector — single mode only (bulk mode has per-row dropdowns) */}
      {mode === 'single' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted-foreground">
              Customer <span className="text-muted-foreground/50">(optional)</span>
            </label>
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
            <option value="">— No customer —</option>
            {[...localCustomers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
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
      )}

      {/* Bulk mode: "+ New Customer" button only — customer is selected per-row */}
      {mode === 'bulk' && (
        <div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowInlineCreate(v => !v)}
              className="text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
            >
              {showInlineCreate ? '✕ Cancel' : '+ New Customer'}
            </button>
          </div>
          {showInlineCreate && (
            <InlineCustomerCreate
              onCustomerCreated={c => {
                setLocalCustomers(prev => [...prev, c]);
                setShowInlineCreate(false);
              }}
            />
          )}
        </div>
      )}

      {/* Single mode: single description textarea */}
      {mode === 'single' && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Task Description *</label>
          <textarea
            rows={2}
            autoFocus
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What needs to be done?"
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none"
          />
        </div>
      )}

      {/* Bulk mode: per-row table with individual customer + OKR assignment */}
      {mode === 'bulk' && (
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_24px] gap-1.5 px-1 mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description *</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">OKR</span>
            <span />
          </div>

          {/* Rows */}
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
            {bulkRows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_90px_90px_24px] gap-1.5 items-center">
                <input
                  autoFocus={idx === 0}
                  value={row.description}
                  onChange={e => updateBulkRow(row.id, 'description', e.target.value)}
                  onPaste={e => handleRowPaste(e, row.id)}
                  placeholder={idx === 0 ? 'Task description…' : ''}
                  className="min-w-0 bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 w-full"
                />
                <select
                  value={row.customerId}
                  onChange={e => updateBulkRow(row.id, 'customerId', e.target.value)}
                  className="min-w-0 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 w-full"
                >
                  <option value="">— None —</option>
                  {[...localCustomers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {okrs.length > 0 ? (
                  <select
                    value={row.okrId}
                    onChange={e => updateBulkRow(row.id, 'okrId', e.target.value)}
                    className="min-w-0 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 w-full"
                  >
                    <option value="">— None —</option>
                    {okrs.map(o => (
                      <option key={o.id} value={o.id}>{o.quarter} — {o.title}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[10px] text-muted-foreground/40 text-center">—</div>
                )}
                <button
                  type="button"
                  onClick={() => deleteBulkRow(row.id)}
                  disabled={bulkRows.length === 1}
                  className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Remove row"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Footer: add row + task count */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={addBulkRow}
              className="flex items-center gap-1 text-[10px] font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
            >
              <Plus size={11} /> Add row
            </button>
            {filledBulkRows.length > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-lavender/15 text-brand-lavender border border-brand-lavender/20">
                {filledBulkRows.length} task{filledBulkRows.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Work Type</label>
          <select
            value={form.workType}
            onChange={e => setForm(p => ({ ...p, workType: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {WORK_TYPES.map(wt => (
              <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
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

      {/* Evergreen toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <CustomCheckbox
          checked={form.isEvergreen}
          onChange={e => setForm(p => ({ ...p, isEvergreen: e.target.checked }))}
          ariaLabel="Evergreen (resets weekly)"
        />
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <RefreshCw size={10} className="text-green-400" /> Evergreen (resets weekly)
        </span>
      </label>

      {/* OKR selector — single mode only (bulk mode has per-row OKR dropdowns) */}
      {mode === 'single' && okrs.length > 0 && (
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
          onClick={handleSubmit}
          className="flex-1 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-foreground transition-colors"
        >
          {mode === 'bulk' && filledBulkRows.length > 1
            ? `Create ${filledBulkRows.length} Tasks`
            : 'Create Task'}
        </button>
      </div>
    </div>
  );
}

// ─── Sortable task row (elevated card with drag handle) ───────────────────────
const SortableTaskRow = memo(function SortableTaskRow({ task, customer, onOpenDetail, isSelected, onToggleSelect, onStatusChange }) {
  const { updateTask } = useAppStore();
  const { isRunning, taskId: runningTaskId } = useTimerContext();
  const isTimerActive = isRunning && runningTaskId === task.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const typeColors = WORK_TYPE_COLORS[task.workType] || WORK_TYPE_COLORS.comms;
  // Only recompute age when the task's creation timestamp changes (not on every parent render)
  const ageDays = useMemo(
    () => Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000),
    [task.createdAt]
  );
  // Age color: ≤7d muted, >7d amber warning
  const ageColor = ageDays > 7 ? 'text-[#f59e0b]' : 'text-[#5a5e72]';
  // Status dot color
  const statusDotColor = { open: 'bg-amber-400', 'in-progress': 'bg-blue-400', blocked: 'bg-red-400', done: 'bg-green-400', archived: 'bg-gray-400' }[task.status] || 'bg-amber-400';
  // Pre-parse Jira URLs once per description change — avoids regex exec on every render
  const { cleanText: descCleanText, tickets: descTickets } = useMemo(
    () => extractJiraLinks(task.description),
    [task.description]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-3 rounded-[10px] px-4 py-[14px] border transition-[all_0.15s_ease]
        shadow-[0_1px_3px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]
        hover:shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.2)]
        hover:-translate-y-px
        ${isSelected
          ? 'bg-[#1f2235] border-indigo-500/40'
          : 'bg-[#1a1d2e] border-[rgba(255,255,255,0.07)] hover:bg-[#1f2235] hover:border-[rgba(99,102,241,0.2)]'
        }`}
    >
      {/* Bulk select checkbox */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={() => onToggleSelect(task.id)}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 mt-[3px] rounded border-border bg-secondary text-indigo-500 focus:ring-ring/40 focus:ring-1 flex-shrink-0 cursor-pointer accent-indigo-500"
        />
      )}

      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[#5a5e72] hover:text-[#8b8fa8] flex-shrink-0 touch-none p-0.5 mt-[2px]"
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
        {/* Client tag + timer dot row — above title */}
        {(isTimerActive || customer) && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {isTimerActive && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" title="Timer running" />
            )}
            {customer && (
              <span
                className="text-[11px] font-bold px-2 py-[2px] rounded-[4px]"
                style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1' }}
              >
                {customer.name}
              </span>
            )}
          </div>
        )}

        {/* Task title — full word wrap, no truncation */}
        <p className="text-[14px] font-medium text-[#e8eaf0] leading-[1.5] break-words mb-2">
          {descCleanText}
          {descTickets.map(t => (
            <a
              key={t.id}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-block ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-brand-lavender/30 bg-brand-lavender/10 text-brand-lavender hover:bg-brand-lavender/20 transition-colors"
            >
              {t.id}
            </a>
          ))}
        </p>

        {/* Badges row — type + age + points + ticket link */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
            {task.isEvergreen && <RefreshCw size={9} />}
            {WORK_TYPE_LABELS[task.workType] || 'Comms'}
          </span>
          <span
            className={`text-[10px] font-semibold ${ageColor}`}
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

      {/* Quick status select with colored dot indicator */}
      <div onClick={e => e.stopPropagation()} className="flex-shrink-0 flex items-center gap-1.5 mt-[2px]">
        <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${statusDotColor}`} />
        <select
          value={task.status}
          onChange={e => {
            updateTask(task.id, { status: e.target.value });
            onStatusChange?.(e.target.value);
          }}
          className="text-[12px] font-medium rounded-[6px] px-3 py-[5px] border border-[rgba(255,255,255,0.07)] bg-[#1e2130] text-[#8b8fa8] cursor-pointer focus:outline-none"
        >
          {TASK_STATUSES.map(s => (
            <option key={s} value={s} className="bg-[#1e2130] text-foreground">{TASK_STATUS_LABELS[s]}</option>
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
  const { isRunning, taskId: runningTaskId, startTimer, stopTimer } = useTimerContext();
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
      {/* Breadcrumb header */}
      <div className="flex items-center gap-1.5 mb-6 text-xs flex-wrap">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Triage
        </button>
        <span className="text-muted-foreground/30">›</span>
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Task Queue
        </button>
        <span className="text-muted-foreground/30">›</span>
        <span
          className="text-foreground/80 font-medium truncate max-w-[40ch]"
          title={task.description}
        >
          {task.description.length > 40 ? `${task.description.slice(0, 40)}…` : task.description}
        </span>
        {customer && (
          <span
            className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
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
          <div className="grid grid-cols-2 gap-4">
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Work Type</label>
              <select
                value={task.workType || 'comms'}
                onChange={e => updateTask(task.id, { workType: e.target.value })}
                className={selectClass}
              >
                {WORK_TYPES.map(wt => (
                  <option key={wt} value={wt} className="bg-secondary">{WORK_TYPE_LABELS[wt]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Evergreen toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <CustomCheckbox
              checked={!!task.isEvergreen}
              onChange={e => updateTask(task.id, { isEvergreen: e.target.checked || undefined })}
              ariaLabel="Evergreen (resets weekly)"
            />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw size={10} className="text-green-400" /> Evergreen (resets weekly)
            </span>
          </label>

          {/* Ticket URL */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Link2 size={11} /> Ticket / Link
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
                      startTimer(task.workType || 'deep_work', { clientIds: task.customerId ? [task.customerId] : [], taskId: task.id, taskDescription: task.description });
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

// ─── Main Triage page ──────────────────────────────────────────────────────────
export default function Triage() {
  const {
    tasks, customers, meetingEntries, updateTask, addTask, reorderTasks, addPoint, okrs,
    aiSettings,
  } = useAppStore();
  const { isRunning, taskId: runningTaskId, startTimer, stopTimer } = useTimerContext();
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showTimerTaskForm, setShowTimerTaskForm] = useState(false);
  const [autoSaveToast, setAutoSaveToast] = useState(null); // { pts, customerName } | null
  const [aiAssistOpen, setAiAssistOpen] = useState(false);

  // Voice Comms modal
  const [showVoiceComms, setShowVoiceComms] = useState(false);

  // Meeting modal
  const [showLogMeeting, setShowLogMeeting] = useState(false);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterWorkType,   setFilterWorkType]   = useState('');
  const [filterStatus,     setFilterStatus]     = useState('open'); // default to Open on page load
  // 'active' tab: open/in-progress/blocked; 'closed' tab: done + archived
  const [boardTab, setBoardTab] = useState('active');

  // Priority quick-filter toggle
  const [filterPriorityClients, setFilterPriorityClients] = useState(false);

  // Closed tab week picker state
  const [closedWeekOffset, setClosedWeekOffset] = useState(0);
  const { weekStart: closedWeekStart, weekEnd: closedWeekEnd } = getWeekRangeForOffset(closedWeekOffset);
  const closedWeekLabel = formatWeekLabel(closedWeekStart, closedWeekEnd);

  // Ref for scrolling to the filter bar (used by the "filtered" badge click)
  const filterRowRef = useRef(null);

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());


  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // O(1) lookup map — memoized to avoid recreation every render
  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Derived customer list for filter dropdown (only customers that have tasks), sorted A-Z
  const customersWithTasks = useMemo(
    () => customers.filter(c => tasks.some(t => t.customerId === c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [customers, tasks]
  );

  // Reset filters when customer filter changes
  const handleCustomerFilter = (val) => {
    setFilterCustomerId(val);
    clearSelection();
  };

  // Active tasks: open, in-progress, blocked (excludes done and archived)
  const activeTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status === 'done' || t.status === 'archived') return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterWorkType && t.workType !== filterWorkType) return false;
      if (filterStatus   && t.status   !== filterStatus)   return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      return true;
    }),
    [tasks, customerMap, filterCustomerId, filterWorkType, filterStatus, filterPriorityClients]
  );

  // Closed tasks: done + archived, filtered by selected week, sorted by closedAt DESC
  const closedTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status !== 'done' && t.status !== 'archived') return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterWorkType && t.workType !== filterWorkType) return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      // Filter by week range — use closedAt, fallback to createdAt
      const closedDate = t.closedAt || t.createdAt;
      if (closedDate && !isInRange(parseISO(closedDate), closedWeekStart, closedWeekEnd)) return false;
      return true;
    }).sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt)),
    [tasks, customerMap, filterCustomerId, filterWorkType, filterPriorityClients, closedWeekStart, closedWeekEnd]
  );

  // Dedicated in-progress list — respects customer/workType/priority filters but NOT filterStatus
  const inProgressTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status !== 'in-progress') return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterWorkType && t.workType !== filterWorkType) return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      return true;
    }),
    [tasks, customerMap, filterCustomerId, filterWorkType, filterPriorityClients]
  );

  // Evergreen tasks: all tasks with isEvergreen flag, regardless of status
  const evergreenTasks = useMemo(
    () => tasks.filter(t => {
      if (!t.isEvergreen) return false;
      if (filterCustomerId && t.customerId !== filterCustomerId) return false;
      if (filterPriorityClients) {
        const cust = customerMap.get(t.customerId);
        if (!cust?.pinned) return false;
      }
      return true;
    }).sort((a, b) => {
      // Open first, then done, then archived
      const statusOrder = { 'open': 0, 'in-progress': 1, 'blocked': 2, 'done': 3, 'archived': 4 };
      return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    }),
    [tasks, customerMap, filterCustomerId, filterPriorityClients]
  );

  // Pending meetings count for badge
  const pendingMeetingsCount = useMemo(
    () => (meetingEntries || []).filter(m => m.triageStatus === 'pending').length,
    [meetingEntries]
  );

  const filtersActive = filterCustomerId || filterWorkType || filterStatus || filterPriorityClients;

  // Bulk action helpers
  const toggleSelect = useCallback((id) => setSelectedTaskIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }), []);
  const selectAll = () => setSelectedTaskIds(new Set(activeTasks.map(t => t.id)));
  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);
  const clearAllFilters = useCallback(() => {
    setFilterCustomerId('');
    setFilterWorkType('');
    setFilterStatus('');
    setFilterPriorityClients(false);
    clearSelection();
  }, [clearSelection]);
  // Shared callback: switch to Closed tab, reset week to current, clear all filters
  const switchToClosedTab = useCallback(() => {
    setBoardTab('closed');
    setClosedWeekOffset(0);
    setFilterStatus('');
    setFilterCustomerId('');
    setFilterWorkType('');
    setFilterPriorityClients(false);
    clearSelection();
  }, [clearSelection]);
  const handleBulkStatus = (status) => {
    selectedTaskIds.forEach(id => updateTask(id, { status }));
    if (status === 'done' || status === 'archived') {
      switchToClosedTab();
    } else {
      clearSelection();
    }
  };
  const handleBulkArchive = () => {
    selectedTaskIds.forEach(id => updateTask(id, { status: 'archived' }));
    switchToClosedTab();
  };
  const handleBulkAssign = (customerId) => {
    selectedTaskIds.forEach(id => updateTask(id, { customerId: customerId || null }));
    clearSelection();
  };


  // ── Auto-timer: start on task open, stop + auto-save points on close ───
  // Wrapped in useCallback so handleOpenDetail's own useCallback dep array stays stable
  const autoSaveSession = useCallback((session) => {
    if (!session || session.elapsedSeconds < AUTO_TRACK_MIN_SECONDS) return;
    const hours = session.elapsedSeconds / 3600;
    const pts = Math.round(hours * AUTO_TRACK_RATE * 100) / 100;
    const clientIds = session.clientIds || [];
    // Create a point for each tagged client (or one with null if no clients)
    if (clientIds.length > 0) {
      clientIds.forEach(cid => {
        addPoint({
          customerId: cid,
          points: Math.round((pts / clientIds.length) * 100) / 100,
          hours: Math.round((hours / clientIds.length) * 100) / 100,
          activityType: 'General Admin',
          comment: `Auto-tracked: ${session.taskDescription || 'Task review'}`,
        });
      });
    } else {
      addPoint({
        customerId: null,
        points: pts,
        hours: Math.round(hours * 100) / 100,
        activityType: 'General Admin',
        comment: `Auto-tracked: ${session.taskDescription || 'Task review'}`,
      });
    }
    // Toast feedback so user knows points were captured
    const cName = clientIds.length === 1
      ? customers.find(c => c.id === clientIds[0])?.name || 'task'
      : clientIds.length > 1 ? `${clientIds.length} clients` : 'task';
    setAutoSaveToast({ pts, customerName: cName });
    setTimeout(() => setAutoSaveToast(null), 3000);
  }, [addPoint, customers]);

  const handleOpenDetail = useCallback((task) => {
    // Auto-stop previous timer if running for a different task
    if (isRunning && runningTaskId && runningTaskId !== task.id) {
      autoSaveSession(stopTimer({ silent: true }));
    }
    // Always attempt start — startTimer's internal localStorage guard prevents double-start
    startTimer(task.workType || 'deep_work', { clientIds: task.customerId ? [task.customerId] : [], taskId: task.id, taskDescription: task.description });
    setTaskDetailId(task.id);
  }, [isRunning, runningTaskId, autoSaveSession, stopTimer, startTimer]);

  // Stable handler passed to every SortableTaskRow — useCallback prevents rows from
  // re-rendering just because the parent re-rendered (works in tandem with memo())
  const handleTaskStatusChange = useCallback((newStatus) => {
    if (newStatus === 'done' || newStatus === 'archived') {
      switchToClosedTab();
    }
  }, [switchToClosedTab]);

  const handleCloseDetail = () => {
    // Auto-stop timer if running for the current task
    if (isRunning && runningTaskId === taskDetailId) {
      autoSaveSession(stopTimer({ silent: true }));
    }
    // If the task was marked done/archived while in the detail view, switch to Closed tab
    const closedTask = tasks.find(t => t.id === taskDetailId);
    if (closedTask && (closedTask.status === 'done' || closedTask.status === 'archived')) {
      switchToClosedTab();
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

  // ─── Weekly Update Log handlers ───────────────────────────────────────────────

  // ─── Close timer task form when timer starts from elsewhere ───────────────
  useEffect(() => {
    if (isRunning) setShowTimerTaskForm(false);
  }, [isRunning]);

  // ── Task Detail sub-view ───────────────────────────────────────────────────
  if (taskDetailId) {
    const task = tasks.find(t => t.id === taskDetailId);
    if (!task) { setTaskDetailId(null); return null; }
    const customer = customers.find(c => c.id === task.customerId);
    return <TaskDetailView task={task} customer={customer} onBack={handleCloseDetail} />;
  }

  // ── Queue view ─────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-5">

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
            <button
              onClick={() => filterRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
              className="bg-teal-500/15 text-teal-400 border border-teal-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full hover:bg-teal-500/25 transition-colors cursor-pointer"
              title="Scroll to filter controls"
            >
              filtered ↓
            </button>
          )}
          {/* Focus Time button — opens quick task form, or starts unlinked timer */}
          {!isRunning && (
            <button
              onClick={() => { setShowTimerTaskForm(v => !v); setShowQuickAdd(false); }}
              className={`ml-auto flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium border transition-[all_0.15s_ease] ${
                showTimerTaskForm
                  ? 'bg-emerald-700/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-[#1a1d2e] border-[rgba(255,255,255,0.07)] text-[#8b8fa8] hover:bg-[#1f2235] hover:text-[#e8eaf0]'
              }`}
              title="Create a focus task and start timer"
            >
              <Timer size={12} />
              Focus Time
            </button>
          )}
          <button
            onClick={() => setShowLogMeeting(true)}
            className="flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium border border-[rgba(255,255,255,0.07)] bg-[#1a1d2e] text-[#8b8fa8] hover:bg-[#1f2235] hover:text-[#e8eaf0] transition-[all_0.15s_ease]"
          >
            <Video size={12} /> Log Meeting
          </button>
          <button
            onClick={() => setAiAssistOpen(true)}
            className="flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium border border-[rgba(255,255,255,0.07)] bg-[#1a1d2e] text-[#8b8fa8] hover:bg-[#1f2235] hover:text-[#e8eaf0] transition-[all_0.15s_ease]"
          >
            <Sparkles size={12} /> AI Assist
          </button>
          <button
            onClick={() => { setShowQuickAdd(v => !v); setShowTimerTaskForm(false); }}
            className={`${isRunning ? 'ml-auto' : ''} flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium transition-[all_0.15s_ease] ${
              showQuickAdd
                ? 'bg-[#818cf8] text-white shadow-[0_4px_12px_rgba(99,102,241,0.45)]'
                : 'bg-[#6366f1] text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)] hover:bg-[#818cf8] hover:shadow-[0_4px_12px_rgba(99,102,241,0.45)]'
            }`}
          >
            <Plus size={12} />
            Task
          </button>
        </div>

        {/* Focus timer quick-create form */}
        {showTimerTaskForm && (
          <TimerQuickTaskForm
            customers={customers}
            onSubmit={(description, customerId) => {
              const newTask = addTask({
                customerId: customerId || null,
                description,
                workType: 'deep_work',
                status: 'open',
              });
              startTimer('deep_work', { clientIds: customerId ? [customerId] : [], taskId: newTask.id, taskDescription: newTask.description });
              setShowTimerTaskForm(false);
            }}
            onStartWithoutTask={() => {
              startTimer('deep_work');
              setShowTimerTaskForm(false);
            }}
            onCancel={() => setShowTimerTaskForm(false)}
          />
        )}

        {/* Quick add task form */}
        {showQuickAdd && (
          <div className="mb-3">
            <QuickAddTaskForm
              customers={customers}
              onSubmit={(tasks) => {
                tasks.forEach(t => addTask({
                  customerId:  t.customerId || null,
                  okrId:       t.okrId || null,
                  description: t.description,
                  workType:    t.workType,
                  isEvergreen: t.isEvergreen || undefined,
                  status:      t.status,
                }));
                setShowQuickAdd(false);
              }}
              onCancel={() => setShowQuickAdd(false)}
            />
          </div>
        )}

        {/* Filter bar — single horizontal row */}
        <div ref={filterRowRef} className="flex items-center gap-2 mb-3 overflow-x-auto py-[10px] border-b border-[rgba(255,255,255,0.07)]">
          {/* Customer dropdown pill */}
          <select
            value={filterCustomerId}
            onChange={e => handleCustomerFilter(e.target.value)}
            className="flex-shrink-0 bg-[#1a1d2e] border border-[rgba(255,255,255,0.07)] text-[#8b8fa8] py-[6px] px-[10px] rounded-[6px] text-[12.5px] font-medium whitespace-nowrap focus:outline-none cursor-pointer"
          >
            <option value="">All clients</option>
            {customersWithTasks.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Work type dropdown pill */}
          <select
            value={filterWorkType}
            onChange={e => { setFilterWorkType(e.target.value); clearSelection(); }}
            className="flex-shrink-0 bg-[#1a1d2e] border border-[rgba(255,255,255,0.07)] text-[#8b8fa8] py-[6px] px-[10px] rounded-[6px] text-[12.5px] font-medium whitespace-nowrap focus:outline-none cursor-pointer"
          >
            <option value="">All types</option>
            {WORK_TYPES.map(wt => (
              <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
            ))}
          </select>

          {/* Status filter — only on Active tab */}
          {boardTab === 'active' && (
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); clearSelection(); }}
              className="flex-shrink-0 bg-[#1a1d2e] border border-[rgba(255,255,255,0.07)] text-[#8b8fa8] py-[6px] px-[10px] rounded-[6px] text-[12.5px] font-medium whitespace-nowrap focus:outline-none cursor-pointer"
            >
              <option value="">All statuses</option>
              {TASK_STATUSES.filter(s => !['done', 'archived'].includes(s)).map(s => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}

          {/* Vertical divider — shown when Priority Clients chip is active */}
          {filterPriorityClients && (
            <div className="w-px h-[18px] bg-[rgba(255,255,255,0.07)] flex-shrink-0" />
          )}

          {/* Priority Clients — amber chip when active, ghost pill when inactive */}
          {filterPriorityClients ? (
            <span className="flex-shrink-0 flex items-center gap-1.5 bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)] py-1 px-[10px] rounded-[20px] text-[11.5px] font-semibold whitespace-nowrap">
              Priority Clients
              <button
                onClick={() => { setFilterPriorityClients(false); clearSelection(); }}
                className="text-[#f59e0b] hover:text-amber-300 ml-0.5 leading-none"
                aria-label="Remove Priority Clients filter"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => { setFilterPriorityClients(true); clearSelection(); }}
              className="flex-shrink-0 flex items-center gap-[6px] bg-[#1a1d2e] border border-[rgba(255,255,255,0.07)] text-[#8b8fa8] py-[6px] px-[10px] rounded-[6px] text-[12.5px] font-medium whitespace-nowrap hover:bg-[#1f2235] hover:text-[#e8eaf0] transition-[all_0.15s_ease]"
            >
              <Pin size={11} /> Priority Clients
            </button>
          )}

          {/* Clear all filters link — pushed to the right */}
          {filtersActive && (
            <button
              onClick={clearAllFilters}
              className="ml-auto flex-shrink-0 text-[12px] text-[#5a5e72] hover:text-[#8b8fa8] transition-colors whitespace-nowrap"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Active / Closed tab switcher */}
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-3 w-fit">
          <button
            onClick={() => { setBoardTab('active'); setFilterStatus('open'); setFilterCustomerId(''); setFilterWorkType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'active' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => { setBoardTab('in-progress'); setFilterStatus(''); setFilterCustomerId(''); setFilterWorkType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'in-progress' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            In Progress
            {inProgressTasks.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                boardTab === 'in-progress' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-muted text-muted-foreground'
              }`}>
                {inProgressTasks.length}
              </span>
            )}
          </button>
          <button
            onClick={switchToClosedTab}
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
          <button
            onClick={() => { setBoardTab('evergreen'); setFilterStatus(''); setFilterCustomerId(''); setFilterWorkType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'evergreen' ? 'bg-green-500/15 text-green-400 shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCw size={12} />
            Evergreen
            {evergreenTasks.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                boardTab === 'evergreen' ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
              }`}>
                {evergreenTasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setBoardTab('meetings'); setFilterStatus(''); setFilterCustomerId(''); setFilterWorkType(''); setFilterPriorityClients(false); clearSelection(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              boardTab === 'meetings' ? 'bg-blue-500/15 text-blue-400 shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Video size={12} />
            Meetings
            {pendingMeetingsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                boardTab === 'meetings' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {pendingMeetingsCount}
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
              <select
                onChange={e => {
                  const val = e.target.value;
                  if (!val) return;
                  handleBulkAssign(val === '__unset__' ? null : val);
                  e.target.value = '';
                }}
                className="bg-secondary border border-border rounded-lg px-2.5 py-1 text-[10px] font-medium text-foreground/80 focus:outline-none focus:border-ring cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Reassign to…</option>
                <option value="__unset__" className="bg-secondary text-muted-foreground">— No customer —</option>
                {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c.id} value={c.id} className="bg-secondary text-foreground">{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Active tab — draggable task list */}
        {boardTab === 'active' && (
          activeTasks.length === 0 ? (
            <div className="bg-[#1a1d2e] border border-dashed border-[rgba(255,255,255,0.1)] rounded-[10px] px-8 py-12 flex flex-col items-center text-center gap-[14px]">
              {/* Icon */}
              <div className="w-14 h-14 rounded-[16px] bg-[rgba(99,102,241,0.15)] flex items-center justify-center flex-shrink-0">
                <Check size={26} className="text-[#6366f1]" />
              </div>
              {/* Title */}
              <h3 className="text-[15px] font-semibold text-[#e8eaf0]">
                {filtersActive ? 'No tasks match this filter.' : "You're all caught up on active tasks"}
              </h3>
              {/* Subtitle */}
              <p className="text-[13px] text-[#5a5e72] max-w-[340px] leading-[1.6]">
                {filtersActive
                  ? 'Try adjusting your filters or clear them to see all tasks.'
                  : 'No more tasks in this view. Add a new task or switch to In Progress to keep the momentum going.'}
              </p>
              {/* Action buttons */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { setBoardTab('in-progress'); setFilterStatus(''); setFilterCustomerId(''); setFilterWorkType(''); setFilterPriorityClients(false); clearSelection(); }}
                  className="flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium border border-[rgba(255,255,255,0.07)] bg-[#1a1d2e] text-[#8b8fa8] hover:bg-[#1f2235] hover:text-[#e8eaf0] transition-[all_0.15s_ease]"
                >
                  View All Tasks
                </button>
                <button
                  onClick={() => { setShowQuickAdd(v => !v); setShowTimerTaskForm(false); }}
                  className="flex items-center gap-[6px] px-3.5 py-[7px] rounded-[6px] text-[13px] font-medium bg-[#6366f1] text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)] hover:bg-[#818cf8] hover:shadow-[0_4px_12px_rgba(99,102,241,0.45)] transition-[all_0.15s_ease]"
                >
                  + Add Task
                </button>
              </div>
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

        {/* In Progress tab — draggable task list */}
        {boardTab === 'in-progress' && (
          inProgressTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
              <Clock size={24} className="text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{filtersActive ? 'No in-progress tasks match this filter.' : 'No tasks in progress.'}</p>
              <p className="text-muted-foreground/70 text-xs mt-1">
                {filtersActive ? 'Try a different filter.' : 'Set a task\'s status to In Progress to track active work here.'}
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={inProgressTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {inProgressTasks.map(task => {
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

        {/* Closed tab — week picker + done/archived tasks */}
        {boardTab === 'closed' && (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5 mb-3">
            <button
              onClick={() => setClosedWeekOffset(o => o - 1)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">{closedWeekLabel}</p>
              {closedWeekOffset !== 0 && (
                <button
                  onClick={() => setClosedWeekOffset(0)}
                  className="text-[10px] text-brand-lavender hover:underline mt-0.5"
                >
                  Go to this week
                </button>
              )}
            </div>
            <button
              onClick={() => setClosedWeekOffset(o => o + 1)}
              disabled={closedWeekOffset >= 0}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
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

        {/* Evergreen tab — all evergreen tasks regardless of status */}
        {boardTab === 'evergreen' && (
          evergreenTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
              <RefreshCw size={24} className="text-green-400/60 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No evergreen tasks.</p>
              <p className="text-muted-foreground/70 text-xs mt-1">Evergreen tasks auto-reset to open every Monday so they can be tracked weekly.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {evergreenTasks.map(task => {
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

        {/* Meetings tab — Meeting Review panel */}
        {boardTab === 'meetings' && (
          <MeetingReviewPanel />
        )}
      </div>

    </div>

    {/* Auto-save toast — appears bottom-right when timer session is saved */}
    {autoSaveToast && (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-sm
                      text-emerald-400 bg-card border border-emerald-500/20 rounded-xl
                      px-4 py-2.5 shadow-lg pointer-events-none">
        <Check size={14} />
        Auto-saved {autoSaveToast.pts} pts · {autoSaveToast.customerName}
      </div>
    )}

    {/* Voice FAB — portalled to escape motion.div transform context */}
    {createPortal(
      <button
        onClick={() => setShowVoiceComms(true)}
        title="Record a voice note"
        className="fixed bottom-20 right-6 z-40 flex items-center gap-2 rounded-full text-white shadow-lg px-5 py-3.5 transition-all active:scale-95 md:bottom-[5.5rem] md:right-8 bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30"
      >
        <Mic size={18} /><span className="text-sm font-semibold">Voice</span>
      </button>,
      document.body
    )}

    {/* Voice Comms modal */}
    {showVoiceComms && (
      <VoiceCommsModal onClose={() => setShowVoiceComms(false)} />
    )}

    {/* AI Assist standalone modal */}
    {aiAssistOpen && (
      <AIAssistModal onClose={() => setAiAssistOpen(false)} />
    )}

    {/* Quick Log Meeting modal */}
    {showLogMeeting && (
      <QuickLogMeetingModal onClose={() => setShowLogMeeting(false)} />
    )}
    </>
  );
}
