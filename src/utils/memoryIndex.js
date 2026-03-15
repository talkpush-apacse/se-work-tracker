/**
 * memoryIndex.js
 * Builds a flat, unified MemoryEntry[] from all store entities.
 *
 * MemoryEntry shape:
 * {
 *   id: string,
 *   entityType: string,   // 'task' | 'meeting' | 'weeklyLog' | 'aiOutput' | 'milestone' | 'activityLog' | 'annotation'
 *   label: string,        // human-readable type label
 *   icon: string,         // emoji
 *   date: string,         // ISO date string
 *   customerId: string | null,
 *   customerName: string | null,
 *   customerColor: string | null,
 *   text: string,
 *   subtext: string | null,
 *   sourceRef: object,    // the original entity
 * }
 */

import { WORK_TYPE_LABELS, WEEKLY_UPDATE_LOG_LABELS } from '../constants';

const WEEKLY_LOG_ICONS = {
  highlight:            '⭐',
  lowlight:             '⚠️',
  learning:             '💡',
  shoutout:             '🙌',
  neutral:              '📋',
  'next-week-priority': '🎯',
};

function safeDate(value) {
  if (!value) return null;
  // Already ISO — return as-is if it parses
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dateFromDateStr(str) {
  // YYYY-MM-DD or similar — append time so it parses correctly in all engines
  if (!str) return null;
  if (str.length === 10) return safeDate(str + 'T00:00:00');
  return safeDate(str);
}

/**
 * Build a unified memory index from the full store context.
 * @param {object} store  Full store context from useAppStore()
 * @returns {MemoryEntry[]} Sorted newest-first
 */
export function buildMemoryIndex(store) {
  const {
    tasks = [],
    weeklyUpdateLogs = [],
    meetingEntries = [],
    aiOutputs = [],
    milestones = [],
    points = [],
    annotations = [],
    customers = [],
  } = store;

  const customerMap = new Map(customers.map(c => [c.id, c]));

  const entries = [];

  // ── Tasks ──────────────────────────────────────────────────────────
  for (const t of tasks) {
    const date = safeDate(t.closedAt) || safeDate(t.createdAt);
    if (!date) continue;
    const customer = t.customerId ? customerMap.get(t.customerId) : null;
    const workTypeLabel = WORK_TYPE_LABELS[t.workType] || t.workType || 'Task';
    entries.push({
      id: t.id,
      entityType: 'task',
      label: workTypeLabel,
      icon: '🟣',
      date,
      customerId: t.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: t.description || '',
      subtext: t.status || null,
      sourceRef: t,
    });
  }

  // ── Weekly Update Logs ─────────────────────────────────────────────
  for (const l of weeklyUpdateLogs) {
    const date = dateFromDateStr(l.date) || safeDate(l.createdAt);
    if (!date) continue;
    const customer = l.customerId ? customerMap.get(l.customerId) : null;
    const typeLabel = WEEKLY_UPDATE_LOG_LABELS[l.type] || l.type || 'Log';
    entries.push({
      id: l.id,
      entityType: 'weeklyLog',
      label: typeLabel,
      icon: WEEKLY_LOG_ICONS[l.type] || '📋',
      date,
      customerId: l.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: l.text || '',
      subtext: null,
      sourceRef: l,
    });
  }

  // ── Meeting Entries ────────────────────────────────────────────────
  for (const m of meetingEntries) {
    const date = dateFromDateStr(m.meetingDate) || safeDate(m.createdAt);
    if (!date) continue;
    const customer = m.customerId ? customerMap.get(m.customerId) : null;
    entries.push({
      id: m.id,
      entityType: 'meeting',
      label: 'Meeting',
      icon: '💬',
      date,
      customerId: m.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: m.aiSummary || (m.rawNotes || '').slice(0, 300),
      subtext: m.title || null,
      sourceRef: m,
    });
  }

  // ── AI Outputs ─────────────────────────────────────────────────────
  for (const o of aiOutputs) {
    const date = safeDate(o.createdAt);
    if (!date) continue;
    // Resolve customer via parent task
    const parentTask = tasks.find(t => t.id === o.taskId);
    const customer = parentTask?.customerId ? customerMap.get(parentTask.customerId) : null;
    entries.push({
      id: o.id,
      entityType: 'aiOutput',
      label: 'AI Draft',
      icon: '🤖',
      date,
      customerId: parentTask?.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: (o.outputText || '').slice(0, 300),
      subtext: o.outputType || o.type || null,
      sourceRef: o,
    });
  }

  // ── Milestones ─────────────────────────────────────────────────────
  for (const m of milestones) {
    const date = dateFromDateStr(m.targetDate) || safeDate(m.createdAt);
    if (!date) continue;
    const customer = m.customerId ? customerMap.get(m.customerId) : null;
    entries.push({
      id: m.id,
      entityType: 'milestone',
      label: 'Milestone',
      icon: '🚩',
      date,
      customerId: m.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: m.title || '',
      subtext: m.status || null,
      sourceRef: m,
    });
  }

  // ── Activity Logs (points with non-empty comment) ──────────────────
  for (const p of points) {
    if (!p.comment) continue;
    const date = safeDate(p.timestamp) || safeDate(p.date) || safeDate(p.createdAt);
    if (!date) continue;
    const customer = p.customerId ? customerMap.get(p.customerId) : null;
    const subtextParts = [];
    if (p.activityType) subtextParts.push(p.activityType);
    if (p.hours != null) subtextParts.push(`${p.hours}h`);
    entries.push({
      id: p.id,
      entityType: 'activityLog',
      label: 'Activity',
      icon: '⏱️',
      date,
      customerId: p.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: p.comment,
      subtext: subtextParts.length ? subtextParts.join(' • ') : null,
      sourceRef: p,
    });
  }

  // ── Annotations ────────────────────────────────────────────────────
  for (const a of annotations) {
    const date = safeDate(a.createdAt) || dateFromDateStr(a.date);
    if (!date) continue;
    const customer = a.customerId ? customerMap.get(a.customerId) : null;
    entries.push({
      id: a.id,
      entityType: 'annotation',
      label: 'Note',
      icon: '📝',
      date,
      customerId: a.customerId || null,
      customerName: customer?.name || null,
      customerColor: customer?.color || null,
      text: a.text || a.content || '',
      subtext: null,
      sourceRef: a,
    });
  }

  // Sort newest first
  return entries.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Badge color config by entityType */
export const ENTITY_TYPE_COLORS = {
  task:        { bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/20',  hex: '#a855f7' },
  meeting:     { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/20',    hex: '#3b82f6' },
  weeklyLog:   { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/20',   hex: '#f59e0b' },
  // specific weekly log sub-types for display (still entityType: weeklyLog)
  highlight:   { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/20',   hex: '#f59e0b' },
  lowlight:    { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/20',     hex: '#ef4444' },
  learning:    { bg: 'bg-green-500/15',   text: 'text-green-400',   border: 'border-green-500/20',   hex: '#22c55e' },
  aiOutput:    { bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    border: 'border-cyan-500/20',    hex: '#06b6d4' },
  milestone:   { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/20',  hex: '#f97316' },
  activityLog: { bg: 'bg-slate-500/15',   text: 'text-slate-400',   border: 'border-slate-500/20',   hex: '#64748b' },
  annotation:  { bg: 'bg-gray-500/15',    text: 'text-gray-400',    border: 'border-gray-500/20',    hex: '#9ca3af' },
};

/** Resolve the right color config for an entry (weekly log entries use their subtype) */
export function getEntryColors(entry) {
  if (entry.entityType === 'weeklyLog') {
    return ENTITY_TYPE_COLORS[entry.sourceRef?.type] || ENTITY_TYPE_COLORS.weeklyLog;
  }
  return ENTITY_TYPE_COLORS[entry.entityType] || ENTITY_TYPE_COLORS.annotation;
}
