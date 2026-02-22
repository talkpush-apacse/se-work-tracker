export const ACTIVITY_TYPES = [
  'Sending Email',
  'Joining Meeting',
  'Troubleshoot / Firefighting',
  'Configuration',
  'Reporting',
];

export const CUSTOMER_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Teal', value: '#14b8a6' },
];

export const PROJECT_STATUSES = ['Active', 'On Hold', 'Completed'];

// Task types (matches spec: mine / coordinate / comms)
export const TASK_TYPES = ['mine', 'coordinate', 'comms'];

export const TASK_TYPE_LABELS = {
  mine: 'Mine',
  coordinate: 'Coordinate',
  comms: 'Needs Comms',
};

export const TASK_TYPE_COLORS = {
  mine: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' },
  coordinate: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' },
  comms: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20' },
};

// Task statuses — 'archived' is a soft-delete; excluded from board by default
export const TASK_STATUSES = ['open', 'in-progress', 'done', 'blocked'];

export const TASK_STATUS_LABELS = {
  'open': 'Open',
  'in-progress': 'In Progress',
  'done': 'Done',
  'blocked': 'Blocked',
  'archived': 'Archived',
};

export const TASK_STATUS_COLORS = {
  'open': { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/20' },
  'in-progress': { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  'done': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'blocked': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
  'archived': { bg: 'bg-gray-800/60', text: 'text-gray-600', border: 'border-gray-700/40' },
};

// Task recipients — who this task/message is directed at
export const TASK_RECIPIENTS = [
  { value: 'client',              label: 'Client' },
  { value: 'internal-core',       label: 'Internal — Core Team' },
  { value: 'internal-management', label: 'Internal — Management' },
  { value: 'internal-support',    label: 'Internal — Product Support' },
  { value: 'internal-crm-dev',    label: 'Internal — CRM Developers' },
  { value: 'internal-chatbot-dev',label: 'Internal — Chatbot Developers' },
  { value: 'internal-analytics',  label: 'Internal — Analytics' },
];

// AI output types
export const AI_OUTPUT_TYPES = ['email', 'slack', 'troubleshooting', 'configuration', 'summary'];

export const AI_OUTPUT_TYPE_LABELS = {
  email: 'Email Draft',
  slack: 'Slack Message',
  troubleshooting: 'Troubleshooting Plan',
  configuration: 'Configuration Plan',
  summary: 'General Summary',
};

export const ACTIVITY_COLORS = {
  'Sending Email': '#6366f1',
  'Joining Meeting': '#8b5cf6',
  'Troubleshoot / Firefighting': '#f43f5e',
  'Configuration': '#10b981',
  'Reporting': '#f59e0b',
};
