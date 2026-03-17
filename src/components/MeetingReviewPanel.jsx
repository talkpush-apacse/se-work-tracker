import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, CheckSquare, Square, ArrowRight, Check, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../context/StoreContext';

function formatMeetingDate(dateStr) {
  try {
    const d = parseISO(dateStr);
    return format(d, 'MMM d, yyyy');
  } catch {
    return dateStr || '';
  }
}

// ── Single Meeting Card ─────────────────────────────────────────────────────
function MeetingCard({ meeting, customer, onTriageItem, onConvertToTask, onMarkAllDone, onEdit }) {
  const [expanded, setExpanded] = useState(true);
  const actionItems = meeting.actionItems || [];
  const decisions = meeting.decisions || [];
  const isDone = meeting.triageStatus === 'done';
  const pendingCount = actionItems.filter(a => !a.triaged).length;

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      isDone
        ? 'bg-card/50 border-border/40'
        : 'bg-secondary/50 border-border/60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-start gap-2 text-left flex-1 min-w-0"
        >
          {expanded ? <ChevronDown size={14} className="mt-0.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-muted-foreground flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground truncate">
                {meeting.title || 'Untitled Meeting'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · {formatMeetingDate(meeting.meetingDate)}
              </span>
              {meeting.duration && (
                <span className="text-[10px] text-muted-foreground">
                  · {meeting.duration} min
                </span>
              )}
            </div>
            {meeting.attendees && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Attendees: {meeting.attendees}
              </p>
            )}
          </div>
        </button>
        {isDone && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold flex-shrink-0">
            <Check size={10} /> Done
          </span>
        )}
        {!isDone && pendingCount > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 flex-shrink-0">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pl-6 space-y-2.5">
          {/* AI Summary */}
          {meeting.aiSummary && (
            <p className="text-xs text-foreground/80 leading-relaxed">
              {meeting.aiSummary}
            </p>
          )}

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Action Items
              </p>
              <div className="space-y-1">
                {actionItems.map(item => (
                  <div key={item.id || item.text} className="flex items-center gap-2 group">
                    <button
                      onClick={() => !item.triaged && onTriageItem(meeting.id, item.id)}
                      className={`flex-shrink-0 ${item.triaged ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
                      disabled={item.triaged}
                    >
                      {item.triaged ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                    <span className={`text-xs flex-1 ${item.triaged ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}>
                      {typeof item === 'string' ? item : item.text}
                    </span>
                    {!item.triaged && (
                      <button
                        onClick={() => onConvertToTask(meeting.id, item.id)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-medium text-brand-lavender hover:text-brand-lavender/80 transition-all px-1.5 py-0.5 rounded border border-indigo-500/30 bg-brand-lavender/10"
                      >
                        <ArrowRight size={9} /> Task
                      </button>
                    )}
                    {item.triaged && item.taskId && (
                      <span className="text-[10px] text-emerald-400/70 font-medium">✓ Task</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decisions */}
          {decisions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Decisions
              </p>
              <ul className="space-y-0.5">
                {decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                    <span className="flex-shrink-0 mt-0.5 text-emerald-400">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-1.5">
            {!isDone && actionItems.length > 0 && (
              <button
                onClick={() => onMarkAllDone(meeting.id)}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg border border-border hover:border-border/80 transition-colors"
              >
                Mark all done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Meeting Review Panel ───────────────────────────────────────────────
export default function MeetingReviewPanel() {
  const {
    customers, meetingEntries, tasks,
    updateMeetingEntry, addTask,
  } = useAppStore();

  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);

  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Triage functions
  const triageActionItem = useCallback((meetingId, actionItemId) => {
    const meeting = meetingEntries.find(m => m.id === meetingId);
    if (!meeting) return;
    const updatedItems = (meeting.actionItems || []).map(a =>
      a.id === actionItemId ? { ...a, triaged: true } : a
    );
    const allDone = updatedItems.every(a => a.triaged);
    updateMeetingEntry(meetingId, {
      actionItems: updatedItems,
      triageStatus: allDone ? 'done' : 'pending',
    });
  }, [meetingEntries, updateMeetingEntry]);

  const convertActionItemToTask = useCallback((meetingId, actionItemId) => {
    const meeting = meetingEntries.find(m => m.id === meetingId);
    if (!meeting) return;
    const item = (meeting.actionItems || []).find(a => a.id === actionItemId);
    if (!item) return;

    const newTask = addTask({
      description: item.text,
      workType: 'deep_work',
      status: 'open',
      customerId: meeting.customerId || null,
    });

    const updatedItems = (meeting.actionItems || []).map(a =>
      a.id === actionItemId ? { ...a, triaged: true, taskId: newTask.id } : a
    );
    const allDone = updatedItems.every(a => a.triaged);
    updateMeetingEntry(meetingId, {
      actionItems: updatedItems,
      triageStatus: allDone ? 'done' : 'pending',
    });
  }, [meetingEntries, updateMeetingEntry, addTask]);

  const markMeetingDone = useCallback((meetingId) => {
    const meeting = meetingEntries.find(m => m.id === meetingId);
    if (!meeting) return;
    const updatedItems = (meeting.actionItems || []).map(a => ({ ...a, triaged: true }));
    updateMeetingEntry(meetingId, {
      actionItems: updatedItems,
      triageStatus: 'done',
    });
  }, [meetingEntries, updateMeetingEntry]);

  // Filter & group meetings
  const filteredMeetings = useMemo(() => {
    return meetingEntries.filter(m => {
      if (filterCustomerId && m.customerId !== filterCustomerId) return false;
      if (pendingOnly) {
        const status = m.triageStatus || 'skipped';
        if (status !== 'pending') return false;
      }
      return true;
    }).sort((a, b) => new Date(b.meetingDate || b.createdAt) - new Date(a.meetingDate || a.createdAt));
  }, [meetingEntries, filterCustomerId, pendingOnly]);

  // Group by projectId (null = "No Project")
  const groupedMeetings = useMemo(() => {
    const groups = new Map();
    for (const m of filteredMeetings) {
      const key = m.projectId || '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return groups;
  }, [filteredMeetings]);

  // Group by customer instead since projects aren't active
  const groupedByCustomer = useMemo(() => {
    const groups = new Map();
    for (const m of filteredMeetings) {
      const key = m.customerId || '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return groups;
  }, [filteredMeetings]);

  const sortedCustomerIds = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const customersWithMeetings = sortedCustomerIds.filter(c =>
    meetingEntries.some(m => m.customerId === c.id)
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterCustomerId}
          onChange={e => setFilterCustomerId(e.target.value)}
          className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
        >
          <option value="">All Customers</option>
          {customersWithMeetings.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={e => setPendingOnly(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-xs text-muted-foreground">Pending only</span>
        </label>
      </div>

      {/* Meeting list grouped by customer */}
      {filteredMeetings.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-5 py-10 text-center">
          <Check size={24} className="text-emerald-400/60 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">
            {pendingOnly ? 'No pending meetings to review.' : 'No meetings found.'}
          </p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            {pendingOnly
              ? 'All meeting action items have been triaged.'
              : 'Log a meeting to see it here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...groupedByCustomer.entries()].map(([custId, meetings]) => {
            const customer = custId !== '__none__' ? customerMap.get(custId) : null;
            return (
              <div key={custId}>
                {/* Customer group header */}
                <div className="flex items-center gap-2 mb-2">
                  {customer && (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: customer.color || '#6366f1' }}
                    />
                  )}
                  <h3 className="text-xs font-semibold text-foreground/80">
                    {customer?.name || 'No Customer'}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    ({meetings.length})
                  </span>
                </div>

                {/* Meeting cards */}
                <div className="space-y-2 pl-1">
                  {meetings.map(meeting => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      customer={customer}
                      onTriageItem={triageActionItem}
                      onConvertToTask={convertActionItemToTask}
                      onMarkAllDone={markMeetingDone}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
