import { useState } from 'react';
import { Plus, Pencil, Trash2, Users, ListPlus, Pin, PinOff, GripVertical, FolderKanban } from 'lucide-react';
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
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer Name *</label>
        <input
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="e.g. TaskUs, Accenture, Inspiro"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Color</label>
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
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">Cancel</button>
        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">{initial.id ? 'Save Changes' : 'Add Customer'}</button>
      </div>
    </form>
  );
}

// ─── Quick Add Project form (inline in customer card) ─────────────────────────
function QuickAddProjectForm({ customerId, okrs, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [okrId, setOkrId] = useState(okrs[0]?.id || '');

  const canSubmit = name.trim();

  return (
    <div className="mt-3 pt-3 border-t border-gray-700/60 space-y-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">New Project</p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Project name *"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
      />
      {okrs.length > 0 && (
        <select
          value={okrId}
          onChange={e => setOkrId(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
        >
          <option value="">— Link OKR (optional) —</option>
          {okrs.map(o => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({ name: name.trim(), customerId, okrId: okrId || null })}
          className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
        >
          Create
        </button>
      </div>
    </div>
  );
}

// ─── Sortable customer row ────────────────────────────────────────────────────
function SortableCustomerRow({ customer, linkedProjects, totalPoints, totalHours, taskPts, okrs, onEdit, onDelete, onPin, onAddProject }) {
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

  const [showAddProject, setShowAddProject] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl transition-all ${
        customer.pinned
          ? 'bg-amber-950/20 border border-amber-700/40'
          : 'bg-gray-900 border border-gray-800'
      } ${isDragging ? 'shadow-2xl shadow-black/40 z-10' : ''}`}
    >
      {/* Colored left border stripe */}
      <div
        className="flex items-center gap-3 p-4"
        style={{ borderLeft: `4px solid ${customer.color}`, borderRadius: 'inherit' }}
      >
        {/* Drag grip */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 touch-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        {/* Customer avatar */}
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: customer.color + '22', color: customer.color }}
          title="Customer color"
        >
          {customer.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name + date */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{customer.name}</p>
          <p className="text-xs text-gray-500">Added: {formatDate(customer.createdAt)}</p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-center">
          <div>
            <p className="text-sm font-bold" style={{ color: customer.color }}>{linkedProjects.length}</p>
            <p className="text-[10px] text-gray-500">Projects</p>
          </div>
          <div>
            <p className="text-sm font-bold text-white">{totalPoints}</p>
            <p className="text-[10px] text-gray-500">Points</p>
          </div>
          <div>
            <p className="text-sm font-bold text-white">{totalHours.toFixed(1)}</p>
            <p className="text-[10px] text-gray-500">Hours</p>
          </div>
          {taskPts > 0 && (
            <div>
              <p className="text-sm font-bold text-teal-400">⚡{taskPts}</p>
              <p className="text-[10px] text-gray-500">Task Pts</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 items-center flex-shrink-0 ml-2">
          <button
            onClick={() => setShowAddProject(v => !v)}
            title="Add project for this customer"
            className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-gray-800 transition-colors"
          >
            <FolderKanban size={13} />
          </button>
          <button
            onClick={() => onPin(customer.id, !customer.pinned)}
            title={customer.pinned ? 'Unpin customer' : 'Pin to top'}
            className={`p-1.5 rounded-lg transition-colors ${
              customer.pinned
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/40'
                : 'text-gray-500 hover:text-amber-400 hover:bg-gray-800'
            }`}
          >
            {customer.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button onClick={() => onEdit(customer)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"><Pencil size={13} /></button>
          <button onClick={() => onDelete(customer)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Inline Add Project form (toggled) */}
      {showAddProject && (
        <div className="px-4 pb-4">
          <QuickAddProjectForm
            customerId={customer.id}
            okrs={okrs}
            onSubmit={(data) => { onAddProject(data); setShowAddProject(false); }}
            onCancel={() => setShowAddProject(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Customers page ──────────────────────────────────────────────────────
export default function Customers() {
  const { customers, projects, points, tasks, okrs, addCustomer, updateCustomer, deleteCustomer, reorderCustomers, addProject } = useAppStore();
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Sort: pinned first, then preserve store order within each group
  const sortedCustomers = [...customers].sort((a, b) => {
    if (!!a.pinned === !!b.pinned) return 0;
    return !!b.pinned - !!a.pinned;
  });

  const handlePin = (id, value) => updateCustomer(id, { pinned: value });

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Determine new order within the full sorted list
    const oldIndex = sortedCustomers.findIndex(c => c.id === active.id);
    const newIndex = sortedCustomers.findIndex(c => c.id === over.id);
    const reordered = arrayMove(sortedCustomers, oldIndex, newIndex);
    reorderCustomers(reordered.map(c => c.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise clients linked to your projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium text-gray-300 hover:text-white transition-all"
          >
            <ListPlus size={15} /> Bulk Add
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
          <Users size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No customers yet.</p>
          <button onClick={() => setCreateModal(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Add your first customer →</button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedCustomers.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {sortedCustomers.map(customer => {
                const linkedProjects = projects.filter(p => p.customerId === customer.id);
                const totalPoints = linkedProjects.reduce((s, proj) => {
                  return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.points, 0);
                }, 0);
                const totalHours = linkedProjects.reduce((s, proj) => {
                  return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.hours, 0);
                }, 0);
                const taskPts = linkedProjects.reduce((s, proj) =>
                  s + tasks.filter(t => t.projectId === proj.id).reduce((ss, t) => ss + (t.points || 0), 0), 0);

                return (
                  <SortableCustomerRow
                    key={customer.id}
                    customer={customer}
                    linkedProjects={linkedProjects}
                    totalPoints={totalPoints}
                    totalHours={totalHours}
                    taskPts={taskPts}
                    okrs={okrs}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                    onPin={handlePin}
                    onAddProject={(data) => addProject(data)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
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
          message={`Delete "${deleteTarget.name}"? Their projects will remain but lose the customer link.`}
          onConfirm={() => { deleteCustomer(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkModal && <BulkAddCustomersModal onClose={() => setBulkModal(false)} />}
    </div>
  );
}
