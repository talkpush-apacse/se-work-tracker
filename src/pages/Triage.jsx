import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Plus, Mic, MicOff, Copy, Save, Check,
  Loader2, ClipboardList, Sparkles, ChevronRight,
  Calendar, User, Tag, AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import {
  TASK_TYPES, TASK_TYPE_LABELS, TASK_TYPE_COLORS,
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  AI_OUTPUT_TYPES, AI_OUTPUT_TYPE_LABELS,
  TASK_RECIPIENTS,
} from '../constants';

// ─── System prompts per output type ───────────────────────────────────────────
const SYSTEM_PROMPTS = {
  email: (task, client) =>
    `You are a professional Solutions Engineer at a SaaS company called Talkpush.
Write a clear, concise professional email related to the following task for client "${client}".
Task: ${task}
Format: Start with "Subject: ..." on the first line, then a blank line, then the email body.
Keep the tone professional but warm. Be direct and action-oriented. No filler phrases.`,

  slack: (task, client) =>
    `You are a Solutions Engineer at Talkpush writing an internal Slack message about a task for client "${client}".
Task: ${task}
Write a brief, direct Slack message. No markdown headers. No excessive formatting.
Use bullet points only if listing multiple items. Keep it under 5 lines where possible.`,

  troubleshooting: (task, client) =>
    `You are a technical Solutions Engineer at Talkpush troubleshooting an issue for client "${client}".
Task/Issue: ${task}
Write a structured troubleshooting plan. Start with the most likely root cause, then numbered steps to diagnose and resolve.
Include what to check at each step and expected outcome.`,

  configuration: (task, client) =>
    `You are a Solutions Engineer at Talkpush writing a configuration guide for client "${client}".
Task: ${task}
Write a structured, numbered configuration plan. Include dependencies, prerequisites, and notes on potential gotchas.
Be specific and actionable.`,

  summary: (task, client) =>
    `You are a Solutions Engineer at Talkpush summarizing work done for client "${client}".
Task: ${task}
Write a concise bullet-point summary covering: key decisions made, actions taken or needed, and any open questions.
Keep it scannable — this is for your own reference or a quick async update.`,
};

