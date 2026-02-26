import { useState, useMemo } from 'react';
import { Target, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { Button } from './ui/button';

// Mirror the quarter generator from OKRs.jsx
function generateQuarters() {
  const quarters = [];
  const now = new Date();
  const startYear = now.getFullYear();
  const startQ = Math.ceil((now.getMonth() + 1) / 3);
  for (let offset = -3; offset <= 4; offset++) {
    let q = startQ + offset;
    let y = startYear;
    while (q < 1) { q += 4; y--; }
    while (q > 4) { q -= 4; y++; }
    quarters.push(`Q${q} ${y}`);
  }
  return quarters;
}
const QUARTERS = generateQuarters();
const CURRENT_QUARTER = QUARTERS[3];

function parseOkrText(text) {
  const lines = text.split('\n');
  const objectives = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const objMatch = line.match(/^Objective:\s*(.+)/i);
    const krMatch = line.match(/^KR\d*:\s*(.+)/i);

    if (objMatch) {
      current = { title: objMatch[1].trim(), keyResults: [] };
      objectives.push(current);
    } else if (krMatch && current) {
      current.keyResults.push(krMatch[1].trim());
    }
    // Lines not matching either pattern are silently ignored
  }

  return objectives;
}

export default function BulkAddOKRsModal({ onClose }) {
  const { okrs, addOkr } = useAppStore();
  const [text, setText] = useState('');
  const [quarter, setQuarter] = useState(CURRENT_QUARTER);
  const [result, setResult] = useState(null);

  const existingTitles = useMemo(
    () => new Set(okrs.map(o => o.title.trim().toLowerCase())),
    [okrs]
  );

  const parsed = useMemo(() => {
    const raw = parseOkrText(text);
    const seen = new Set();

    return raw.map(obj => {
      const isDuplicate = existingTitles.has(obj.title.toLowerCase());
      const isSeenInBatch = seen.has(obj.title.toLowerCase());
      const skip = isDuplicate || isSeenInBatch;
      if (!skip) seen.add(obj.title.toLowerCase());
      return {
        ...obj,
        skip,
        reason: isDuplicate ? 'already exists' : isSeenInBatch ? 'duplicate in batch' : null,
      };
    });
  }, [text, existingTitles]);

  const toAdd = parsed.filter(p => !p.skip);
  const skipped = parsed.filter(p => p.skip);

  const handleConfirm = () => {
    toAdd.forEach(obj => {
      // Convert parsed KR strings into the structured keyResults format
      const keyResults = obj.keyResults.map((krText, i) => ({
        id: `kr-bulk-${Date.now().toString(36)}-${i}`,
        text: krText,
        type: 'boolean', // default; user can change type after via Edit
        value: null,
      }));
      addOkr({ title: obj.title, description: '', quarter, keyResults });
    });
    setResult({ added: toAdd.length, skipped: skipped.length });
  };

  if (result) {
    return (
      <Modal title="Bulk Add OKRs" onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-sage/10 flex items-center justify-center mx-auto">
            <Target size={22} className="text-brand-sage" />
          </div>
          <p className="text-foreground font-semibold">{result.added} objective{result.added !== 1 ? 's' : ''} added!</p>
          {result.skipped > 0 && (
            <p className="text-xs text-brand-amber">{result.skipped} skipped — already exist or duplicates in batch</p>
          )}
          <Button onClick={onClose} size="sm" className="mt-4 w-full">Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Bulk Add OKRs" onClose={onClose} size="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Quarter (applied to all objectives)</label>
          <select
            value={quarter}
            onChange={e => setQuarter(e.target.value)}
            className="w-full h-10 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
          >
            {QUARTERS.map(q => (
              <option key={q} value={q}>{q}{q === CURRENT_QUARTER ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Paste OKRs in structured format
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Objective: Improve client onboarding speed by 30%
KR1: Reduce time-to-first-value from 14 days to 10 days
KR2: Automate 3 manual onboarding steps
KR3: Achieve 90% onboarding satisfaction score

Objective: Expand product adoption across enterprise accounts
KR1: Increase feature adoption rate to 70%
KR2: Deliver 5 new enterprise case studies`}
            rows={10}
            autoFocus
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40 resize-none font-mono"
          />
          <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
            <p>• Start each objective with <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">Objective: [title]</code></p>
            <p>• Add key results with <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">KR1: [description]</code>, <code className="text-brand-lavender bg-brand-lavender/10 px-1 rounded">KR2:</code>, etc.</p>
            <p>• Blank lines between objectives are fine. Lines not matching the format are ignored.</p>
            <p>• KRs default to Yes/No type — change to numeric (0–100) by editing the OKR after adding.</p>
          </div>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 bg-secondary/60 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">Parsed Preview</span>
              <span className="text-xs text-muted-foreground">
                {toAdd.length} to add{skipped.length > 0 ? `, ${skipped.length} skipped` : ''}
              </span>
            </div>
            {parsed.map((obj, i) => (
              <div
                key={i}
                className={`px-3 py-3 border-b border-secondary/60 last:border-0 ${obj.skip ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <Target size={13} className={`mt-0.5 flex-shrink-0 ${obj.skip ? 'text-muted-foreground/40' : 'text-brand-lavender'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${obj.skip ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {obj.title}
                    </p>
                    {obj.keyResults.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 pl-1">
                        {obj.keyResults.map((kr, ki) => (
                          <p key={ki} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <ChevronRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
                            KR{ki + 1}: {kr}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {obj.skip && <span className="text-[10px] text-brand-amber flex-shrink-0 mt-0.5">{obj.reason}</span>}
                </div>
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
            disabled={toAdd.length === 0}
            className="flex-1"
          >
            Add {toAdd.length > 0 ? `${toAdd.length} ` : ''}Objective{toAdd.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
