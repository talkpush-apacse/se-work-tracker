import { useState, useMemo } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { ACTIVITY_TYPES } from '../constants';
import { Button } from './ui/button';

// Parse a CSV/structured line into a point entry.
// Supported format (all fields positional, comma-separated):
//   points, hours, activityType, comment
// e.g.:   5, 1.5, Configuration, Set up SSO for TaskUs
// activityType is matched case-insensitively. If not matched, it's stored as-is for display but flagged invalid.
function parseLine(raw) {
  const line = raw.trim();
  if (!line) return null;

  const parts = line.split(',').map(s => s.trim());
  const [rawPoints, rawHours, rawType, ...rest] = parts;

  const points = Number(rawPoints);
  const hours = Number(rawHours);
  const activityType = (rawType || '').trim();
  const comment = rest.join(',').trim();

  const errors = [];
  if (!rawPoints || isNaN(points) || points <= 0) errors.push('points must be a positive number');
  if (rawHours === undefined || rawHours === '' || isNaN(hours) || hours < 0) errors.push('hours must be ≥ 0');
  if (activityType) {
    const matched = ACTIVITY_TYPES.find(t => t.toLowerCase() === activityType.toLowerCase());
    if (!matched) errors.push(`unknown activity type "${activityType}"`);
  }

  const matchedType = ACTIVITY_TYPES.find(t => t.toLowerCase() === activityType.toLowerCase()) || activityType;

  return {
    raw: line,
    points: isNaN(points) ? 0 : points,
    hours: isNaN(hours) ? 0 : hours,
    activityType: matchedType,
    comment,
    errors,
    valid: errors.length === 0,
  };
}

export default function BulkAddPointsModal({ project, onClose }) {
  const { addPoint } = useAppStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);

  const parsed = useMemo(() => {
    return text
      .split('\n')
      .map(parseLine)
      .filter(Boolean);
  }, [text]);

  const valid = parsed.filter(p => p.valid);
  const invalid = parsed.filter(p => !p.valid);

  const handleConfirm = () => {
    valid.forEach(item => {
      addPoint({
        projectId: project.id,
        points: item.points,
        hours: item.hours,
        activityType: item.activityType,
        comment: item.comment,
      });
    });
    setResult({ added: valid.length, skipped: invalid.length });
  };

  if (result) {
    return (
      <Modal title={`Bulk Add Points — ${project.name}`} onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-sage/10 flex items-center justify-center mx-auto">
            <Zap size={22} className="text-brand-sage" />
          </div>
          <p className="text-foreground font-semibold">{result.added} {result.added === 1 ? 'entry' : 'entries'} added!</p>
          {result.skipped > 0 && (
            <p className="text-xs text-brand-amber">{result.skipped} {result.skipped === 1 ? 'row' : 'rows'} skipped — invalid format</p>
          )}
          <Button onClick={onClose} size="sm" className="mt-4 w-full">Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Bulk Add Points — ${project.name}`} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            One entry per line — <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">points, hours, activityType (optional), comment</code>
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              `5, 1.5, Configuration, Set up SSO for onboarding\n` +
              `3, 0.5, Sending Email, Followed up on integration tickets\n` +
              `8, 2, Troubleshoot / Firefighting, Fixed Workday sync issue\n` +
              `4, 1, Joining Meeting, Weekly sync with TaskUs team\n` +
              `2, 0.5, Reporting, Sent weekly status report`
            }
            rows={7}
            autoFocus
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none font-mono"
          />
          <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
            <p>• <strong className="text-foreground/70">points</strong> — positive number (e.g. <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">5</code> or <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">2.5</code>)</p>
            <p>• <strong className="text-foreground/70">hours</strong> — decimal allowed (e.g. <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">1.5</code>)</p>
            <p>• <strong className="text-foreground/70">activityType</strong> — optional, one of: {ACTIVITY_TYPES.map((t, i) => (
              <span key={t}><code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">{t}</code>{i < ACTIVITY_TYPES.length - 1 ? ', ' : ''}</span>
            ))}</p>
            <p>• <strong className="text-foreground/70">comment</strong> — optional, can contain commas</p>
          </div>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 bg-secondary/60 border-b border-border flex items-center justify-between sticky top-0">
              <span className="text-xs font-medium text-foreground/80">Parsed Preview</span>
              <span className="text-xs text-muted-foreground">
                {valid.length} valid{invalid.length > 0 ? `, ${invalid.length} error${invalid.length !== 1 ? 's' : ''}` : ''}
              </span>
            </div>
            {parsed.map((item, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 border-b border-secondary/60 last:border-0 ${item.valid ? '' : 'bg-destructive/10'}`}
              >
                {item.valid ? (
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-bold text-brand-lavender flex-shrink-0 w-8">+{item.points}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{item.activityType || 'General'}</span>
                        <span className="text-xs text-muted-foreground">{item.hours}h</span>
                      </div>
                      {item.comment && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.comment}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertCircle size={13} className="text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-mono truncate">{item.raw}</p>
                      <p className="text-xs text-destructive mt-0.5">{item.errors.join('; ')}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={valid.length === 0}
            className="flex-1"
          >
            Add {valid.length > 0 ? `${valid.length} ` : ''}{valid.length === 1 ? 'Entry' : 'Entries'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
