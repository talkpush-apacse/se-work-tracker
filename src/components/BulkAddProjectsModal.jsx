import { useState, useMemo } from 'react';
import { FolderKanban } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';

export default function BulkAddProjectsModal({ onClose }) {
  const { projects, customers, okrs, addProject } = useAppStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOkrId, setSelectedOkrId] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);

  const existingNames = useMemo(
    () => new Set(projects.map(p => p.name.trim().toLowerCase())),
    [projects]
  );

  const parsed = useMemo(() => {
    const seen = new Set();
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(name => {
        const isDuplicate = existingNames.has(name.toLowerCase());
        const isSeenInBatch = seen.has(name.toLowerCase());
        const skip = isDuplicate || isSeenInBatch;
        if (!skip) seen.add(name.toLowerCase());
        return {
          name,
          skip,
          reason: isDuplicate ? 'already exists' : isSeenInBatch ? 'duplicate in batch' : null,
        };
      });
  }, [text, existingNames]);

  const toAdd = parsed.filter(p => !p.skip);
  const skipped = parsed.filter(p => p.skip);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedOkr = okrs.find(o => o.id === selectedOkrId);

  const validate = () => {
    const e = {};
    if (!selectedCustomerId) e.customer = 'Select a customer';
    if (!selectedOkrId) e.okr = 'Select an OKR';
    if (toAdd.length === 0) e.names = 'Enter at least one project name';
    return e;
  };

  const handleConfirm = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    toAdd.forEach(item =>
      addProject({ name: item.name, customerId: selectedCustomerId, okrId: selectedOkrId })
    );
    setResult({ added: toAdd.length, skipped: skipped.length });
  };

  if (result) {
    return (
      <Modal title="Bulk Add Projects" onClose={onClose} size="sm">
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <FolderKanban size={22} className="text-emerald-400" />
          </div>
          <p className="text-white font-semibold">{result.added} project{result.added !== 1 ? 's' : ''} added!</p>
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
    <Modal title="Bulk Add Projects" onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Shared Customer + OKR selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer (applies to all) *</label>
            <select
              value={selectedCustomerId}
              onChange={e => { setSelectedCustomerId(e.target.value); setErrors(prev => ({ ...prev, customer: undefined })); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.customer && <p className="mt-1 text-xs text-red-400">{errors.customer}</p>}
            {customers.length === 0 && <p className="mt-1 text-xs text-gray-500">No customers yet — add one first.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">OKR (applies to all) *</label>
            <select
              value={selectedOkrId}
              onChange={e => { setSelectedOkrId(e.target.value); setErrors(prev => ({ ...prev, okr: undefined })); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="">Select OKR...</option>
              {okrs.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            {errors.okr && <p className="mt-1 text-xs text-red-400">{errors.okr}</p>}
            {okrs.length === 0 && <p className="mt-1 text-xs text-gray-500">No OKRs yet — add one first.</p>}
          </div>
        </div>

        {/* Shared settings info */}
        {(selectedCustomer || selectedOkr) && (
          <div className="rounded-xl bg-indigo-950/40 border border-indigo-700/30 px-3 py-2.5 text-xs text-indigo-300">
            All projects will be: <span className="font-semibold">Active</span>
            {selectedCustomer && <> · <span className="font-semibold">{selectedCustomer.name}</span></>}
            {selectedOkr && <> · <span className="font-semibold truncate inline-block max-w-[180px] align-bottom">{selectedOkr.title}</span></>}
          </div>
        )}

        {/* Project names textarea */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Project names — one per line
          </label>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setErrors(prev => ({ ...prev, names: undefined })); }}
            placeholder={"TaskUs Onboarding Revamp\nAccenture Integration Phase 2\nInspiro QA Automation"}
            rows={5}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono"
          />
          {errors.names && <p className="mt-1 text-xs text-red-400">{errors.names}</p>}
          <p className="mt-1 text-xs text-gray-500">Blank lines are ignored. Existing project names are skipped.</p>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="border border-gray-700 rounded-xl overflow-hidden max-h-44 overflow-y-auto scrollbar-thin">
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
                <FolderKanban size={13} className={item.skip ? 'text-gray-600' : 'text-indigo-400'} />
                <span className={`text-sm flex-1 ${item.skip ? 'line-through text-gray-500' : 'text-white'}`}>{item.name}</span>
                {item.skip && <span className="text-[10px] text-amber-500 flex-shrink-0">{item.reason}</span>}
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
            Add {toAdd.length > 0 ? `${toAdd.length} ` : ''}Project{toAdd.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
