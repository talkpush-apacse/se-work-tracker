import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../constants';

const EMPTY_FORM = {
  ticketKey: '',
  title: '',
  url: '',
  status: 'Open',
  priority: 'Medium',
  customerId: '',
  clientName: '',
  reporter: '',
  assignee: '',
  createdAt: '',
  dueDate: '',
  notes: '',
};

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function isValidUrl(value) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export default function TicketEditModal({ open, ticket, tickets, customers, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...ticket,
    ticketKey: ticket?.ticketKey || '',
    createdAt: toDateInput(ticket?.createdAt),
    dueDate: toDateInput(ticket?.dueDate),
    customerId: ticket?.customerId || '',
    clientName: ticket?.clientName || '',
  }));

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  const clientMode = form.customerId ? form.customerId : (form.clientName ? '__custom__' : '__none__');
  const normalizedKey = form.ticketKey.trim().toUpperCase();
  const duplicateKey = normalizedKey
    ? tickets.some(t => t.id !== ticket?.id && String(t.ticketKey || '').trim().toUpperCase() === normalizedKey)
    : false;
  const urlInvalid = !isValidUrl(form.url);
  const requiredMissing = !normalizedKey || !form.title.trim();
  const canSave = !requiredMissing && !duplicateKey && !urlInvalid && !isSaving;

  const setField = (field, value) => {
    setSaveError('');
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleClientChange = (value) => {
    setSaveError('');
    if (value === '__none__') {
      setForm(prev => ({ ...prev, customerId: '', clientName: '' }));
      return;
    }
    if (value === '__custom__') {
      setForm(prev => ({ ...prev, customerId: '' }));
      return;
    }
    setForm(prev => ({ ...prev, customerId: value, clientName: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...form,
        ticketKey: normalizedKey,
        title: form.title.trim(),
        url: form.url.trim(),
        customerId: form.customerId || null,
        clientName: form.customerId ? '' : form.clientName.trim(),
      });
      onClose();
    } catch (error) {
      setSaveError(error?.message || 'Unable to save ticket');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ticket ? 'Edit Ticket' : 'Add Ticket'}</DialogTitle>
          <DialogDescription>
            Track Jira tickets raised or requested outside of a direct Jira integration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ticket Key *</label>
              <Input
                value={form.ticketKey}
                onChange={e => setField('ticketKey', e.target.value)}
                placeholder="INSP-1234"
                className="uppercase"
              />
              {duplicateKey && <p className="mt-1 text-xs text-destructive">That ticket key already exists.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title *</label>
              <Input
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                placeholder="Short Jira summary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">URL</label>
            <Input
              value={form.url}
              onChange={e => setField('url', e.target.value)}
              placeholder="https://your-domain.atlassian.net/browse/INSP-1234"
            />
            {urlInvalid && <p className="mt-1 text-xs text-destructive">Enter a valid http or https URL.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
              <Select value={form.status} onValueChange={value => setField('status', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
              <Select value={form.priority} onValueChange={value => setField('priority', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map(priority => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Client</label>
              <Select value={clientMode} onValueChange={handleClientChange}>
                <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No client</SelectItem>
                  {sortedCustomers.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {clientMode === '__custom__' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custom Client</label>
              <Input
                value={form.clientName}
                onChange={e => setField('clientName', e.target.value)}
                placeholder="Client name"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reporter</label>
              <Input value={form.reporter} onChange={e => setField('reporter', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Assignee</label>
              <Input value={form.assignee} onChange={e => setField('assignee', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Created in Jira</label>
              <Input type="date" value={form.createdAt} onChange={e => setField('createdAt', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={e => setField('dueDate', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
            <Textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Context, asks, links, or follow-up details"
              className="min-h-[120px]"
            />
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canSave}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
