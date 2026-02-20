import { useState, useEffect, useCallback } from 'react';

const KEYS = {
  okrs: 'gpt-okrs',
  customers: 'gpt-customers',
  projects: 'gpt-projects',
  points: 'gpt-points',
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

  useEffect(() => { save(KEYS.okrs, okrs); }, [okrs]);
  useEffect(() => { save(KEYS.customers, customers); }, [customers]);
  useEffect(() => { save(KEYS.projects, projects); }, [projects]);
  useEffect(() => { save(KEYS.points, points); }, [points]);

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
    okrs, customers, projects, points,
    addOkr, updateOkr, deleteOkr,
    addCustomer, updateCustomer, deleteCustomer,
    addProject, updateProject, deleteProject,
    addPoint, deletePoint,
    getProjectPoints, getProjectTotals,
    exportData, importData,
  };
}
