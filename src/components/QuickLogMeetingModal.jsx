import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Video, CheckSquare, Square } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';

// Returns today as YYYY-MM-DD in local time
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Round current time to nearest 15 min, return HH:MM
function nowRounded15() {
  const d = new Date();
  const mins = Math.round(d.getMinutes() / 15) * 15;
  d.setMinutes(mins, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function QuickLogMeetingModal({ onClose }) {
  const {
    customers, meetingEntries, tasks,
    addMeetingEntry, updateMeetingEntry, addTask,
  } = useAppStore();

  // Form state
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayLocalISO());
  const [meetingTime, setMeetingTime] = useState(nowRounded15());
  const [duration, setDuration] = useState(30);
  const [attendees, setAttendees] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringSeries, setRecurringSeries] = useState('');
  const [rawNotes, setRawNotes] = useState('');

  // AI state
  const [aiSummary, setAiSummary] = useState('');
  const [aiActionItems, setAiActionItems] = useState([]);
  const [aiDecisions, setAiDecisions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [createTasks, setCreateTasks] = useState(true);

  // Validation
  const [titleError, setTitleError] = useState('');

  // Toast
  const [toast, setToast] = useState('');

  const notesRef = useRef(null);

  // Auto-focus notes textarea on mount
  useEffect(() => {
    setTimeout(() => notesRef.current?.focus(), 100);
  }, []);

  // Pre-fill recurringSeries with title
  useEffect(() => {
    if (isRecurring && !recurringSeries) {
      setRecurringSeries(title);
    }
  }, [isRecurring, title]);

  // Reset projectId when customerId changes
  useEffect(() => {
    setProjectId('');
  }, [customerId]);

  const sortedCustomers = [...customers].sort((a, b) => a.name.localeCompare(b.name));

  // AI Summarize
  const handleSummarize = async () => {
    if (!rawNotes.trim()) return;
    setIsGenerating(true);
    setAiError('');

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setAiError('Missing VITE_ANTHROPIC_API_KEY');
      setIsGenerating(false);
      return;
    }

    const prompt = `You are a meeting notes processor. Given raw meeting notes, extract structured information.

Return ONLY valid JSON — no markdown, no preamble:
{
  "summary": "2–3 sentence paragraph describing what the meeting covered and key outcomes",
  "actionItems": ["action item 1", "action item 2"],
  "decisions": ["decision 1", "decision 2"]
}

If there are no action items or decisions, return empty arrays.
Raw notes:
${rawNotes}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);
      setAiSummary(parsed.summary || '');
      setAiActionItems(parsed.actionItems || []);
      setAiDecisions(parsed.decisions || []);
    } catch (err) {
      setAiError(err.message || 'AI summarization failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save
  const handleSave = () => {
    if (!title.trim()) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');

    // Build action items as objects with triage state
    const builtActionItems = aiActionItems.map(text => ({
      id: crypto.randomUUID(),
      text,
      triaged: false,
      taskId: null,
    }));

    // Determine initial triageStatus
    const triageStatus = builtActionItems.length > 0 ? 'pending' : 'skipped';

    const meetingDateTime = meetingTime
      ? `${meetingDate}T${meetingTime}:00`
      : meetingDate;

    const newMeeting = {
      customerId: customerId || null,
      projectId: projectId || null,
      meetingDate: meetingDateTime,
      title: title.trim(),
      duration: parseInt(duration) || 30,
      attendees: attendees.trim() || null,
      isRecurring,
      recurringSeries: isRecurring ? (recurringSeries.trim() || title.trim()) : null,
      rawNotes: rawNotes.trim() || null,
      aiSummary: aiSummary || null,
      actionItems: builtActionItems,
      decisions: aiDecisions.length > 0 ? aiDecisions : [],
      triageStatus,
    };

    const entry = addMeetingEntry(newMeeting);

    let taskCount = 0;

    // If createTasks is checked, create tasks and backfill taskId on action items
    if (createTasks && builtActionItems.length > 0) {
      const newTasks = builtActionItems.map(item => {
        const task = addTask({
          description: item.text,
          workType: 'deep_work',
          status: 'open',
          customerId: customerId || null,
        });
        item.triaged = true;
        item.taskId = task.id;
        return task;
      });
      taskCount = newTasks.length;

      // Re-save meeting with updated action items (taskId backfilled)
      updateMeetingEntry(entry.id, {
        actionItems: builtActionItems,
        triageStatus: 'done',
      });
    }

    // Toast
    const msg = taskCount > 0
      ? `Meeting logged + ${taskCount} task${taskCount > 1 ? 's' : ''} created`
      : 'Meeting logged';
    setToast(msg);
    setTimeout(() => {
      setToast('');
      onClose();
    }, 1500);
  };

  const hasAiResults = aiSummary || aiActionItems.length > 0 || aiDecisions.length > 0;

  if (toast) {
    return (
      <Modal title="Log Meeting" onClose={onClose} size="lg">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
            <CheckSquare size={16} />
            {toast}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Log Meeting" onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Title */}
        <div>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); setTitleError(''); }}
            placeholder="Meeting title *"
            className={`w-full bg-secondary border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 ${
              titleError ? 'border-red-200' : 'border-border'
            }`}
          />
          {titleError && (
            <p className="text-red-700 text-[11px] mt-1">{titleError}</p>
          )}
        </div>

        {/* Customer + Project row */}
        <div className="flex gap-3">
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
          >
            <option value="">No customer</option>
            {sortedCustomers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground focus:outline-none focus:border-ring cursor-pointer"
          >
            <option value="">No project</option>
            <option value="" disabled>No projects yet</option>
          </select>
        </div>

        {/* Date + Time + Duration + Attendees row */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="date"
            value={meetingDate}
            onChange={e => setMeetingDate(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring"
          />
          <input
            type="time"
            value={meetingTime}
            onChange={e => setMeetingTime(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              min={5}
              max={480}
              step={5}
              className="w-20 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
          <input
            value={attendees}
            onChange={e => setAttendees(e.target.value)}
            placeholder="Attendees (e.g. Jan, Marco)"
            className="flex-1 min-w-[140px] bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
        </div>

        {/* Recurring toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Recurring meeting</span>
          </label>
          {isRecurring && (
            <input
              value={recurringSeries}
              onChange={e => setRecurringSeries(e.target.value)}
              placeholder="Series name (e.g. Weekly Sync)"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          )}
        </div>

        {/* Raw Notes */}
        <textarea
          ref={notesRef}
          value={rawNotes}
          onChange={e => setRawNotes(e.target.value)}
          placeholder="Paste notes, bullet points, anything..."
          rows={7}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-y"
        />

        {/* AI Summarize button */}
        <button
          onClick={handleSummarize}
          disabled={!rawNotes.trim() || isGenerating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-brand-lavender/20 text-brand-lavender border border-brand-lavender/20 hover:bg-brand-lavender/30"
        >
          {isGenerating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {isGenerating ? 'Summarizing...' : '✨ Summarize with AI'}
        </button>

        {aiError && (
          <p className="text-red-700 text-xs">{aiError}</p>
        )}

        {/* AI Results */}
        {hasAiResults && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-brand-lavender" />
              <span className="text-xs font-semibold text-brand-lavender">AI Summary</span>
            </div>

            {aiSummary && (
              <p className="text-xs text-foreground/90 leading-relaxed">{aiSummary}</p>
            )}

            {aiActionItems.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">
                  Action Items ({aiActionItems.length})
                </p>
                <ul className="space-y-1 pl-1">
                  {aiActionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <span className="flex-shrink-0 mt-0.5 text-brand-lavender">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiDecisions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">
                  Decisions ({aiDecisions.length})
                </p>
                <ul className="space-y-1 pl-1">
                  {aiDecisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <span className="flex-shrink-0 mt-0.5 text-emerald-700">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Create Tasks checkbox */}
            {aiActionItems.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setCreateTasks(!createTasks)}
                  className="text-brand-lavender"
                >
                  {createTasks ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
                <span className="text-xs text-foreground/80">
                  Create tasks from action items ({aiActionItems.length})
                </span>
              </label>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-lavender text-white hover:bg-brand-lavender/80 transition-colors"
          >
            Save Meeting
          </button>
        </div>
      </div>
    </Modal>
  );
}
