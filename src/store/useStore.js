import { useState, useEffect, useCallback, useRef } from 'react';
import { TASK_TYPE_POINTS } from '../constants';
import { fetchAllData, saveEntity, seedAllData } from '../lib/api';

const KEYS = {
  okrs: 'gpt-okrs',
  customers: 'gpt-customers',
  points: 'gpt-points',
  meetingEntries: 'gpt-meeting-entries',
  tasks: 'gpt-tasks',
  milestones: 'gpt-milestones',
  aiOutputs: 'gpt-ai-outputs',
  aiSettings: 'gpt-ai-settings',
  annotations: 'gpt-annotations',
  weeklyReports: 'gpt-weekly-reports',
  weeklyUpdateLogs: 'gpt-weekly-update-logs',
  timeBudgets: 'gpt-time-budgets',
  timeLogs: 'gpt-time-logs',
  stressLogs: 'gpt-stress-logs',
  workTypeTargets: 'gpt-work-type-targets',
};

const MIGRATION_FLAG = 'gpt-migrated-to-neon';
const V2_MIGRATION_FLAG = 'gpt-v2-migrated';
const V3_MIGRATION_FLAG = 'gpt-v3-migrated';

// Default AI settings shape — empty string means "use built-in default prompt"
const DEFAULT_AI_SETTINGS = {
  prompts: { email: '', slack: '', troubleshooting: '', configuration: '', summary: '', weeklyEmail: '' },
  providers: { email: 'openai', slack: 'openai', troubleshooting: 'openai', configuration: 'openai', summary: 'openai', weeklyEmail: 'claude', knowledge: 'claude' },
  openaiModel: 'gpt-4o',
  claudeModel: 'claude-sonnet-4-6',
};

