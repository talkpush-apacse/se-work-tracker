import { useState } from 'react';
import Modal from './Modal';
import { useAppStore } from '../context/StoreContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import RichTextEditor from './ui/RichTextEditor';

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
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Meeting Date *</label>
          <Input
            type="date"
            value={form.meetingDate}
            onChange={(e) => setForm(p => ({ ...p, meetingDate: e.target.value }))}
            className="[color-scheme:dark]"
          />
          {errors.meetingDate && <p className="mt-1 text-xs text-destructive">{errors.meetingDate}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes *</label>
          <RichTextEditor
            value={form.rawNotes}
            onChange={val => setForm(p => ({ ...p, rawNotes: val }))}
            placeholder="Paste your raw meeting notes here — action items, decisions, follow-ups, anything..."
            minHeight="200px"
          />
          {errors.rawNotes && <p className="mt-1 text-xs text-destructive">{errors.rawNotes}</p>}
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="flex-1"
          >
            Save Entry
          </Button>
        </div>
      </form>
    </Modal>
  );
}
