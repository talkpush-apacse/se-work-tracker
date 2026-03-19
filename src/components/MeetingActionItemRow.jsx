import { useState } from 'react';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/**
 * MeetingActionItemRow
 *
 * Props:
 *   item            — ActionItem object { id, text, owner, dueDate, convertedToTaskId }
 *   onConvert(item) — async fn; creates task in store, returns the new task's id
 *   onUpdate(id, patch) — updates the action item in place (sets convertedToTaskId)
 */
export default function MeetingActionItemRow({ item, onConvert, onUpdate }) {
  const [checked, setChecked]     = useState(false);
  const [converting, setConverting] = useState(false);
  const [flash, setFlash]         = useState(false);

  const isLinked = !!item.convertedToTaskId;

  const handleConvert = async () => {
    if (isLinked || converting) return;
    setConverting(true);
    try {
      const taskId = await onConvert(item);
      if (taskId) {
        onUpdate(item.id, { convertedToTaskId: taskId });
        // Brief green flash
        setFlash(true);
        setTimeout(() => setFlash(false), 1000);
      }
    } finally {
      setConverting(false);
    }
  };

  const formatDue = (dueDate) => {
    if (!dueDate) return null;
    try { return format(parseISO(dueDate), 'MMM d'); } catch { return dueDate; }
  };

  return (
    <div
      className={`flex items-start gap-2.5 py-2 px-1 rounded-lg transition-colors ${
        flash ? 'bg-emerald-50' : ''
      }`}
    >
      {/* Checkbox (local visual state only) */}
      <button
        onClick={() => setChecked(p => !p)}
        className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded border transition-all ${
          checked
            ? 'bg-brand-lavender border-brand-lavender flex items-center justify-center'
            : 'border-border hover:border-brand-lavender/50'
        }`}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </button>

      {/* Text */}
      <p className={`flex-1 text-xs leading-relaxed min-w-0 ${checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {item.text}
      </p>

      {/* Meta: owner + due date */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.owner && (
          <span className="text-[10px] text-muted-foreground">{item.owner}</span>
        )}
        {item.dueDate && (
          <span className="text-[10px] text-muted-foreground/70">
            Due: {formatDue(item.dueDate)}
          </span>
        )}

        {/* Convert / linked button */}
        {isLinked ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-md bg-secondary border border-border">
            <Check size={9} className="text-emerald-700" />
            Linked
          </span>
        ) : (
          <button
            onClick={handleConvert}
            disabled={converting}
            className="flex items-center gap-1 text-[10px] text-brand-lavender hover:text-brand-lavender/80 px-2 py-0.5 rounded-md border border-brand-lavender/20 hover:bg-brand-lavender/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {converting
              ? <Loader2 size={9} className="animate-spin" />
              : <ArrowRight size={9} />
            }
            {converting ? 'Creating…' : 'Convert to Task'}
          </button>
        )}
      </div>
    </div>
  );
}
