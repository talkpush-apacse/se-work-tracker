import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Plus, Mic, MicOff, Copy, Save, Check,
  Loader2, ClipboardList, Sparkles, ChevronRight,
  Calendar, User, Tag, AlertCircle, Archive, ArchiveX,
  Settings, RotateCcw, Pencil,
} from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import {
  TASK_TYPES, TASK_TYPE_LABELS, TASK_TYPE_COLORS,
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  AI_OUTPUT_TYPES, AI_OUTPUT_TYPE_LABELS,
  TASK_RECIPIENTS,
  CUSTOMER_COLORS,
  TASK_TYPE_POINTS,
} from '../constants';

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

// ─── Shared inline project + customer creation form ───────────────────────────
// Used by both TriageForm and QuickAddTaskForm to allow creating a new project
// (and optionally a new customer) without leaving the current form.
function InlineProjectCreate({ localCustomers, onCustomerCreated, onProjectCreated }) {
  const { addCustomer, addProject } = useAppStore();
  const [newProject, setNewProject] = useState({ name: '', customerId: '' });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', color: CUSTOMER_COLORS[0].value });

  const handleCreateCustomer = () => {
    if (!newCustomer.name.trim()) return;
    const created = addCustomer({ name: newCustomer.name.trim(), color: newCustomer.color });
    onCustomerCreated(created);
    setNewProject(p => ({ ...p, customerId: created.id }));
    setNewCustomer({ name: '', color: CUSTOMER_COLORS[0].value });
    setShowNewCustomer(false);
  };

  const handleCreateProject = () => {
    if (!newProject.name.trim()) return;
    const created = addProject({
      name: newProject.name.trim(),
      customerId: newProject.customerId || null,
      okrId: null,
      status: 'Active',
    });
    onProjectCreated(created);
  };

  return (
    <div className="mt-2 p-2.5 bg-gray-800 border border-gray-700 rounded-xl space-y-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">New Project</p>
      <input
        value={newProject.name}
        onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
        placeholder="Project name *"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
      />
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">Customer <span className="text-gray-600">(optional)</span></span>
          <button
            type="button"
            onClick={() => setShowNewCustomer(v => !v)}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showNewCustomer ? '✕ Cancel' : '+ New Customer'}
          </button>
        </div>
        <select
          value={newProject.customerId}
          onChange={e => setNewProject(p => ({ ...p, customerId: e.target.value }))}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— No customer —</option>
          {localCustomers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {showNewCustomer && (
        <div className="p-2 bg-gray-900 border border-gray-700 rounded-lg space-y-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">New Customer</p>
          <input
            value={newCustomer.name}
            onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
            placeholder="Customer name *"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
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
            className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
          >
            Create Customer
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={!newProject.name.trim()}
        onClick={handleCreateProject}
        className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
      >
        Create Project
      </button>
    </div>
  );
}

// ─── Inline triage form (shown below an untriaged entry) ──────────────────────
function TriageForm({ entry, project, customer, projects, customers, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    projectId:     project?.id || '',
    description:   entry.rawNotes.split('\n')[0].slice(0, 120), // pre-fill from first line
    taskType:      'comms',
    assigneeOrTeam: '',
    status:        'open',
  });

  // Local lists that grow if user creates new entries inline
  const [localProjects,  setLocalProjects]  = useState(projects  || []);
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [showInlineCreate, setShowInlineCreate] = useState(false);

  // Build project options: non-Completed, with customer name suffix
  const projectOptions = localProjects
    .filter(p => p.status !== 'Completed')
    .map(p => {
      const c = localCustomers.find(c => c.id === p.customerId);
      return { id: p.id, label: `${p.name}${c ? ` — ${c.name}` : ''}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const canSubmit = form.projectId && form.description.trim();

  // "Logged on" date from entry.createdAt
  const loggedOn = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="mt-3 border-t border-gray-700/60 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Convert to Task</p>
        {loggedOn && (
          <p className="text-[10px] text-gray-500">Logged on {loggedOn}</p>
        )}
      </div>

      {/* Project selector with inline creation */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400">Project *</label>
          <button
            type="button"
            onClick={() => setShowInlineCreate(v => !v)}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showInlineCreate ? '✕ Cancel' : '+ New Project'}
          </button>
        </div>
        <select
          value={form.projectId}
          onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— Select project —</option>
          {projectOptions.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {showInlineCreate && (
          <InlineProjectCreate
            localCustomers={localCustomers}
            onCustomerCreated={c => setLocalCustomers(prev => [...prev, c])}
            onProjectCreated={p => {
              setLocalProjects(prev => [...prev, p]);
              setForm(f => ({ ...f, projectId: p.id }));
              setShowInlineCreate(false);
            }}
          />
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Task Description *</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Task Type</label>
          <select
            value={form.taskType}
            onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Recipient <span className="text-gray-600">(optional)</span></label>
        <select
          value={form.assigneeOrTeam}
          onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— Select recipient —</option>
          {TASK_RECIPIENTS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ ...form, description: form.description.trim() })}
          className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

// ─── Triage queue entry card ──────────────────────────────────────────────────
function TriageEntryCard({ entry, project, customer, onTriaged }) {
  const { addTask, markMeetingEntryTriaged, projects, customers } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (formData) => {
    addTask({
      projectId: formData.projectId || project.id, // use form-selected project (may differ from entry's)
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
    <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-3">
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
            <span className="text-[10px] text-gray-400 font-medium truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <Calendar size={10} />
            {new Date(entry.meetingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 flex-shrink-0">
          Untriaged
        </span>
      </div>

      {/* Notes preview */}
      <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
        {expanded ? entry.rawNotes : previewLines}
      </p>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1"
        >
          Show more…
        </button>
      )}

      {/* Action row */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-xs font-semibold border border-indigo-500/20 transition-all"
        >
          <Plus size={12} /> Convert to Task
        </button>
      )}

      {showForm && (
        <TriageForm
          entry={entry}
          project={project}
          customer={customer}
          projects={projects}
          customers={customers}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ─── Task card (in the board) ─────────────────────────────────────────────────
function TaskCard({ task, project, customer, isSelected, onSelect, onStatusChange, onArchive }) {
  const { updateTask } = useAppStore();
  const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;
  const isArchived = task.status === 'archived';

  // Aging — days since task creation (client-side, no DB needed)
  const ageDays = Math.floor((Date.now() - new Date(task.createdAt)) / 86_400_000);
  const ageStyle = ageDays <= 2
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : ageDays <= 5
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-red-400 bg-red-500/10 border-red-500/20';
  const [isEditing, setIsEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(task.description);
  const editRef = useRef(null);

  // Notes — freeform field for links, artifacts, context
  const [notesDraft, setNotesDraft] = useState(task.notes || '');
  const notesTimerRef = useRef(null);
  const handleNotesChange = (val) => {
    setNotesDraft(val);
    clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      updateTask(task.id, { notes: val });
    }, 500);
  };

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
          ? 'bg-gray-900/40 border-gray-800/60 opacity-60'
          : isSelected
            ? 'bg-indigo-600/15 border-indigo-500/40 shadow-lg shadow-indigo-500/10 cursor-pointer'
            : 'bg-gray-800/50 border-gray-700/60 hover:border-gray-600 cursor-pointer'
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
              className="w-full bg-gray-700/60 border border-indigo-500/50 rounded-lg px-2 py-1 text-xs text-white resize-none focus:outline-none focus:border-indigo-400 leading-snug"
            />
          ) : (
            <div
              className="group/desc flex items-start gap-1"
              onClick={e => { if (!isArchived) { e.stopPropagation(); setIsEditing(true); } }}
            >
              <p className={`flex-1 text-xs font-medium leading-snug line-clamp-2 ${isArchived ? 'text-gray-500 line-through' : 'text-white group-hover/desc:text-indigo-200 cursor-text'}`}>
                {task.description}
              </p>
              {!isArchived && (
                <Pencil size={10} className="flex-shrink-0 mt-0.5 text-gray-600 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
              )}
            </div>
          )}
          {project && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{project.name}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Archive / Unarchive button */}
          <button
            onClick={e => { e.stopPropagation(); onArchive(task); }}
            title={isArchived ? 'Restore task' : 'Archive task'}
            className={`p-1 rounded transition-colors ${
              isArchived
                ? 'text-gray-500 hover:text-emerald-400'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {isArchived ? <ArchiveX size={12} /> : <Archive size={12} />}
          </button>
          {!isArchived && (
            <ChevronRight size={13} className={`transition-colors ${isSelected ? 'text-indigo-400' : 'text-gray-600'}`} />
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
          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
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
              <option key={s} value={s} className="bg-gray-800 text-white">
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes textarea — for links, artifacts, context */}
      {!isArchived && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <textarea
            value={notesDraft}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Notes, links, artifacts…"
            rows={2}
            className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 placeholder:text-gray-600 resize-none focus:outline-none focus:border-gray-600"
          />
        </div>
      )}

      {isArchived && (
        <div>
          {task.notes && (
            <p className="mt-1 text-[10px] text-gray-500 line-clamp-2">{task.notes}</p>
          )}
          <p className="mt-1 text-[10px] text-gray-600 italic">Archived</p>
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
    <details className="bg-gray-900 border border-gray-800 rounded-xl">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {AI_OUTPUT_TYPE_LABELS[h.outputType]}
          </span>
          {h.provider && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
              h.provider === 'claude'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
            }`}>
              {h.provider === 'claude' ? 'Claude' : 'ChatGPT'}
            </span>
          )}
          <span className="text-[10px] text-gray-600">
            {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' '}
            {new Date(h.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <ChevronDown size={13} className="text-gray-600 flex-shrink-0" />
      </summary>

      <div className="px-4 pb-4 space-y-2">
        {/* Editable textarea — same UX as current output */}
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.max(5, draft.split('\n').length + 1)}
          className="w-full bg-transparent text-xs text-gray-300 leading-relaxed resize-none focus:outline-none"
        />

        {/* Edited indicator */}
        {draft !== h.outputText && (
          <p className="text-[10px] text-indigo-400/60 flex items-center gap-1">
            ✎ Edited — save to persist
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5 border-t border-gray-800 pt-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-all border border-gray-700"
          >
            {copied
              ? <><Check size={11} className="text-emerald-400" /> Copied!</>
              : <><Copy size={11} /> Copy</>}
          </button>
          <button
            onClick={handleSave}
            disabled={draft === h.outputText}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-all border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved
              ? <><Check size={11} className="text-emerald-400" /> Saved!</>
              : <><Save size={11} /> Save</>}
          </button>
        </div>
      </div>
    </details>
  );
}

// ─── AI Workspace (right panel) ───────────────────────────────────────────────
function AIWorkspace({ task, project, customer }) {
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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
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
        <p className="text-sm font-semibold text-white leading-snug">{task.description}</p>
        {project && <p className="text-xs text-gray-500 mt-1">{project.name}</p>}
        {recipientText && (
          <p className="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <User size={11} /> {recipientText}
          </p>
        )}
      </div>

      {/* Output type selector */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Output Type</p>
        <div className="flex flex-wrap gap-1.5">
          {AI_OUTPUT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setOutputType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                outputType === type
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              {AI_OUTPUT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {/* Recipient selector — visible for output types that use it */}
        {['message-draft', 'meeting-summary'].includes(outputType) && (
          <div className="mt-2.5 flex items-center gap-2">
            <User size={11} className="text-gray-500 flex-shrink-0" />
            <select
              value={recipientOverride}
              onChange={e => setRecipientOverride(e.target.value)}
              className="flex-1 bg-gray-800/60 border border-gray-700/60 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">— No recipient —</option>
              {TASK_RECIPIENTS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {recipientText && (
              <span className="text-[10px] text-indigo-400/70 whitespace-nowrap">
                tailored for <span className="font-semibold">{recipientText}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Email nature sub-selector — only for Message Draft */}
      {outputType === 'message-draft' && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">Message Nature</p>
          <select
            value={emailNature}
            onChange={e => setEmailNature(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {EMAIL_NATURES.map(n => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Customize Panel ───────────────────────────────────────────────────── */}
      <div className="border border-gray-700/60 rounded-xl overflow-hidden">
        {/* Collapse toggle */}
        <button
          onClick={() => setShowCustomize(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Settings size={12} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-400">Model settings</span>
            {/* Indicators: provider badge + custom prompt dot */}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              currentProvider === 'claude'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
            }`}>
              {currentProvider === 'claude' ? 'Claude' : 'ChatGPT'}
            </span>
            {customPrompt.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Custom prompt active" />
            )}
          </div>
          <ChevronDown size={16} className={`text-gray-600 transition-transform ${showCustomize ? 'rotate-180' : ''}`} />
        </button>

        {showCustomize && (
          <div className="p-3 space-y-3 bg-gray-900/40 border-t border-gray-700/60">

            {/* Provider toggle */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">AI Provider</p>
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
                          : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
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
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">OpenAI Model</p>
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
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
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
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Claude Model</p>
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
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
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
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  System Prompt
                </p>
                {customPrompt.trim() && (
                  <button
                    onClick={() => updateAiSettings({ prompts: { [outputType]: '' } })}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
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
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono leading-relaxed"
              />
              <p className="mt-1 text-[10px] text-gray-600">
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
          <p className="text-xs font-medium text-gray-400">Context / Notes</p>
          <button
            onClick={toggleListening}
            disabled={isTranscribing}
            title={isListening ? 'Stop recording' : 'Record voice input (Whisper)'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isListening
                ? 'bg-red-600/20 border-red-500/40 text-red-400 animate-pulse'
                : isTranscribing
                  ? 'bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed opacity-60'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
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
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !userInput.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30"
      >
        {isGenerating
          ? <><Loader2 size={16} className="animate-spin" /> Generating…</>
          : <><Sparkles size={16} /> Generate with {currentProvider === 'claude' ? 'Claude' : 'ChatGPT'}</>
        }
      </button>

      {/* Current output */}
      {currentOutput && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {AI_OUTPUT_TYPE_LABELS[currentOutput.outputType]}
              </p>
              {currentOutput.provider && (
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  currentOutput.provider === 'claude'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                }`}>
                  {currentOutput.provider === 'claude' ? 'Claude' : 'GPT-4o'}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-all border border-gray-700"
              >
                {copied ? <><Check size={12} className="text-emerald-400" /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-all border border-gray-700"
              >
                {savedMsg ? <><Check size={12} className="text-emerald-400" /> Saved!</> : <><Save size={12} /> Save</>}
              </button>
            </div>
          </div>
          <textarea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            rows={Math.max(6, editedText.split('\n').length + 1)}
            className="w-full bg-transparent text-sm text-gray-200 leading-relaxed resize-none focus:outline-none placeholder-gray-600"
            placeholder="Output will appear here…"
          />
          {editedText !== currentOutput.outputText && (
            <p className="text-[10px] text-indigo-400/60 flex items-center gap-1">
              ✎ Edited — copy or save to use your version
            </p>
          )}
        </div>
      )}

      {/* Output history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Previous Outputs ({history.length})</p>
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

// ─── Quick add task form (no meeting entry, just description + project link) ───
function QuickAddTaskForm({ projects, customers, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    projectId: '',
    description: '',
    taskType: 'comms',
    assigneeOrTeam: '',
    status: 'open',
  });

  // Live lists grow when user creates new entries via InlineProjectCreate
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [localProjects,  setLocalProjects]  = useState(projects);
  const [showInlineCreate, setShowInlineCreate] = useState(false);

  const projectOptions = localProjects
    .filter(p => p.status !== 'Completed')
    .map(p => {
      const c = localCustomers.find(c => c.id === p.customerId);
      return { id: p.id, label: `${p.name}${c ? ` — ${c.name}` : ''}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const canSubmit = form.projectId && form.description.trim();

  return (
    <div className="bg-gray-800/60 border border-indigo-500/30 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">New Task</p>

      {/* Project selector */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400">Project *</label>
          <button
            type="button"
            onClick={() => setShowInlineCreate(v => !v)}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showInlineCreate ? '✕ Cancel' : '+ New Project'}
          </button>
        </div>
        <select
          value={form.projectId}
          onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— Select project —</option>
          {projectOptions.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {showInlineCreate && (
          <InlineProjectCreate
            localCustomers={localCustomers}
            onCustomerCreated={c => setLocalCustomers(prev => [...prev, c])}
            onProjectCreated={p => {
              setLocalProjects(prev => [...prev, p]);
              setForm(f => ({ ...f, projectId: p.id }));
              setShowInlineCreate(false);
            }}
          />
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Task Description *</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="What needs to be done?"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Task Type</label>
          <select
            value={form.taskType}
            onChange={e => setForm(p => ({ ...p, taskType: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {TASK_TYPES.map(t => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Recipient <span className="text-gray-600">(optional)</span></label>
        <select
          value={form.assigneeOrTeam}
          onChange={e => setForm(p => ({ ...p, assigneeOrTeam: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— Select recipient —</option>
          {TASK_RECIPIENTS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ ...form, description: form.description.trim() })}
          className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

// ─── Main Triage page ──────────────────────────────────────────────────────────
export default function Triage() {
  const { meetingEntries, tasks, projects, customers, updateTask, addTask } = useAppStore();
  const [selectedTask, setSelectedTask] = useState(null);
  const [triageRefresh, setTriageRefresh] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterTaskType,   setFilterTaskType]   = useState('');
  const [filterStatus,     setFilterStatus]     = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Derived customer list for filter dropdown (only customers that have tasks)
  const customersWithTasks = customers.filter(c =>
    projects.some(p => p.customerId === c.id && tasks.some(t => t.projectId === p.id))
  );

  // Derived project list filtered by selected customer
  const projectsForFilter = filterCustomerId
    ? projects.filter(p => p.customerId === filterCustomerId && tasks.some(t => t.projectId === p.id))
    : projects.filter(p => tasks.some(t => t.projectId === p.id));

  // Reset project filter when customer filter changes
  const handleCustomerFilter = (val) => {
    setFilterCustomerId(val);
    setFilterProjectId('');
  };

  // Untriaged entries, sorted newest meeting date first
  const untriagedEntries = meetingEntries
    .filter(m => !m.isTriaged)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));

  // Group untriaged entries by customer
  const untriagedByCustomer = untriagedEntries.reduce((acc, entry) => {
    const project = projects.find(p => p.id === entry.projectId);
    if (!project) return acc;
    const customer = customers.find(c => c.id === project.customerId);
    const key = customer?.id || '_none';
    if (!acc[key]) acc[key] = { customer, entries: [] };
    acc[key].entries.push({ entry, project, customer });
    return acc;
  }, {});

  // All active (non-archived) tasks, filtered
  const activeTasks = tasks.filter(t => {
    if (t.status === 'archived') return false;
    if (filterCustomerId) {
      const proj = projects.find(p => p.id === t.projectId);
      if (!proj || proj.customerId !== filterCustomerId) return false;
    }
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterTaskType && t.taskType !== filterTaskType) return false;
    if (filterStatus   && t.status   !== filterStatus)   return false;
    return true;
  });

  // Archived tasks (filtered the same way)
  const archivedTasks = tasks.filter(t => {
    if (t.status !== 'archived') return false;
    if (filterCustomerId) {
      const proj = projects.find(p => p.id === t.projectId);
      if (!proj || proj.customerId !== filterCustomerId) return false;
    }
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterTaskType && t.taskType !== filterTaskType) return false;
    return true;
  });

  // Group active tasks by status
  const tasksByStatus = TASK_STATUSES.reduce((acc, s) => {
    acc[s] = activeTasks
      .filter(t => t.status === s)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return acc;
  }, {});

  const totalActiveTasks = activeTasks.length;
  const openCount = (tasksByStatus['open'] || []).length + (tasksByStatus['in-progress'] || []).length;
  const filtersActive = filterCustomerId || filterProjectId || filterTaskType || filterStatus;

  // Resolve selected task's project/customer
  const selectedProject = selectedTask ? projects.find(p => p.id === selectedTask.projectId) : null;
  const selectedCustomer = selectedProject ? customers.find(c => c.id === selectedProject.customerId) : null;

  // Keep selectedTask in sync if it gets updated
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
      else setSelectedTask(null); // task was deleted
    }
  }, [tasks]);

  // Handle archive/unarchive toggle
  const handleArchive = (task) => {
    if (task.status === 'archived') {
      // Restore to 'open'
      updateTask(task.id, { status: 'open' });
    } else {
      // Archive — deselect if it was selected
      if (selectedTask?.id === task.id) setSelectedTask(null);
      updateTask(task.id, { status: 'archived' });
    }
  };

  // Render a task card (used for both active and archived sections)
  const renderTaskCard = (task) => {
    const proj = projects.find(p => p.id === task.projectId);
    const cust = proj ? customers.find(c => c.id === proj.customerId) : null;
    return (
      <TaskCard
        key={task.id}
        task={task}
        project={proj}
        customer={cust}
        isSelected={selectedTask?.id === task.id}
        onSelect={setSelectedTask}
        onStatusChange={(id, val) => updateTask(id, { status: val })}
        onArchive={handleArchive}
      />
    );
  };

  return (
    <div className="flex gap-5 min-h-[calc(100vh-8rem)]">

      {/* ── LEFT PANEL ────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex-shrink-0 space-y-5 overflow-y-auto">

        {/* Triage Queue */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Triage Queue</h2>
              {untriagedEntries.length > 0 && (
                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {untriagedEntries.length}
                </span>
              )}
            </div>
          </div>

          {untriagedEntries.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-10 text-center">
              <ClipboardList size={24} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Queue is clear!</p>
              <p className="text-gray-600 text-xs mt-1">All meeting entries have been triaged.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.values(untriagedByCustomer).map(({ customer, entries: customerEntries }) => (
                <div key={customer?.id || '_none'}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {customer && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: customer.color || '#6366f1' }} />
                    )}
                    <span className="text-xs font-semibold text-gray-400">
                      {customer?.name || 'No Customer'}
                    </span>
                    <span className="text-xs text-gray-600">({customerEntries.length})</span>
                  </div>
                  <div className="space-y-2">
                    {customerEntries.map(({ entry, project, customer: c }) => (
                      <TriageEntryCard
                        key={entry.id}
                        entry={entry}
                        project={project}
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
            <Tag size={15} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Task Board</h2>
            {totalActiveTasks > 0 && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {openCount} open
              </span>
            )}
            {filtersActive && (
              <span className="bg-teal-500/15 text-teal-400 border border-teal-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                filtered
              </span>
            )}
            <button
              onClick={() => setShowQuickAdd(v => !v)}
              className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                showQuickAdd
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-indigo-300 hover:border-indigo-500/40'
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
                projects={projects}
                customers={customers}
                onSubmit={(formData) => {
                  addTask({
                    projectId: formData.projectId,
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

          {/* Filter bar — row 1: client + project */}
          <div className="flex gap-2 mb-2">
            <select
              value={filterCustomerId}
              onChange={e => handleCustomerFilter(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">All clients</option>
              {customersWithTasks.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
              disabled={projectsForFilter.length === 0}
            >
              <option value="">All projects</option>
              {projectsForFilter.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Filter bar — row 2: task type + status + clear */}
          <div className="flex gap-2 mb-3">
            <select
              value={filterTaskType}
              onChange={e => setFilterTaskType(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">All types</option>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">All statuses</option>
              {TASK_STATUSES.map(s => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
            {filtersActive && (
              <button
                onClick={() => {
                  setFilterCustomerId('');
                  setFilterProjectId('');
                  setFilterTaskType('');
                  setFilterStatus('');
                }}
                className="px-2.5 py-2 rounded-xl bg-gray-800 border border-gray-700 text-[10px] text-gray-400 hover:text-white hover:border-gray-600 transition-colors flex-shrink-0"
                title="Clear all filters"
              >
                ✕
              </button>
            )}
          </div>

          {/* Board content */}
          {totalActiveTasks === 0 && !showArchived ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-10 text-center">
              <Tag size={24} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">{filtersActive ? 'No tasks match this filter.' : 'No tasks yet.'}</p>
              <p className="text-gray-600 text-xs mt-1">
                {filtersActive ? 'Try a different filter.' : 'Convert a meeting entry above to create your first task.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {TASK_STATUSES.map(status => {
                const group = tasksByStatus[status] || [];
                if (group.length === 0) return null;
                const statusColors = TASK_STATUS_COLORS[status];
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColors.text}`}>
                        {TASK_STATUS_LABELS[status]}
                      </span>
                      <span className="text-xs text-gray-600">({group.length})</span>
                    </div>
                    <div className="space-y-2">
                      {group.map(renderTaskCard)}
                    </div>
                  </div>
                );
              })}

              {/* Archived section */}
              {archivedTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-2 text-[10px] font-semibold text-gray-600 hover:text-gray-400 transition-colors mb-2"
                  >
                    <Archive size={11} />
                    {showArchived ? 'Hide' : 'Show'} Archived ({archivedTasks.length})
                    <ChevronDown size={11} className={`transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                  </button>
                  {showArchived && (
                    <div className="space-y-2">
                      {archivedTasks
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map(renderTaskCard)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {selectedTask ? (
          <div className="sticky top-0">
            <AIWorkspace
              key={selectedTask.id}
              task={selectedTask}
              project={selectedProject}
              customer={selectedCustomer}
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Sparkles size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Select a task to open AI Workspace</p>
              <p className="text-gray-600 text-xs mt-1">Click any task card on the left to get started.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