function load(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Use the Web Crypto API for collision-free IDs — works in all modern browsers
// and avoids the rare Date.now() collision risk under rapid bulk-create operations.
function uid() {
  return crypto.randomUUID();
}

// Migrate OKRs that predate the keyResults/quarter fields
function migrateOkrs(okrs) {
  return okrs.map(okr => {
    const m = { ...okr };
    if (!m.quarter) m.quarter = 'Q1 2026';
    if (!m.keyResults) {
      if (m.description && m.description.trim()) {
        const lines = m.description.split('\n').filter(l => /^KR\d*:/i.test(l.trim()));
        if (lines.length > 0) {
          m.keyResults = lines.map((line, i) => ({
            id: `kr-${okr.id}-${i}`,
            text: line.replace(/^KR\d*:\s*/i, '').trim(),
            type: 'boolean', value: null,
          }));
          m.description = '';
        } else { m.keyResults = []; }
      } else { m.keyResults = []; }
    }
    return m;
  });
}

// ─── V2 Migration: Project → Customer direct linking ──────────────────────────
// Runs once. Resolves projectId → project.customerId on all entities.
// After migration, the Project entity is no longer used.
function runV2Migration() {
  if (localStorage.getItem(V2_MIGRATION_FLAG)) return; // already done

  const projects = load('gpt-projects', []);
  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Helper: resolve projectId → customerId
  const resolve = (entity) => {
    if (entity.customerId !== undefined) return entity; // already migrated
    const project = projectMap.get(entity.projectId);
    const migrated = { ...entity };
    migrated.customerId = project?.customerId || null;
    delete migrated.projectId;
    return migrated;
  };

  // Migrate tasks (also inherit OKR from project)
  const tasks = load(KEYS.tasks).map(t => {
    if (t.customerId !== undefined) return t;
    const project = projectMap.get(t.projectId);
    const migrated = { ...t };
    migrated.customerId = project?.customerId || null;
    migrated.okrId = project?.okrId || null;
    delete migrated.projectId;
    return migrated;
  });

  // Migrate points (add okrId field)
  const points = load(KEYS.points).map(pt => {
    const m = resolve(pt);
    if (m.okrId === undefined) m.okrId = null;
    return m;
  });

  const meetingEntries = load(KEYS.meetingEntries).map(resolve);
  const milestones = load(KEYS.milestones).map(resolve);

  // Save migrated data back to localStorage
  save(KEYS.tasks, tasks);
  save(KEYS.points, points);
  save(KEYS.meetingEntries, meetingEntries);
  save(KEYS.milestones, milestones);

  // Migrate active timer if it has a projectId
  try {
    const timerRaw = localStorage.getItem('gpt-active-timer');
    if (timerRaw) {
      const timer = JSON.parse(timerRaw);
      if (timer.projectId !== undefined) {
        const project = projectMap.get(timer.projectId);
        timer.customerId = project?.customerId || null;
        delete timer.projectId;
        localStorage.setItem('gpt-active-timer', JSON.stringify(timer));
      }
    }
  } catch { /* ignore timer migration errors */ }

  localStorage.setItem(V2_MIGRATION_FLAG, new Date().toISOString());
  console.log('[v2] Migration complete — projectId → customerId');
}

// Also migrates remote Neon data when it still has projectId references
function migrateRemoteV2(remoteTasks, remotePoints, remoteMeetingEntries, remoteMilestones, remoteProjects) {
  const projectMap = new Map((remoteProjects || []).map(p => [p.id, p]));

  const resolve = (entity) => {
    if (entity.customerId !== undefined) return entity;
    const project = projectMap.get(entity.projectId);
    const m = { ...entity };
    m.customerId = project?.customerId || null;
    delete m.projectId;
    return m;
  };

  return {
    tasks: remoteTasks.map(t => {
      if (t.customerId !== undefined) return t;
      const project = projectMap.get(t.projectId);
      const m = { ...t };
      m.customerId = project?.customerId || null;
      m.okrId = project?.okrId || null;
      delete m.projectId;
      return m;
    }),
    points: remotePoints.map(pt => {
      const m = resolve(pt);
      if (m.okrId === undefined) m.okrId = null;
      return m;
    }),
    meetingEntries: remoteMeetingEntries.map(resolve),
    milestones: remoteMilestones.map(resolve),
  };
}

// ─── Debounce helper for API saves ───────────────────────────────
// getMounted: () => boolean — gates saves until after the init fetch completes
// onError: (entity) => void — called when a Neon PUT fails, so the UI can show a sync error
function createBatchedSaver(getMounted, onError) {
  let timer = null;
  const dirty = new Map();
  // Saves that arrive before mountedRef is set are queued here and flushed after init
  const pending = new Map();

  const flush = async () => {
    const toSave = Array.from(dirty.entries());
    dirty.clear();
    for (const [e, d] of toSave) {
      const ok = await saveEntity(e, d);
      if (!ok) {
        console.warn(`[sync] Failed to save ${e} to Neon`);
        onError?.(e);
      }
    }
  };

  const saver = (entity, data) => {
    if (!getMounted()) {
      // Queue the save — will be flushed once the init fetch completes
      pending.set(entity, data);
      return;
    }
    dirty.set(entity, data);
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };

  // Called after mountedRef becomes true — pushes any pre-mount changes to Neon
  saver.flushPending = () => {
    if (pending.size === 0) return;
    pending.forEach((d, e) => dirty.set(e, d));
    pending.clear();
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };

  // Synchronously flushes all pending dirty entities with keepalive=true.
  // Called from the beforeunload handler so in-flight saves survive page unload.
  saver.flushSync = () => {
    clearTimeout(timer);
    if (dirty.size === 0) return;
    for (const [entity, data] of dirty.entries()) {
      saveEntity(entity, data, { keepalive: true }).catch(() => {});
    }
    dirty.clear();
  };

  return saver;
}

// ─── Evergreen task weekly reset ──────────────────────────────────
// Resets 'evergreen' tasks with status 'done' back to 'open' at the
// start of each new week (Monday). Runs once per week, gated by a
// localStorage flag storing the Monday date of the last reset.
function resetEvergreenTasks() {
  const now = new Date();
  const day = now.getDay();
  // Calculate this Monday (weekStartsOn = 1)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const mondayStr = monday.toISOString().slice(0, 10);

  const lastReset = localStorage.getItem('gpt-evergreen-last-reset');
  if (lastReset === mondayStr) return; // already reset this week

  const tasks = load('gpt-tasks', []);
  let changed = false;
  const updated = tasks.map(t => {
    if (t.taskType === 'evergreen' && t.status === 'done') {
      changed = true;
      return { ...t, status: 'open', points: 0, closedAt: null };
    }
    return t;
  });
  if (changed) {
    save('gpt-tasks', updated);
    console.log('[evergreen] Reset done evergreen tasks for week of', mondayStr);
  }
  localStorage.setItem('gpt-evergreen-last-reset', mondayStr);
}

// ─── V3 Migration: Backfill timeLogs from existing points ──────────────────
// Maps old interaction types to new work types so the bandwidth view has
// data from day one, even for users who tracked time before this redesign.
function runV3Migration() {
  if (localStorage.getItem(V3_MIGRATION_FLAG)) return;

  const points = load(KEYS.points, []);
  if (!points.length) {
    localStorage.setItem(V3_MIGRATION_FLAG, new Date().toISOString());
    return;
  }

  const INTERACTION_TO_WORK_TYPE = {
    'Meeting':    'meetings',
    'Email':      'comms',
    'Focus Time': 'deep_work',
  };

  const timeLogs = points.map(pt => {
    const loggedAt = pt.timestamp;
    // Derive weekStart (Monday) from the point's timestamp
    const d = new Date(loggedAt);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
    const weekStart = monday.toISOString().slice(0, 10);

    return {
      id: crypto.randomUUID(),
      workType: INTERACTION_TO_WORK_TYPE[pt.interactionType] || 'deep_work',
      hours: pt.hours || 0,
      clientIds: pt.customerId ? [pt.customerId] : [],
      okrId: pt.okrId || null,
      taskId: null,
      note: pt.comment || '',
      loggedAt,
      weekStart,
    };
  });

  save(KEYS.timeLogs, timeLogs);
  localStorage.setItem(V3_MIGRATION_FLAG, new Date().toISOString());
  console.log('[v3] Backfilled', timeLogs.length, 'timeLogs from points');
}

// ─── Run migrations before any component mounts ────────────────
runV2Migration();
runV3Migration();
resetEvergreenTasks();

export function useStore() {
  const [okrs, setOkrs] = useState(() => migrateOkrs(load(KEYS.okrs)));
  const [customers, setCustomers] = useState(() => load(KEYS.customers));
  const [points, setPoints] = useState(() => load(KEYS.points));
  const [meetingEntries, setMeetingEntries] = useState(() => load(KEYS.meetingEntries));
  const [tasks, setTasks] = useState(() => load(KEYS.tasks));
  const [milestones, setMilestones] = useState(() => load(KEYS.milestones));
  const [aiOutputs, setAiOutputs] = useState(() => load(KEYS.aiOutputs));
  const [annotations, setAnnotations] = useState(() => load(KEYS.annotations));
  const [weeklyReports, setWeeklyReports] = useState(() => load(KEYS.weeklyReports));
  const [weeklyUpdateLogs, setWeeklyUpdateLogs] = useState(() => load(KEYS.weeklyUpdateLogs));
  const [timeBudgets, setTimeBudgets] = useState(() => load(KEYS.timeBudgets));
  const [timeLogs, setTimeLogs] = useState(() => load(KEYS.timeLogs));
  const [stressLogs, setStressLogs] = useState(() => load(KEYS.stressLogs));
  const [workTypeTargets, setWorkTypeTargets] = useState(() => load(KEYS.workTypeTargets));
  const [aiSettings, setAiSettings] = useState(() => {
    const stored = load(KEYS.aiSettings, null);
    if (!stored) return DEFAULT_AI_SETTINGS;
    return {
      prompts: { ...DEFAULT_AI_SETTINGS.prompts, ...stored.prompts },
      providers: { ...DEFAULT_AI_SETTINGS.providers, ...stored.providers },
      openaiModel: stored.openaiModel || DEFAULT_AI_SETTINGS.openaiModel,
      claudeModel: stored.claudeModel || DEFAULT_AI_SETTINGS.claudeModel,
    };
  });

  const [syncStatus, setSyncStatus] = useState('loading');
  // mountedRef must be declared before debouncedSave so the closure captures it correctly
  const mountedRef = useRef(false);
  const debouncedSave = useRef(createBatchedSaver(
    () => mountedRef.current,
    () => setSyncStatus('error'),
  )).current;

  // ─── localStorage save effects ───
  useEffect(() => { save(KEYS.okrs, okrs); }, [okrs]);
  useEffect(() => { save(KEYS.customers, customers); }, [customers]);
  useEffect(() => { save(KEYS.points, points); }, [points]);
  useEffect(() => { save(KEYS.meetingEntries, meetingEntries); }, [meetingEntries]);
  useEffect(() => { save(KEYS.tasks, tasks); }, [tasks]);
  useEffect(() => { save(KEYS.milestones, milestones); }, [milestones]);
  useEffect(() => { save(KEYS.aiOutputs, aiOutputs); }, [aiOutputs]);
  useEffect(() => { save(KEYS.aiSettings, aiSettings); }, [aiSettings]);
  useEffect(() => { save(KEYS.annotations, annotations); }, [annotations]);
  useEffect(() => { save(KEYS.weeklyReports, weeklyReports); }, [weeklyReports]);
  useEffect(() => { save(KEYS.weeklyUpdateLogs, weeklyUpdateLogs); }, [weeklyUpdateLogs]);
  useEffect(() => { save(KEYS.timeBudgets, timeBudgets); }, [timeBudgets]);
  useEffect(() => { save(KEYS.timeLogs, timeLogs); }, [timeLogs]);
  useEffect(() => { save(KEYS.stressLogs, stressLogs); }, [stressLogs]);
  useEffect(() => { save(KEYS.workTypeTargets, workTypeTargets); }, [workTypeTargets]);

  // ─── Neon save effects (debounced, only after mount-fetch) ───
  useEffect(() => { if (mountedRef.current) debouncedSave('okrs', okrs); }, [okrs]);
  useEffect(() => { if (mountedRef.current) debouncedSave('customers', customers); }, [customers]);
  useEffect(() => { if (mountedRef.current) debouncedSave('points', points); }, [points]);
  useEffect(() => { if (mountedRef.current) debouncedSave('meetingEntries', meetingEntries); }, [meetingEntries]);
  useEffect(() => { if (mountedRef.current) debouncedSave('tasks', tasks); }, [tasks]);
  useEffect(() => { if (mountedRef.current) debouncedSave('milestones', milestones); }, [milestones]);
  useEffect(() => { if (mountedRef.current) debouncedSave('aiOutputs', aiOutputs); }, [aiOutputs]);
  useEffect(() => { if (mountedRef.current) debouncedSave('aiSettings', aiSettings); }, [aiSettings]);
  useEffect(() => { if (mountedRef.current) debouncedSave('annotations', annotations); }, [annotations]);
  useEffect(() => { if (mountedRef.current) debouncedSave('weeklyReports', weeklyReports); }, [weeklyReports]);
  useEffect(() => { if (mountedRef.current) debouncedSave('weeklyUpdateLogs', weeklyUpdateLogs); }, [weeklyUpdateLogs]);
  useEffect(() => { if (mountedRef.current) debouncedSave('timeBudgets', timeBudgets); }, [timeBudgets]);
  useEffect(() => { if (mountedRef.current) debouncedSave('timeLogs', timeLogs); }, [timeLogs]);
  useEffect(() => { if (mountedRef.current) debouncedSave('stressLogs', stressLogs); }, [stressLogs]);
  useEffect(() => { if (mountedRef.current) debouncedSave('workTypeTargets', workTypeTargets); }, [workTypeTargets]);

  // Flush any pending Neon writes when the user reloads or navigates away.
  // keepalive: true tells the browser to complete the fetch even after the page unloads.
  useEffect(() => {
    const handleBeforeUnload = () => debouncedSave.flushSync();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (mountedRef.current) setSyncStatus('saving'); }, [okrs, customers, points, meetingEntries, tasks, milestones, aiOutputs, aiSettings, annotations, weeklyReports, weeklyUpdateLogs, timeBudgets, timeLogs, stressLogs, workTypeTargets]);

  useEffect(() => {
    if (syncStatus === 'saving') {
      const t = setTimeout(() => setSyncStatus('synced'), 800);
      return () => clearTimeout(t);
    }
  }, [syncStatus]);

  // ─── Mount: fetch from Neon, auto-migrate if first run ─────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const remote = await fetchAllData();
      if (cancelled) return;

      if (!remote) {
        setSyncStatus('offline');
        mountedRef.current = true;
        return;
      }

      const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG);
      const neonHasData = Object.values(remote).some(d =>
        Array.isArray(d) ? d.length > 0 : (d && typeof d === 'object' && Object.keys(d).length > 0)
      );

      if (!neonHasData && !alreadyMigrated) {
        console.log('[sync] Neon empty → seeding from localStorage');
        const localData = { okrs, customers, points, meetingEntries, tasks, milestones, aiOutputs, aiSettings };
        const result = await seedAllData(localData);
        if (result) {
          localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
          console.log('[sync] Seed complete:', result.entitiesSeeded, 'entities');
        }
      } else if (neonHasData) {
        let rTasks = remote.tasks || [];
        let rPoints = remote.points || [];
        let rMeetingEntries = remote.meetingEntries || [];
        let rMilestones = remote.milestones || [];

        // Check if remote data still has projectId (needs v2 migration)
        const remoteNeedsV2 = rTasks.some(t => t.projectId !== undefined && t.customerId === undefined);
        if (remoteNeedsV2) {
          const migrated = migrateRemoteV2(rTasks, rPoints, rMeetingEntries, rMilestones, remote.projects);
          rTasks = migrated.tasks;
          rPoints = migrated.points;
          rMeetingEntries = migrated.meetingEntries;
          rMilestones = migrated.milestones;
        }

        if (remote.okrs) setOkrs(migrateOkrs(remote.okrs));
        if (remote.customers) setCustomers(remote.customers);
        setPoints(rPoints);
        setMeetingEntries(rMeetingEntries);
        setTasks(rTasks);
        setMilestones(rMilestones);
        if (remote.annotations) setAnnotations(remote.annotations);
        if (remote.weeklyReports) setWeeklyReports(remote.weeklyReports);
        if (remote.weeklyUpdateLogs) setWeeklyUpdateLogs(remote.weeklyUpdateLogs);
        if (remote.timeBudgets) setTimeBudgets(remote.timeBudgets);
        if (remote.timeLogs) setTimeLogs(remote.timeLogs);
        if (remote.stressLogs) setStressLogs(remote.stressLogs);
        if (remote.workTypeTargets) setWorkTypeTargets(remote.workTypeTargets);
        if (remote.aiOutputs) setAiOutputs(remote.aiOutputs);
        if (remote.aiSettings && Object.keys(remote.aiSettings).length > 0) {
          setAiSettings(prev => ({
            prompts: { ...DEFAULT_AI_SETTINGS.prompts, ...remote.aiSettings.prompts },
            providers: { ...DEFAULT_AI_SETTINGS.providers, ...remote.aiSettings.providers },
            openaiModel: remote.aiSettings.openaiModel || prev.openaiModel,
            claudeModel: remote.aiSettings.claudeModel || prev.claudeModel,
          }));
        }
        if (!alreadyMigrated) localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
      }

      if (!cancelled) {
        mountedRef.current = true;
        // Flush any saves that arrived during the init fetch (pre-mount changes)
        debouncedSave.flushPending();
        setSyncStatus('synced');
      }
    }

    init();
    return () => { cancelled = true; };
  }, []); // run once on mount

  // ─── OKR actions ───
  const addOkr = useCallback((data) => {
    const okr = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setOkrs(prev => [...prev, okr]);
    return okr;
  }, []);
  const updateOkr = useCallback((id, data) => {
    setOkrs(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
  }, []);
  const deleteOkr = useCallback((id) => {
    setOkrs(prev => prev.filter(o => o.id !== id));
  }, []);

  // ─── Customer actions ───
  const addCustomer = useCallback((data) => {
    const customer = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setCustomers(prev => [...prev, customer]);
    return customer;
  }, []);
  const updateCustomer = useCallback((id, data) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);
  // Cascade delete: points, meeting entries, tasks (+ their AI outputs), milestones, annotations, weekly reports + logs
  const deleteCustomer = useCallback((id) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    setPoints(prev => prev.filter(pt => pt.customerId !== id));
    setMeetingEntries(prev => prev.filter(m => m.customerId !== id));
    setTasks(prev => {
      const toDelete = new Set(prev.filter(t => t.customerId === id).map(t => t.id));
      setAiOutputs(ao => ao.filter(o => !toDelete.has(o.taskId)));
      return prev.filter(t => t.customerId !== id);
    });
    setMilestones(prev => prev.filter(m => m.customerId !== id));
    setAnnotations(prev => prev.filter(a => a.customerId !== id));
    setWeeklyReports(prev => prev.filter(r => r.customerId !== id));
    setWeeklyUpdateLogs(prev => prev.filter(l => l.customerId !== id));
  }, []);
  const reorderCustomers = useCallback((orderedIds) => {
    setCustomers(prev => orderedIds.map(id => prev.find(c => c.id === id)).filter(Boolean));
  }, []);

  // ─── Point actions ───
  const addPoint = useCallback((data) => {
    // data: { customerId, okrId (optional), points, hours, activityType, comment }
    const entry = { id: uid(), timestamp: new Date().toISOString(), ...data };
    setPoints(prev => [...prev, entry]);
    return entry;
  }, []);
  const deletePoint = useCallback((id) => {
    setPoints(prev => prev.filter(p => p.id !== id));
  }, []);
  const updatePoint = useCallback((id, data) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  // ─── Meeting entry actions ───
  const addMeetingEntry = useCallback((data) => {
    // data: { customerId, meetingDate, rawNotes }
    const entry = { id: uid(), createdAt: new Date().toISOString(), isTriaged: false, ...data };
    setMeetingEntries(prev => [...prev, entry]);
    return entry;
  }, []);
  const markMeetingEntryTriaged = useCallback((id) => {
    setMeetingEntries(prev => prev.map(m => m.id === id ? { ...m, isTriaged: true } : m));
  }, []);
  const getCustomerMeetingEntries = useCallback((customerId) => {
    return meetingEntries.filter(m => m.customerId === customerId);
  }, [meetingEntries]);

  // ─── Task actions ───
  const addTask = useCallback((data) => {
    // data: { customerId, okrId (optional), meetingEntryId (optional), description, taskType, assigneeOrTeam, status }
    const task = { id: uid(), createdAt: new Date().toISOString(), status: 'open', points: 0, closedAt: null, ...data };
    if (task.status === 'done') task.points = TASK_TYPE_POINTS[task.taskType] || 0;
    if (task.status === 'done' || task.status === 'archived') task.closedAt = new Date().toISOString();
    setTasks(prev => [...prev, task]);
    return task;
  }, []);
  const updateTask = useCallback((id, data) => {
    let updatedTasks;
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...data };
        if ('status' in data) {
          const wasOpen = !['done', 'archived'].includes(t.status);
          const nowClosed = ['done', 'archived'].includes(data.status);
          if (nowClosed && wasOpen) updated.closedAt = new Date().toISOString();
          else if (!nowClosed) updated.closedAt = null;
          if (data.status === 'done') updated.points = TASK_TYPE_POINTS[updated.taskType] || 0;
          else if (t.status === 'done') updated.points = 0;
        }
        return updated;
      });
      updatedTasks = next;
      return next;
    });
    // Bypass the 500ms debounce for critical status transitions — prevents data loss if the
    // user reloads before the debounce fires (Neon would otherwise overwrite with stale status)
    if ('status' in data && ['done', 'archived'].includes(data.status) && mountedRef.current) {
      saveEntity('tasks', updatedTasks).catch(() => {});
    }
  }, []);
  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setAiOutputs(prev => prev.filter(o => o.taskId !== id));
  }, []);
  const getCustomerTasks = useCallback((customerId) => {
    return tasks.filter(t => t.customerId === customerId);
  }, [tasks]);
  const reorderTasks = useCallback((orderedIds) => {
    setTasks(prev => orderedIds.map(id => prev.find(t => t.id === id)).filter(Boolean));
  }, []);

  // ─── Milestone actions ───
  const addMilestone = useCallback((data) => {
    // data: { customerId, title, targetDate, status }
    const m = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setMilestones(prev => [...prev, m]);
    return m;
  }, []);
  const updateMilestone = useCallback((id, data) => {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
  }, []);
  const deleteMilestone = useCallback((id) => {
    setMilestones(prev => prev.filter(m => m.id !== id));
  }, []);
  const getCustomerMilestones = useCallback((customerId) => {
    return milestones.filter(m => m.customerId === customerId);
  }, [milestones]);

  // ─── Annotation actions ───
  const addAnnotation = useCallback((data) => {
    // data: { customerId, date (YYYY-MM-DD), text, tag ('good'|'bad'|'learning') }
    const a = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setAnnotations(prev => [...prev, a]);
    return a;
  }, []);
  const updateAnnotation = useCallback((id, data) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
  }, []);
  const deleteAnnotation = useCallback((id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);
  const getCustomerAnnotations = useCallback((customerId) => {
    return annotations.filter(a => a.customerId === customerId);
  }, [annotations]);

  // ─── Weekly Report actions ───
  // Shape: { id, createdAt, weekStart (ISO), weekEnd (ISO), emailText, provider, model, promptUsed }
  const addWeeklyReport = useCallback((data) => {
    const r = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setWeeklyReports(prev => [...prev, r]);
    return r;
  }, []);
  const updateWeeklyReport = useCallback((id, data) => {
    setWeeklyReports(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
  }, []);
  const deleteWeeklyReport = useCallback((id) => {
    setWeeklyReports(prev => prev.filter(r => r.id !== id));
  }, []);

  // ─── Weekly Update Log actions ───
  // Shape: { id, createdAt, date (YYYY-MM-DD), type: 'highlight'|'lowlight', text, customerId? }
  const addWeeklyUpdateLog = useCallback((data) => {
    const log = { id: uid(), createdAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), ...data };
    setWeeklyUpdateLogs(prev => [...prev, log]);
    return log;
  }, []);
  const updateWeeklyUpdateLog = useCallback((id, data) => {
    setWeeklyUpdateLogs(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  }, []);
  const deleteWeeklyUpdateLog = useCallback((id) => {
    setWeeklyUpdateLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  // ─── Time Budget actions ───
  // Shape: { id, weekStart (YYYY-MM-DD), totalBudgetHours, meetings: [], tasks: [], createdAt }
  const getTimeBudget = useCallback((weekStart) => {
    return timeBudgets.find(b => b.weekStart === weekStart) || null;
  }, [timeBudgets]);
  const upsertTimeBudget = useCallback((weekStart, data) => {
    setTimeBudgets(prev => {
      const existing = prev.find(b => b.weekStart === weekStart);
      if (existing) {
        return prev.map(b => b.weekStart === weekStart ? { ...b, ...data } : b);
      }
      return [...prev, { id: uid(), createdAt: new Date().toISOString(), weekStart, totalBudgetHours: 40, meetings: [], tasks: [], ...data }];
    });
  }, []);

  // ─── Time Log actions ───
  // Shape: { id, workType, hours, clientIds: [], okrId, taskId, note, loggedAt, weekStart }
  const addTimeLog = useCallback((data) => {
    const entry = { id: uid(), loggedAt: new Date().toISOString(), ...data };
    setTimeLogs(prev => [...prev, entry]);
    return entry;
  }, []);
  const updateTimeLog = useCallback((id, data) => {
    setTimeLogs(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  }, []);
  const deleteTimeLog = useCallback((id) => {
    setTimeLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  // ─── Stress Log actions ───
  // Shape: { id, logDate (YYYY-MM-DD, unique per day), stressLevel (1-5), stressor, note, createdAt }
  const upsertStressLog = useCallback((logDate, data) => {
    setStressLogs(prev => {
      const existing = prev.find(l => l.logDate === logDate);
      if (existing) {
        return prev.map(l => l.logDate === logDate ? { ...l, ...data } : l);
      }
      return [...prev, { id: uid(), createdAt: new Date().toISOString(), logDate, ...data }];
    });
  }, []);
  const deleteStressLog = useCallback((id) => {
    setStressLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  // ─── Work Type Targets actions ───
  // Shape: { id, weekStart (YYYY-MM-DD), targets: { deep_work, meetings, comms, admin } }
  const getWorkTypeTargets = useCallback((weekStart) => {
    return workTypeTargets.find(t => t.weekStart === weekStart) || null;
  }, [workTypeTargets]);
  const upsertWorkTypeTargets = useCallback((weekStart, targets) => {
    setWorkTypeTargets(prev => {
      const existing = prev.find(t => t.weekStart === weekStart);
      if (existing) {
        return prev.map(t => t.weekStart === weekStart ? { ...t, targets } : t);
      }
      return [...prev, { id: uid(), createdAt: new Date().toISOString(), weekStart, targets }];
    });
  }, []);

  // ─── One-time migration: Annotations → Weekly Update Logs ───
  // Maps good→highlight, bad→lowlight, learning→learning.
  // Guarded by a localStorage flag so it only runs once ever.
  const MIGRATION_FLAG_KEY = 'gpt-annotations-migrated';
  const migrateAnnotationsToLogs = useCallback(() => {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return 0;
    if (!annotations.length) {
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      return 0;
    }
    const TAG_MAP = { good: 'highlight', bad: 'lowlight', learning: 'learning' };
    const migrated = annotations.map(a => ({
      id:         uid(),
      createdAt:  a.createdAt,
      date:       a.date,
      customerId: a.customerId || undefined,
      type:       TAG_MAP[a.tag] || 'neutral',
      text:       a.text,
    }));
    setWeeklyUpdateLogs(prev => [...prev, ...migrated]);
    setAnnotations([]);
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    return migrated.length;
  }, [annotations]);

  // ─── AI output actions ───
  const addAiOutput = useCallback((data) => {
    const output = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setAiOutputs(prev => [...prev, output]);
    return output;
  }, []);
  const getTaskAiOutputs = useCallback((taskId) => {
    return aiOutputs.filter(o => o.taskId === taskId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [aiOutputs]);
  const updateAiOutput = useCallback((id, newText) => {
    setAiOutputs(prev => prev.map(o => o.id === id ? { ...o, outputText: newText } : o));
  }, []);

  // ─── AI settings ───
  const updateAiSettings = useCallback((patch) => {
    setAiSettings(prev => ({
      prompts: { ...prev.prompts, ...(patch.prompts || {}) },
      providers: { ...prev.providers, ...(patch.providers || {}) },
      openaiModel: patch.openaiModel !== undefined ? patch.openaiModel : prev.openaiModel,
      claudeModel: patch.claudeModel !== undefined ? patch.claudeModel : prev.claudeModel,
    }));
  }, []);

  // ─── Computed helpers ───
  const getCustomerPoints = useCallback((customerId) => {
    return points.filter(p => p.customerId === customerId);
  }, [points]);

  const getCustomerTotals = useCallback((customerId) => {
    const entries = points.filter(p => p.customerId === customerId);
    return {
      totalPoints: entries.reduce((s, e) => s + (e.points || 0), 0),
      totalHours: entries.reduce((s, e) => s + (e.hours || 0), 0),
      lastActivity: entries.length ? entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp : null,
    };
  }, [points]);

  // ─── Export / Import ───
  const exportData = useCallback(() => {
    const data = {
      okrs, customers, points, tasks, meetingEntries, milestones, aiOutputs, aiSettings,
      annotations, weeklyReports, weeklyUpdateLogs, timeBudgets, timeLogs, stressLogs, workTypeTargets,
      exportedAt: new Date().toISOString(), version: 3,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [okrs, customers, points, tasks, meetingEntries, milestones, aiOutputs, aiSettings, annotations, weeklyReports, weeklyUpdateLogs, timeBudgets, timeLogs, stressLogs, workTypeTargets]);

  const importData = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.okrs) setOkrs(data.okrs);
        if (data.customers) setCustomers(data.customers);
        if (data.points) setPoints(data.points);
        if (data.tasks) setTasks(data.tasks);
        if (data.meetingEntries) setMeetingEntries(data.meetingEntries);
        if (data.milestones) setMilestones(data.milestones);
        if (data.aiOutputs) setAiOutputs(data.aiOutputs);
        if (data.annotations) setAnnotations(data.annotations);
        if (data.weeklyReports) setWeeklyReports(data.weeklyReports);
        if (data.weeklyUpdateLogs) setWeeklyUpdateLogs(data.weeklyUpdateLogs);
        if (data.timeBudgets) setTimeBudgets(data.timeBudgets);
        if (data.timeLogs) setTimeLogs(data.timeLogs);
        if (data.stressLogs) setStressLogs(data.stressLogs);
        if (data.workTypeTargets) setWorkTypeTargets(data.workTypeTargets);
      } catch { alert('Invalid backup file'); }
    };
    reader.readAsText(file);
  }, []);

  return {
    okrs, customers, points, meetingEntries, tasks, milestones, aiOutputs,
    annotations, weeklyReports, weeklyUpdateLogs, timeBudgets,
    timeLogs, stressLogs, workTypeTargets,
    addOkr, updateOkr, deleteOkr,
    addCustomer, updateCustomer, deleteCustomer, reorderCustomers,
    addPoint, deletePoint, updatePoint,
    getCustomerPoints, getCustomerTotals,
    addMeetingEntry, markMeetingEntryTriaged, getCustomerMeetingEntries,
    addTask, updateTask, deleteTask, reorderTasks, getCustomerTasks,
    addMilestone, updateMilestone, deleteMilestone, getCustomerMilestones,
    addAnnotation, updateAnnotation, deleteAnnotation, getCustomerAnnotations,
    addWeeklyReport, updateWeeklyReport, deleteWeeklyReport,
    addWeeklyUpdateLog, updateWeeklyUpdateLog, deleteWeeklyUpdateLog, migrateAnnotationsToLogs,
    getTimeBudget, upsertTimeBudget,
    addTimeLog, updateTimeLog, deleteTimeLog,
    upsertStressLog, deleteStressLog,
    getWorkTypeTargets, upsertWorkTypeTargets,
    addAiOutput, getTaskAiOutputs, updateAiOutput,
    aiSettings, updateAiSettings,
    exportData, importData,
    syncStatus,
  };
}
