import { useState, useEffect, useCallback } from 'react';

const KEYS = {
  okrs: 'gpt-okrs',
  customers: 'gpt-customers',
  projects: 'gpt-projects',
  points: 'gpt-points',
  meetingEntries: 'gpt-meeting-entries',
  tasks: 'gpt-tasks',
  aiOutputs: 'gpt-ai-outputs',
};

function load(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function useStore() {
  const [okrs, setOkrs] = useState(() => load(KEYS.okrs));
  const [customers, setCustomers] = useState(() => load(KEYS.customers));
  const [projects, setProjects] = useState(() => load(KEYS.projects));
  const [points, setPoints] = useState(() => load(KEYS.points));
  const [meetingEntries, setMeetingEntries] = useState(() => load(KEYS.meetingEntries));
  const [tasks, setTasks] = useState(() => load(KEYS.tasks));
  const [aiOutputs, setAiOutputs] = useState(() => load(KEYS.aiOutputs));

  useEffect(() => { save(KEYS.okrs, okrs); }, [okrs]);
  useEffect(() => { save(KEYS.customers, customers); }, [customers]);
  useEffect(() => { save(KEYS.projects, projects); }, [projects]);
  useEffect(() => { save(KEYS.points, points); }, [points]);
  useEffect(() => { save(KEYS.meetingEntries, meetingEntries); }, [meetingEntries]);
  useEffect(() => { save(KEYS.tasks, tasks); }, [tasks]);
  useEffect(() => { save(KEYS.aiOutputs, aiOutputs); }, [aiOutputs]);

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
    const task = { id: uid(), createdAt: new Date().toISOString(), status: 'open', ...data };
    setTasks(prev => [...prev, task]);
    return task;
  }, []);

  const updateTask = useCallback((id, data) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  }, []);

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setAiOutputs(prev => prev.filter(o => o.taskId !== id));
  }, []);

  const getProjectTasks = useCallback((projectId) => {
    return tasks.filter(t => t.projectId === projectId);
  }, [tasks]);

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
    okrs, customers, projects, points, meetingEntries, tasks, aiOutputs,
    addOkr, updateOkr, deleteOkr,
    addCustomer, updateCustomer, deleteCustomer,
    addProject, updateProject, deleteProject,
    addPoint, deletePoint, updatePoint,
    getProjectPoints, getProjectTotals,
    addMeetingEntry, markMeetingEntryTriaged, getProjectMeetingEntries,
    addTask, updateTask, deleteTask, getProjectTasks,
    addAiOutput, getTaskAiOutputs,
    exportData, importData,
  };
}
