import { useState, useEffect, useCallback, useRef } from 'react';
import { TASK_TYPE_POINTS } from '../constants';
import { fetchAllData, saveEntity, seedAllData } from '../lib/api';

const KEYS = {
  okrs: 'gpt-okrs',
  customers: 'gpt-customers',
  projects: 'gpt-projects',
  points: 'gpt-points',
  meetingEntries: 'gpt-meeting-entries',
  tasks: 'gpt-tasks',
  milestones: 'gpt-milestones',
  aiOutputs: 'gpt-ai-outputs',
  aiSettings: 'gpt-ai-settings',
};

const MIGRATION_FLAG = 'gpt-migrated-to-neon';

// Default AI settings shape — empty string means "use built-in default prompt"
const DEFAULT_AI_SETTINGS = {
  prompts: {
    email: '',
    slack: '',
    troubleshooting: '',
    configuration: '',
    summary: '',
  },
  providers: {
    email: 'openai',
    slack: 'openai',
    troubleshooting: 'openai',
    configuration: 'openai',
    summary: 'openai',
  },
  openaiModel: 'gpt-4o',
  claudeModel: 'claude-sonnet-4-6',
};

function load(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Migrate OKRs that predate the keyResults/quarter fields
function migrateOkrs(okrs) {
  return okrs.map(okr => {
    const migrated = { ...okr };
    // Add quarter default for existing OKRs
    if (!migrated.quarter) migrated.quarter = 'Q1 2026';
    // Convert old freeform description into structured keyResults
    if (!migrated.keyResults) {
      if (migrated.description && migrated.description.trim()) {
        // Parse "KR1: ..." lines from description into structured KRs
        const lines = migrated.description.split('\n').filter(l => /^KR\d*:/i.test(l.trim()));
        if (lines.length > 0) {
          migrated.keyResults = lines.map((line, i) => ({
            id: `kr-${okr.id}-${i}`,
            text: line.replace(/^KR\d*:\s*/i, '').trim(),
            type: 'boolean',
            value: null,
          }));
          migrated.description = ''; // clear since KRs are now structured
        } else {
          migrated.keyResults = [];
          // Keep description as-is (it's freeform notes, not KRs)
        }
      } else {
        migrated.keyResults = [];
      }
    }
    return migrated;
  });
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Debounce helper for API saves ───────────────────────────────
// One timer per entity so rapid changes to the same entity collapse,
// but changes to different entities can fire independently.
function createDebouncedSaver() {
  const timers = {};
  return (entity, data) => {
    clearTimeout(timers[entity]);
    timers[entity] = setTimeout(() => {
      saveEntity(entity, data);
    }, 500);
  };
}

export function useStore() {
  const [okrs, setOkrs] = useState(() => migrateOkrs(load(KEYS.okrs)));
  const [customers, setCustomers] = useState(() => load(KEYS.customers));
  const [projects, setProjects] = useState(() => load(KEYS.projects));
  const [points, setPoints] = useState(() => load(KEYS.points));
  const [meetingEntries, setMeetingEntries] = useState(() => load(KEYS.meetingEntries));
  const [tasks, setTasks] = useState(() => load(KEYS.tasks));
  const [milestones, setMilestones] = useState(() => load(KEYS.milestones));
  const [aiOutputs, setAiOutputs] = useState(() => load(KEYS.aiOutputs));
  const [aiSettings, setAiSettings] = useState(() => {
    const stored = load(KEYS.aiSettings, null);
    if (!stored) return DEFAULT_AI_SETTINGS;
    // Merge stored with defaults so new output types get default values
    return {
      prompts: { ...DEFAULT_AI_SETTINGS.prompts, ...stored.prompts },
      providers: { ...DEFAULT_AI_SETTINGS.providers, ...stored.providers },
      openaiModel: stored.openaiModel || DEFAULT_AI_SETTINGS.openaiModel,
      claudeModel: stored.claudeModel || DEFAULT_AI_SETTINGS.claudeModel,
    };
  });

  // Sync status: 'loading' | 'synced' | 'saving' | 'offline' | 'error'
  const [syncStatus, setSyncStatus] = useState('loading');

  // Stable debounced saver — created once per component lifetime
  const debouncedSave = useRef(createDebouncedSaver()).current;

  // Track whether initial Neon fetch has completed.
  // We suppress API saves until mount-fetch is done to avoid echoing
  // stale localStorage data back to Neon before we've received remote data.
  const mountedRef = useRef(false);

  // ─── localStorage save effects (unchanged — instant, synchronous cache) ───
  useEffect(() => { save(KEYS.okrs, okrs); }, [okrs]);
  useEffect(() => { save(KEYS.customers, customers); }, [customers]);
  useEffect(() => { save(KEYS.projects, projects); }, [projects]);
  useEffect(() => { save(KEYS.points, points); }, [points]);
  useEffect(() => { save(KEYS.meetingEntries, meetingEntries); }, [meetingEntries]);
  useEffect(() => { save(KEYS.tasks, tasks); }, [tasks]);
  useEffect(() => { save(KEYS.milestones, milestones); }, [milestones]);
  useEffect(() => { save(KEYS.aiOutputs, aiOutputs); }, [aiOutputs]);
  useEffect(() => { save(KEYS.aiSettings, aiSettings); }, [aiSettings]);

  // ─── Neon save effects (debounced 500ms, only after mount-fetch) ──────────
  useEffect(() => { if (mountedRef.current) { debouncedSave('okrs', okrs); setSyncStatus('saving'); } }, [okrs]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('customers', customers); setSyncStatus('saving'); } }, [customers]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('projects', projects); setSyncStatus('saving'); } }, [projects]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('points', points); setSyncStatus('saving'); } }, [points]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('meetingEntries', meetingEntries); setSyncStatus('saving'); } }, [meetingEntries]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('tasks', tasks); setSyncStatus('saving'); } }, [tasks]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('milestones', milestones); setSyncStatus('saving'); } }, [milestones]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('aiOutputs', aiOutputs); setSyncStatus('saving'); } }, [aiOutputs]);
  useEffect(() => { if (mountedRef.current) { debouncedSave('aiSettings', aiSettings); setSyncStatus('saving'); } }, [aiSettings]);

  // Update syncStatus back to 'synced' after the debounce window
  useEffect(() => {
    if (syncStatus === 'saving') {
      const t = setTimeout(() => setSyncStatus('synced'), 800);
      return () => clearTimeout(t);
    }
  }, [syncStatus]);

  // ─── Mount effect: fetch from Neon, auto-migrate if first run ─────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const remote = await fetchAllData();

      if (cancelled) return;

      if (!remote) {
        // Neon unreachable — work offline from localStorage
        setSyncStatus('offline');
        mountedRef.current = true;
        return;
      }

      const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG);

      // Check if Neon has real data (any entity with non-empty array)
      const neonHasData = Object.values(remote).some(d =>
        Array.isArray(d) ? d.length > 0 : (d && typeof d === 'object' && Object.keys(d).length > 0)
      );

      if (!neonHasData && !alreadyMigrated) {
        // First run — push localStorage data to Neon
        console.log('[sync] Neon empty + no migration flag → seeding from localStorage');
        const localData = {
          okrs, customers, projects, points,
          meetingEntries, tasks, milestones,
          aiOutputs, aiSettings,
        };
        const result = await seedAllData(localData);
        if (result) {
          localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
          console.log('[sync] Seed complete:', result.entitiesSeeded, 'entities');
        }
      } else if (neonHasData) {
        // Neon has data — overwrite local state with remote data
        if (remote.okrs) setOkrs(migrateOkrs(remote.okrs));
        if (remote.customers) setCustomers(remote.customers);
        if (remote.projects) setProjects(remote.projects);
        if (remote.points) setPoints(remote.points);
        if (remote.meetingEntries) setMeetingEntries(remote.meetingEntries);
        if (remote.tasks) setTasks(remote.tasks);
        if (remote.milestones) setMilestones(remote.milestones);
        if (remote.aiOutputs) setAiOutputs(remote.aiOutputs);
        if (remote.aiSettings && Object.keys(remote.aiSettings).length > 0) {
          setAiSettings(prev => ({
            prompts: { ...DEFAULT_AI_SETTINGS.prompts, ...remote.aiSettings.prompts },
            providers: { ...DEFAULT_AI_SETTINGS.providers, ...remote.aiSettings.providers },
            openaiModel: remote.aiSettings.openaiModel || prev.openaiModel,
            claudeModel: remote.aiSettings.claudeModel || prev.claudeModel,
          }));
        }
        // Mark as migrated (in case it wasn't yet)
        if (!alreadyMigrated) {
          localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
        }
      }

      if (!cancelled) {
        setSyncStatus('synced');
        // Enable API save effects now that we've loaded remote data
        mountedRef.current = true;
      }
    }

    init();
    return () => { cancelled = true; };
  }, []); // run once on mount

  // OKR actions
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

  // Customer actions
  const addCustomer = useCallback((data) => {
    const customer = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setCustomers(prev => [...prev, customer]);
    return customer;
  }, []);

  const updateCustomer = useCallback((id, data) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  const deleteCustomer = useCallback((id) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  }, []);

  // Reorder customers by an ordered array of IDs (used by drag-and-drop)
  const reorderCustomers = useCallback((orderedIds) => {
    setCustomers(prev => orderedIds.map(id => prev.find(c => c.id === id)).filter(Boolean));
  }, []);

  // Project actions
  const addProject = useCallback((data) => {
    const project = { id: uid(), createdAt: new Date().toISOString(), status: 'Active', ...data };
    setProjects(prev => [...prev, project]);
    return project;
  }, []);

  const updateProject = useCallback((id, data) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    setPoints(prev => prev.filter(pt => pt.projectId !== id));
    setMeetingEntries(prev => prev.filter(m => m.projectId !== id));
    setTasks(prev => prev.filter(t => t.projectId !== id));
    setMilestones(prev => prev.filter(m => m.projectId !== id));
  }, []);

  // Point actions
  const addPoint = useCallback((data) => {
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

  // Meeting entry actions
  const addMeetingEntry = useCallback((data) => {
    // data: { projectId, meetingDate (YYYY-MM-DD string), rawNotes }
    const entry = { id: uid(), createdAt: new Date().toISOString(), isTriaged: false, ...data };
    setMeetingEntries(prev => [...prev, entry]);
    return entry;
  }, []);

  const markMeetingEntryTriaged = useCallback((id) => {
    setMeetingEntries(prev => prev.map(m => m.id === id ? { ...m, isTriaged: true } : m));
  }, []);

  const getProjectMeetingEntries = useCallback((projectId) => {
    return meetingEntries.filter(m => m.projectId === projectId);
  }, [meetingEntries]);

  // Task actions
  const addTask = useCallback((data) => {
    // data: { projectId, meetingEntryId (optional), description, taskType, assigneeOrTeam, status }
    const task = { id: uid(), createdAt: new Date().toISOString(), status: 'open', points: 0, closedAt: null, ...data };
    // Auto-assign points if task is created already in 'done' status
    if (task.status === 'done') task.points = TASK_TYPE_POINTS[task.taskType] || 0;
    // Stamp closedAt if task is created directly in a closed status
    if (task.status === 'done' || task.status === 'archived') {
      task.closedAt = new Date().toISOString();
    }
    setTasks(prev => [...prev, task]);
    return task;
  }, []);

  const updateTask = useCallback((id, data) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const next = { ...t, ...data };
      // Auto-calculate task points + closedAt on status change
      if ('status' in data) {
        const wasOpen = !['done', 'archived'].includes(t.status);
        const nowClosed = ['done', 'archived'].includes(data.status);

        // closedAt: stamp when closing, clear when reopening, preserve on done↔archived
        if (nowClosed && wasOpen) {
          next.closedAt = new Date().toISOString();
        } else if (!nowClosed) {
          next.closedAt = null;
        }

        if (data.status === 'done') {
          // Completed — award points based on task type
          next.points = TASK_TYPE_POINTS[next.taskType] || 0;
        } else if (t.status === 'done') {
          // Moved OUT of done (including archive) — deduct points
          next.points = 0;
        }
      }
      return next;
    }));
  }, []);

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setAiOutputs(prev => prev.filter(o => o.taskId !== id));
  }, []);

  const getProjectTasks = useCallback((projectId) => {
    return tasks.filter(t => t.projectId === projectId);
  }, [tasks]);

  const reorderTasks = useCallback((orderedIds) => {
    setTasks(prev => orderedIds.map(id => prev.find(t => t.id === id)).filter(Boolean));
  }, []);

  // Milestone actions
  const addMilestone = useCallback((data) => {
    // data: { projectId, title, targetDate (YYYY-MM-DD), status ('upcoming'|'achieved'|'missed') }
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

  const getProjectMilestones = useCallback((projectId) => {
    return milestones.filter(m => m.projectId === projectId);
  }, [milestones]);

  // AI output actions
  const addAiOutput = useCallback((data) => {
    // data: { taskId, outputType, inputText, outputText }
    const output = { id: uid(), createdAt: new Date().toISOString(), ...data };
    setAiOutputs(prev => [...prev, output]);
    return output;
  }, []);

  const getTaskAiOutputs = useCallback((taskId) => {
    return aiOutputs
      .filter(o => o.taskId === taskId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [aiOutputs]);

  const updateAiOutput = useCallback((id, newText) => {
    setAiOutputs(prev =>
      prev.map(o => o.id === id ? { ...o, outputText: newText } : o)
    );
  }, []);

  // AI settings actions
  const updateAiSettings = useCallback((patch) => {
    setAiSettings(prev => ({
      prompts: { ...prev.prompts, ...(patch.prompts || {}) },
      providers: { ...prev.providers, ...(patch.providers || {}) },
      openaiModel: patch.openaiModel !== undefined ? patch.openaiModel : prev.openaiModel,
      claudeModel: patch.claudeModel !== undefined ? patch.claudeModel : prev.claudeModel,
    }));
  }, []);

  // Computed helpers
  const getProjectPoints = useCallback((projectId) => {
    return points.filter(p => p.projectId === projectId);
  }, [points]);

  const getProjectTotals = useCallback((projectId) => {
    const entries = points.filter(p => p.projectId === projectId);
    return {
      totalPoints: entries.reduce((s, e) => s + (e.points || 0), 0),
      totalHours: entries.reduce((s, e) => s + (e.hours || 0), 0),
      lastActivity: entries.length ? entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp : null,
    };
  }, [points]);

  // Export / Import
  const exportData = useCallback(() => {
    const data = { okrs, customers, projects, points, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [okrs, customers, projects, points]);

  const importData = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.okrs) setOkrs(data.okrs);
        if (data.customers) setCustomers(data.customers);
        if (data.projects) setProjects(data.projects);
        if (data.points) setPoints(data.points);
      } catch {
        alert('Invalid backup file');
      }
    };
    reader.readAsText(file);
  }, []);

  return {
    okrs, customers, projects, points, meetingEntries, tasks, milestones, aiOutputs,
    addOkr, updateOkr, deleteOkr,
    addCustomer, updateCustomer, deleteCustomer, reorderCustomers,
    addProject, updateProject, deleteProject,
    addPoint, deletePoint, updatePoint,
    getProjectPoints, getProjectTotals,
    addMeetingEntry, markMeetingEntryTriaged, getProjectMeetingEntries,
    addTask, updateTask, deleteTask, reorderTasks, getProjectTasks,
    addMilestone, updateMilestone, deleteMilestone, getProjectMilestones,
    addAiOutput, getTaskAiOutputs, updateAiOutput,
    aiSettings, updateAiSettings,
    exportData, importData,
    syncStatus,
  };
}
