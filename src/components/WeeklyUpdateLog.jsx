import { useState, useMemo, useEffect } from 'react';
import { Bookmark, Pencil, Trash2, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../context/StoreContext';
import {
  WEEKLY_UPDATE_LOG_TYPES, WEEKLY_UPDATE_LOG_LABELS, WEEKLY_UPDATE_LOG_COLORS,
} from '../constants';
import CalendarEmailImport from './CalendarEmailImport';
import ConfirmDialog from './ConfirmDialog';

export default function WeeklyUpdateLog({ weekStart, weekEnd } = {}) {
  const {
    customers, weeklyUpdateLogs,
    addWeeklyUpdateLog, updateWeeklyUpdateLog, deleteWeeklyUpdateLog,
    migrateAnnotationsToLogs, aiSettings,
  } = useAppStore();

  // O(1) lookup map
  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Form state
  const [logForm, setLogForm]             = useState({ type: 'highlight', text: '', customerId: '' });
  const [logDate, setLogDate]             = useState(new Date().toISOString().slice(0, 10));
  const [logEditId, setLogEditId]         = useState(null);
  const [logDeleteTarget, setLogDeleteTarget] = useState(null);

  // Filters
  const [filterLogType, setFilterLogType]             = useState('');
  const [filterLogCustomer, setFilterLogCustomer]     = useState('');
  const [filterLogDateFrom, setFilterLogDateFrom]     = useState('');
  const [filterLogDateTo, setFilterLogDateTo]         = useState('');

  // Migration banner
  const [migrationBanner, setMigrationBanner]         = useState(0);

  // One-time annotation migration (auto, on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const count = migrateAnnotationsToLogs();
    if (count > 0) setMigrationBanner(count);
  }, []);

  // Sync date filters + default logDate to parent week range (when rendered inside WeeklyReport)
  useEffect(() => {
    if (!weekStart || !weekEnd) return;
    const from = format(weekStart, 'yyyy-MM-dd');
    const to   = format(weekEnd,   'yyyy-MM-dd');
    setFilterLogDateFrom(from);
    setFilterLogDateTo(to);
    // Default logDate to today if within range, otherwise weekStart
    const today = new Date().toISOString().slice(0, 10);
    if (!logEditId) {
      setLogDate(today >= from && today <= to ? today : from);
    }
  }, [weekStart, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered + sorted logs
  const filteredLogs = useMemo(() => {
    return weeklyUpdateLogs
      .filter(l => !filterLogType || l.type === filterLogType)
      .filter(l => !filterLogCustomer || l.customerId === filterLogCustomer)
      .filter(l => !filterLogDateFrom || l.date >= filterLogDateFrom)
      .filter(l => !filterLogDateTo   || l.date <= filterLogDateTo)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }, [weeklyUpdateLogs, filterLogType, filterLogCustomer, filterLogDateFrom, filterLogDateTo]);

  // Handlers
  const handleAddLog = (e) => {
    e.preventDefault();
    if (!logForm.text.trim()) return;
    if (logEditId) {
      updateWeeklyUpdateLog(logEditId, {
        type:       logForm.type,
        text:       logForm.text.trim(),
        customerId: logForm.customerId || undefined,
        date:       logDate,
      });
      setLogEditId(null);
    } else {
      addWeeklyUpdateLog({
        type:       logForm.type,
        text:       logForm.text.trim(),
        customerId: logForm.customerId || undefined,
        date:       logDate,
      });
    }
    setLogForm({ type: 'highlight', text: '', customerId: '' });
  };

  const handleEditLog = (log) => {
    setLogEditId(log.id);
    setLogDate(log.date);
    setLogForm({ type: log.type, text: log.text, customerId: log.customerId || '' });
    document.getElementById('section-update-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelLogEdit = () => {
    setLogEditId(null);
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogForm({ type: 'highlight', text: '', customerId: '' });
  };

  return (
    <div id="section-update-log">

      {/* Migration banner */}
      {migrationBanner > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
          <Check size={13} className="flex-shrink-0" />
          <span>{migrationBanner} annotation{migrationBanner > 1 ? 's' : ''} migrated into Weekly Log</span>
          <button onClick={() => setMigrationBanner(0)} className="ml-auto text-amber-700/60 hover:text-amber-700 transition-colors"><X size={13} /></button>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Bookmark size={15} className="text-brand-lavender" />
        <h2 className="text-sm font-semibold text-foreground">Weekly Update Log</h2>
        {weeklyUpdateLogs.length > 0 && (
          <span className="bg-brand-lavender/20 text-brand-lavender border border-brand-lavender/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {weeklyUpdateLogs.length}
          </span>
        )}
      </div>

      {/* Import from Calendar & Email */}
      <CalendarEmailImport
        customers={customers}
        addWeeklyUpdateLog={addWeeklyUpdateLog}
        aiSettings={aiSettings}
      />

      {/* Add / Edit form */}
      <form onSubmit={handleAddLog} className="bg-card border border-border rounded-2xl p-4 mb-3 space-y-3">
        {logEditId && (
          <p className="text-xs font-semibold text-brand-lavender">Editing entry</p>
        )}

        {/* Row 1: Date + Customer */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Date</label>
            <input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Client (optional)</label>
            <select
              value={logForm.customerId}
              onChange={e => setLogForm(p => ({ ...p, customerId: e.target.value }))}
              className="w-full h-9 bg-secondary border border-border rounded-lg px-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            >
              <option value="">No specific client</option>
              {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Type pills */}
        <div role="group" aria-labelledby="log-type-label">
        <p id="log-type-label" className="text-[10px] font-medium text-muted-foreground mb-1.5">Log Type</p>
        <div className="flex gap-1.5 flex-wrap">
          {WEEKLY_UPDATE_LOG_TYPES.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setLogForm(p => ({ ...p, type }))}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                logForm.type === type ? 'scale-105 shadow-sm' : 'hover:scale-105'
              }`}
              style={logForm.type === type ? {
                backgroundColor: WEEKLY_UPDATE_LOG_COLORS[type] + '40',
                color: WEEKLY_UPDATE_LOG_COLORS[type],
                borderColor: WEEKLY_UPDATE_LOG_COLORS[type] + '80',
              } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)', backgroundColor: 'transparent' }}
            >
              {WEEKLY_UPDATE_LOG_LABELS[type]}
            </button>
          ))}
        </div>
        </div>

        {/* Row 3: Text + actions */}
        <textarea
          rows={2}
          value={logForm.text}
          onChange={e => setLogForm(p => ({ ...p, text: e.target.value }))}
          placeholder="What happened?"
          className="w-full rounded-xl border border-border bg-input-bg px-3 py-2 text-sm resize-none text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        />

        <div className="flex gap-2">
          {logEditId && (
            <button type="button" onClick={handleCancelLogEdit} className="px-4 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!logForm.text.trim()}
            className="flex-1 px-4 py-1.5 rounded-xl bg-brand-lavender text-[hsl(var(--sidebar-background))] text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-all"
          >
            {logEditId ? 'Save Changes' : 'Add Log'}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="border-t border-border/50 mb-3 -mx-0 pt-3 flex gap-2 flex-wrap">
        <select
          value={filterLogType}
          onChange={e => setFilterLogType(e.target.value)}
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All Types</option>
          {WEEKLY_UPDATE_LOG_TYPES.map(t => <option key={t} value={t}>{WEEKLY_UPDATE_LOG_LABELS[t]}</option>)}
        </select>
        <select
          value={filterLogCustomer}
          onChange={e => setFilterLogCustomer(e.target.value)}
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All Clients</option>
          {customers.filter(c => weeklyUpdateLogs.some(l => l.customerId === c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterLogDateFrom}
          onChange={e => setFilterLogDateFrom(e.target.value)}
          title="From date"
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
        />
        <input
          type="date"
          value={filterLogDateTo}
          onChange={e => setFilterLogDateTo(e.target.value)}
          title="To date"
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs text-foreground focus:outline-none focus:border-ring"
        />
        {(filterLogType || filterLogCustomer || filterLogDateFrom || filterLogDateTo) && (
          <button
            onClick={() => { setFilterLogType(''); setFilterLogCustomer(''); setFilterLogDateFrom(''); setFilterLogDateTo(''); }}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Entry list */}
      {weeklyUpdateLogs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <Bookmark size={24} className="text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No entries yet. Log your first highlight, lowlight, learning, or next week priority above.</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-5 py-6 text-center">
          <p className="text-xs text-muted-foreground">No entries match these filters.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl px-4 py-1">
          {filteredLogs.map((log, idx, arr) => {
            const customer = log.customerId ? customerMap.get(log.customerId) : null;
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 py-3 ${idx < arr.length - 1 ? 'border-b border-border' : ''}`}
              >
                {/* Type badge */}
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5 whitespace-nowrap"
                  style={{
                    backgroundColor: WEEKLY_UPDATE_LOG_COLORS[log.type] + '20',
                    color: WEEKLY_UPDATE_LOG_COLORS[log.type],
                  }}
                >
                  {WEEKLY_UPDATE_LOG_LABELS[log.type]}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{log.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {log.date}
                    {customer && (
                      <span
                        className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                        style={{ backgroundColor: customer.color + '22', color: customer.color }}
                      >
                        {customer.name}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0 mt-0.5">
                  <button
                    onClick={() => handleEditLog(log)}
                    className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setLogDeleteTarget(log.id)}
                    className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-secondary transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm delete log */}
      {logDeleteTarget && (
        <ConfirmDialog
          title="Delete log entry?"
          message="This entry will be permanently removed."
          onConfirm={() => { deleteWeeklyUpdateLog(logDeleteTarget); setLogDeleteTarget(null); }}
          onCancel={() => setLogDeleteTarget(null)}
        />
      )}
    </div>
  );
}
