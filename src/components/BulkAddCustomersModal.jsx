import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { CUSTOMER_COLORS } from '../constants';

export default function BulkAddCustomersModal({ onClose }) {
  const { customers, addCustomer } = useAppStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null); // null = preview mode, object = done

  // Cycle through the palette, skipping colors already used by existing customers
  const usedColors = useMemo(() => new Set(customers.map(c => c.color)), [customers]);

  function assignColor(index) {
    // Find colors not yet used by existing customers
    const available = CUSTOMER_COLORS.filter(c => !usedColors.has(c.value));
    if (available.length > 0) {
      return available[index % available.length].value;
    }
    // All colors used — just cycle the full palette
    return CUSTOMER_COLORS[index % CUSTOMER_COLORS.length].value;
  }

  const existingNames = useMemo(
    () => new Set(customers.map(c => c.name.trim().toLowerCase())),
    [customers]
  );

  const parsed = useMemo(() => {
    const lines = text.split('\n');
    const seen = new Set();
    const items = [];
    let colorIdx = 0;

    lines.forEach(line => {
      const name = line.trim();
      if (!name) return; // skip blank lines

      const isDuplicate = existingNames.has(name.toLowerCase());
      const isSeenInBatch = seen.has(name.toLowerCase());

      items.push({
        name,
        color: assignColor(colorIdx),
        skip: isDuplicate || isSeenInBatch,
        reason: isDuplicate ? 'already exists' : isSeenInBatch ? 'duplicate in batch' : null,
      });

      if (!isDuplicate && !isSeenInBatch) {
        seen.add(name.toLowerCase());
        colorIdx++;
      }
    });

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, existingNames]);

  const toAdd = parsed.filter(p => !p.skip);
  const skipped = parsed.filter(p => p.skip);

  const handleConfirm = () => {
    toAdd.forEach(item => addCustomer({ name: item.name, color: item.color }));
    setResult({ added: toAdd.length, skipped: skipped.length });
  };

  if (result) {
    return (
      <Modal title="Bulk Add Customers" onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <Users size={22} className="text-emerald-400" />
          </div>
          <p className="text-white font-semibold">{result.added} customer{result.added !== 1 ? 's' : ''} added!</p>
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
    <Modal title="Bulk Add Customers" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Customer names — one per line
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={"TaskUs\nAccenture\nInspiro\nTelus International"}
            rows={6}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">Colors are auto-assigned from the palette. Blank lines are ignored.</p>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="border border-gray-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 bg-gray-800/60 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">Preview</span>
              <span className="text-xs text-gray-500">
                {toAdd.length} to add{skipped.length > 0 ? `, ${skipped.length} skipped` : ''}
              </span>
            </div>
            {parsed.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2 border-b border-gray-800/60 last:border-0 ${item.skip ? 'opacity-40' : ''}`}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.skip ? '#6b7280' : item.color }} />
                <span className={`text-sm flex-1 ${item.skip ? 'line-through text-gray-500' : 'text-white'}`}>{item.name}</span>
                {item.skip && (
                  <span className="text-[10px] text-amber-500 flex-shrink-0">{item.reason}</span>
                )}
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
            Add {toAdd.length > 0 ? `${toAdd.length} ` : ''}Customer{toAdd.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
