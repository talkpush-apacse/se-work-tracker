import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Pencil, Plus, Search, Ticket as TicketIcon, Trash2 } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import TicketEditModal from '../components/TicketEditModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_COLORS,
  TICKET_STATUSES,
  TICKET_STATUS_COLORS,
} from '../constants';

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Updated' },
  { value: 'created_desc', label: 'Created' },
  { value: 'priority_desc', label: 'Priority' },
  { value: 'status_asc', label: 'Status' },
];

function colorClasses(config) {
  return `${config?.bg || 'bg-gray-100'} ${config?.text || 'text-gray-600'} ${config?.border || 'border-gray-200'}`;
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function relativeDate(value) {
  const time = getTime(value);
  if (!time) return 'Never';
  return `${formatDistanceToNow(new Date(time), { addSuffix: false })} ago`;
}

function MultiFilter({ label, values, selected, onToggle }) {
  const activeCount = selected.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="font-medium">
          {label}{activeCount ? ` (${activeCount})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {values.map(value => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={selected.includes(value)}
            onCheckedChange={() => onToggle(value)}
          >
            {value}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Tickets() {
  const { tickets, customers, addTicket, updateTicket, deleteTicket } = useAppStore();
  const [statusFilter, setStatusFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [clientFilter, setClientFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('updated_desc');
  const [editingTicket, setEditingTicket] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const customerMap = useMemo(
    () => new Map(customers.map(customer => [customer.id, customer])),
    [customers],
  );

  const clientOptions = useMemo(() => {
    const options = customers.map(customer => ({ value: `customer:${customer.id}`, label: customer.name }));
    const customNames = new Set();
    tickets.forEach(ticket => {
      if (!ticket.customerId && ticket.clientName?.trim()) customNames.add(ticket.clientName.trim());
    });
    [...customNames].sort((a, b) => a.localeCompare(b)).forEach(name => {
      options.push({ value: `name:${name.toLowerCase()}`, label: name });
    });
    return options;
  }, [customers, tickets]);

  const openCount = tickets.filter(ticket => !['Done', 'Closed'].includes(ticket.status)).length;
  const blockedCount = tickets.filter(ticket => ticket.status === 'Blocked').length;

  const filteredTickets = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    const priorityRank = new Map(TICKET_PRIORITIES.map((priority, index) => [priority, TICKET_PRIORITIES.length - index]));
    const statusRank = new Map(TICKET_STATUSES.map((status, index) => [status, index]));

    const filtered = tickets.filter(ticket => {
      if (statusFilter.length && !statusFilter.includes(ticket.status)) return false;
      if (priorityFilter.length && !priorityFilter.includes(ticket.priority)) return false;
      if (clientFilter.startsWith('customer:')) {
        if (ticket.customerId !== clientFilter.slice(9)) return false;
      } else if (clientFilter.startsWith('name:')) {
        const clientName = customerMap.get(ticket.customerId)?.name || ticket.clientName || '';
        if (clientName.toLowerCase() !== clientFilter.slice(5)) return false;
      }
      if (!lowerSearch) return true;
      return (
        String(ticket.ticketKey || '').toLowerCase().includes(lowerSearch) ||
        String(ticket.title || '').toLowerCase().includes(lowerSearch)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'created_desc') return getTime(b.createdAt || b.rowCreatedAt) - getTime(a.createdAt || a.rowCreatedAt);
      if (sortBy === 'priority_desc') return (priorityRank.get(b.priority) || 0) - (priorityRank.get(a.priority) || 0);
      if (sortBy === 'status_asc') return (statusRank.get(a.status) ?? 99) - (statusRank.get(b.status) ?? 99);
      return getTime(b.updatedAt) - getTime(a.updatedAt);
    });
  }, [clientFilter, customerMap, priorityFilter, search, sortBy, statusFilter, tickets]);

  const toggleStatus = (status) => {
    setStatusFilter(prev => prev.includes(status) ? prev.filter(item => item !== status) : [...prev, status]);
  };

  const togglePriority = (priority) => {
    setPriorityFilter(prev => prev.includes(priority) ? prev.filter(item => item !== priority) : [...prev, priority]);
  };

  const clearFilters = () => {
    setStatusFilter([]);
    setPriorityFilter([]);
    setClientFilter('all');
    setSearch('');
  };

  const filtersActive = statusFilter.length > 0 || priorityFilter.length > 0 || clientFilter !== 'all' || search.trim();

  const handleSave = (data) => {
    if (editingTicket) return updateTicket(editingTicket.id, data);
    return addTicket(data);
  };

  // Future enhancement: include relevant tickets in Weekly Report drafting once that flow is ready.

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-bold text-foreground">Tickets</h1>
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
              {openCount} open · {blockedCount} blocked
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Jira tickets raised or requested through Claude and the tracker</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticket key or title..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiFilter label="Status" values={TICKET_STATUSES} selected={statusFilter} onToggle={toggleStatus} />
            <MultiFilter label="Priority" values={TICKET_PRIORITIES} selected={priorityFilter} onToggle={togglePriority} />
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs font-medium">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-[140px] text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            className="self-start text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {tickets.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl px-6 py-14 text-center">
          <TicketIcon size={30} className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No tickets yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Ask Claude to add one for you, or click + Add Ticket below.</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No tickets match this view.</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting the filters or search terms.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket Key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map(ticket => {
                const clientName = customerMap.get(ticket.customerId)?.name || ticket.clientName || 'No client';
                return (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer"
                    onClick={() => setEditingTicket(ticket)}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                      {ticket.url ? (
                        <a
                          href={ticket.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={event => event.stopPropagation()}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {ticket.ticketKey}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        ticket.ticketKey
                      )}
                    </TableCell>
                    <TableCell className="min-w-[220px] max-w-[360px]">
                      <p className="font-medium text-foreground line-clamp-2">{ticket.title}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{clientName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={colorClasses(TICKET_STATUS_COLORS[ticket.status])}>
                        {ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={colorClasses(TICKET_PRIORITY_COLORS[ticket.priority])}>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                      {relativeDate(ticket.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(event) => { event.stopPropagation(); setEditingTicket(ticket); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label={`Edit ${ticket.ticketKey}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(event) => { event.stopPropagation(); setDeleteTarget(ticket); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                          aria-label={`Delete ${ticket.ticketKey}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <button
        onClick={() => setIsCreating(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
      >
        <Plus size={18} /> Add Ticket
      </button>

      {(isCreating || editingTicket) && (
        <TicketEditModal
          key={editingTicket?.id || 'new-ticket'}
          open
          ticket={editingTicket}
          tickets={tickets}
          customers={customers}
          onClose={() => { setIsCreating(false); setEditingTicket(null); }}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ticket ${deleteTarget.ticketKey}?`}
          message="This cannot be undone."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteTicket(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