// ─── Inline triage form (shown below an untriaged entry) ──────────────────────
function TriageForm({ entry, project, customer, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    description: entry.rawNotes.split('\n')[0].slice(0, 120), // pre-fill from first line
    taskType: 'mine',
    assigneeOrTeam: '',  // stores the recipient value key
    status: 'open',
  });

  return (
    <div className="mt-3 border-t border-gray-700/60 pt-3 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Convert to Task</p>

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
          disabled={!form.description.trim()}
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
  const { addTask, markMeetingEntryTriaged } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (formData) => {
    addTask({
      projectId: project.id,
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
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ─── Task card (in the board) ─────────────────────────────────────────────────
function TaskCard({ task, project, customer, isSelected, onSelect, onStatusChange }) {
  const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;

  return (
    <div
      onClick={() => onSelect(task)}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-indigo-600/15 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
          : 'bg-gray-800/50 border-gray-700/60 hover:border-gray-600'
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
          <p className="text-xs font-medium text-white leading-snug line-clamp-2">{task.description}</p>
          {project && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{project.name}</p>}
        </div>
        <ChevronRight size={13} className={`flex-shrink-0 mt-0.5 transition-colors ${isSelected ? 'text-indigo-400' : 'text-gray-600'}`} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}>
          {TASK_TYPE_LABELS[task.taskType]}
        </span>
        {task.assigneeOrTeam && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
            <User size={9} /> {TASK_RECIPIENTS.find(r => r.value === task.assigneeOrTeam)?.label || task.assigneeOrTeam}
          </span>
        )}
      </div>

      {/* Inline status dropdown — stop propagation so clicking it doesn't select the card */}
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
    </div>
  );
}

// ─── AI Workspace (right panel) ───────────────────────────────────────────────
function AIWorkspace({ task, project, customer }) {
  const { addAiOutput, getTaskAiOutputs } = useAppStore();
  const [outputType, setOutputType] = useState('email');
  const [userInput, setUserInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentOutput, setCurrentOutput] = useState(null);
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const history = getTaskAiOutputs(task.id);

  // Reset workspace when task changes
  useEffect(() => {
    setCurrentOutput(null);
    setUserInput('');
    setError(null);
  }, [task.id]);

  // ── Web Speech API voice input ──────────────────────────────────────────
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = userInput;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + t;
        } else {
          interim = t;
        }
      }
      setUserInput(finalTranscript + (interim ? ' ' + interim : ''));
    };

    recognition.onend = () => {
      setIsListening(false);
      setUserInput(finalTranscript);
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      if (e.error !== 'aborted') setError(`Voice error: ${e.error}`);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ── OpenAI generate ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setError('Add some context or notes before generating.');
      return;
    }

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      setError('VITE_OPENAI_API_KEY is not set. Add it to your .env file and restart the dev server.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentOutput(null);

    const clientName = customer?.name || 'the client';
    const systemPrompt = SYSTEM_PROMPTS[outputType](task.description, clientName);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
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
      setCurrentOutput({ outputType, inputText: userInput.trim(), outputText: text });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!currentOutput) return;
    navigator.clipboard.writeText(currentOutput.outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!currentOutput) return;
    addAiOutput({ taskId: task.id, ...currentOutput });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const typeColors = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.mine;
  const statusColors = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open;

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
        {task.assigneeOrTeam && (
          <p className="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <User size={11} /> {TASK_RECIPIENTS.find(r => r.value === task.assigneeOrTeam)?.label || task.assigneeOrTeam}
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
      </div>

      {/* Voice + text input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-400">Context / Notes</p>
          <button
            onClick={toggleListening}
            title={isListening ? 'Stop recording' : 'Start voice input'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isListening
                ? 'bg-red-600/20 border-red-500/40 text-red-400 animate-pulse'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {isListening ? <MicOff size={13} /> : <Mic size={13} />}
            {isListening ? 'Stop' : 'Voice'}
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
          : <><Sparkles size={16} /> Generate {AI_OUTPUT_TYPE_LABELS[outputType]}</>
        }
      </button>

      {/* Current output */}
      {currentOutput && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {AI_OUTPUT_TYPE_LABELS[currentOutput.outputType]}
            </p>
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
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{currentOutput.outputText}</p>
        </div>
      )}

      {/* Output history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Previous Outputs ({history.length})</p>
          <div className="space-y-2">
            {history.map(h => (
              <details key={h.id} className="bg-gray-900 border border-gray-800 rounded-xl">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">{AI_OUTPUT_TYPE_LABELS[h.outputType]}</span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' '}
                      {new Date(h.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <ChevronDown size={13} className="text-gray-600 flex-shrink-0" />
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{h.outputText}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Triage page ──────────────────────────────────────────────────────────
export default function Triage() {
  const { meetingEntries, tasks, projects, customers, updateTask } = useAppStore();
  const [selectedTask, setSelectedTask] = useState(null);
  const [triageRefresh, setTriageRefresh] = useState(0); // bump to re-filter after triage

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

  // All tasks grouped by status
  const tasksByStatus = TASK_STATUSES.reduce((acc, s) => {
    acc[s] = tasks
      .filter(t => t.status === s)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return acc;
  }, {});

  const totalTasks = tasks.length;
  const openCount = (tasksByStatus['open'] || []).length + (tasksByStatus['in-progress'] || []).length;

  // Resolve selected task's project/customer
  const selectedProject = selectedTask ? projects.find(p => p.id === selectedTask.projectId) : null;
  const selectedCustomer = selectedProject ? customers.find(c => c.id === selectedProject.customerId) : null;

  // Keep selectedTask in sync if it gets updated (e.g. status change)
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  }, [tasks]);

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
          <div className="flex items-center gap-2 mb-3">
            <Tag size={15} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Task Board</h2>
            {totalTasks > 0 && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {openCount} open
              </span>
            )}
          </div>

          {totalTasks === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-10 text-center">
              <Tag size={24} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No tasks yet.</p>
              <p className="text-gray-600 text-xs mt-1">Convert a meeting entry above to create your first task.</p>
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
                      {group.map(task => {
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
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
