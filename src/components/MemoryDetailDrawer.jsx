import { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { WORK_TYPE_LABELS, TASK_STATUS_LABELS, MILESTONE_STATUS_LABELS, AI_OUTPUT_TYPE_LABELS } from '../constants';
import { getEntryColors } from '../utils/memoryIndex';

// ── Sheet-style drawer using Radix Dialog ─────────────────────────────────────

function SheetOverlay({ onClick }) {
  return (
    <DialogPrimitive.Overlay
      onClick={onClick}
      className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
  );
}

function SheetContent({ children, onClose }) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay onClick={onClose} />
      <DialogPrimitive.Content
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300"
        aria-describedby={undefined}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy text'}
    </button>
  );
}

function Section({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function formatFullDate(dateStr) {
  try {
    return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ── Extra fields by entity type ───────────────────────────────────────────────

function TaskExtras({ entry }) {
  const { sourceRef: t } = entry;
  return (
    <>
      {t.status && (
        <Section label="Status">
          <span className="text-xs text-foreground bg-secondary border border-border px-2 py-0.5 rounded-md">
            {TASK_STATUS_LABELS[t.status] || t.status}
          </span>
        </Section>
      )}
      {t.workType && (
        <Section label="Work Type">
          <span className="text-xs text-muted-foreground">
            {WORK_TYPE_LABELS[t.workType] || t.workType}
          </span>
        </Section>
      )}
      {t.points != null && (
        <Section label="Points">
          <span className="text-xs text-muted-foreground">{t.points}</span>
        </Section>
      )}
    </>
  );
}

function MeetingExtras({ entry }) {
  const { sourceRef: m } = entry;
  if (!m.rawNotes) return null;
  return (
    <Section label="Full Notes">
      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{m.rawNotes}</p>
    </Section>
  );
}

function AiOutputExtras({ entry }) {
  const { sourceRef: o } = entry;
  return (
    <>
      {o.outputType || o.type ? (
        <Section label="Type">
          <span className="text-xs text-muted-foreground">
            {AI_OUTPUT_TYPE_LABELS[o.outputType || o.type] || o.outputType || o.type}
          </span>
        </Section>
      ) : null}
      {o.outputText && (
        <Section label="Full Output">
          <pre className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans bg-secondary/50 border border-border rounded-lg p-3 overflow-y-auto max-h-80">
            {o.outputText}
          </pre>
        </Section>
      )}
    </>
  );
}

function MilestoneExtras({ entry }) {
  const { sourceRef: m } = entry;
  return (
    <>
      {m.status && (
        <Section label="Status">
          <span className="text-xs text-muted-foreground">
            {MILESTONE_STATUS_LABELS[m.status] || m.status}
          </span>
        </Section>
      )}
      {m.targetDate && (
        <Section label="Target Date">
          <span className="text-xs text-muted-foreground">
            {formatFullDate(m.targetDate + 'T00:00:00')}
          </span>
        </Section>
      )}
    </>
  );
}

function ActivityExtras({ entry }) {
  const { sourceRef: p } = entry;
  return (
    <>
      {p.activityType && (
        <Section label="Activity Type">
          <span className="text-xs text-muted-foreground">{p.activityType}</span>
        </Section>
      )}
      {p.hours != null && (
        <Section label="Hours">
          <span className="text-xs text-muted-foreground">{p.hours}h</span>
        </Section>
      )}
      {p.points != null && (
        <Section label="Points">
          <span className="text-xs text-muted-foreground">{p.points}</span>
        </Section>
      )}
    </>
  );
}

function WeeklyLogExtras({ entry }) {
  const { sourceRef: l } = entry;
  if (!l.date) return null;
  return (
    <Section label="Week">
      <span className="text-xs text-muted-foreground">
        Week of {formatFullDate(l.date + 'T00:00:00')}
      </span>
    </Section>
  );
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export default function MemoryDetailDrawer({ entry, onClose, onNavigateToTriage, extraActions }) {
  const isOpen = !!entry;

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!entry) return null;

  const colors = getEntryColors(entry);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent onClose={onClose}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <span className="text-xl">{entry.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {entry.label}
              </span>
              {entry.customerName && (
                <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.customerColor || '#6366f1' }}
                  />
                  {entry.customerName}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFullDate(entry.date)}
            </p>
          </div>
          <DialogPrimitive.Close asChild>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all flex-shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </DialogPrimitive.Close>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Primary text */}
          <Section label="Content">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {entry.text}
            </p>
          </Section>

          {/* Entity-specific extras */}
          {entry.entityType === 'task'        && <TaskExtras       entry={entry} />}
          {entry.entityType === 'meeting'     && <MeetingExtras    entry={entry} />}
          {entry.entityType === 'aiOutput'    && <AiOutputExtras   entry={entry} />}
          {entry.entityType === 'milestone'   && <MilestoneExtras  entry={entry} />}
          {entry.entityType === 'activityLog' && <ActivityExtras   entry={entry} />}
          {entry.entityType === 'weeklyLog'   && <WeeklyLogExtras  entry={entry} />}

          {/* Deep link for tasks */}
          {entry.entityType === 'task' && (
            <button
              onClick={() => { onNavigateToTriage?.(entry.id); onClose(); }}
              className="flex items-center gap-1.5 text-xs text-brand-lavender hover:underline"
            >
              <ExternalLink size={12} />
              Go to Triage
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center gap-2 flex-wrap">
          <CopyButton text={entry.text} />
          {extraActions}
        </div>
      </SheetContent>
    </DialogPrimitive.Root>
  );
}
