import { useState, useMemo } from 'react';
import { Target, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';

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
      // Build description from key results if any
      const description = obj.keyResults.length
        ? obj.keyResults.map((kr, i) => `KR${i + 1}: ${kr}`).join('\n')
        : '';
      addOkr({ title: obj.title, description });
    });
    setResult({ added: toAdd.length, skipped: skipped.length });
  };

  if (result) {
    return (
      <Modal title="Bulk Add OKRs" onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <Target size={22} className="text-emerald-400" />
          </div>
          <p className="text-white font-semibold">{result.added} objective{result.added !== 1 ? 's' : ''} added!</p>
          {result.skipped > 0 && (
            <p className="text-xs text-amber-400">{result.skipped} skipped — already exist or duplicates in batch</p>
          )}
          <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Bulk Add OKRs" onClose={onClose} size="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
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
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono"
          />
          <div className="mt-1.5 text-xs text-gray-500 space-y-0.5">
            <p>• Start each objective with <code className="text-indigo-400 bg-indigo-950/40 px-1 rounded">Objective: [title]</code></p>
            <p>• Add key results with <code className="text-indigo-400 bg-indigo-950/40 px-1 rounded">KR1: [description]</code>, <code className="text-indigo-400 bg-indigo-950/40 px-1 rounded">KR2:</code>, etc.</p>
            <p>• Blank lines between objectives are fine. Lines not matching the format are ignored.</p>
          </div>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="border border-gray-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 bg-gray-800/60 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">Parsed Preview</span>
              <span className="text-xs text-gray-500">
                {toAdd.length} to add{skipped.length > 0 ? `, ${skipped.length} skipped` : ''}
              </span>
            </div>
            {parsed.map((obj, i) => (
              <div
                key={i}
                className={`px-3 py-3 border-b border-gray-800/60 last:border-0 ${obj.skip ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <Target size={13} className={`mt-0.5 flex-shrink-0 ${obj.skip ? 'text-gray-600' : 'text-indigo-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${obj.skip ? 'line-through text-gray-500' : 'text-white'}`}>
                      {obj.title}
                    </p>
                    {obj.keyResults.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 pl-1">
                        {obj.keyResults.map((kr, ki) => (
                          <p key={ki} className="text-xs text-gray-400 flex items-center gap-1.5">
                            <ChevronRight size={10} className="text-gray-600 flex-shrink-0" />
                            KR{ki + 1}: {kr}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {obj.skip && <span className="text-[10px] text-amber-500 flex-shrink-0 mt-0.5">{obj.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={toAdd.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-white transition-colors"
          >
            Add {toAdd.length > 0 ? `${toAdd.length} ` : ''}Objective{toAdd.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
