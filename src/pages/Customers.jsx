import { useState } from 'react';
import { Plus, Pencil, Trash2, Users, ListPlus, Star, GripVertical, ChevronRight, Search } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../context/StoreContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import BulkAddCustomersModal from '../components/BulkAddCustomersModal';
import CustomerDetailView from '../components/CustomerDetailView';
import { CUSTOMER_COLORS } from '../constants';
import { formatDate } from '../utils/dateHelpers';

// ─── Customer form (add/edit) ─────────────────────────────────────────────────
function CustomerForm({ initial = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({ name: initial.name || '', color: initial.color || CUSTOMER_COLORS[0].value });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Required' }); return; }
    onSubmit({ name: form.name.trim(), color: form.color });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer Name *</label>
        <input
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="e.g. TaskUs, Accenture, Inspiro"
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
        />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color</label>
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_COLORS.map(({ name, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm(p => ({ ...p, color: value }))}
              title={name}
              className={`w-8 h-8 rounded-full transition-all ${form.color === value ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800 scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: value }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-colors">{initial.id ? 'Save Changes' : 'Add Customer'}</button>
      </div>
    </form>
  );
}

// ─── Sortable customer row ────────────────────────────────────────────────────
function SortableCustomerRow({ customer, taskCount, totalPoints, totalHours, taskPts, onEdit, onDelete, onPin, onView }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: customer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl transition-all ${
        customer.pinned
          ? 'bg-amber-950/20 border border-amber-700/40'
          : 'bg-card border border-border'
      } ${isDragging ? 'shadow-2xl shadow-black/40 z-10' : ''}`}
    >
      {/* Entire row is clickable — opens detail view */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer group"
        style={{ borderLeft: `4px solid ${customer.color}`, borderRadius: 'inherit' }}
        onClick={() => onView(customer)}
      >
        {/* Drag grip — stop propagation so drag doesn't navigate */}
        <button
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-muted-foreground transition-colors flex-shrink-0 touch-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        {/* Customer avatar */}
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-sm"
          style={{ backgroundColor: customer.color + '22', color: customer.color }}
        >
          {customer.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name + date */}
        <div className="flex-1 min-w-0 text-left">
          <p className="font-semibold text-foreground truncate group-hover:text-brand-lavender transition-colors">
            {customer.name}
          </p>
          <p className="text-xs text-muted-foreground">Added: {formatDate(customer.createdAt)}</p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-center">
          <div>
            <p className="text-sm font-bold" style={{ color: customer.color }}>{taskCount}</p>
            <p className="text-[10px] text-muted-foreground">Tasks</p>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{Number(totalPoints).toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">Points</p>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{totalHours.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">Hours</p>
          </div>
          {taskPts > 0 && (
            <div>
              <p className="text-sm font-bold text-teal-400">⚡{Number(taskPts).toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">Task Pts</p>
            </div>
          )}
        </div>

        {/* Action buttons — all stop propagation to prevent row click */}
        <div className="flex gap-1 items-center flex-shrink-0 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(customer.id, !customer.pinned); }}
            title={customer.pinned ? 'Remove from priority' : 'Mark as priority'}
            className={`p-1.5 rounded-lg transition-colors ${
              customer.pinned
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/40'
                : 'text-muted-foreground hover:text-amber-400 hover:bg-secondary'
            }`}
          >
            <Star size={13} className={customer.pinned ? 'fill-amber-400' : ''} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(customer); }}   className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><Pencil size={13} /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(customer); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"><Trash2 size={13} /></button>
          {/* Visual chevron — row click handles navigation */}
          <ChevronRight size={14} className="text-muted-foreground/40 ml-1 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Customers page ──────────────────────────────────────────────────────
export default function Customers() {
  const { customers, points, tasks, addCustomer, updateCustomer, deleteCustomer, reorderCustomers } = useAppStore();
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal,   setBulkModal]   = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');

  // Customer detail view state
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Split into pinned / unpinned, filtered by search
  const searchLower = search.trim().toLowerCase();
  const pinnedCustomers   = customers.filter(c => !!c.pinned  && (!searchLower || c.name.toLowerCase().includes(searchLower)));
  const unpinnedCustomers = customers.filter(c => !c.pinned  && (!searchLower || c.name.toLowerCase().includes(searchLower)));

  const handlePin = (id, value) => updateCustomer(id, { pinned: value });

  // Helper: compute stats for a customer (direct — no project indirection)
  const getCustomerStats = (customer) => {
    const custPoints  = points.filter(pt => pt.customerId === customer.id);
    const totalPoints = custPoints.reduce((s, e) => s + e.points, 0);
    const totalHours  = custPoints.reduce((s, e) => s + e.hours,  0);
    const custTasks   = tasks.filter(t => t.customerId === customer.id);
    const taskCount   = custTasks.length;
    const taskPts     = custTasks.reduce((s, t) => s + (t.points || 0), 0);
    return { taskCount, totalPoints, totalHours, taskPts };
  };

  // Drag handler for pinned section — reorder within pinned, keep unpinned order
  const handlePinnedDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pinnedCustomers.findIndex(c => c.id === active.id);
    const newIndex = pinnedCustomers.findIndex(c => c.id === over.id);
    const reordered = arrayMove(pinnedCustomers, oldIndex, newIndex);
    reorderCustomers([...reordered.map(c => c.id), ...unpinnedCustomers.map(c => c.id)]);
  };

  // Drag handler for unpinned section — reorder within unpinned, keep pinned order
  const handleUnpinnedDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = unpinnedCustomers.findIndex(c => c.id === active.id);
    const newIndex = unpinnedCustomers.findIndex(c => c.id === over.id);
    const reordered = arrayMove(unpinnedCustomers, oldIndex, newIndex);
    reorderCustomers([...pinnedCustomers.map(c => c.id), ...reordered.map(c => c.id)]);
  };

  // Render a customer row with stats
  const renderCustomerRow = (customer) => {
    const { taskCount, totalPoints, totalHours, taskPts } = getCustomerStats(customer);
    return (
      <SortableCustomerRow
        key={customer.id}
        customer={customer}
        taskCount={taskCount}
        totalPoints={totalPoints}
        totalHours={totalHours}
        taskPts={taskPts}
        onEdit={setEditTarget}
        onDelete={setDeleteTarget}
        onPin={handlePin}
        onView={setSelectedCustomer}
      />
    );
  };

  // ── Customer detail view ──────────────────────────────────────────────────
  // Keep selectedCustomer in sync with the store (e.g. after edit)
  const liveSelectedCustomer = selectedCustomer
    ? customers.find(c => c.id === selectedCustomer.id) ?? null
    : null;

  if (liveSelectedCustomer) {
    return (
      <CustomerDetailView
        customer={liveSelectedCustomer}
        onBack={() => setSelectedCustomer(null)}
      />
    );
  }

  // ── Customer list view ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Enterprise clients you track work for</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-muted border border-border text-sm font-medium text-foreground/80 hover:text-foreground transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-lavender hover:bg-brand-lavender/80 text-sm font-bold text-foreground transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <Users size={32} className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No customers yet.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-brand-lavender hover:text-brand-lavender/80">Add your first customer →</button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Search / filter */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>

          {/* No results */}
          {searchLower && pinnedCustomers.length === 0 && unpinnedCustomers.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No customers match "{search}"</p>
          )}

          {/* Priority section */}
          {pinnedCustomers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Priority</span>
                <span className="text-xs text-muted-foreground/70">({pinnedCustomers.length})</span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePinnedDragEnd}>
                <SortableContext items={pinnedCustomers.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {pinnedCustomers.map(renderCustomerRow)}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Non-Priority section */}
          {unpinnedCustomers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-muted-foreground">Non Priority</span>
                <span className="text-xs text-muted-foreground/70">({unpinnedCustomers.length})</span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUnpinnedDragEnd}>
                <SortableContext items={unpinnedCustomers.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {unpinnedCustomers.map(renderCustomerRow)}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}

      {createModal && (
        <Modal title="Add Customer" onClose={() => setCreateModal(false)}>
          <CustomerForm onSubmit={(data) => { addCustomer(data); setCreateModal(false); }} onCancel={() => setCreateModal(false)} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit Customer" onClose={() => setEditTarget(null)}>
          <CustomerForm initial={editTarget} onSubmit={(data) => { updateCustomer(editTarget.id, data); setEditTarget(null); }} onCancel={() => setEditTarget(null)} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Customer"
          message={`Delete "${deleteTarget.name}"? All tasks, points, meetings, and milestones for this customer will also be deleted. This cannot be undone.`}
          onConfirm={() => {
            // If we're viewing this customer, go back first
            if (selectedCustomer?.id === deleteTarget.id) setSelectedCustomer(null);
            deleteCustomer(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkModal && <BulkAddCustomersModal onClose={() => setBulkModal(false)} />}
    </div>
  );
}
