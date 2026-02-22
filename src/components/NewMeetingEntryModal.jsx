import { useState } from 'react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';

// Returns today's date as a YYYY-MM-DD string in local time
function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function NewMeetingEntryModal({ project, onClose }) {
  const { addMeetingEntry } = useAppStore();
  const [form, setForm] = useState({ meetingDate: todayLocalISO(), rawNotes: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.meetingDate) e.meetingDate = 'Required';
    if (!form.rawNotes.trim()) e.rawNotes = 'Required';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    addMeetingEntry({ projectId: project.id, meetingDate: form.meetingDate, rawNotes: form.rawNotes.trim() });
    onClose();
  };

  return (
    <Modal title="New Meeting Entry" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Meeting Date *</label>
          <input
            type="date"
            value={form.meetingDate}
            onChange={(e) => setForm(p => ({ ...p, meetingDate: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 [color-scheme:dark]"
          />
          {errors.meetingDate && <p className="mt-1 text-xs text-red-400">{errors.meetingDate}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Raw Notes *</label>
          <textarea
            rows={8}
            placeholder="Paste your raw meeting notes here — action items, decisions, follow-ups, anything..."
            value={form.rawNotes}
            onChange={(e) => setForm(p => ({ ...p, rawNotes: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-y"
          />
          {errors.rawNotes && <p className="mt-1 text-xs text-red-400">{errors.rawNotes}</p>}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors"
          >
            Save Entry
          </button>
        </div>
      </form>
    </Modal>
  );
}
